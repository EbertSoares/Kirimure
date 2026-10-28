import { describe, expect, it } from 'vitest';
import { CHALLENGES, evaluateChallenge } from './challenges';
import { BASELINE, ITEM_DEFINITIONS, PARAMETERS } from './config';
import {
  buildTargets,
  calculateAlgae,
  calculateFishPressures,
  calculatePressures,
  calculateStress,
  countActiveFactors,
  createInitialState,
  deriveIndicators,
  effectivePh,
  estimateCriticalDays,
  getDissolvedOxygenBreakdown,
  receivedLoadRange,
  speciesStress,
  tickSimulation,
} from './model';
import { formatSimulatedTime } from './time';
import { evaluateMessages } from './messages';
import type { SimulationState } from './types';

/** Roda a simulação por um número de dias simulados, em passos de `stepSeconds`. */
function run(state: SimulationState, days: number, stepSeconds = 0.1) {
  let current = state;
  const daysPerTick = stepSeconds * PARAMETERS.daysPerRealSecond * current.speed;
  const steps = Math.max(1, Math.round(days / daysPerTick));
  for (let index = 0; index < steps; index += 1) current = tickSimulation(current, stepSeconds);
  return current;
}

describe('modelo de simulação', () => {
  it('oferece cargas pequenas em kg antes das toneladas', () => {
    const expectedStart = [0, 1, 2, 5, 10, 20, 50];
    (['microplastics', 'oil', 'sewage'] as const).forEach((id) => {
      expect(ITEM_DEFINITIONS[id].massOptionsKg?.slice(0, 7)).toEqual(expectedStart);
      expect(ITEM_DEFINITIONS[id].massOptionsKg).toContain(1000);
      expect(ITEM_DEFINITIONS[id].massOptionsKg).toContain(100000);
    });
  });

  it('inicia no estado saudável', () => {
    const state = createInitialState();
    expect(state.env).toEqual(BASELINE);
    expect(state.health).toEqual({ coral: 100, fish: 100 });
    expect(state.species).toEqual({ 'blue-tang': 100, 'sergeant-major': 100, parrotfish: 100 });
    expect(state.history).toHaveLength(1);
    expect(state.history[0].day).toBe(0);
  });

  it('aplica apenas os fatores que saíram da posição inicial', () => {
    const targets = buildTargets({
      ...BASELINE,
      oil: 50000,
      temperature: 31,
      ph: 7.8,
      sewage: 5000,
    });
    expect(targets).toEqual({
      ...BASELINE,
      oil: receivedLoadRange(50000).centralKg,
      temperature: 31,
      ph: 7.8,
      sewage: receivedLoadRange(5000).centralKg,
    });
    expect(countActiveFactors({ ...BASELINE, oil: 50000, sewage: 5000 })).toBe(2);
  });

  it('aproxima o ambiente do alvo sem salto instantâneo', () => {
    const state = createInitialState();
    state.paused = false;
    state.targets.temperature = 32;
    const next = tickSimulation(state, 0.1);
    expect(next.env.temperature).toBeGreaterThan(26);
    expect(next.env.temperature).toBeLessThan(32);
  });

  it('faz a velocidade alterar o relógio, não as regras', () => {
    const normal = { ...createInitialState(), paused: false };
    normal.targets.temperature = 31;
    const fast = { ...createInitialState(), speed: 10 as const, paused: false };
    fast.targets.temperature = 31;
    const afterNormal = tickSimulation(normal, 1);
    const afterFast = tickSimulation(fast, 0.1);
    expect(afterNormal.elapsedDays).toBeCloseTo(PARAMETERS.daysPerRealSecond);
    expect(afterFast.elapsedDays).toBeCloseTo(PARAMETERS.daysPerRealSecond);
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
    const heat = calculateStress({ ...BASELINE, temperature: 29.5 });
    const oilLoad = PARAMETERS.receivedLoads.oil.maximumKg * 0.6;
    const oil = calculateStress({ ...BASELINE, oil: oilLoad });
    const combined = calculateStress({ ...BASELINE, temperature: 29.5, oil: oilLoad });
    expect(combined.coral).toBeGreaterThan(Math.max(heat.coral, oil.coral));
  });

  it('soma esgoto e turbidez no estresse dos corais', () => {
    const sewage = calculateStress({ ...BASELINE, sewage: PARAMETERS.receivedLoads.sewage.maximumKg });
    const turbidity = calculateStress({ ...BASELINE, turbidity: 60 });
    const both = calculateStress({
      ...BASELINE,
      sewage: PARAMETERS.receivedLoads.sewage.maximumKg,
      turbidity: 60,
    });
    expect(both.coral).toBeGreaterThan(Math.max(sewage.coral, turbidity.coral));
  });

  it('liga a queda costeira de pH à carga orgânica, não a óleo ou plástico', () => {
    const semEsgoto = { ...BASELINE, ph: 8.02 };
    const comEsgoto = { ...semEsgoto, sewage: PARAMETERS.receivedLoads.sewage.maximumKg };

    expect(effectivePh(comEsgoto)).toBeLessThan(effectivePh(semEsgoto));
    expect(calculatePressures(comEsgoto).acidification).toBeGreaterThan(
      calculatePressures(semEsgoto).acidification,
    );
    expect(effectivePh({
      ...BASELINE,
      oil: PARAMETERS.receivedLoads.oil.maximumKg,
      microplastics: PARAMETERS.receivedLoads.microplastics.maximumKg,
    })).toBe(BASELINE.ph);
  });

  it('acumula DHW em 12 semanas e começa a aliviar após o resfriamento', () => {
    const heated = createInitialState();
    heated.paused = false;
    heated.targets.temperature = 31;
    const afterHeat = run(heated, 84);
    expect(afterHeat.degreeHeatingWeeks).toBeGreaterThan(8);

    afterHeat.targets.temperature = 26;
    const afterCooling = run(afterHeat, 100);
    expect(afterCooling.degreeHeatingWeeks).toBeLessThan(afterHeat.degreeHeatingWeeks);
  });

  it('inicia estresse térmico dos corais antes do estresse dos peixes', () => {
    const stress = calculateStress({ ...BASELINE, temperature: 29.5 });
    expect(stress.coral).toBeGreaterThan(0);
    expect(stress.fish).toBe(0);
  });

  it('faz a pesca pesar mais no peixe-papagaio', () => {
    const pressures = calculateFishPressures({ ...BASELINE, fishing: 80 });
    expect(speciesStress(pressures, 'parrotfish')).toBeGreaterThan(speciesStress(pressures, 'sergeant-major'));
    expect(speciesStress(pressures, 'parrotfish')).toBeGreaterThan(speciesStress(pressures, 'blue-tang'));
  });

  it('faz o peixe tolerar mais calor que o coral', () => {
    const env = { ...BASELINE, temperature: 29.5 };
    expect(calculatePressures(env).thermal).toBeGreaterThan(0);
    expect(calculateFishPressures(env).thermal).toBe(0);
  });

  it('mantém saúde entre zero e cem', () => {
    const state = {
      ...createInitialState(),
      paused: false,
      targets: {
        temperature: 34,
        ph: 7.5,
        microplastics: PARAMETERS.receivedLoads.microplastics.maximumKg,
        oil: PARAMETERS.receivedLoads.oil.maximumKg,
        sewage: PARAMETERS.receivedLoads.sewage.maximumKg,
        turbidity: 100,
        fishing: 100,
        recovery: 0,
      },
    };
    const after = run(state, 200);
    expect(after.health.coral).toBeGreaterThanOrEqual(0);
    expect(after.health.fish).toBeGreaterThanOrEqual(0);
    expect(after.health.coral).toBeLessThan(20);
  });

  it('acumula exposição conforme intensidade e duração', () => {
    const state = { ...createInitialState(), paused: false };
    state.targets.oil = PARAMETERS.receivedLoads.oil.maximumKg;
    const after = run(state, 10);
    expect(after.exposure.oil).toBeGreaterThan(0);
    expect(after.elapsedDays).toBeCloseTo(10);
  });

  it('faz a recuperação ambiental reduzir o dano', () => {
    const polluted = { ...createInitialState(), paused: false };
    polluted.targets.oil = PARAMETERS.receivedLoads.oil.maximumKg * 0.8;
    const protectedReef = {
      ...polluted,
      targets: { ...polluted.targets, recovery: 100 },
    };
    const bare = run(polluted, 45);
    const guarded = run(protectedReef, 45);
    expect(guarded.health.coral).toBeGreaterThan(bare.health.coral);
  });

  it('registra o histórico ao longo do tempo', () => {
    const state = { ...createInitialState(), paused: false };
    const after = run(state, 12);
    expect(after.history.length).toBeGreaterThanOrEqual(11);
    expect(after.history[0].day).toBeLessThanOrEqual(1);
    expect(after.history.at(-1)?.day).toBeLessThanOrEqual(12);
  });

  it('faz os indicadores reagirem ao ambiente', () => {
    const clean = createInitialState();
    const dirty = {
      ...clean,
      env: { ...BASELINE, sewage: PARAMETERS.receivedLoads.sewage.maximumKg, turbidity: 90 },
    };
    const cleanIndicators = deriveIndicators(clean);
    const dirtyIndicators = deriveIndicators(dirty);
    const pick = (list: ReturnType<typeof deriveIndicators>, id: string) =>
      list.find((indicator) => indicator.id === id)?.value ?? 0;

    expect(calculateAlgae(dirty.env, dirty.health)).toBeGreaterThan(calculateAlgae(clean.env, clean.health));
    expect(pick(dirtyIndicators, 'algae')).toBeGreaterThan(pick(cleanIndicators, 'algae'));
    expect(pick(dirtyIndicators, 'oxygen')).toBeLessThan(pick(cleanIndicators, 'oxygen'));
  });

  it('avança o desafio enquanto as condições se mantêm', () => {
    const challenge = CHALLENGES[0];
    const clean = { ...createInitialState(), paused: false };
    const after = run(clean, 10);
    const progress = evaluateChallenge(challenge, after);
    expect(progress.status).toBe('running');
    expect(progress.daysHeld).toBeGreaterThanOrEqual(8);

    const polluted = { ...createInitialState(), paused: false };
    polluted.targets.sewage = PARAMETERS.receivedLoads.sewage.maximumKg;
    const troubled = evaluateChallenge(challenge, run(polluted, 10));
    expect(troubled.status).toBe('pending');
  });

  it('projeta o prazo crítico pela dose acumulada do cenário', () => {
    const fiftyTonnes = estimateCriticalDays(buildTargets({ ...BASELINE, oil: 50000 }));
    const hundredTonnes = estimateCriticalDays(buildTargets({ ...BASELINE, oil: 100000 }));
    expect(fiftyTonnes).not.toBeNull();
    expect(hundredTonnes).not.toBeNull();
    expect(fiftyTonnes!).toBeGreaterThan(4);
    expect(fiftyTonnes!).toBeLessThan(3650);
    expect(hundredTonnes!).toBeLessThan(fiftyTonnes!);
  });

  it('salva variáveis físico-químicas e poluentes em cada ponto do histórico', () => {
    const state = { ...createInitialState(), paused: false };
    state.targets.sewage = 2000;
    const after = run(state, 5);
    const lastPoint = after.history.at(-1)!;
    expect(lastPoint).toHaveProperty('dissolvedOxygen');
    expect(lastPoint).toHaveProperty('sewage');
    expect(lastPoint).toHaveProperty('microplastics');
    expect(lastPoint).toHaveProperty('oil');
    expect(lastPoint.sewage).toBeGreaterThan(0);
  });

  it('impede que o desafio de restaurar o recife conclua sem ter havido degradação prévia', () => {
    const challenge = CHALLENGES.find((c) => c.id === 'restored-reef')!;
    const pristine = { ...createInitialState(), paused: false };
    const afterThirtyDays = run(pristine, 35);
    // Em um recife virgem de 100% que nunca caiu, everDegraded continua falso
    expect(afterThirtyDays.everDegraded).toBe(false);
    expect(evaluateChallenge(challenge, afterThirtyDays).status).toBe('pending');
  });

  it('acopla a desoxigenação (hipóxia) ao estresse dos peixes', () => {
    const normoxic = calculateFishPressures(BASELINE, 0, 7.12);
    const hypoxic = calculateFishPressures(BASELINE, 0, 1.8);
    expect(hypoxic.sewage).toBeGreaterThan(normoxic.sewage);
  });

  it('ajusta retenção e alvos de carga conforme o compartimento da BTS', () => {
    const fradesTargets = buildTargets({ ...BASELINE, sewage: 10000 }, 'frades');
    const barraTargets = buildTargets({ ...BASELINE, sewage: 10000 }, 'barra');
    // Na Boca da Barra (baixa retenção, descarga rápida), a massa retida é bem menor que na Ilha dos Frades
    expect(barraTargets.sewage).toBeLessThan(fradesTargets.sewage);
  });

  it('isola os dois caminhos causais do oxigênio dissolvido (DBO direta vs algas)', () => {
    // 1. Caminho direto: esgoto bruto sem algas causa consumo imediato por oxidação da DBO
    const baselineBreakdown = getDissolvedOxygenBreakdown(BASELINE, 0);
    const sewageOnlyBreakdown = getDissolvedOxygenBreakdown({ ...BASELINE, sewage: 5000 }, 0);
    expect(sewageOnlyBreakdown.organicDemand).toBeGreaterThan(baselineBreakdown.organicDemand);
    expect(sewageOnlyBreakdown.algalDemand).toBe(0);
    expect(sewageOnlyBreakdown.dissolvedOxygen).toBeLessThan(baselineBreakdown.dissolvedOxygen);

    // 2. Caminho secundário: floração e decomposição de algas acrescenta consumo adicional
    const sewagePlusAlgaeBreakdown = getDissolvedOxygenBreakdown({ ...BASELINE, sewage: 5000 }, 60);
    expect(sewagePlusAlgaeBreakdown.algalDemand).toBeGreaterThan(0);
    expect(sewagePlusAlgaeBreakdown.dissolvedOxygen).toBeLessThan(sewageOnlyBreakdown.dissolvedOxygen);
  });
});

describe('marcos do painel', () => {
  it('mostra um marco por vez, com pausa entre eles', () => {
    const base = createInitialState();
    // Exposição já acumulada: o primeiro marco do roteiro é o estresse térmico.
    const warmed: SimulationState = {
      ...base,
      paused: false,
      degreeHeatingWeeks: 1,
    };

    const first = evaluateMessages(warmed);
    expect(first.latestMessageId).toBe('thermal_stress');
    expect(first.events).toHaveLength(1);
    expect(first.messageCooldown).toBeGreaterThan(0);

    // Vários limiares verdadeiros ao mesmo tempo: ainda assim, um marco só.
    const several = evaluateMessages({
      ...warmed,
      health: { coral: 10, fish: 10 },
      exposure: { ...warmed.exposure, acidification: 9, oil: 9, sewage: 9 },
    });
    expect(several.events).toHaveLength(1);

    // Durante a pausa o painel não troca de texto.
    let held = first;
    for (let index = 0; index < 3; index += 1) held = evaluateMessages(tickSimulation(held, 0.1));
    expect(held.latestMessageId).toBe('thermal_stress');

    // Passada a pausa, o próximo marco pode entrar.
    const released = evaluateMessages({ ...run(first, 3), health: { coral: 10, fish: 10 } });
    expect(released.latestMessageId).not.toBe('thermal_stress');
    expect(released.events).toHaveLength(2);
  });
});
