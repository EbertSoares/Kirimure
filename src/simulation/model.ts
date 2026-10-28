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
import { calculateEquilibriumOxygen, calculateWeissOxygenSaturation, convertBOD5ToUltimateBOD, integrateOxygenKinetics } from './oxygen';
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

export function isFactorActive(id: ItemId, value: number) {
  return Math.abs(value - BASELINE[id]) > 1e-9;
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

/** Normaliza a massa recebida para a escala educativa escolhida. */
export function normalizedReceivedLoad(id: MassLoadId, valueKg: number) {
  return clamp(valueKg / PARAMETERS.receivedLoads[id].maximumKg);
}

/**
 * pH que o recife sente: pH de contorno ajustado termodinamicamente pela respiração
 * microbiana da matéria orgânica (DBO) que eleva o DIC, eliminando deduções lineares fictícias.
 */
export function effectivePh(
  env: Environment,
  bodConcentrationMgL = 0,
  sectorId: BtsSectorId = 'frades',
): number {
  if (bodConcentrationMgL <= 0 && env.sewage <= 0) {
    return env.ph;
  }
  const sector = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];
  const scaledTa = 2350 * (sector.baselineSalinity / 35.0);
  const effectiveBodMgL = bodConcentrationMgL > 0
    ? bodConcentrationMgL
    : (convertBOD5ToUltimateBOD(env.sewage) * 1000) / sector.mixingVolumeM3;

  const impact = calculateRespirationPhImpact(
    env.ph,
    effectiveBodMgL,
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
): Pressures {
  const ph = effectivePh(env, bodConcentrationMgL, sectorId);
  const currentHeat = stressAbove(
    env.temperature,
    PARAMETERS.temperature.bleachingThreshold,
    PARAMETERS.temperature.bleachingThreshold + 2,
  ) * 0.25;
  const accumulatedHeat = clamp(dhw / PARAMETERS.temperature.severeDhw);

  return {
    thermal: combine([currentHeat, accumulatedHeat]),
    acidification: stressBelow(ph, PARAMETERS.ph.coralStart, PARAMETERS.ph.coralMax),
    oil: normalizedReceivedLoad('oil', env.oil),
    microplastics: normalizedReceivedLoad('microplastics', env.microplastics),
    sewage: normalizedReceivedLoad('sewage', env.sewage),
    turbidity: clamp(env.turbidity / 100),
    fishing: clamp(env.fishing / 100),
  };
}

/**
 * Índice de estresse respiratório por desoxigenação (hipóxia) [Padrão US EPA / CONAMA 357].
 * > 5,0 mg/L: normóxia (condição adequada para vida aquática marinha, estresse = 0).
 * 3,0–5,0 mg/L: estresse respiratório potencial (0 .. 0.35).
 * 2,0–3,0 mg/L: hipóxia (0.35 .. 0.75).
 * < 2,0 mg/L: hipóxia severa (0.75 .. 1.0, risco agudo de asfixia e mortalidade).
 */
export function hypoxiaStress(dissolvedOxygen = 7.12): number {
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
  dissolvedOxygen = 7.12,
  bodConcentrationMgL = 0,
  sectorId: BtsSectorId = 'frades',
): Pressures {
  const base = calculatePressures(env, dhw, bodConcentrationMgL, sectorId);
  const hypoxia = hypoxiaStress(dissolvedOxygen);
  return {
    ...base,
    thermal: stressAbove(env.temperature, PARAMETERS.temperature.fishStart, PARAMETERS.temperature.fishMax),
    acidification: stressBelow(effectivePh(env, bodConcentrationMgL, sectorId), PARAMETERS.ph.fishStart, PARAMETERS.ph.fishMax),
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
  dissolvedOxygen = 7.12,
  bodConcentrationMgL = 0,
  sectorId: BtsSectorId = 'frades',
) {
  const pressures = calculatePressures(env, dhw, bodConcentrationMgL, sectorId);
  const fishPressures = calculateFishPressures(env, dhw, dissolvedOxygen, bodConcentrationMgL, sectorId);
  const species = Object.fromEntries(
    FISH_SPECIES.map((item) => [item.id, speciesStress(fishPressures, item.id)]),
  ) as Record<FishSpeciesId, number>;
  const fish = FISH_SPECIES.reduce((total, item) => total + species[item.id], 0) / FISH_SPECIES.length;

  return { coral: coralStress(pressures), fish, species, pressures };
}

/** Cobertura de algas (0 a 100): nutrientes, perda de herbívoros e espaço livre. */
export function calculateAlgae(env: Environment, health: Health) {
  const nutrients = normalizedReceivedLoad('sewage', env.sewage);
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
    paused: true,
    everDegraded: false,
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
    ph: effectivePh(next.env, next.biochemicalOxygenDemand, next.sector),
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
 * Atualiza a janela móvel de 84 dias usada pelo Degree Heating Week (DHW).
 * Só entram temperaturas pelo menos 1 °C acima da MMM, seguindo o método
 * operacional do NOAA Coral Reef Watch.
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

export function tickSimulation(state: SimulationState, realDtSeconds: number): SimulationState {
  if (state.paused || realDtSeconds <= 0) return state;

  const dtDays = realDtSeconds * PARAMETERS.daysPerRealSecond * state.speed;
  const env = { ...state.env };

  (Object.keys(env) as ItemId[]).forEach((id) => {
    const factor = 1 - Math.exp(-dtDays / PARAMETERS.tauDays[id]);
    env[id] += (state.targets[id] - env[id]) * factor;
  });

  const algae = calculateAlgae(env, state.health);
  const currentBod = state.biochemicalOxygenDemand ?? 0;
  const currentDo = state.dissolvedOxygen ?? calculateWeissOxygenSaturation(env.temperature);
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

  const thermal = updateThermalDose(state, env.temperature, dtDays);
  const stress = calculateStress(env, thermal.degreeHeatingWeeks, oxygen, bod, state.sector);
  const protection = clamp(env.recovery / 100);
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

  return sampleHistory(state, {
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
    elapsedDays: state.elapsedDays + dtDays,
    // A pausa entre marcos conta em segundos reais (ver messages.ts).
    messageCooldown: Math.max(0, state.messageCooldown - realDtSeconds),
  });
}

/**
 * Projeta, a partir de um recife saudável, quando a saúde geral cruza a faixa
 * crítica caso as condições aplicadas permaneçam constantes. O resultado é
 * determinístico, mas continua sendo uma estimativa do cenário calibrado — não
 * uma previsão de campo para um ponto específico da baía.
 */
export function estimateCriticalDays(targets: Environment, sectorId: BtsSectorId = 'frades', maxDays = 3650) {
  let projected: SimulationState = {
    ...createInitialState(sectorId),
    targets: { ...targets },
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
      display: `${Math.round(state.health.coral)}%`,
      value: state.health.coral,
      unit: '%',
      tone: tone(state.health.coral),
      note: 'Índice didático relativo à baseline; não equivale a cobertura viva medida em campo.',
      badge: 'Regra do Modelo',
    },
    {
      id: 'algae',
      label: 'Pressão de algas',
      display: `${Math.round(algae)}%`,
      value: algae,
      unit: '%',
      tone: tone(algae, false),
      note: 'Índice derivado de nutrientes, raspagem de herbívoros e espaço livre.',
      badge: 'Regra do Modelo',
    },
    {
      id: 'fish',
      label: 'Saúde dos peixes',
      display: `${Math.round(state.health.fish)}%`,
      value: state.health.fish,
      unit: '%',
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
      note: 'Espécies com índice individual acima de 60% no cenário.',
      badge: 'Regra do Modelo',
    },
    {
      id: 'trophic',
      label: 'Equilíbrio trófico',
      display: `${Math.round(trophic)}%`,
      value: trophic,
      unit: '%',
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
      badge: 'Padrão Operacional',
      equation: 'd[OD]/dt = ka·(Cs - [OD]) - kd·[DBO] - SOD/H + (P - R)',
    },
  ];
}
