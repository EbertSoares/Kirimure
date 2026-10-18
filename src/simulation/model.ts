import { BASELINE, PARAMETERS } from './config';
import type { Environment, Health, ItemId, SimulationState } from './types';

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

function updateHealth(current: number, stress: number, collapseSeconds: number, dt: number) {
  const maxDamagePerSecond = 100 / collapseSeconds;
  const damage = maxDamagePerSecond * stress;
  const recovery =
    stress < PARAMETERS.recoveryThreshold
      ? (maxDamagePerSecond / PARAMETERS.recoveryFactor) * (1 - stress)
      : 0;

  return clamp(current - damage * dt + recovery * dt, 0, 100);
}

export function createInitialState(): SimulationState {
  return {
    env: { ...BASELINE },
    targets: { ...BASELINE },
    health: { coral: 100, fish: 100 },
    overall: 100,
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

export function tickSimulation(state: SimulationState, dt: number): SimulationState {
  const env = { ...state.env };

  (Object.keys(env) as ItemId[]).forEach((id) => {
    const factor = 1 - Math.exp(-dt / PARAMETERS.tau[id]);
    env[id] += (state.targets[id] - env[id]) * factor;
  });

  const stress = calculateStress(env);
  const health: Health = {
    coral: updateHealth(state.health.coral, stress.coral, PARAMETERS.collapseSeconds.coral, dt),
    fish: updateHealth(state.health.fish, stress.fish, PARAMETERS.collapseSeconds.fish, dt),
  };

  return {
    ...state,
    env,
    health,
    overall: (health.coral + health.fish) / 2,
  };
}
