import { BASELINE, FISH_SPECIES, ITEM_IDS, PARAMETERS, PRESSURE_IDS } from './config';
import type {
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

/** Traduz o ambiente em pressões de 0 a 1 sobre o recife (limiares dos corais). */
export function calculatePressures(env: Environment): Pressures {
  return {
    thermal: stressAbove(env.temperature, PARAMETERS.temperature.coralStart, PARAMETERS.temperature.coralMax),
    acidification: stressBelow(env.ph, PARAMETERS.ph.coralStart, PARAMETERS.ph.coralMax),
    oil: clamp(env.oil / 100),
    microplastics: clamp(env.microplastics / 100),
    sewage: clamp(env.sewage / 100),
    turbidity: clamp(env.turbidity / 100),
    fishing: clamp(env.fishing / 100),
  };
}

/** Peixes toleram mais calor e menos acidez que os corais: os limiares mudam. */
export function calculateFishPressures(env: Environment): Pressures {
  return {
    ...calculatePressures(env),
    thermal: stressAbove(env.temperature, PARAMETERS.temperature.fishStart, PARAMETERS.temperature.fishMax),
    acidification: stressBelow(env.ph, PARAMETERS.ph.fishStart, PARAMETERS.ph.fishMax),
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

export function calculateStress(env: Environment) {
  const pressures = calculatePressures(env);
  const fishPressures = calculateFishPressures(env);
  const species = Object.fromEntries(
    FISH_SPECIES.map((item) => [item.id, speciesStress(fishPressures, item.id)]),
  ) as Record<FishSpeciesId, number>;
  const fish = FISH_SPECIES.reduce((total, item) => total + species[item.id], 0) / FISH_SPECIES.length;

  return { coral: coralStress(pressures), fish, species, pressures };
}

/** Cobertura de algas (0 a 100): nutrientes, perda de herbívoros e espaço livre. */
export function calculateAlgae(env: Environment, health: Health) {
  const nutrients = clamp(env.sewage / 100);
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

export function createInitialState(): SimulationState {
  const stress = calculateStress(BASELINE);

  return {
    env: { ...BASELINE },
    targets: { ...BASELINE },
    health: { coral: 100, fish: 100 },
    species: { 'blue-tang': 100, 'sergeant-major': 100, parrotfish: 100 },
    pressures: stress.pressures,
    exposure: Object.fromEntries(PRESSURE_IDS.map((id) => [id, 0])) as Exposure,
    overall: 100,
    elapsedDays: 0,
    speed: 1,
    paused: true,
    history: [
      {
        day: 0,
        coral: 100,
        fish: 100,
        overall: 100,
        algae: calculateAlgae(BASELINE, { coral: 100, fish: 100 }),
        temperature: BASELINE.temperature,
        ph: BASELINE.ph,
      },
    ],
    firedMessages: new Set(),
    events: [],
    latestMessageId: null,
    messageCooldown: 0,
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
    overall: next.overall,
    algae: calculateAlgae(next.env, next.health),
    temperature: next.env.temperature,
    ph: next.env.ph,
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

  const stress = calculateStress(env);
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

  return sampleHistory(state, {
    ...state,
    env,
    pressures: stress.pressures,
    health,
    species,
    exposure,
    overall,
    elapsedDays: state.elapsedDays + dtDays,
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
  const algae = calculateAlgae(state.env, state.health);
  const oxygen = clamp(
    100 - state.pressures.thermal * 40 - state.pressures.sewage * 45 - (algae / 100) * 25,
    0,
    100,
  );
  const light = clamp(100 - state.env.turbidity, 0, 100);
  const thriving = FISH_SPECIES.filter((item) => state.species[item.id] >= 60);
  const speciesScore = (thriving.length / FISH_SPECIES.length) * 100;
  const trophic = calculateTrophicBalance(state.species, algae);

  return [
    {
      id: 'coral',
      label: 'Cobertura de coral vivo',
      display: `${Math.round(state.health.coral)}%`,
      value: state.health.coral,
      unit: '%',
      tone: tone(state.health.coral),
      note: 'Corais branqueados perdem as algas simbiontes que lhes dão energia e cor.',
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
      label: 'Comunidade de peixes',
      display: `${Math.round(state.health.fish)}%`,
      value: state.health.fish,
      unit: '%',
      tone: tone(state.health.fish),
      note: 'Média das três espécies acompanhadas nesta simulação.',
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
      id: 'light',
      label: 'Luz que chega ao fundo',
      display: `${Math.round(light)}%`,
      value: light,
      unit: '%',
      tone: tone(light),
      note: 'Sedimentos em suspensão reduzem a luz disponível para o coral.',
    },
    {
      id: 'oxygen',
      label: 'Oxigênio dissolvido',
      display: `${Math.round(oxygen)}%`,
      value: oxygen,
      unit: '%',
      tone: tone(oxygen),
      note: 'Água quente dissolve menos oxigênio e o esgoto consome o que resta.',
    },
  ];
}
