import { describe, expect, it } from 'vitest';
import { BASELINE } from './config';
import { buildTargets, calculateStress, createInitialState, tickSimulation } from './model';
import { formatSimulatedTime } from './time';

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
    state.paused = false;
    state.targets.temperature = 34;
    const next = tickSimulation(state, 0.1);
    expect(next.env.temperature).toBeGreaterThan(26);
    expect(next.env.temperature).toBeLessThan(34);
  });

  it('faz a velocidade alterar o relógio, não as regras', () => {
    const normal = createInitialState();
    normal.paused = false;
    normal.targets.temperature = 31;
    const fast = { ...createInitialState(), speed: 10 as const, paused: false };
    fast.targets.temperature = 31;
    const afterNormal = tickSimulation(normal, 1);
    const afterFast = tickSimulation(fast, 0.1);
    expect(afterNormal.elapsedDays).toBe(1);
    expect(afterFast.elapsedDays).toBe(1);
    expect(afterFast.env.temperature).toBeCloseTo(afterNormal.env.temperature);
  });

  it('não avança enquanto a simulação está pausada', () => {
    const state = { ...createInitialState(), paused: true };
    expect(tickSimulation(state, 5)).toBe(state);
  });

  it('exibe somente uma unidade temporal adequada', () => {
    expect(formatSimulatedTime(12)).toBe('12 dias');
    expect(formatSimulatedTime(90)).toBe('3 meses');
    expect(formatSimulatedTime(730.5)).toBe('2 anos');
  });

  it('aplica sinergia de calor e poluição aos corais', () => {
    const heat = calculateStress({ ...BASELINE, temperature: 29 });
    const oil = calculateStress({ ...BASELINE, oil: 60 });
    const combined = calculateStress({ ...BASELINE, temperature: 29, oil: 60 });
    expect(combined.coral).toBeGreaterThan(Math.max(heat.coral, oil.coral));
  });

  it('inicia estresse térmico dos corais antes do estresse dos peixes', () => {
    const stress = calculateStress({ ...BASELINE, temperature: 29 });
    expect(stress.coral).toBeGreaterThan(0);
    expect(stress.fish).toBe(0);
  });

  it('mantém saúde entre zero e cem', () => {
    let state = createInitialState();
    state.paused = false;
    state.targets = { microplastics: 100, oil: 100, temperature: 35, ph: 7.4 };
    for (let index = 0; index < 2000; index += 1) state = tickSimulation(state, 0.1);
    expect(state.health.coral).toBeGreaterThanOrEqual(0);
    expect(state.health.fish).toBeGreaterThanOrEqual(0);
  });

  it('acumula exposição conforme intensidade e duração', () => {
    let state = createInitialState();
    state.paused = false;
    state.targets.oil = 100;
    for (let index = 0; index < 100; index += 1) state = tickSimulation(state, 0.1);
    expect(state.exposure.oil).toBeGreaterThan(0);
    expect(state.elapsedDays).toBeCloseTo(10);
  });
});
