import {
  BASELINE,
  BTS_SECTORS,
  FISH_SPECIES,
  isMassLoadId,
  ITEM_IDS,
  PARAMETERS,
  PRESSURE_IDS,
  type MassLoadId,
} from './config';
import { calculateCarbonateSystem, calculateRespirationPhImpact } from './carbonate';
import { calculateOilFateBudget, evaluateOilEcotoxicity } from './contaminants';
import {
  computeEffectiveFishingPressure,
  computeEffectiveTargets,
  isInterventionActive,
  stepEnvironmentalStocks,
  stepOilContainmentSkimming,
} from './interventionModel';
import type { ActiveIntervention } from './interventions';
import { calculateDeoxygenationRate, calculateEquilibriumOxygen, calculateWeissOxygenSaturation, convertBOD5ToPulseDeltaMgL, convertBOD5ToUltimateBOD, integrateOxygenKinetics } from './oxygen';
import type {
  BtsSectorId,
  Environment,
  Exposure,
  FishSpeciesId,
  Health,
  Indicator,
  ItemId,
  Pressures,
  SimulationState,
} from './types';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function stressAbove(value: number, start: number, maximum: number) {
  return clamp((value - start) / (maximum - start));
}

export function stressBelow(value: number, start: number, maximum: number) {
  return clamp((start - value) / (start - maximum));
}

function combine(stresses: number[]) {
  return 1 - stresses.reduce((product, stress) => product * (1 - stress), 1);
}

export function isFactorActive(id: ItemId, value: number, baselineValue?: number) {
  const ref = baselineValue !== undefined ? baselineValue : BASELINE[id];
  return Math.abs(value - ref) > 1e-9;
}

/** Um fator entra na simulação quando a barra sai da posição inicial. */
export function countActiveFactors(environment: Environment) {
  return ITEM_IDS.filter((id) => isFactorActive(id, environment[id])).length;
}

/** Faixa sazonal da massa que permanece na BTS após 30 dias com base no compartimento ativo. */
export function receivedLoadRange(inputKg: number, sectorId: BtsSectorId = 'frades') {
  const sector = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];
  const tauWinter = sector.dischargeRange[0];
  const tauSummer = sector.dischargeRange[1];
  const winterRetention = Math.exp(-30 / tauWinter);
  const summerRetention = Math.exp(-30 / tauSummer);
  return {
    minimumKg: inputKg * winterRetention,
    maximumKg: inputKg * summerRetention,
    centralKg: inputKg * ((winterRetention + summerRetention) / 2),
  };
}

/** Normaliza a massa recebida para a escala educativa escolhida (contaminantes em massa: óleo e esgoto). */
export function normalizedReceivedLoad(id: MassLoadId, valueKg: number) {
  return clamp(valueKg / PARAMETERS.receivedLoads[id].maximumKg);
}

/**
 * Normaliza a concentração superficial de microplásticos (partículas/m³) na escala
 * ancorada nos levantamentos estuarinos da BTS (0 a 35.000 part./m³; Trindade et al., 2023),
 * sem converter arbitrariamente massa em contagem de partículas.
 */
export function normalizedMicroplasticsConcentration(particlesPerM3: number): number {
  return clamp(particlesPerM3 / PARAMETERS.microplastics.maximumParticlesPerM3);
}

/**
 * Normaliza a pressão de efluentes (DBO / matéria orgânica e nutrientes) mantendo coerência de unidades físicas:
 * - Modo contínuo: taxa diária de entrada (kg DBO₅/dia) comparada ao limite contínuo diário (kg/dia);
 * - Modo pulso: massa instantânea injetada (kg) e concentração resultante de CBODu na água (mg O₂/L).
 * Garante que taxas diárias e massas em pulso não sejam misturadas na mesma escala de carga retida.
 */
export function normalizedSewagePressure(
  sewageValue: number,
  mode: 'continuous' | 'pulse' = 'continuous',
  bodConcentrationMgL = 0,
): number {
  if (mode === 'pulse') {
    const fromConcentration = clamp(bodConcentrationMgL / PARAMETERS.sewageLoads.saturationBodConcentrationMgL);
    const fromMass = clamp(sewageValue / PARAMETERS.sewageLoads.pulseMaximumKg);
    return Math.max(fromConcentration, fromMass);
  }
  const fromRate = clamp(sewageValue / PARAMETERS.sewageLoads.continuousMaximumKgPerDay);
  const fromConcentration = bodConcentrationMgL > 0
    ? clamp(bodConcentrationMgL / PARAMETERS.sewageLoads.saturationBodConcentrationMgL)
    : 0;
  return Math.max(fromRate, fromConcentration);
}

/**
 * pH que o recife sente: pH de contorno ajustado termodinamicamente pelo fluxo
 * respiratório microbiano integrado que oxida a matéria orgânica e libera CO2 (Lueker et al., 2000).
 *
 * Não utiliza o déficit instantâneo de OD (que confunde reaeração com respiração),
 * mas sim a produção acumulada de DIC por oxidação heterotrófica da DBO.
 */
export function effectivePh(
  env: Environment,
  bodConcentrationMgL = 0,
  sectorId: BtsSectorId = 'frades',
  respiratoryDicUmolKg?: number,
): number {
  const sector = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];

  let addedDic = 0;
  if (respiratoryDicUmolKg !== undefined) {
    // Quando o DIC respiratório integrado no tempo está disponível no estado da simulação
    addedDic = Math.max(0, respiratoryDicUmolKg);
  } else if (bodConcentrationMgL > 0) {
    // Estimativa cinética de caixa para testes ou cálculo pontual
    const kd = calculateDeoxygenationRate(env.temperature);
    const tau = Math.min(sector.dischargeDays, 5);
    const consumedO2 = bodConcentrationMgL * (1 - Math.exp(-kd * tau));
    addedDic = (consumedO2 / 32) * 1000 * 0.98;
  } else if (env.sewage > 0) {
    // Via auxiliar de pH para aporte contínuo de DBO quando o DIC acumulado no estado não for fornecido.
    // Taxa de entrada constante R em mg CBODu / L / dia:
    const kd = calculateDeoxygenationRate(env.temperature);
    const tau = Math.max(1, sector.dischargeDays);
    const kFlush = 1 / tau;
    const kEf = kd + kFlush; // Coeficiente efetivo de remoção (oxidação bacteriana + dispersão/lavagem por maré)
    const cbodDailyKg = convertBOD5ToUltimateBOD(env.sewage);
    const R = (cbodDailyKg * 1000) / sector.mixingVolumeM3; // mg/L/dia
    const steadyStateBodMgL = R / kEf; // Concentração de estado estacionário B_ss em mg/L
    // Taxa diária de consumo de O2 por oxidação da DBO (mg O2 / L / dia):
    const dailyConsumedO2 = kd * steadyStateBodMgL;
    // Horizonte temporal de referência Δt_ref = 1 dia:
    // Em regime estacionário, a taxa diária de mineralização (mg O2 / L / dia) é convertida para o
    // incremento diário de DIC gerado pela respiração microbiana:
    // ΔDIC = (dailyConsumedO2 / 32) * 1000 * 0.98 * Δt_ref (com Δt_ref = 1 dia).
    // Esse cálculo compatibiliza dimensionalmente taxa diária e acréscimo de concentração no volume de mistura,
    // com teto pedagógico de 45 µmol/kg para respeitar o limite superior de sewageMaxDrop (~0.08 unidades de pH).
    const deltaTRefDays = 1.0;
    addedDic = Math.min(45, ((dailyConsumedO2 * deltaTRefDays) / 32) * 1000 * 0.98);
  }

  if (addedDic <= 0.01) {
    return env.ph;
  }

  const scaledTa = 2350 * (sector.baselineSalinity / 35.0);
  const impact = calculateRespirationPhImpact(
    env.ph,
    addedDic,
    scaledTa,
    env.temperature,
    sector.baselineSalinity,
  );
  return impact.effectivePh;
}

/** Traduz o ambiente em pressões de 0 a 1 sobre o recife. */
export function calculatePressures(
  env: Environment,
  dhw = 0,
  bodConcentrationMgL = 0,
  sectorId: BtsSectorId = 'frades',
  respiratoryDicUmolKg?: number,
  sewageDischargeMode: 'continuous' | 'pulse' = 'continuous',
  elapsedDays = 1,
  recoveredOilKg = 0,
  activeInterventions?: readonly ActiveIntervention[],
): Pressures {
  const ph = effectivePh(env, bodConcentrationMgL, sectorId, respiratoryDicUmolKg);
  const currentHeat = stressAbove(
    env.temperature,
    PARAMETERS.temperature.bleachingThreshold,
    PARAMETERS.temperature.bleachingThreshold + 2,
  ) * 0.25;
  const accumulatedHeat = clamp(dhw / PARAMETERS.temperature.severeDhw);

  const remainingOilKg = Math.max(0, env.oil - recoveredOilKg);
  let oilPressure = normalizedReceivedLoad('oil', remainingOilKg);
  if (env.oil > 0) {
    const isContainment = isInterventionActive(activeInterventions, 'oilContainmentSkimming');
    const budget = calculateOilFateBudget(
      env.oil,
      sectorId,
      Math.max(0.1, elapsedDays),
      true,
      recoveredOilKg,
      isContainment,
    );
    const ecotox = evaluateOilEcotoxicity(budget.dissolvedPahConcentrationUgL);
    const toxicResponse = clamp(ecotox.tissueRegenerationInhibitionPercent / 100);
    oilPressure = Math.max(oilPressure, toxicResponse);
  }

  const effectiveFishing = computeEffectiveFishingPressure(env.fishing, activeInterventions);

  return {
    thermal: combine([currentHeat, accumulatedHeat]),
    acidification: stressBelow(ph, PARAMETERS.ph.coralStart, PARAMETERS.ph.coralMax),
    oil: oilPressure,
    microplastics: normalizedMicroplasticsConcentration(env.microplastics),
    sewage: normalizedSewagePressure(env.sewage, sewageDischargeMode, bodConcentrationMgL),
    turbidity: clamp(env.turbidity / 100),
    fishing: clamp(effectiveFishing / 100),
  };
}

/**
 * Índice de estresse respiratório por desoxigenação (hipóxia) [Padrão US EPA / CONAMA 357].
 * > 5,0 mg/L: normóxia (condição adequada para vida aquática marinha, estresse = 0).
 * 3,0–5,0 mg/L: estresse respiratório potencial (0 .. 0.35).
 * 2,0–3,0 mg/L: hipóxia (0.35 .. 0.75).
 * < 2,0 mg/L: hipóxia severa (0.75 .. 1.0, risco agudo de asfixia e mortalidade).
 */
export function hypoxiaStress(dissolvedOxygen: number = PARAMETERS.oxygen.saturationMgL): number {
  if (dissolvedOxygen >= 5.0) return 0;
  if (dissolvedOxygen >= 3.0) {
    return ((5.0 - dissolvedOxygen) / (5.0 - 3.0)) * 0.35;
  }
  if (dissolvedOxygen >= 2.0) {
    return 0.35 + ((3.0 - dissolvedOxygen) / (3.0 - 2.0)) * 0.40;
  }
  return clamp(0.75 + ((2.0 - dissolvedOxygen) / 2.0) * 0.25);
}

/** Peixes toleram mais calor e menos acidez que os corais, mas sofrem estresse agudo por hipóxia. */
export function calculateFishPressures(
  env: Environment,
  dhw = 0,
  dissolvedOxygen: number = PARAMETERS.oxygen.saturationMgL,
  bodConcentrationMgL = 0,
  sectorId: BtsSectorId = 'frades',
  respiratoryDicUmolKg?: number,
  sewageDischargeMode: 'continuous' | 'pulse' = 'continuous',
  elapsedDays = 1,
  recoveredOilKg = 0,
  activeInterventions?: readonly ActiveIntervention[],
): Pressures {
  const base = calculatePressures(
    env,
    dhw,
    bodConcentrationMgL,
    sectorId,
    respiratoryDicUmolKg,
    sewageDischargeMode,
    elapsedDays,
    recoveredOilKg,
    activeInterventions,
  );
  const hypoxia = hypoxiaStress(dissolvedOxygen);
  return {
    ...base,
    thermal: stressAbove(env.temperature, PARAMETERS.temperature.fishStart, PARAMETERS.temperature.fishMax),
    acidification: stressBelow(effectivePh(env, bodConcentrationMgL, sectorId, respiratoryDicUmolKg), PARAMETERS.ph.fishStart, PARAMETERS.ph.fishMax),
    // A hipóxia acopla-se à pressão de efluentes/esgoto, expressando o mecanismo biológico de asfixia
    sewage: combine([base.sewage, hypoxia]),
  };
}

function pollutionPressures(pressures: Pressures, weights: Partial<Record<string, number>>) {
  return PRESSURE_IDS.filter((id) => id !== 'thermal' && id !== 'acidification')
    .map((id) => (weights[id] ?? 0) * pressures[id]);
}

export function coralStress(pressures: Pressures) {
  const weights = PARAMETERS.pollutantWeights.coral as Partial<Record<string, number>>;
  const direct = [pressures.thermal, pressures.acidification];
  const pollution = pollutionPressures(pressures, weights);
  const base = combine([...direct, ...pollution]);
  const worstPollution = Math.max(0, ...pollution);
  // Calor e poluição juntos são piores que a soma das partes.
  return clamp(base * (1 + PARAMETERS.synergy * Math.min(pressures.thermal, worstPollution)));
}

export function speciesStress(pressures: Pressures, id: FishSpeciesId) {
  const species = FISH_SPECIES.find((item) => item.id === id) ?? FISH_SPECIES[0];
  return clamp(
    combine(PRESSURE_IDS.map((pressure) => pressures[pressure] * species.sensitivity[pressure])),
  );
}

export function calculateStress(
  env: Environment,
  dhw = 0,
  dissolvedOxygen: number = PARAMETERS.oxygen.saturationMgL,
  bodConcentrationMgL = 0,
  sectorId: BtsSectorId = 'frades',
  respiratoryDicUmolKg?: number,
  sewageDischargeMode: 'continuous' | 'pulse' = 'continuous',
  elapsedDays = 1,
  recoveredOilKg = 0,
  activeInterventions?: readonly ActiveIntervention[],
) {
  const pressures = calculatePressures(
    env,
    dhw,
    bodConcentrationMgL,
    sectorId,
    respiratoryDicUmolKg,
    sewageDischargeMode,
    elapsedDays,
    recoveredOilKg,
    activeInterventions,
  );
  const fishPressures = calculateFishPressures(
    env,
    dhw,
    dissolvedOxygen,
    bodConcentrationMgL,
    sectorId,
    respiratoryDicUmolKg,
    sewageDischargeMode,
    elapsedDays,
    recoveredOilKg,
    activeInterventions,
  );
  const species = Object.fromEntries(
    FISH_SPECIES.map((item) => [item.id, speciesStress(fishPressures, item.id)]),
  ) as Record<FishSpeciesId, number>;
  const fish = FISH_SPECIES.reduce((total, item) => total + species[item.id], 0) / FISH_SPECIES.length;

  return { coral: coralStress(pressures), fish, species, pressures };
}

/** Cobertura de algas (0 a 100): nutrientes, perda de herbívoros e espaço livre. */
export function calculateAlgae(
  env: Environment,
  health: Health,
  sewageDischargeMode: 'continuous' | 'pulse' = 'continuous',
  bodConcentrationMgL = 0,
) {
  const nutrients = normalizedSewagePressure(env.sewage, sewageDischargeMode, bodConcentrationMgL);
  const grazers = clamp(1 - health.fish / 100);
  const sediment = clamp(env.turbidity / 100) * 0.2;
  const freeSpace = clamp(1 - health.coral / 100) * 0.5;

  return clamp(0.15 + nutrients * 0.75 + grazers * 0.55 + sediment + freeSpace) * 100;
}

/**
 * Equilíbrio da teia alimentar (0 a 100). Depende de quem come algas
 * (cirurgião-patela e papagaio) e de quanto espaço as algas ocupam.
 */
export function calculateTrophicBalance(
  species: Record<FishSpeciesId, number>,
  algae: number,
) {
  const herbivores = (species['blue-tang'] + species.parrotfish) / 2;
  const grazeable = clamp(1 - algae / 100) * 100;

  return clamp((herbivores * 0.65 + grazeable * 0.35) / 100) * 100;
}

function updateHealth(current: number, stress: number, collapseDays: number, dtDays: number, protection: number) {
  const maxDamagePerDay = 100 / collapseDays;
  const damage = maxDamagePerDay * stress * (1 - protection * PARAMETERS.recovery.damageReduction);
  const threshold = PARAMETERS.recoveryThreshold + protection * PARAMETERS.recovery.thresholdBoost;
  const recovery =
    stress < threshold
      ? (maxDamagePerDay / PARAMETERS.recoveryFactor)
        * (1 + protection * PARAMETERS.recovery.speedBoost)
        * (1 - stress)
      : 0;

  return clamp(current - damage * dtDays + recovery * dtDays, 0, 100);
}

export function createInitialState(sectorId: BtsSectorId = 'frades'): SimulationState {
  const stress = calculateStress(BASELINE);
  const sector = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];
  const initialDo = calculateWeissOxygenSaturation(BASELINE.temperature, sector.baselineSalinity);

  return {
    controls: { ...BASELINE },
    env: { ...BASELINE },
    targets: { ...BASELINE },
    health: { coral: 100, fish: 100 },
    species: { 'blue-tang': 100, 'sergeant-major': 100, parrotfish: 100 },
    pressures: stress.pressures,
    exposure: Object.fromEntries(PRESSURE_IDS.map((id) => [id, 0])) as Exposure,
    degreeHeatingWeeks: 0,
    thermalDose: [],
    overall: 100,
    elapsedDays: 0,
    speed: 1,
    paused: false,
    everDegraded: false,
    activeInterventions: [],
    recoveredOilKg: 0,
    oilSpillAgeDays: 0,
    history: [
      {
        day: 0,
        coral: 100,
        fish: 100,
        overall: 100,
        algae: calculateAlgae(BASELINE, { coral: 100, fish: 100 }),
        temperature: BASELINE.temperature,
        ph: BASELINE.ph,
        dhw: 0,
        dissolvedOxygen: initialDo,
        bod: 0,
        saturationOxygen: initialDo,
        sewage: BASELINE.sewage,
        microplastics: BASELINE.microplastics,
        oil: BASELINE.oil,
        species: { 'blue-tang': 100, 'sergeant-major': 100, parrotfish: 100 },
      },
    ],
    firedMessages: new Set(),
    events: [],
    latestMessageId: null,
    messageCooldown: 0,
    sector: sectorId,
    sewageDischargeMode: 'continuous',
    initialConditionSource: 'PADRAO_CALIBRADO',
    dissolvedOxygen: initialDo,
    biochemicalOxygenDemand: 0,
    respiratoryDicUmolKg: 0,
  };
}

export function buildTargets(
  controls: Environment,
  sectorId: BtsSectorId = 'frades',
  dischargeMode: 'continuous' | 'pulse' = 'continuous',
): Environment {
  return (Object.keys(BASELINE) as ItemId[]).reduce(
    (result, id) => {
      if (!isFactorActive(id, controls[id])) {
        result[id] = BASELINE[id];
      } else if (id === 'sewage') {
        // No modo pulso, o efluente não tem taxa contínua (a massa é injetada instantaneamente em [CBOD])
        // No modo contínuo, a taxa diária (kg DBO5/dia) vai direto para a EDO sem passar por retenção de 30d
        result.sewage = dischargeMode === 'pulse' ? 0 : controls.sewage;
      } else if (isMassLoadId(id)) {
        result[id] = receivedLoadRange(controls[id], sectorId).centralKg;
      } else {
        result[id] = controls[id];
      }
      return result;
    },
    { ...BASELINE },
  );
}

function sampleHistory(state: SimulationState, next: SimulationState): SimulationState {
  const { sampleDays, maxPoints } = PARAMETERS.history;
  const previousSample = Math.floor(state.elapsedDays / sampleDays);
  const nextSample = Math.floor(next.elapsedDays / sampleDays);
  if (nextSample <= previousSample) return next;

  const sector = BTS_SECTORS.find((s) => s.id === next.sector) ?? BTS_SECTORS[0];

  const point = {
    day: Math.round(next.elapsedDays),
    coral: next.health.coral,
    fish: next.health.fish,
    overall: next.overall,
    algae: calculateAlgae(next.env, next.health),
    temperature: next.env.temperature,
    ph: effectivePh(next.env, next.biochemicalOxygenDemand, next.sector, next.respiratoryDicUmolKg),
    dhw: next.degreeHeatingWeeks,
    dissolvedOxygen: next.dissolvedOxygen,
    bod: next.biochemicalOxygenDemand,
    saturationOxygen: calculateWeissOxygenSaturation(next.env.temperature, sector.baselineSalinity),
    sewage: next.env.sewage,
    microplastics: next.env.microplastics,
    oil: next.env.oil,
    species: { ...next.species },
  };

  return { ...next, history: [...state.history, point].slice(-maxPoints) };
}

/**
 * Atualiza a janela móvel de 84 dias do estresse térmico acumulado simulado.
 * Utiliza a referência didática fixa do cenário local (MMM = 28,0 °C; limiar de acúmulo = 29,0 °C),
 * que não deve ser confundida com o produto satelital oficial DHW da NOAA CRW (calculado sobre a
 * climatologia específica de cada célula de 5 km).
 */
function updateThermalDose(state: SimulationState, temperature: number, dtDays: number) {
  const thermalDose = state.thermalDose.map((entry) => ({ ...entry }));
  const hotSpot = temperature - PARAMETERS.temperature.maximumMonthlyMean;
  let cursor = state.elapsedDays;
  let remaining = dtDays;

  while (remaining > 1e-9) {
    const day = Math.floor(cursor);
    const slice = Math.min(remaining, day + 1 - cursor || remaining);
    const degreeDays = hotSpot >= 1 ? hotSpot * slice : 0;
    const last = thermalDose.at(-1);

    if (last?.day === day) last.degreeDays += degreeDays;
    else thermalDose.push({ day, degreeDays });

    cursor += slice;
    remaining -= slice;
  }

  const firstDay = Math.floor(state.elapsedDays + dtDays) - 83;
  const window = thermalDose.filter((entry) => entry.day >= firstDay);
  const degreeHeatingWeeks = window.reduce((sum, entry) => sum + entry.degreeDays, 0) / 7;

  return { thermalDose: window, degreeHeatingWeeks };
}

function singleTickStep(state: SimulationState, dtDays: number): SimulationState {
  const sector = BTS_SECTORS.find((s) => s.id === state.sector) ?? BTS_SECTORS[0];
  const effectiveTargets = computeEffectiveTargets(state.targets, state.activeInterventions);

  // Depuração de estoques ambientais respeitando tempos de descarga e sedimentação
  const env = stepEnvironmentalStocks(state.env, effectiveTargets, state.activeInterventions, sector, dtDays);

  // Idade de intemperismo do derramamento de óleo
  const currentSpillAge = (env.oil > 0 || state.targets.oil > 0)
    ? (state.oilSpillAgeDays ?? 0) + dtDays
    : 0;

  // Skimming de óleo superficial
  const skimming = stepOilContainmentSkimming(
    env.oil,
    state.recoveredOilKg ?? 0,
    currentSpillAge,
    state.sector,
    state.activeInterventions,
    dtDays,
  );
  const nextRecoveredOilKg = skimming.nextRecoveredKg;

  const currentBod = state.biochemicalOxygenDemand ?? 0;
  const currentDo = state.dissolvedOxygen ?? calculateWeissOxygenSaturation(env.temperature);
  const algae = calculateAlgae(env, state.health, state.sewageDischargeMode, currentBod);
  const dischargeType = state.sewageDischargeMode === 'pulse' ? 'instant_pulse' : 'continuous_daily';
  const oxygenKinetics = integrateOxygenKinetics(
    currentDo,
    currentBod,
    env,
    state.sector,
    dtDays,
    algae,
    dischargeType,
  );
  const oxygen = oxygenKinetics.nextDo;
  const bod = oxygenKinetics.nextBod;

  // Integração do fluxo de respiração microbiana para acréscimo de DIC (estequiometria RQ = 1,0)
  const kFlush = 1 / Math.max(1, sector.dischargeDays);
  const respiratoryDicFluxUmolKg = (oxygenKinetics.bodDeoxFlux / 32) * 1000 * 0.98;
  const nextRespiratoryDic = Math.max(
    0,
    (state.respiratoryDicUmolKg ?? 0) * Math.exp(-kFlush * dtDays) + respiratoryDicFluxUmolKg * dtDays,
  );

  const thermal = updateThermalDose(state, env.temperature, dtDays);
  const stress = calculateStress(
    env,
    thermal.degreeHeatingWeeks,
    oxygen,
    bod,
    state.sector,
    nextRespiratoryDic,
    state.sewageDischargeMode,
    state.elapsedDays + dtDays,
    nextRecoveredOilKg,
    state.activeInterventions,
  );

  // Proteção do ecossistema: responde a alívio real e suporta compatibilidade legada caso recovery > 0
  const protection = Math.max(0, Math.min(1, (state.env.recovery ?? 0) / 100));
  const exposure = PRESSURE_IDS.reduce(
    (result, id) => {
      result[id] += stress.pressures[id] * dtDays;
      return result;
    },
    { ...state.exposure },
  );

  const health: Health = {
    coral: updateHealth(state.health.coral, stress.coral, PARAMETERS.collapseDays.coral, dtDays, protection),
    fish: 0,
  };

  const species = FISH_SPECIES.reduce(
    (result, item) => {
      result[item.id] = updateHealth(
        state.species[item.id],
        stress.species[item.id],
        item.collapseDays,
        dtDays,
        protection,
      );
      return result;
    },
    { ...state.species },
  );

  health.fish = FISH_SPECIES.reduce((total, item) => total + species[item.id], 0) / FISH_SPECIES.length;
  const overall = (health.coral + health.fish) / 2;
  const everDegraded = state.everDegraded || overall < 75;

  return {
    ...state,
    env,
    degreeHeatingWeeks: thermal.degreeHeatingWeeks,
    thermalDose: thermal.thermalDose,
    pressures: stress.pressures,
    health,
    species,
    exposure,
    overall,
    everDegraded,
    dissolvedOxygen: oxygen,
    biochemicalOxygenDemand: bod,
    respiratoryDicUmolKg: nextRespiratoryDic,
    recoveredOilKg: nextRecoveredOilKg,
    oilSpillAgeDays: currentSpillAge,
    elapsedDays: state.elapsedDays + dtDays,
  };
}

export function tickSimulation(state: SimulationState, realDtSeconds: number): SimulationState {
  if (state.paused || realDtSeconds <= 0) return state;

  const totalDtDays = realDtSeconds * PARAMETERS.daysPerRealSecond * state.speed;
  // Sub-stepping numérico: passos de no máximo 0.05 dias (~1.2 horas simuladas)
  // com proteção contra erros de arredondamento em ponto flutuante para garantir
  // equivalência exata entre velocidades (1×, 3×, 5× e 10×).
  const maxSubStepDays = 0.05;
  const numSteps = Math.max(1, Math.ceil((totalDtDays - 1e-9) / maxSubStepDays));
  const subDtDays = totalDtDays / numSteps;

  let current = state;
  for (let step = 0; step < numSteps; step += 1) {
    current = singleTickStep(current, subDtDays);
  }

  const updatedState = {
    ...current,
    messageCooldown: Math.max(0, state.messageCooldown - realDtSeconds),
  };

  return sampleHistory(state, updatedState);
}

export interface EstimateCriticalDaysOptions {
  sewageDischargeMode?: 'continuous' | 'pulse';
  initialBod?: number;
  initialDo?: number;
  initialControls?: Environment;
  initialEnv?: Environment;
}

/**
 * Projeta, a partir de um recife saudável, quando a saúde geral cruza a faixa
 * crítica didática (índice global <= 33 pontos) caso as condições aplicadas permaneçam constantes.
 *
 * NOTA EPISTEMOLÓGICA (Regra do Modelo Didático):
 * O limiar interno de 33 pontos é uma convenção didática para sinalizar colapso funcional da bancada,
 * não uma previsão demográfica ou populacional de extinção biológica em campo. A escala (0 a 100)
 * sintetiza pressões ponderadas relativas para demonstrar relações pedagógicas de estresse acumulado.
 *
 * Considera o estado completo, incluindo DBO inicial de pulsos e renovação do setor.
 */
export function estimateCriticalDays(
  targets: Environment,
  sectorId: BtsSectorId = 'frades',
  maxDays = 3650,
  options?: EstimateCriticalDaysOptions,
) {
  const isPulse = options?.sewageDischargeMode === 'pulse';
  const sectorDef = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];

  let initialBod = options?.initialBod ?? 0;
  const controlsSewage = options?.initialControls?.sewage ?? targets.sewage;
  if (isPulse && controlsSewage > 0 && initialBod === 0) {
    initialBod = convertBOD5ToPulseDeltaMgL(controlsSewage, sectorDef.mixingVolumeM3);
  }

  const baseState = createInitialState(sectorId);
  let projected: SimulationState = {
    ...baseState,
    env: options?.initialEnv ? { ...options.initialEnv } : baseState.env,
    controls: options?.initialControls ? { ...options.initialControls } : { ...targets },
    targets: {
      ...targets,
      sewage: isPulse ? 0 : targets.sewage,
    },
    sewageDischargeMode: options?.sewageDischargeMode ?? 'continuous',
    biochemicalOxygenDemand: initialBod,
    dissolvedOxygen: options?.initialDo ?? baseState.dissolvedOxygen,
    respiratoryDicUmolKg: 0,
    paused: false,
    history: [],
  };
  const stepDays = 0.5;
  const realSecondsPerStep = stepDays / PARAMETERS.daysPerRealSecond;

  while (projected.elapsedDays < maxDays && projected.overall > 33) {
    projected = tickSimulation(projected, realSecondsPerStep);
  }

  return projected.overall <= 33 ? projected.elapsedDays : null;
}

function tone(value: number, higherIsBetter = true) {
  const score = higherIsBetter ? value : 100 - value;
  if (score >= 67) return 'healthy' as const;
  if (score >= 34) return 'watch' as const;
  return 'critical' as const;
}

export interface DissolvedOxygenBreakdown {
  saturation: number;
  temperatureEffect: number;
  /** Consumo bacteriano direto por oxidação heterotrófica da matéria orgânica (DBO). */
  organicDemand: number;
  /** Consumo de oxigênio pela decomposição secundária da biomassa de algas. */
  algalDemand: number;
  dissolvedOxygen: number;
}

/**
 * Decomposição dos fatores de oxigênio dissolvido em mg/L [Produto de Modelo / CONAMA 357].
 * Separa a via direta de decomposição da matéria orgânica (DBO) da via de proliferação de algas (N/P).
 */
export function getDissolvedOxygenBreakdown(
  env: Environment,
  algae = 0,
  sectorId: BtsSectorId = 'frades',
): DissolvedOxygenBreakdown {
  const sector = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];
  const saturation = calculateWeissOxygenSaturation(env.temperature, sector.baselineSalinity);
  const baselineSat = calculateWeissOxygenSaturation(BASELINE.temperature, sector.baselineSalinity);
  const temperatureEffect = baselineSat - saturation;

  const dissolvedOxygen = calculateEquilibriumOxygen(env, sectorId, algae);
  const totalDeficit = Math.max(0, saturation - dissolvedOxygen);
  const algalShare = Math.min(1, (algae / 100) * 0.35);
  const algalDemand = totalDeficit * algalShare;
  const organicDemand = totalDeficit - algalDemand;

  return {
    saturation,
    temperatureEffect,
    organicDemand,
    algalDemand,
    dissolvedOxygen,
  };
}

/**
 * Estimativa físico-química de oxigênio dissolvido em mg/L [Produto de Modelo / Padrão CONAMA 357].
 * Baseada no balanço analítico em estado estacionário acoplado à equação de Weiss (1970).
 */
export function calculateDissolvedOxygen(
  state: {
    env: Environment;
    pressures?: Pressures;
    health?: Health;
    dissolvedOxygen?: number;
    sector?: BtsSectorId;
    sewageDischargeMode?: 'continuous' | 'pulse';
  },
  algae?: number,
) {
  const currentAlgae = algae ?? (state.health ? calculateAlgae(state.env, state.health) : 0);
  const dischargeType = state.sewageDischargeMode === 'pulse' ? 'instant_pulse' : 'continuous_daily';
  return calculateEquilibriumOxygen(state.env, state.sector ?? 'frades', currentAlgae, dischargeType);
}

/** Indicadores derivados que o aluno acompanha no painel. */
export function deriveIndicators(state: SimulationState): Indicator[] {
  const algae = calculateAlgae(state.env, state.health);
  const oxygen = state.elapsedDays > 0
    ? state.dissolvedOxygen
    : calculateDissolvedOxygen(state, algae);
  const oxygenScore = clamp((oxygen - 2) / 4, 0, 1) * 100;
  const thriving = FISH_SPECIES.filter((item) => state.species[item.id] >= 60);
  const speciesScore = (thriving.length / FISH_SPECIES.length) * 100;
  const trophic = calculateTrophicBalance(state.species, algae);

  return [
    {
      id: 'coral',
      label: 'Saúde dos corais',
      display: `${Math.round(state.health.coral)}/100`,
      value: state.health.coral,
      unit: '/100',
      tone: tone(state.health.coral),
      note: 'Índice didático relativo à baseline; não equivale a cobertura viva medida em campo.',
      badge: 'Regra do Modelo',
    },
    {
      id: 'algae',
      label: 'Pressão de algas',
      display: `${Math.round(algae)}/100`,
      value: algae,
      unit: '/100',
      tone: tone(algae, false),
      note: 'Índice derivado de nutrientes, raspagem de herbívoros e espaço livre.',
      badge: 'Regra do Modelo',
    },
    {
      id: 'fish',
      label: 'Saúde dos peixes',
      display: `${Math.round(state.health.fish)}/100`,
      value: state.health.fish,
      unit: '/100',
      tone: tone(state.health.fish),
      note: 'Índice composto das três espécies simuladas, sem equivalência demográfica direta.',
      badge: 'Regra do Modelo',
    },
    {
      id: 'species',
      label: 'Espécies estáveis',
      display: `${thriving.length} de ${FISH_SPECIES.length}`,
      value: speciesScore,
      unit: '',
      tone: tone(speciesScore),
      note: 'Espécies com índice individual acima de 60/100 no cenário.',
      badge: 'Regra do Modelo',
    },
    {
      id: 'trophic',
      label: 'Equilíbrio trófico',
      display: `${Math.round(trophic)}/100`,
      value: trophic,
      unit: '/100',
      tone: tone(trophic),
      note: 'Razão entre herbivoria ativa e dominância de algas.',
      badge: 'Regra do Modelo',
    },
    {
      id: 'oxygen',
      label: 'Oxigênio dissolvido',
      display: `${oxygen.toFixed(1).replace('.', ',')} mg/L`,
      value: oxygenScore,
      unit: 'mg/L',
      tone: oxygen >= 5 ? 'healthy' : oxygen >= 3 ? 'watch' : 'critical',
      note: 'Padrão US EPA / CONAMA 357: > 5 mg/L condição adequada; 3–5 mg/L estresse potencial; 2–3 mg/L hipóxia; < 2 mg/L hipóxia severa (anóxia em ~0 mg/L).',
      badge: 'Produto de Modelo',
      equation: 'd[OD]/dt = ka·(Cs - [OD]) - kd·[DBO] - SOD/H + (P - R)',
    },
  ];
}

export type ImpactMetricId =
  | 'dissolvedOxygen'
  | 'coralHealth'
  | 'fishHealth'
  | 'turbidity'
  | 'ph';

export interface ImpactMilestone {
  id: string;
  label: string;
  metric: ImpactMetricId;
  direction: 'below' | 'above' | 'decreaseFromBaseline';
  threshold: number;
  firstCrossingDay: number | null;
  crossingSimDay?: number | null;
  baseline?: number;
  unit?: string;
  assumptions?: string;
  evidenceLevel: 'published' | 'local-calibrated' | 'educational-hypothesis';
}

/**
 * Cria a lista de marcos padrão para estimativa de linha do tempo de impacto.
 * Distingue explicitamente limiares oceanográficos publicados (CONAMA/EPA, Lueker)
 * de convenções didáticas de sensibilidade do modelo.
 */
export function buildDefaultImpactMilestones(state: SimulationState): ImpactMilestone[] {
  const currentPh = effectivePh(state.env, state.biochemicalOxygenDemand, state.sector, state.respiratoryDicUmolKg);
  return [
    {
      id: 'do-stress-5mgL',
      label: 'Oxigênio < 5,0 mg/L (estresse respiratório inicial)',
      metric: 'dissolvedOxygen',
      direction: 'below',
      threshold: 5.0,
      baseline: Number(state.dissolvedOxygen.toFixed(2)),
      unit: 'mg/L',
      assumptions: 'Critério CONAMA 357 / US EPA para vida aquática marinha',
      evidenceLevel: 'published',
      firstCrossingDay: null,
    },
    {
      id: 'do-hypoxia-3mgL',
      label: 'Oxigênio < 3,0 mg/L (alerta de hipóxia estuarina)',
      metric: 'dissolvedOxygen',
      direction: 'below',
      threshold: 3.0,
      baseline: Number(state.dissolvedOxygen.toFixed(2)),
      unit: 'mg/L',
      assumptions: 'Limiar de fuga e letargia da fauna recifal',
      evidenceLevel: 'published',
      firstCrossingDay: null,
    },
    {
      id: 'ph-stress-790',
      label: 'pH efetivo ≤ 7,90 (redução de saturação de aragonita)',
      metric: 'ph',
      direction: 'below',
      threshold: 7.90,
      baseline: Number(currentPh.toFixed(2)),
      unit: 'escala total',
      assumptions: 'Equilíbrio carbonático acoplado a Lueker et al. (2000)',
      evidenceLevel: 'published',
      firstCrossingDay: null,
    },
    {
      id: 'coral-drop-10',
      label: 'Saúde dos corais cai 10% no modelo',
      metric: 'coralHealth',
      direction: 'decreaseFromBaseline',
      threshold: 10,
      baseline: Number(state.health.coral.toFixed(1)),
      unit: '% índice',
      assumptions: 'Dinâmica didática de sensibilidade ponderada do recife',
      evidenceLevel: 'educational-hypothesis',
      firstCrossingDay: null,
    },
    {
      id: 'fish-drop-10',
      label: 'Saúde dos peixes cai 10% no modelo',
      metric: 'fishHealth',
      direction: 'decreaseFromBaseline',
      threshold: 10,
      baseline: Number(state.health.fish.toFixed(1)),
      unit: '% índice',
      assumptions: 'Média ponderada das 3 espécies recifais simuladas',
      evidenceLevel: 'educational-hypothesis',
      firstCrossingDay: null,
    },
    {
      id: 'turbidity-attenuation-35',
      label: 'Turbidez ≥ 35% (limiar de atenuação de luz)',
      metric: 'turbidity',
      direction: 'above',
      threshold: 35,
      baseline: Number(state.env.turbidity.toFixed(1)),
      unit: '% índice',
      assumptions: 'Índice de perda de transparência no cenário',
      evidenceLevel: 'educational-hypothesis',
      firstCrossingDay: null,
    },
  ];
}

/**
 * Percorre o modelo em passos simulados fixos projetando quando os indicadores ambientais
 * e ecológicos cruzam marcos predefinidos.
 *
 * Força velocidade speed = 1 para que o resultado dependa exclusivamente do estado e da física,
 * nunca da taxa de reprodução gráfica escolhida na interface.
 */
export function estimateImpactTimeline(
  initialState: SimulationState,
  milestones: readonly ImpactMilestone[],
  horizonDays = 365,
): ImpactMilestone[] {
  let sim: SimulationState = {
    ...initialState,
    paused: false,
    speed: 1,
    history: [],
    firedMessages: new Set<string>(),
    events: [],
  };

  const results: ImpactMilestone[] = milestones.map((m) => ({ ...m, firstCrossingDay: null }));
  const startDay = sim.elapsedDays;

  const readMetric = (st: SimulationState, metric: ImpactMetricId): number => {
    switch (metric) {
      case 'dissolvedOxygen':
        return st.dissolvedOxygen;
      case 'coralHealth':
        return st.health.coral;
      case 'fishHealth':
        return st.health.fish;
      case 'turbidity':
        return st.env.turbidity;
      case 'ph':
        return effectivePh(st.env, st.biochemicalOxygenDemand, st.sector, st.respiratoryDicUmolKg);
    }
  };

  const checkCrossing = (m: ImpactMilestone, currentVal: number): boolean => {
    const base = m.baseline ?? (m.direction === 'decreaseFromBaseline' ? 100 : currentVal);
    if (m.direction === 'below') {
      return currentVal <= m.threshold;
    }
    if (m.direction === 'above') {
      return currentVal >= m.threshold;
    }
    if (m.direction === 'decreaseFromBaseline') {
      return (base - currentVal) >= m.threshold;
    }
    return false;
  };

  // Avaliação no instante t = 0 (marco já atingido na condição inicial)
  for (let i = 0; i < results.length; i += 1) {
    const val = readMetric(sim, results[i].metric);
    if (checkCrossing(results[i], val)) {
      results[i].firstCrossingDay = 0;
      results[i].crossingSimDay = Number(sim.elapsedDays.toFixed(1));
    }
  }

  const stepDays = 0.25;
  const realSecondsPerStep = stepDays / PARAMETERS.daysPerRealSecond; // a speed=1: 0.5 s real
  let projectedDays = 0;

  while (projectedDays < horizonDays) {
    const allCrossed = results.every((m) => m.firstCrossingDay !== null);
    if (allCrossed) break;

    sim = tickSimulation(sim, realSecondsPerStep);
    projectedDays += stepDays;

    for (let i = 0; i < results.length; i += 1) {
      if (results[i].firstCrossingDay === null) {
        const val = readMetric(sim, results[i].metric);
        if (checkCrossing(results[i], val)) {
          results[i].firstCrossingDay = Number((sim.elapsedDays - startDay).toFixed(1));
          results[i].crossingSimDay = Number(sim.elapsedDays.toFixed(1));
        }
      }
    }
  }

  return results;
}
