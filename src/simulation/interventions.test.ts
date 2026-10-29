import { describe, expect, it } from 'vitest';
import {
  computeEffectiveFishingPressure,
  computeEffectiveTargets,
  getRecommendedInterventions,
  isInterventionActive,
  stepEnvironmentalStocks,
  stepOilContainmentSkimming,
} from './interventionModel';
import { INTERVENTIONS, type ActiveIntervention } from './interventions';
import {
  buildDefaultImpactMilestones,
  createInitialState,
  estimateImpactTimeline,
  tickSimulation,
} from './model';
import { formatSimulatedDuration } from './time';
import type { Environment, SimulationState } from './types';

describe('Ações de Recuperação e Modelo Científico de Intervenção', () => {
  it('separa redução de aporte (input) do estoque disperso na coluna de água', () => {
    const rawTargets: Environment = {
      temperature: 28,
      ph: 8.1,
      sewage: 2000, // 2 t DBO
      oil: 5000,
      microplastics: 10000,
      turbidity: 80,
      fishing: 1,
      recovery: 0,
    };

    const activeInterventions: ActiveIntervention[] = [
      { id: 'wastewaterTreatment', startedAtDay: 0, intensity: 1, status: 'active' },
      { id: 'microplasticInterception', startedAtDay: 0, intensity: 1, status: 'active' },
      { id: 'erosionControl', startedAtDay: 0, intensity: 1, status: 'active' },
    ];

    const effective = computeEffectiveTargets(rawTargets, activeInterventions);

    // Esgoto com tratamento: alvos futuros caem em 75%
    expect(effective.sewage).toBe(2000 * 0.25);
    // Microplásticos com retenção na fonte: alvos futuros caem em 65%
    expect(effective.microplastics).toBe(10000 * 0.35);
    // Erosão com contenção: alvo futuro de turbidez cai em 60%
    expect(effective.turbidity).toBe(80 * 0.4);

    // Depuração do estoque na água: decai gradualmente por troca de maré/sedimentação, sem salto instantâneo
    const currentStocks = { ...rawTargets };
    const sectorDef = { id: 'frades' as const, dischargeDays: 38 } as any;
    const stepped = stepEnvironmentalStocks(currentStocks, effective, activeInterventions, sectorDef, 0.5); // 0.5 dia

    expect(stepped.sewage).toBeLessThan(rawTargets.sewage);
    expect(stepped.sewage).toBeGreaterThan(effective.sewage); // ainda não atingiu o alvo instantaneamente

    expect(stepped.turbidity).toBeLessThan(rawTargets.turbidity);
    expect(stepped.turbidity).toBeGreaterThan(effective.turbidity);
  });

  it('recolhe filme de óleo superficial por skimming acumulando massa recuperada', () => {
    const activeInterventions: ActiveIntervention[] = [
      { id: 'oilContainmentSkimming', startedAtDay: 0, intensity: 1, status: 'active' },
    ];

    expect(isInterventionActive(activeInterventions, 'oilContainmentSkimming')).toBe(true);

    const initialOilKg = 10000;
    const initialRecovered = 0;
    const spillAgeDays = 1.0;
    const dtDays = 1.0;

    const { nextRecoveredKg } = stepOilContainmentSkimming(
      initialOilKg,
      initialRecovered,
      spillAgeDays,
      'frades',
      activeInterventions,
      dtDays,
    );

    expect(nextRecoveredKg).toBeGreaterThan(0);
    expect(nextRecoveredKg).toBeLessThan(initialOilKg);
  });

  it('reduz esforço pesqueiro efetivo ao ativar área marinha protegida', () => {
    const rawFishing = 0.8;
    const activeInterventions: ActiveIntervention[] = [
      { id: 'marineProtectedArea', startedAtDay: 0, intensity: 1, status: 'active' },
    ];

    const effectiveFishing = computeEffectiveFishingPressure(rawFishing, activeInterventions);
    expect(effectiveFishing).toBeCloseTo(0.8 * 0.25, 4); // redução de 75% do esforço
  });

  it('recomenda ações relevantes conforme estressores ambientais ativos', () => {
    const state = createInitialState('frades');
    state.controls.sewage = 5000;
    state.controls.oil = 2000;

    const { recommended } = getRecommendedInterventions(state);
    const recIds = recommended.map((r) => r.id);

    expect(recIds).toContain('wastewaterTreatment');
    expect(recIds).toContain('oilContainmentSkimming');
    expect(recIds.length).toBeLessThanOrEqual(3);
  });

  it('garante que o catálogo declare todas as 7 intervenções com metadados científicos honestos', () => {
    expect(INTERVENTIONS).toHaveLength(7);
    const modeled = INTERVENTIONS.filter((i) => i.modeled);
    const conceptual = INTERVENTIONS.filter((i) => !i.modeled);

    expect(modeled).toHaveLength(5);
    expect(conceptual).toHaveLength(2); // coralRestoration e co2Mitigation
  });

  it('projeta linha do tempo de marcos ecológicos (estimateImpactTimeline) de forma determinística', () => {
    const state = createInitialState('frades');
    state.targets.temperature = 31.5; // onda de calor severa
    state.controls.temperature = 31.5;

    const milestones = buildDefaultImpactMilestones(state);
    const timeline = estimateImpactTimeline(state, milestones, 90);

    const coralMilestone = timeline.find((m) => m.id === 'coral-drop-10');
    expect(coralMilestone).toBeDefined();
    expect(coralMilestone?.firstCrossingDay).toBeGreaterThan(0);
    expect(coralMilestone?.firstCrossingDay).toBeLessThan(90);
  });

  it('formata durações simuladas com precisão em anos, meses e dias sem decimais confusos', () => {
    expect(formatSimulatedDuration(0)).toBe('0 dias');
    expect(formatSimulatedDuration(0.5)).toBe('0 dias');
    expect(formatSimulatedDuration(14)).toBe('14 dias');
    expect(formatSimulatedDuration(45)).toBe('1 mês, 14 dias');
    expect(formatSimulatedDuration(365.25)).toBe('1 ano');
    expect(formatSimulatedDuration(740)).toBe('2 anos, 9 dias');
  });

  it('preserva equivalência numérica ao simular a 1× vs 10× graças ao sub-stepping de Euler', () => {
    const initial = createInitialState('frades');
    initial.targets.sewage = 4000;
    initial.controls.sewage = 4000;
    initial.paused = false;

    // Simulação 1: 10 segundos reais a 1× = 5 dias simulados
    let sim1: SimulationState = { ...initial, speed: 1 };
    for (let i = 0; i < 100; i++) {
      sim1 = tickSimulation(sim1, 0.1);
    }

    // Simulação 2: 1 segundo real a 10× = 5 dias simulados
    let sim2: SimulationState = { ...initial, speed: 10 };
    for (let i = 0; i < 10; i++) {
      sim2 = tickSimulation(sim2, 0.1);
    }

    expect(sim1.elapsedDays).toBeCloseTo(sim2.elapsedDays, 1);
    expect(sim1.dissolvedOxygen).toBeCloseTo(sim2.dissolvedOxygen, 2);
    expect(sim1.health.coral).toBeCloseTo(sim2.health.coral, 2);
    expect(sim1.health.fish).toBeCloseTo(sim2.health.fish, 2);
  });
});
