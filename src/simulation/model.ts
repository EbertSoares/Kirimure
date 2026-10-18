import { BASELINE, PARAMETERS } from './config';
import type { Environment, Exposure, Health, ItemId, SimulationState } from './types';

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

export function calculateStress(env: Environment) {
  const coralTemperature = stressAbove(
    env.temperature,
    PARAMETERS.temperature.coralStart,
    PARAMETERS.temperature.coralMax,
  );
  const fishTemperature = stressAbove(
    env.temperature,
    PARAMETERS.temperature.fishStart,
    PARAMETERS.temperature.fishMax,
  );
  const coralPh = stressBelow(env.ph, PARAMETERS.ph.coralStart, PARAMETERS.ph.coralMax);
  const fishPh = stressBelow(env.ph, PARAMETERS.ph.fishStart, PARAMETERS.ph.fishMax);
  const coralMicroplastics = PARAMETERS.pollutantWeights.coral.microplastics * (env.microplastics / 100);
  const fishMicroplastics = PARAMETERS.pollutantWeights.fish.microplastics * (env.microplastics / 100);
  const coralOil = PARAMETERS.pollutantWeights.coral.oil * (env.oil / 100);
  const fishOil = PARAMETERS.pollutantWeights.fish.oil * (env.oil / 100);

  const coralBase = combine([coralTemperature, coralPh, coralMicroplastics, coralOil]);
  const coralPollution = Math.max(coralMicroplastics, coralOil);
  const coral = clamp(
    coralBase * (1 + PARAMETERS.synergy * Math.min(coralTemperature, coralPollution)),
  );
  const fish = clamp(combine([fishTemperature, fishPh, fishMicroplastics, fishOil]));

  return { coral, fish };
}

export function calculateExposureRates(env: Environment): Exposure {
  return {
    thermal: stressAbove(
      env.temperature,
      PARAMETERS.temperature.coralStart,
      PARAMETERS.temperature.coralMax,
    ),
    acidification: stressBelow(env.ph, PARAMETERS.ph.coralStart, PARAMETERS.ph.coralMax),
    oil: clamp(env.oil / 100),
    microplastics: clamp(env.microplastics / 100),
  };
}

function updateHealth(current: number, stress: number, collapseDays: number, dtDays: number) {
  const maxDamagePerDay = 100 / collapseDays;
  const damage = maxDamagePerDay * stress;
  const recovery =
    stress < PARAMETERS.recoveryThreshold
      ? (maxDamagePerDay / PARAMETERS.recoveryFactor) * (1 - stress)
      : 0;

  return clamp(current - damage * dtDays + recovery * dtDays, 0, 100);
}

export function createInitialState(): SimulationState {
  return {
    env: { ...BASELINE },
    targets: { ...BASELINE },
    health: { coral: 100, fish: 100 },
    exposure: { thermal: 0, acidification: 0, oil: 0, microplastics: 0 },
    overall: 100,
    elapsedDays: 0,
    speed: 1,
    paused: true,
    firedMessages: new Set(),
    latestMessageId: null,
  };
}

export function buildTargets(
  selected: Set<ItemId>,
  controls: Environment,
): Environment {
  return (Object.keys(BASELINE) as ItemId[]).reduce(
    (result, id) => {
      result[id] = selected.has(id) ? controls[id] : BASELINE[id];
      return result;
    },
    { ...BASELINE },
  );
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
  const exposureRates = calculateExposureRates(env);
  const exposure = (Object.keys(exposureRates) as (keyof Exposure)[]).reduce(
    (result, id) => {
      result[id] += exposureRates[id] * dtDays;
      return result;
    },
    { ...state.exposure },
  );
  const health: Health = {
    coral: updateHealth(state.health.coral, stress.coral, PARAMETERS.collapseDays.coral, dtDays),
    fish: updateHealth(state.health.fish, stress.fish, PARAMETERS.collapseDays.fish, dtDays),
  };

  return {
    ...state,
    env,
    health,
    exposure,
    overall: (health.coral + health.fish) / 2,
    elapsedDays: state.elapsedDays + dtDays,
  };
}
