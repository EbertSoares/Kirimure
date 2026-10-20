import { describe, expect, it } from 'vitest';
import { CHALLENGES, evaluateChallenge } from './challenges';
import { BASELINE, PARAMETERS } from './config';
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
  microplasticsMgPerM3,
  oilGramsPerM2,
  sewageNitrogenMgPerLDay,
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
      oil: 70,
      temperature: 34,
      ph: 7.5,
      sewage: 30,
    });
    expect(targets).toEqual({ ...BASELINE, oil: 70, temperature: 34, ph: 7.5, sewage: 30 });
    expect(countActiveFactors({ ...BASELINE, oil: 70, sewage: 30 })).toBe(2);
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
    const heat = calculateStress({ ...BASELINE, temperature: 29 });
    const oil = calculateStress({ ...BASELINE, oil: 60 });
    const combined = calculateStress({ ...BASELINE, temperature: 29, oil: 60 });
    expect(combined.coral).toBeGreaterThan(Math.max(heat.coral, oil.coral));
  });

  it('soma esgoto e turbidez no estresse dos corais', () => {
    const sewage = calculateStress({ ...BASELINE, sewage: 60 });
    const turbidity = calculateStress({ ...BASELINE, turbidity: 60 });
    const both = calculateStress({ ...BASELINE, sewage: 60, turbidity: 60 });
    expect(both.coral).toBeGreaterThan(Math.max(sewage.coral, turbidity.coral));
  });

  it('faz a poluição acidificar a água', () => {
    const limpa = calculatePressures(BASELINE);
    const comEsgoto = { ...BASELINE, sewage: 2_000 };

    expect(effectivePh(comEsgoto)).toBeLessThan(BASELINE.ph);
    expect(effectivePh(comEsgoto)).toBeGreaterThan(PARAMETERS.ph.coralMax);
    expect(calculatePressures(comEsgoto).acidification).toBeGreaterThan(limpa.acidification);
    // A poluição sozinha acidifica menos que a barra de pH no máximo.
    expect(calculatePressures(comEsgoto).acidification).toBeLessThan(
      calculatePressures({ ...BASELINE, ph: PARAMETERS.ph.coralMax }).acidification,
    );
  });

  it('inicia estresse térmico dos corais antes do estresse dos peixes', () => {
    const stress = calculateStress({ ...BASELINE, temperature: 29 });
    expect(stress.coral).toBeGreaterThan(0);
    expect(stress.fish).toBe(0);
  });

  it('faz a pesca pesar mais no peixe-papagaio', () => {
    const pressures = calculateFishPressures({ ...BASELINE, fishing: 80 });
    expect(speciesStress(pressures, 'parrotfish')).toBeGreaterThan(speciesStress(pressures, 'sergeant-major'));
    expect(speciesStress(pressures, 'parrotfish')).toBeGreaterThan(speciesStress(pressures, 'blue-tang'));
  });

  it('faz o peixe tolerar mais calor que o coral', () => {
    const env = { ...BASELINE, temperature: 29 };
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
        microplastics: 100,
        oil: 100,
        sewage: 100,
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
    state.targets.oil = 100;
    const after = run(state, 10);
    expect(after.exposure.oil).toBeGreaterThan(0);
    expect(after.elapsedDays).toBeCloseTo(10);
  });

  it('faz a recuperação ambiental reduzir o dano', () => {
    const polluted = { ...createInitialState(), paused: false };
    polluted.targets.oil = 40_000;
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
    const dirty = { ...clean, env: { ...BASELINE, sewage: 100, turbidity: 90 } };
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
    polluted.targets.sewage = 1_600;
    const troubled = evaluateChallenge(challenge, run(polluted, 10));
    expect(troubled.status).toBe('pending');
  });

  it('converte cargas da célula de referência sem usar porcentagens', () => {
    expect(microplasticsMgPerM3(50)).toBeCloseTo(10);
    expect(oilGramsPerM2(50_000)).toBeCloseTo(50);
    expect(sewageNitrogenMgPerLDay(2_000)).toBeCloseTo(0.4);
  });

  it('não ressuscita cobertura nem peixes mortos ao retirar as pressões', () => {
    const damaged: SimulationState = {
      ...createInitialState(),
      paused: false,
      criticalCheckpointAcknowledged: true,
      health: { coral: 20, fish: 20 },
      living: { coral: 18, fish: 22 },
      species: { 'blue-tang': 20, 'sergeant-major': 20, parrotfish: 20 },
      speciesLiving: { 'blue-tang': 18, 'sergeant-major': 25, parrotfish: 23 },
    };
    const recovered = run(damaged, 30);
    expect(recovered.health.coral).toBeGreaterThan(damaged.health.coral);
    expect(recovered.living).toEqual(damaged.living);
    expect(recovered.speciesLiving).toEqual(damaged.speciesLiving);
  });

  it('pausa automaticamente no primeiro marco crítico', () => {
    const stressed = createInitialState();
    stressed.paused = false;
    stressed.targets = {
      ...stressed.targets,
      temperature: 32,
      ph: 7.6,
      microplastics: 1_000,
      oil: 50_000,
      sewage: 2_000,
    };

    const stopped = run(stressed, 250);
    expect(stopped.paused).toBe(true);
    expect(stopped.checkpoint?.kind).toBe('critical');
    expect(stopped.elapsedDays).toBeLessThan(250);
  });

  it('encerra o relógio no colapso depois que o professor continua o marco crítico', () => {
    const stressed = createInitialState();
    stressed.paused = false;
    stressed.targets = {
      ...stressed.targets,
      temperature: 32,
      ph: 7.6,
      microplastics: 1_000,
      oil: 50_000,
      sewage: 2_000,
    };

    const critical = run(stressed, 250);
    const continued: SimulationState = {
      ...critical,
      paused: false,
      checkpoint: null,
      criticalCheckpointAcknowledged: true,
    };
    const collapsed = run(continued, 500);

    expect(collapsed.paused).toBe(true);
    expect(collapsed.checkpoint?.kind).toBe('collapse');
    expect(collapsed.checkpoint?.locked).toBe(true);
  });
});

describe('marcos do painel', () => {
  it('mostra um marco por vez, com pausa entre eles', () => {
    const base = createInitialState();
    // Exposição já acumulada: o primeiro marco do roteiro é o estresse térmico.
    const warmed: SimulationState = {
      ...base,
      paused: false,
      degreeHeatingWeeks: 5,
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
