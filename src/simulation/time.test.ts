import { describe, expect, it } from 'vitest';
import { BASELINE, PARAMETERS } from './config';
import { buildTargets, createInitialState, tickSimulation } from './model';
import { formatSimulatedTime, SIMULATION_SPEEDS } from './time';
import type { SimulationSpeed, SimulationState } from './types';

describe('formatação do tempo simulado', () => {
  it('respeita singular e plural', () => {
    expect(formatSimulatedTime(1)).toBe('1 dia');
    expect(formatSimulatedTime(365.25)).toBe('1 ano');
  });

  it('troca de unidade sem combiná-las', () => {
    expect(formatSimulatedTime(44)).toBe('44 dias');
    expect(formatSimulatedTime(45)).toBe('1,5 meses');
    expect(formatSimulatedTime(364)).toBe('12 meses');
  });
});

describe('relógio e velocidades da simulação (1×, 3×, 5×, 10×)', () => {
  it('avança elapsedDays na proporção exata 1:3:5:10 para a mesma duração real', () => {
    expect(PARAMETERS.daysPerRealSecond).toBe(0.5);
    expect(SIMULATION_SPEEDS).toEqual([1, 3, 5, 10]);

    const realDurationSeconds = 4;
    const stepSeconds = 0.1;
    const ticks = Math.round(realDurationSeconds / stepSeconds);

    const elapsedBySpeed = Object.fromEntries(
      SIMULATION_SPEEDS.map((speed: SimulationSpeed) => {
        let state = {
          ...createInitialState('frades'),
          paused: false,
          speed,
        };
        for (let i = 0; i < ticks; i += 1) {
          state = tickSimulation(state, stepSeconds);
        }
        return [speed, state.elapsedDays];
      }),
    ) as Record<SimulationSpeed, number>;

    expect(elapsedBySpeed[1]).toBeCloseTo(2.0, 5);
    expect(elapsedBySpeed[3] / elapsedBySpeed[1]).toBeCloseTo(3, 5);
    expect(elapsedBySpeed[5] / elapsedBySpeed[1]).toBeCloseTo(5, 5);
    expect(elapsedBySpeed[10] / elapsedBySpeed[1]).toBeCloseTo(10, 5);
  });

  it('avança aproximadamente 5 dias simulados por segundo real em 10×', () => {
    let state: SimulationState = {
      ...createInitialState('frades'),
      paused: false,
      speed: 10,
    };

    for (let i = 0; i < 10; i += 1) {
      state = tickSimulation(state, 0.1);
    }

    expect(state.elapsedDays).toBeCloseTo(5.0, 5);
  });

  it('não avança o tempo nem altera variáveis enquanto pausada', () => {
    const pausedState = {
      ...createInitialState('frades'),
      paused: true,
      speed: 10 as const,
    };

    const after = tickSimulation(pausedState, 2.0);
    expect(after).toBe(pausedState);
    expect(after.elapsedDays).toBe(0);
  });

  it('alternar velocidade preserva o cenário em andamento e os controles ambientais', () => {
    let state = createInitialState('frades');
    const customControls = {
      ...BASELINE,
      temperature: 29.6,
      sewage: 5000,
      turbidity: 40,
    };
    state.paused = false;
    state.speed = 1;
    state.controls = { ...customControls };
    state.targets = buildTargets(customControls, 'frades', 'continuous');

    for (let i = 0; i < 20; i += 1) {
      state = tickSimulation(state, 0.1);
    }
    const dayBeforeSwitch = state.elapsedDays;
    const coralBeforeSwitch = state.health.coral;

    // Alterna para 10× no meio do experimento sem reiniciar
    state = { ...state, speed: 10 };
    expect(state.controls).toEqual(customControls);
    expect(state.elapsedDays).toBeCloseTo(dayBeforeSwitch, 6);
    expect(state.health.coral).toBeCloseTo(coralBeforeSwitch, 6);

    state = tickSimulation(state, 0.2);
    expect(state.controls).toEqual(customControls);
    expect(state.elapsedDays).toBeCloseTo(dayBeforeSwitch + 1.0, 5);
  });

  it('mantém desempenho rápido e estabilidade numérica durante 60 segundos reais em 10× (300 dias simulados)', () => {
    let state = createInitialState('paraguacu');
    const controls = {
      ...BASELINE,
      temperature: 30.2,
      ph: 7.82,
      sewage: 20000,
      oil: 5000,
      microplastics: 10000,
      turbidity: 55,
      fishing: 45,
    };
    state.paused = false;
    state.speed = 10;
    state.controls = controls;
    state.targets = buildTargets(controls, 'paraguacu', 'continuous');

    const startMs = performance.now();
    // 60 segundos reais a 10 Hz = 600 passos de 0,1 s -> 300 dias simulados
    for (let step = 0; step < 600; step += 1) {
      state = tickSimulation(state, 0.1);
    }
    const elapsedComputeMs = performance.now() - startMs;

    expect(state.elapsedDays).toBeCloseTo(300, 3);
    expect(elapsedComputeMs).toBeLessThan(1500);
    expect(Number.isFinite(state.dissolvedOxygen)).toBe(true);
    expect(state.dissolvedOxygen).toBeGreaterThanOrEqual(0.05);
    expect(state.dissolvedOxygen).toBeLessThanOrEqual(10);
    expect(Number.isFinite(state.biochemicalOxygenDemand)).toBe(true);
    expect(state.biochemicalOxygenDemand).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(state.degreeHeatingWeeks)).toBe(true);
    expect(state.health.coral).toBeGreaterThanOrEqual(0);
    expect(state.health.coral).toBeLessThanOrEqual(100);
    expect(state.health.fish).toBeGreaterThanOrEqual(0);
    expect(state.health.fish).toBeLessThanOrEqual(100);
    expect(state.history.length).toBeLessThanOrEqual(PARAMETERS.history.maxPoints);
  });
});
