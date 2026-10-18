import { describe, expect, it } from 'vitest';
import { BASELINE } from './config';
import { buildTargets, calculateStress, createInitialState, tickSimulation } from './model';

describe('modelo de simulação', () => {
  it('inicia no estado saudável', () => {
    const state = createInitialState();
    expect(state.env).toEqual(BASELINE);
    expect(state.health).toEqual({ coral: 100, fish: 100 });
  });

  it('retorna fatores desmarcados ao baseline', () => {
    const targets = buildTargets(new Set(['oil']), {
      microplastics: 80,
      oil: 70,
      temperature: 34,
      ph: 7.5,
    });
    expect(targets).toEqual({ ...BASELINE, oil: 70 });
  });

  it('aproxima o ambiente do alvo sem salto instantâneo', () => {
    const state = createInitialState();
    state.targets.temperature = 34;
    const next = tickSimulation(state, 0.1);
    expect(next.env.temperature).toBeGreaterThan(26);
    expect(next.env.temperature).toBeLessThan(34);
  });

  it('aplica sinergia de calor e poluição aos corais', () => {
    const heat = calculateStress({ ...BASELINE, temperature: 31 });
    const oil = calculateStress({ ...BASELINE, oil: 60 });
    const combined = calculateStress({ ...BASELINE, temperature: 31, oil: 60 });
    expect(combined.coral).toBeGreaterThan(Math.max(heat.coral, oil.coral));
  });

  it('mantém saúde entre zero e cem', () => {
    let state = createInitialState();
    state.targets = { microplastics: 100, oil: 100, temperature: 35, ph: 7.4 };
    for (let index = 0; index < 2000; index += 1) state = tickSimulation(state, 0.1);
    expect(state.health.coral).toBeGreaterThanOrEqual(0);
    expect(state.health.fish).toBeGreaterThanOrEqual(0);
  });
});
