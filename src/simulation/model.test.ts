import { describe, expect, it } from 'vitest';
import { BASELINE, BTS_SECTORS, ITEM_DEFINITIONS, MICROPLASTICS_OPTIONS_PARTICLES_M3, PARAMETERS } from './config';
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
  normalizedMicroplasticsConcentration,
  normalizedSewagePressure,
  receivedLoadRange,
  speciesStress,
  tickSimulation,
} from './model';
import { formatSimulatedTime } from './time';
import { evaluateMessages } from './messages';
import { convertBOD5ToPulseDeltaMgL, integrateOxygenKinetics } from './oxygen';
import { calculateOilFateBudget } from './contaminants';
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
  it('oferece cargas pequenas em kg antes das toneladas para óleo e esgoto, e concentração em part./m³ para microplásticos', () => {
    const expectedStart = [0, 1, 2, 5, 10, 20, 50];
    (['oil', 'sewage'] as const).forEach((id) => {
      expect(ITEM_DEFINITIONS[id].massOptionsKg?.slice(0, 7)).toEqual(expectedStart);
      expect(ITEM_DEFINITIONS[id].massOptionsKg).toContain(1000);
      expect(ITEM_DEFINITIONS[id].massOptionsKg).toContain(100000);
    });

    expect(ITEM_DEFINITIONS.microplastics.unit).toBe('part./m³');
    expect(ITEM_DEFINITIONS.microplastics.scaleOptions).toEqual(MICROPLASTICS_OPTIONS_PARTICLES_M3);
    expect(ITEM_DEFINITIONS.microplastics.scaleOptions).toContain(5000);
    expect(ITEM_DEFINITIONS.microplastics.scaleOptions).toContain(33000);
    expect(normalizedMicroplasticsConcentration(5000)).toBeCloseTo(5000 / 33000, 4);
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
      sewage: 5000,
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

  it('faz a velocidade alterar o relógio, não as regras (invariância numérica por sub-stepping)', () => {
    const normal = { ...createInitialState(), paused: false };
    normal.targets.temperature = 31;
    normal.targets.sewage = 10000;
    const fast = { ...createInitialState(), speed: 10 as const, paused: false };
    fast.targets.temperature = 31;
    fast.targets.sewage = 10000;
    const afterNormal = tickSimulation(normal, 1);
    const afterFast = tickSimulation(fast, 0.1);
    expect(afterNormal.elapsedDays).toBeCloseTo(PARAMETERS.daysPerRealSecond);
    expect(afterFast.elapsedDays).toBeCloseTo(PARAMETERS.daysPerRealSecond);
    expect(afterFast.env.temperature).toBeCloseTo(afterNormal.env.temperature, 4);
    expect(afterFast.dissolvedOxygen).toBeCloseTo(afterNormal.dissolvedOxygen, 3);
    expect(afterFast.biochemicalOxygenDemand).toBeCloseTo(afterNormal.biochemicalOxygenDemand, 3);
    expect(afterFast.overall).toBeCloseTo(afterNormal.overall, 3);
  });

  it('demonstra convergência temporal numérica comparando passos de 0.05, 0.025 e 0.0125 dia', () => {
    // 1. Cenário de Carga Contínua Baixa (200 kg DBO₅/dia)
    const runKineticSubsteps = (totalDays: number, dt: number, initialDo: number, initialBod: number, env: typeof BASELINE, discharge: 'continuous_daily' | 'instant_pulse') => {
      let doVal = initialDo;
      let bodVal = initialBod;
      const steps = Math.round(totalDays / dt);
      for (let i = 0; i < steps; i += 1) {
        const res = integrateOxygenKinetics(doVal, bodVal, env, 'frades', dt, 15, discharge);
        doVal = res.nextDo;
        bodVal = res.nextBod;
      }
      return { doVal, bodVal };
    };

    const envLow = { ...BASELINE, sewage: 200 };
    const low05 = runKineticSubsteps(5, 0.05, 6.55, 0, envLow, 'continuous_daily');
    const low025 = runKineticSubsteps(5, 0.025, 6.55, 0, envLow, 'continuous_daily');
    const low0125 = runKineticSubsteps(5, 0.0125, 6.55, 0, envLow, 'continuous_daily');

    // Tolerância rigorosa de convergência: diferença relativa < 0,1%
    expect(Math.abs(low05.doVal - low0125.doVal)).toBeLessThan(0.01);
    expect(Math.abs(low025.doVal - low0125.doVal)).toBeLessThan(0.005);
    expect(Math.abs(low05.bodVal - low0125.bodVal)).toBeLessThan(0.005);

    // 2. Cenário de Carga Contínua Elevada (20.000 kg DBO₅/dia)
    const envHigh = { ...BASELINE, sewage: 20000 };
    const high05 = runKineticSubsteps(5, 0.05, 6.55, 0, envHigh, 'continuous_daily');
    const high025 = runKineticSubsteps(5, 0.025, 6.55, 0, envHigh, 'continuous_daily');
    const high0125 = runKineticSubsteps(5, 0.0125, 6.55, 0, envHigh, 'continuous_daily');

    expect(Math.abs(high05.doVal - high0125.doVal)).toBeLessThan(0.02);
    expect(Math.abs(high025.doVal - high0125.doVal)).toBeLessThan(0.01);
    expect(Math.abs(high05.bodVal - high0125.bodVal)).toBeLessThan(0.01);

    // 3. Cenário de Pulso Instantâneo (20.000 kg injetados em t = 0)
    const pulseDeltaBod = convertBOD5ToPulseDeltaMgL(20000, BTS_SECTORS[0].mixingVolumeM3);
    const envPulse = { ...BASELINE, sewage: 0 };
    const pulse05 = runKineticSubsteps(5, 0.05, 6.55, pulseDeltaBod, envPulse, 'instant_pulse');
    const pulse025 = runKineticSubsteps(5, 0.025, 6.55, pulseDeltaBod, envPulse, 'instant_pulse');
    const pulse0125 = runKineticSubsteps(5, 0.0125, 6.55, pulseDeltaBod, envPulse, 'instant_pulse');

    expect(Math.abs(pulse05.doVal - pulse0125.doVal)).toBeLessThan(0.02);
    expect(Math.abs(pulse025.doVal - pulse0125.doVal)).toBeLessThan(0.01);
    expect(Math.abs(pulse05.bodVal - pulse0125.bodVal)).toBeLessThan(0.01);
  });

  it('mantém separação dimensional entre taxa de esgoto em kg/dia e massa em kg de pulso', () => {
    // Modo contínuo: compara estritamente com continuousMaximumKgPerDay (100.000 kg/dia)
    const pressureContinuous = normalizedSewagePressure(10000, 'continuous', 0);
    expect(pressureContinuous).toBeCloseTo(0.10, 4);

    // Modo pulso com 10.000 kg e concentração em mg/L na água
    const pressurePulse = normalizedSewagePressure(10000, 'pulse', 1.0);
    expect(pressurePulse).toBeGreaterThan(0);
    // Pulso instantâneo não usa a taxa diária de 100.000 kg/dia
    expect(pressurePulse).not.toBe(pressureContinuous);
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
      microplastics: PARAMETERS.microplastics.maximumParticlesPerM3,
    })).toBe(BASELINE.ph);
  });

  it('mantém consistência dimensional e comparabilidade entre rota auxiliar de effectivePh e simulação dinâmica', () => {
    // Na rota auxiliar (estática), a taxa de DBO contínua (kg/dia) produz concentração B_ss e consumo diário
    const staticPh = effectivePh({ ...BASELINE, sewage: 20000 });
    expect(staticPh).toBeLessThan(BASELINE.ph);
    expect(staticPh).toBeGreaterThan(BASELINE.ph - 0.08);

    // Na simulação dinâmica, o estado acumula respiratoryDicUmolKg via balanço ODE
    const state = createInitialState('frades');
    state.paused = false;
    state.targets.sewage = 20000;
    const simulated = run(state, 5);
    expect(simulated.respiratoryDicUmolKg).toBeGreaterThan(0);
    const dynamicPh = effectivePh(simulated.env, simulated.biochemicalOxygenDemand, simulated.sector, simulated.respiratoryDicUmolKg);
    expect(Math.abs(dynamicPh - staticPh)).toBeLessThan(0.06);
  });

  it('evita dupla atenuação temporal de exportação no balanço de óleo quando isAlreadyRetained é verdadeiro', () => {
    const rawBudget = calculateOilFateBudget(10000, 'frades', 10, false);
    const retainedBudget = calculateOilFateBudget(10000, 'frades', 10, true);
    expect(rawBudget.exportedKg).toBeGreaterThan(0);
    expect(retainedBudget.exportedKg).toBe(0);
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
        microplastics: PARAMETERS.microplastics.maximumParticlesPerM3,
        oil: PARAMETERS.receivedLoads.oil.maximumKg,
        sewage: PARAMETERS.receivedLoads.sewage.maximumKg,
        turbidity: 100,
        fishing: 100,
      },
    };
    const after = run(state, 200);
    expect(after.health.coral).toBeGreaterThanOrEqual(0);
    expect(after.health.fish).toBeGreaterThanOrEqual(0);
    expect(after.health.coral).toBeLessThan(20);
  });

  it('inicia pausada aguardando modificação do usuário e com tempo decorrido zerado', () => {
    const state = createInitialState();
    expect(state.paused).toBe(true);
    expect(state.elapsedDays).toBe(0);
  });

  it('induz estresse térmico acelerado nos peixes acima de 29.5 °C e declínio sensível em ~30 dias a 31 °C', () => {
    const warmStress = calculateStress({ ...BASELINE, temperature: 30.5 });
    expect(warmStress.fish).toBeGreaterThan(0.5);

    let state: SimulationState = {
      ...createInitialState(),
      paused: false,
      speed: 1,
      controls: { ...BASELINE, temperature: 31.0 },
      targets: { ...BASELINE, temperature: 31.0 },
    };

    state = run(state, 35);
    // Em 35 dias sob temperatura máxima (31 °C), a fauna de peixes já sofre declínio expressivo
    expect(state.health.fish).toBeLessThan(45);
    // Espécies mais vulneráveis (papagaio) colapsam mais rápido que generalistas rústicos (sargentinho)
    expect(state.species.parrotfish).toBeLessThan(state.species['sergeant-major']);
  });

  it('acumula exposição conforme intensidade e duração', () => {
    const state = { ...createInitialState(), paused: false };
    state.targets.oil = PARAMETERS.receivedLoads.oil.maximumKg;
    const after = run(state, 10);
    expect(after.exposure.oil).toBeGreaterThan(0);
    expect(after.elapsedDays).toBeCloseTo(10);
  });

  it('permite regeneração biológica natural quando o estresse ambiental cai abaixo do limiar', () => {
    const initial = { ...createInitialState(), paused: false };
    // Reduz saúde inicial para simular histórico prévio de perturbação
    initial.health.coral = 60;
    initial.species['blue-tang'] = 60;
    // Sob condições de base da baía (estresse < 0.1), o recife regenera naturalmente
    const recovered = run(initial, 30);
    expect(recovered.health.coral).toBeGreaterThan(60);
    expect(recovered.species['blue-tang']).toBeGreaterThan(60);
  });

  it('registra o histórico ao longo do tempo', () => {
    const state = { ...createInitialState(), paused: false };
    const after = run(state, 12);
    expect(after.history.length).toBeGreaterThanOrEqual(11);
    expect(after.history[0].day).toBeLessThanOrEqual(1);
    expect(after.history.at(-1)?.day).toBeLessThanOrEqual(12);
  });

  it('propaga a DBO de pulso para algas, oxigênio e histórico', () => {
    const clean = createInitialState();
    const pulse = {
      ...clean,
      sewageDischargeMode: 'pulse' as const,
      biochemicalOxygenDemand: 8,
    };

    expect(
      calculateAlgae(pulse.env, pulse.health, 'pulse', pulse.biochemicalOxygenDemand),
    ).toBeGreaterThan(calculateAlgae(pulse.env, pulse.health, 'pulse', 0));

    const pick = (list: ReturnType<typeof deriveIndicators>, id: string) =>
      list.find((indicator) => indicator.id === id)?.value ?? 0;
    expect(pick(deriveIndicators(pulse), 'oxygen')).toBeLessThan(
      pick(deriveIndicators(clean), 'oxygen'),
    );

    const after = run({ ...pulse, paused: false }, 2);
    const lastPoint = after.history.at(-1);
    expect(lastPoint?.bod).toBeGreaterThan(0);
    expect(lastPoint?.algae).toBeGreaterThan(20);
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

  it('acopla a desoxigenação (hipóxia) ao estresse dos peixes', () => {
    const normoxic = calculateFishPressures(BASELINE, 0, 7.12);
    const hypoxic = calculateFishPressures(BASELINE, 0, 1.8);
    expect(hypoxic.sewage).toBeGreaterThan(normoxic.sewage);
  });

  it('ajusta retenção e alvos de carga conforme o compartimento da BTS', () => {
    // Para óleo (modelo de partição estática), o alvo é modulado pela retenção física do setor
    const fradesTargets = buildTargets({ ...BASELINE, oil: 10000 }, 'frades');
    const barraTargets = buildTargets({ ...BASELINE, oil: 10000 }, 'barra');
    expect(barraTargets.oil).toBeLessThan(fradesTargets.oil);

    // Para esgoto (modelo cinético acoplado), a retenção atua via flushing hidrodinâmico (washout = 1/tau)
    const fradesKinetics = integrateOxygenKinetics(6.0, 2.0, { ...BASELINE, sewage: 5000 }, 'frades', 5);
    const barraKinetics = integrateOxygenKinetics(6.0, 2.0, { ...BASELINE, sewage: 5000 }, 'barra', 5);
    expect(barraKinetics.nextBod).toBeLessThan(fradesKinetics.nextBod);
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

    // 3. Pulso isolado: a DBO já dissolvida na caixa de mistura também consome oxigênio.
    const pulseBreakdown = getDissolvedOxygenBreakdown(BASELINE, 0, 'frades', 4, 'pulse');
    expect(pulseBreakdown.organicDemand).toBeGreaterThan(baselineBreakdown.organicDemand);
    expect(pulseBreakdown.dissolvedOxygen).toBeLessThan(baselineBreakdown.dissolvedOxygen);
  });

  it('projeta prazo crítico em modo pulso de DBO considerando o estado inicial da massa injetada', () => {
    const pulseMassKg = 1000000;
    const targets = buildTargets({ ...BASELINE, sewage: pulseMassKg }, 'paraguacu', 'pulse');
    expect(targets.sewage).toBe(0); // No modo pulso, o alvo contínuo é zero

    const sectorDef = BTS_SECTORS.find((s) => s.id === 'paraguacu')!;
    const deltaBod = convertBOD5ToPulseDeltaMgL(pulseMassKg, sectorDef.mixingVolumeM3);
    expect(deltaBod).toBeGreaterThan(10);

    // Sem passar options (bug anterior): targets.sewage é 0, projeta null (recife nunca cruza limiar)
    const naiveProjection = estimateCriticalDays(targets, 'paraguacu');
    expect(naiveProjection).toBeNull();

    // Com options contendo o pulso inicial de DBO: projeta dias críticos com precisão
    const pulseProjection = estimateCriticalDays(targets, 'paraguacu', 3650, {
      sewageDischargeMode: 'pulse',
      initialBod: deltaBod,
      initialControls: { ...BASELINE, sewage: pulseMassKg },
    });
    expect(pulseProjection).not.toBeNull();
    expect(pulseProjection!).toBeGreaterThan(0);
    expect(pulseProjection!).toBeLessThan(3650);
  });

  it('diferencia a projeção de tempo crítico entre compartimentos estuarinos e oceânicos', () => {
    const sewageLoad = 20000;
    const paraguacuTargets = buildTargets({ ...BASELINE, sewage: sewageLoad }, 'paraguacu', 'continuous');
    const barraTargets = buildTargets({ ...BASELINE, sewage: sewageLoad }, 'barra', 'continuous');

    const paraguacuDays = estimateCriticalDays(paraguacuTargets, 'paraguacu');
    const barraDays = estimateCriticalDays(barraTargets, 'barra');

    expect(paraguacuDays).not.toBeNull();
    // No estuário do Paraguaçu (troca lenta, 35 dias), o esgoto atinge o limiar crítico muito mais rápido que na Barra (5 dias)
    if (barraDays !== null) {
      expect(paraguacuDays!).toBeLessThan(barraDays);
    }
  });

  it('faz decair o acúmulo de DHW após o encerramento de evento térmico na janela móvel de 84 dias', () => {
    let state = { ...createInitialState(), paused: false };
    state.env.temperature = 31.0; // 3 °C acima da MMM
    state.targets.temperature = 31.0;

    // 14 dias sob onda de calor (HotSpot de 3 °C) acumulam DHW significativo
    state = run(state, 14);
    expect(state.degreeHeatingWeeks).toBeGreaterThan(3.0);

    // Encerra a onda de calor retornando a temperatura para o baseline (26.8 °C)
    state.env.temperature = BASELINE.temperature;
    state.targets.temperature = BASELINE.temperature;

    // Após 85 dias em temperatura normal, os 14 dias quentes saem da janela móvel de 84 dias da NOAA
    const recovered = run(state, 86);
    expect(recovered.degreeHeatingWeeks).toBe(0);
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
