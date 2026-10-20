import {
  BASELINE,
  FISH_SPECIES,
  ITEM_IDS,
  PARAMETERS,
  POLLUTANT_SCALES,
  PRESSURE_IDS,
  SCENARIO,
} from './config';
import type {
  Environment,
  Exposure,
  FishSpeciesId,
  Health,
  Indicator,
  ItemId,
  LivingCommunity,
  Pressures,
  SimulationCheckpoint,
  SimulationState,
} from './types';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function normalizedPollutantLoad(id: 'microplastics' | 'oil' | 'sewage', value: number) {
  return clamp(value / POLLUTANT_SCALES[id].severe);
}

export function microplasticsMgPerM3(kilograms: number) {
  return (kilograms * 1_000_000) / SCENARIO.mixedVolumeM3;
}

export function oilGramsPerM2(kilograms: number) {
  return (kilograms * 1_000) / (SCENARIO.referenceAreaKm2 * 1_000_000);
}

export function sewageNitrogenMgPerLDay(kilogramsPerDay: number) {
  return (kilogramsPerDay * 1_000_000)
    / (SCENARIO.mixedVolumeM3 * 1_000);
}

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

/**
 * Acidez extra que a poluição orgânica soma à água (0 = água sem poluição).
 *
 * A barra de pH representa acidificação da coluna d'água. A respiração e a
 * decomposição ligadas à matéria orgânica do esgoto acrescentam uma queda local.
 */
export function pollutionAcidity(env: Environment) {
  const weights = PARAMETERS.ph.pollutionWeights;
  const load = (
    normalizedPollutantLoad('sewage', env.sewage) * weights.sewage
    + normalizedPollutantLoad('oil', env.oil) * weights.oil
    + normalizedPollutantLoad('microplastics', env.microplastics) * weights.microplastics
  );

  return clamp(load) * PARAMETERS.ph.pollutionDrop;
}

/** pH que o recife sente: o da barra menos a acidez vinda da poluição. */
export function effectivePh(env: Environment) {
  return env.ph - pollutionAcidity(env);
}

/** Traduz o ambiente em pressões de 0 a 1 sobre o recife (limiares dos corais). */
export function calculatePressures(env: Environment): Pressures {
  const ph = effectivePh(env);

  return {
    thermal: stressAbove(env.temperature, PARAMETERS.temperature.coralStart, PARAMETERS.temperature.coralMax),
    acidification: stressBelow(ph, PARAMETERS.ph.coralStart, PARAMETERS.ph.coralMax),
    oil: normalizedPollutantLoad('oil', env.oil),
    microplastics: normalizedPollutantLoad('microplastics', env.microplastics),
    sewage: normalizedPollutantLoad('sewage', env.sewage),
    turbidity: clamp(env.turbidity / 100),
    fishing: clamp(env.fishing / 100),
  };
}

/** Peixes toleram mais calor e menos acidez que os corais: os limiares mudam. */
export function calculateFishPressures(env: Environment): Pressures {
  return {
    ...calculatePressures(env),
    thermal: stressAbove(env.temperature, PARAMETERS.temperature.fishStart, PARAMETERS.temperature.fishMax),
    acidification: stressBelow(effectivePh(env), PARAMETERS.ph.fishStart, PARAMETERS.ph.fishMax),
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

export function calculateStress(env: Environment, degreeHeatingWeeks = 0) {
  const instantaneousPressures = calculatePressures(env);
  const pressures = {
    ...instantaneousPressures,
    // O calor só domina depois de acumular. Uma pequena parcela instantânea
    // mantém o organismo reagindo enquanto a janela térmica é formada.
    thermal: Math.max(
      instantaneousPressures.thermal * 0.2,
      clamp(degreeHeatingWeeks / PARAMETERS.temperature.dhwMortality),
    ),
  };
  const instantaneousFishPressures = calculateFishPressures(env);
  const fishPressures = {
    ...instantaneousFishPressures,
    thermal: Math.max(
      instantaneousFishPressures.thermal * 0.3,
      clamp(degreeHeatingWeeks / (PARAMETERS.temperature.dhwMortality * 1.35)),
    ),
  };
  const species = Object.fromEntries(
    FISH_SPECIES.map((item) => [item.id, speciesStress(fishPressures, item.id)]),
  ) as Record<FishSpeciesId, number>;
  const fish = FISH_SPECIES.reduce((total, item) => total + species[item.id], 0) / FISH_SPECIES.length;

  return { coral: coralStress(pressures), fish, species, pressures };
}

/** Cobertura de algas (0 a 100): nutrientes, perda de herbívoros e espaço livre. */
export function calculateAlgae(env: Environment, health: Health) {
  const nutrients = normalizedPollutantLoad('sewage', env.sewage);
  const grazers = clamp(1 - health.fish / 100);
  const sediment = clamp(env.turbidity / 100) * 0.2;
  const freeSpace = clamp(1 - health.coral / 100) * 0.5;

  return clamp(0.15 + nutrients * 0.75 + grazers * 0.55 + sediment + freeSpace) * 100;
}

/** Oxigênio dissolvido estimado em mg/L para a célula didática. */
export function calculateDissolvedOxygen(env: Environment, algae: number) {
  const warmingLoss = Math.max(0, env.temperature - BASELINE.temperature) * 0.18;
  const organicDemand = normalizedPollutantLoad('sewage', env.sewage) * 3.15;
  const bloomDemand = clamp((algae - 15) / 85) * 1.35;
  return clamp(6.6 - warmingLoss - organicDemand - bloomDemand, 0.4, 8);
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

function updateLivingCommunity(
  current: number,
  condition: number,
  stress: number,
  collapseDays: number,
  dtDays: number,
) {
  const start = PARAMETERS.mortality.startsBelowCondition;
  if (condition >= start || stress <= 0) return current;
  const physiologicalSeverity = clamp((start - condition) / start);
  const mortalityPerDay = (100 / collapseDays)
    * PARAMETERS.mortality.relativeRate
    * stress
    * physiologicalSeverity;
  // Nunca aumenta: retirar a pressão salva sobreviventes, mas não ressuscita
  // organismos mortos nem recompõe cobertura de coral durante o experimento.
  return clamp(current - mortalityPerDay * dtDays, 0, 100);
}

function updateDegreeHeatingWeeks(current: number, temperature: number, dtDays: number) {
  const hotspot = Math.max(0, temperature - PARAMETERS.temperature.coralStart);
  const gain = hotspot * dtDays / 7;
  // Aproxima a saída da janela móvel de 12 semanas do NOAA Coral Reef Watch.
  const retention = Math.exp(-dtDays / PARAMETERS.temperature.dhwWindowDays);
  return Math.max(0, current * retention + gain);
}

function recoveryOutlook(living: LivingCommunity) {
  const remaining = (living.coral * 0.65) + (living.fish * 0.35);
  if (living.coral <= 5) return 'reconstrução física: séculos a milênios';
  if (remaining < 20) return 'recuperação ecológica: décadas a séculos';
  if (remaining < 50) return 'recuperação ecológica: 20–50 anos';
  if (remaining < 75) return 'recuperação provável: 10–30 anos';
  return 'recuperação provável: 7–15 anos';
}

function evaluateCheckpoint(
  state: SimulationState,
  nextOverall: number,
  living: LivingCommunity,
  elapsedDays: number,
): SimulationCheckpoint | null {
  const collapsed = nextOverall <= PARAMETERS.checkpoints.collapseOverall
    || living.coral <= PARAMETERS.checkpoints.collapseLiving;

  if (collapsed) {
    return {
      kind: 'collapse',
      day: Math.round(elapsedDays),
      title: 'Colapso ecológico do recorte simulado',
      explanation: 'A cobertura viva caiu abaixo do limite funcional. Zerar as cargas interrompe o dano, mas não recompõe os organismos mortos.',
      recoveryLabel: recoveryOutlook(living),
      locked: true,
    };
  }

  if (
    nextOverall <= PARAMETERS.checkpoints.criticalOverall
    && !state.criticalCheckpointAcknowledged
  ) {
    return {
      kind: 'critical',
      day: Math.round(elapsedDays),
      title: 'Estado crítico, ainda recuperável',
      explanation: 'O relógio parou para a turma observar o primeiro limite crítico antes de decidir se continua o experimento.',
      recoveryLabel: recoveryOutlook(living),
      locked: false,
    };
  }

  return null;
}

export function createInitialState(): SimulationState {
  const stress = calculateStress(BASELINE);
  const initialAlgae = calculateAlgae(BASELINE, { coral: 100, fish: 100 });

  return {
    env: { ...BASELINE },
    targets: { ...BASELINE },
    health: { coral: 100, fish: 100 },
    living: { coral: 100, fish: 100 },
    species: { 'blue-tang': 100, 'sergeant-major': 100, parrotfish: 100 },
    speciesLiving: { 'blue-tang': 100, 'sergeant-major': 100, parrotfish: 100 },
    pressures: stress.pressures,
    exposure: Object.fromEntries(PRESSURE_IDS.map((id) => [id, 0])) as Exposure,
    degreeHeatingWeeks: 0,
    overall: 100,
    elapsedDays: 0,
    speed: 1,
    paused: true,
    history: [
      {
        day: 0,
        coral: 100,
        fish: 100,
        livingCoral: 100,
        livingFish: 100,
        overall: 100,
        algae: initialAlgae,
        temperature: BASELINE.temperature,
        ph: BASELINE.ph,
        microplastics: BASELINE.microplastics,
        oil: BASELINE.oil,
        sewage: BASELINE.sewage,
        dissolvedOxygen: calculateDissolvedOxygen(BASELINE, initialAlgae),
        degreeHeatingWeeks: 0,
      },
    ],
    firedMessages: new Set(),
    events: [],
    latestMessageId: null,
    messageCooldown: 0,
    checkpoint: null,
    criticalCheckpointAcknowledged: false,
  };
}

export function buildTargets(controls: Environment): Environment {
  return (Object.keys(BASELINE) as ItemId[]).reduce(
    (result, id) => {
      result[id] = isFactorActive(id, controls[id]) ? controls[id] : BASELINE[id];
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

  const point = {
    day: Math.round(next.elapsedDays),
    coral: next.health.coral,
    fish: next.health.fish,
    livingCoral: next.living.coral,
    livingFish: next.living.fish,
    overall: next.overall,
    algae: calculateAlgae(next.env, next.living),
    temperature: next.env.temperature,
    ph: effectivePh(next.env),
    microplastics: next.env.microplastics,
    oil: next.env.oil,
    sewage: next.env.sewage,
    dissolvedOxygen: calculateDissolvedOxygen(
      next.env,
      calculateAlgae(next.env, next.living),
    ),
    degreeHeatingWeeks: next.degreeHeatingWeeks,
  };

  return { ...next, history: [...state.history, point].slice(-maxPoints) };
}

export function tickSimulation(state: SimulationState, realDtSeconds: number): SimulationState {
  if (state.paused || realDtSeconds <= 0) return state;

  const dtDays = realDtSeconds * PARAMETERS.daysPerRealSecond * state.speed;
  const env = { ...state.env };

  (Object.keys(env) as ItemId[]).forEach((id) => {
    const factor = 1 - Math.exp(-dtDays / PARAMETERS.tauDays[id]);
    env[id] += (state.targets[id] - env[id]) * factor;
  });

  const degreeHeatingWeeks = updateDegreeHeatingWeeks(
    state.degreeHeatingWeeks,
    env.temperature,
    dtDays,
  );
  const stress = calculateStress(env, degreeHeatingWeeks);
  const protection = clamp(env.recovery / 100);
  const exposure = PRESSURE_IDS.reduce(
    (result, id) => {
      result[id] = id === 'thermal'
        ? degreeHeatingWeeks
        : result[id] + stress.pressures[id] * dtDays;
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

  const living: LivingCommunity = {
    coral: updateLivingCommunity(
      state.living.coral,
      health.coral,
      stress.coral,
      PARAMETERS.collapseDays.coral,
      dtDays,
    ),
    fish: 0,
  };

  const speciesLiving = FISH_SPECIES.reduce(
    (result, item) => {
      result[item.id] = updateLivingCommunity(
        state.speciesLiving[item.id],
        species[item.id],
        stress.species[item.id],
        item.collapseDays,
        dtDays,
      );
      return result;
    },
    { ...state.speciesLiving },
  );

  health.fish = FISH_SPECIES.reduce((total, item) => total + species[item.id], 0) / FISH_SPECIES.length;
  living.fish = FISH_SPECIES.reduce(
    (total, item) => total + speciesLiving[item.id],
    0,
  ) / FISH_SPECIES.length;
  const overall = (
    health.coral * 0.3
    + health.fish * 0.25
    + living.coral * 0.3
    + living.fish * 0.15
  );
  const elapsedDays = state.elapsedDays + dtDays;
  const checkpoint = evaluateCheckpoint(state, overall, living, elapsedDays);

  return sampleHistory(state, {
    ...state,
    env,
    pressures: stress.pressures,
    health,
    living,
    species,
    speciesLiving,
    exposure,
    degreeHeatingWeeks,
    overall,
    elapsedDays,
    paused: checkpoint ? true : state.paused,
    checkpoint: checkpoint ?? state.checkpoint,
    // A pausa entre marcos conta em segundos reais (ver messages.ts).
    messageCooldown: Math.max(0, state.messageCooldown - realDtSeconds),
  });
}

function tone(value: number, higherIsBetter = true) {
  const score = higherIsBetter ? value : 100 - value;
  if (score >= 67) return 'healthy' as const;
  if (score >= 34) return 'watch' as const;
  return 'critical' as const;
}

/** Indicadores derivados que o aluno acompanha no painel. */
export function deriveIndicators(state: SimulationState): Indicator[] {
  const algae = calculateAlgae(state.env, state.living);
  const oxygen = calculateDissolvedOxygen(state.env, algae);
  const oxygenScore = clamp(oxygen / 6.6) * 100;
  const thriving = FISH_SPECIES.filter((item) =>
    Math.min(state.species[item.id], state.speciesLiving[item.id]) >= 60
  );
  const speciesScore = (thriving.length / FISH_SPECIES.length) * 100;
  const trophic = calculateTrophicBalance(state.speciesLiving, algae);

  return [
    {
      id: 'coral',
      label: 'Cobertura de coral vivo',
      display: `${Math.round(state.living.coral)}%`,
      value: state.living.coral,
      unit: '%',
      tone: tone(state.living.coral),
      note: `Condição dos sobreviventes: ${Math.round(state.health.coral)}%. Cobertura perdida não volta sem recrutamento ou restauração.`,
    },
    {
      id: 'algae',
      label: 'Cobertura de algas',
      display: `${Math.round(algae)}%`,
      value: algae,
      unit: '%',
      tone: tone(algae, false),
      note: 'Algas crescem com nutrientes e com a falta de peixes herbívoros.',
    },
    {
      id: 'fish',
      label: 'Abundância relativa de peixes',
      display: `${Math.round(state.living.fish)}%`,
      value: state.living.fish,
      unit: '%',
      tone: tone(state.living.fish),
      note: `Condição média dos sobreviventes: ${Math.round(state.health.fish)}%. Mortes só são revertidas ao reiniciar.`,
    },
    {
      id: 'species',
      label: 'Espécies em bom estado',
      display: `${thriving.length} de ${FISH_SPECIES.length}`,
      value: speciesScore,
      unit: '',
      tone: tone(speciesScore),
      note: 'Uma espécie conta como saudável acima de 60%.',
    },
    {
      id: 'trophic',
      label: 'Equilíbrio da teia alimentar',
      display: `${Math.round(trophic)}%`,
      value: trophic,
      unit: '%',
      tone: tone(trophic),
      note: 'Pesa quem come algas (cirurgião-patela e papagaio) contra o espaço que as algas ocupam.',
    },
    {
      id: 'oxygen',
      label: 'Oxigênio dissolvido',
      display: `${oxygen.toFixed(1).replace('.', ',')} mg/L`,
      value: oxygenScore,
      unit: 'mg/L',
      tone: oxygen >= 5 ? 'healthy' : oxygen >= 3 ? 'watch' : 'critical',
      note: 'Abaixo de 5 mg/L há estresse; abaixo de 3 mg/L muitos peixes não se sustentam.',
    },
  ];
}
