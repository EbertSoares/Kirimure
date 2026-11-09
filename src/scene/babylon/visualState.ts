/**
 * Tradução suavizada do estado científico para parâmetros visuais.
 *
 * Nenhum efeito inventa um número: todos derivam das mesmas funções usadas pelo
 * modelo (`simulation/model.ts`). A suavização evita "piscadas" quando o usuário
 * arrasta um controle, mas não altera o sinal científico.
 */

import {
  effectivePh,
  hypoxiaStress,
  normalizedMicroplasticsConcentration,
  normalizedReceivedLoad,
  normalizedSewagePressure,
} from '../../simulation/model';
import type { SimulationState } from '../../simulation/types';
import { clamp } from './procedural';

export interface VisualState {
  oil: number;
  sewage: number;
  plastics: number;
  turbidity: number;
  bleaching: number;
  coralDead: number;
  hypoxia: number;
  coralHealth: number;
  fishHealth: number;
  fishing: number;
  restoration: number;
  waterClarity: number;
  overall: number;
}

const ZERO: VisualState = {
  oil: 0,
  sewage: 0,
  plastics: 0,
  turbidity: 0,
  bleaching: 0,
  coralDead: 0,
  hypoxia: 0,
  coralHealth: 1,
  fishHealth: 1,
  fishing: 0,
  restoration: 0,
  waterClarity: 1,
  overall: 1,
};

export function deriveVisualState(state: SimulationState): VisualState {
  const envOil = normalizedReceivedLoad('oil', state.env.oil);
  const previewOil = normalizedReceivedLoad('oil', state.targets.oil) * 0.35;

  const envSewage = normalizedSewagePressure(
    state.env.sewage,
    state.sewageDischargeMode,
    state.biochemicalOxygenDemand,
  );
  const previewSewage = normalizedSewagePressure(
    state.targets.sewage,
    state.sewageDischargeMode,
    state.biochemicalOxygenDemand,
  ) * 0.35;

  const envPlastics = normalizedMicroplasticsConcentration(state.env.microplastics);
  const previewPlastics = normalizedMicroplasticsConcentration(state.targets.microplastics) * 0.35;
  const turbidity = clamp(Math.max(state.env.turbidity, state.targets.turbidity * 0.4) / 100);

  const coralHealth = clamp(state.health.coral / 100);
  const coralHealthLoss = clamp((94 - state.health.coral) / 48);
  const dhwBleach = clamp(state.degreeHeatingWeeks / 4.2);
  const currentPh = effectivePh(
    state.env,
    state.biochemicalOxygenDemand,
    state.sector,
    state.respiratoryDicUmolKg,
  );
  const acidStress = clamp((8.0 - currentPh) / 0.3) * 0.65;
  const bleaching = clamp(Math.max(coralHealthLoss, dhwBleach, acidStress));

  const oil = clamp(Math.max(envOil, previewOil));
  const sewage = clamp(Math.max(envSewage, previewSewage));
  const plastics = clamp(Math.max(envPlastics, previewPlastics));
  const hypoxia = hypoxiaStress(state.dissolvedOxygen);
  const fishing = clamp(state.pressures.fishing);
  const restoration = clamp((state.restoration?.restoredCoverPercent ?? 0) / 100);
  const dead = clamp((35 - state.health.coral) / 35);

  const waterClarity = clamp(
    1
      - oil * 0.72
      - sewage * 0.48
      - hypoxia * 0.22
      - turbidity * 0.5
      - plastics * 0.08,
    0.08,
    1,
  );

  return {
    oil,
    sewage,
    plastics,
    turbidity,
    bleaching,
    coralDead: dead,
    hypoxia,
    coralHealth,
    fishHealth: clamp(state.health.fish / 100),
    fishing,
    restoration,
    waterClarity,
    overall: clamp(state.overall / 100),
  };
}

export class VisualStateTracker {
  private current: VisualState = { ...ZERO };

  get value(): VisualState {
    return this.current;
  }

  update(state: SimulationState, dt: number, immediate = false): VisualState {
    const target = deriveVisualState(state);
    const rate = immediate ? 1 : 1 - Math.exp(-Math.max(0, dt) * 2.4);

    for (const key of Object.keys(target) as Array<keyof VisualState>) {
      const from = this.current[key];
      const to = target[key];
      this.current[key] = from + (to - from) * rate;
    }

    return this.current;
  }

  reset(): void {
    this.current = { ...ZERO };
  }
}
