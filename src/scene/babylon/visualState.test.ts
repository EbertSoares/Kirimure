import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../simulation/model';
import type { SimulationState } from '../../simulation/types';
import { deriveVisualState, VisualStateTracker } from './visualState';

function degraded(): SimulationState {
  const base = createInitialState();
  return {
    ...base,
    env: { ...base.env, oil: 100000, sewage: 100000, microplastics: 33000, turbidity: 90 },
    targets: { ...base.targets, oil: 100000, sewage: 100000, microplastics: 33000, turbidity: 90 },
    health: { coral: 18, fish: 32 },
    dissolvedOxygen: 1.2,
    degreeHeatingWeeks: 5,
    pressures: { ...base.pressures, fishing: 0.75 },
    restoration: {
      introducedColonies: 100,
      establishedColonies: 80,
      survivingColonies: 70,
      transplantSurvivalRate: 85,
      restoredCoverPercent: 60,
      environmentalSuitability: 0.8,
    },
  };
}

describe('estado visual derivado da simulação', () => {
  it('começa limpo e claro no estado saudável', () => {
    const visual = deriveVisualState(createInitialState());
    expect(visual.oil).toBeCloseTo(0, 6);
    expect(visual.sewage).toBeCloseTo(0, 6);
    expect(visual.plastics).toBeCloseTo(0, 6);
    expect(visual.waterClarity).toBeCloseTo(1, 6);
    expect(visual.coralHealth).toBeCloseTo(1, 6);
    expect(visual.fishHealth).toBeCloseTo(1, 6);
  });

  it('traduz poluição, hipóxia, pesca e restauração sem inventar valores', () => {
    const visual = deriveVisualState(degraded());
    expect(visual.oil).toBeGreaterThan(0.4);
    expect(visual.sewage).toBeGreaterThan(0.4);
    expect(visual.plastics).toBeGreaterThan(0.4);
    expect(visual.turbidity).toBeCloseTo(0.9, 6);
    expect(visual.hypoxia).toBeGreaterThan(0.4);
    expect(visual.fishing).toBeCloseTo(0.75, 6);
    expect(visual.restoration).toBeCloseTo(0.6, 6);
    expect(visual.waterClarity).toBeLessThan(0.6);
    expect(visual.coralDead).toBeGreaterThan(0);
  });

  it('suaviza a transição e permite reset imediato', () => {
    const tracker = new VisualStateTracker();
    const visual = tracker.update(createInitialState(), 0, true);
    expect(visual.oil).toBeCloseTo(0, 6);

    tracker.update(degraded(), 0.25);
    const midway = tracker.value.oil;
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(1);

    tracker.reset();
    expect(tracker.value.oil).toBe(0);
    expect(tracker.value.waterClarity).toBe(1);
  });

  it('não altera a saúde dos peixes no texto científico', () => {
    const visual = deriveVisualState(degraded());
    expect(visual.fishHealth).toBeCloseTo(0.32, 6);
    expect(visual.coralHealth).toBeCloseTo(0.18, 6);
  });
});
