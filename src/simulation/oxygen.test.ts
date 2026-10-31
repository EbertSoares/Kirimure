import { describe, expect, it } from 'vitest';
import {
  calculateDeoxygenationRate,
  calculateEquilibriumOxygen,
  calculateReaerationRate,
  calculateWeissOxygenSaturation,
  classifyDissolvedOxygen,
  convertBOD5ToPulseDeltaMgL,
  getOxygenMetadata,
  integrateOxygenKinetics,
} from './oxygen';
import { BASELINE } from './config';

describe('módulo cinético de oxigênio dissolvido e DBO', () => {
  it('calcula saturação oceanográfica real de Weiss (1970) (~6,55 mg/L a 26,8 °C e 35 PSU na BTS)', () => {
    const cs = calculateWeissOxygenSaturation(26.8, 35.0);
    expect(cs).toBeGreaterThan(6.50);
    expect(cs).toBeLessThan(6.60);
    expect(Math.round(cs * 100) / 100).toBe(6.55);
  });

  it('respeita a termodinâmica: água mais fria dissolve mais gás oxigênio', () => {
    const cold = calculateWeissOxygenSaturation(20.0, 35.0);
    const warm = calculateWeissOxygenSaturation(30.0, 35.0);
    expect(cold).toBeGreaterThan(warm);
  });

  it('respeita o efeito de salga (salting-out): água doce dissolve mais oxigênio que água salgada', () => {
    const fresh = calculateWeissOxygenSaturation(26.8, 0.0);
    const marine = calculateWeissOxygenSaturation(26.8, 35.0);
    expect(fresh).toBeGreaterThan(marine);
  });

  it('calcula taxas cinéticas coerentes com vento e temperatura', () => {
    const kaBreeze = calculateReaerationRate(2.0, 8.0, 26.8);
    const kaGale = calculateReaerationRate(8.0, 8.0, 26.8);
    expect(kaGale).toBeGreaterThan(kaBreeze);

    const kdCool = calculateDeoxygenationRate(20.0);
    const kdHot = calculateDeoxygenationRate(30.0);
    expect(kdHot).toBeGreaterThan(kdCool);
  });

  it('classifica oxigênio conforme normas US EPA e CONAMA 357 sem equiparar hipóxia severa a anóxia', () => {
    expect(classifyDissolvedOxygen(6.5).category).toBe('normoxia');
    expect(classifyDissolvedOxygen(4.2).category).toBe('respiratory_stress');
    expect(classifyDissolvedOxygen(2.4).category).toBe('hypoxia');
    expect(classifyDissolvedOxygen(1.2).category).toBe('severe_hypoxia');
    expect(classifyDissolvedOxygen(0.05).category).toBe('anoxia');
  });

  it('integra balanço acoplado: carga orgânica contínua reduz oxigênio gradualmente com inércia física', () => {
    let doConc = 6.55;
    let bodConc = 0;
    const sewageEnv = { ...BASELINE, sewage: 50000 };

    for (let day = 0; day < 3; day += 0.5) {
      const step = integrateOxygenKinetics(doConc, bodConc, sewageEnv, 'frades', 0.5);
      doConc = step.nextDo;
      bodConc = step.nextBod;
    }

    expect(bodConc).toBeGreaterThan(0);
    expect(doConc).toBeLessThan(6.5);
    expect(doConc).toBeGreaterThan(0.5);
  });

  it('diferencia dimensionalmente e dinamicamente pulso instantâneo de carga contínua', () => {
    // 1. Pulso instantâneo: 50.000 kg DBO aplicados no instante inicial
    const pulseDelta = convertBOD5ToPulseDeltaMgL(50000, 3.2e7);
    expect(pulseDelta).toBeGreaterThan(0);

    let doPulse = 6.55;
    let bodPulse = pulseDelta;
    const zeroContinuousEnv = { ...BASELINE, sewage: 0 };

    // Simula 10 dias após o pulso: sem nova entrada diária, DBO decai e oxigênio se recupera
    for (let day = 0; day < 10; day += 0.5) {
      const step = integrateOxygenKinetics(doPulse, bodPulse, zeroContinuousEnv, 'frades', 0.5, 15, 'instant_pulse');
      doPulse = step.nextDo;
      bodPulse = step.nextBod;
    }

    // O CBOD residual do pulso deve ter decaído significativamente
    expect(bodPulse).toBeLessThan(pulseDelta * 0.35);
    expect(doPulse).toBeGreaterThan(5.0); // oxigênio recuperado em direção à saturação

    // 2. Carga contínua diária de 50.000 kg/dia mantém depressão constante
    let doCont = 6.55;
    let bodCont = 0;
    const sewageEnv = { ...BASELINE, sewage: 50000 };
    for (let day = 0; day < 10; day += 0.5) {
      const step = integrateOxygenKinetics(doCont, bodCont, sewageEnv, 'frades', 0.5, 15, 'continuous_daily');
      doCont = step.nextDo;
      bodCont = step.nextBod;
    }
    expect(doCont).toBeLessThan(1.0); // continua em hipóxia/anóxia severa contínua
  });

  it('gera metadados científicos rastreáveis com selo epistemológico', () => {
    const meta = getOxygenMetadata(4.5, 27.0, 35.0);
    expect(meta.unit).toBe('mg O₂/L');
    expect(meta.epistemicClass).toBe('Produto de Modelo');
    expect(meta.recordId).toBe('do-bts-coupled-model');
  });

  it('respeita a monotonicidade: aumentar carga orgânica mantendo condições iguais nunca pode aumentar o oxigênio', () => {
    const lowLoadEnv = { ...BASELINE, sewage: 5000 };
    const medLoadEnv = { ...BASELINE, sewage: 20000 };
    const highLoadEnv = { ...BASELINE, sewage: 80000 };

    const eqLow = calculateEquilibriumOxygen(lowLoadEnv, 'frades');
    const eqMed = calculateEquilibriumOxygen(medLoadEnv, 'frades');
    const eqHigh = calculateEquilibriumOxygen(highLoadEnv, 'frades');

    expect(eqLow).toBeGreaterThanOrEqual(eqMed);
    expect(eqMed).toBeGreaterThanOrEqual(eqHigh);

    // Na integração temporal para 5 dias a partir do mesmo estado inicial:
    let doLow = 6.55;
    let bodLow = 0;
    let doHigh = 6.55;
    let bodHigh = 0;

    for (let day = 0; day < 5; day += 0.25) {
      const stepLow = integrateOxygenKinetics(doLow, bodLow, lowLoadEnv, 'frades', 0.25);
      const stepHigh = integrateOxygenKinetics(doHigh, bodHigh, highLoadEnv, 'frades', 0.25);
      doLow = stepLow.nextDo;
      bodLow = stepLow.nextBod;
      doHigh = stepHigh.nextDo;
      bodHigh = stepHigh.nextBod;
    }

    expect(doLow).toBeGreaterThan(doHigh);
    expect(bodHigh).toBeGreaterThan(bodLow);
  });

  it('carga orgânica zero não cria demanda de oxigênio atribuível à carga (bodDeoxFlux = 0)', () => {
    const zeroSewageEnv = { ...BASELINE, sewage: 0 };
    const step = integrateOxygenKinetics(6.55, 0, zeroSewageEnv, 'frades', 0.1);
    expect(step.bodDeoxFlux).toBe(0);
    expect(step.nextBod).toBe(0);
  });

  it('duplicar massa de entrada em pulso duplica a concentração inicial de CBODu', () => {
    const delta1 = convertBOD5ToPulseDeltaMgL(25000, 3.2e7);
    const delta2 = convertBOD5ToPulseDeltaMgL(50000, 3.2e7);
    expect(delta2).toBeCloseTo(delta1 * 2, 5);
  });

  it('estabilidade numérica: reduzir o timestep em 2x mantém a trajetória com alta concordância', () => {
    const sewageEnv = { ...BASELINE, sewage: 30000 };

    // Simulação com dt = 0.2 dias (10 passos = 2 dias)
    let doCoarse = 6.55;
    let bodCoarse = 0;
    for (let i = 0; i < 10; i += 1) {
      const step = integrateOxygenKinetics(doCoarse, bodCoarse, sewageEnv, 'frades', 0.2);
      doCoarse = step.nextDo;
      bodCoarse = step.nextBod;
    }

    // Simulação com dt = 0.1 dias (20 passos = 2 dias)
    let doFine = 6.55;
    let bodFine = 0;
    for (let i = 0; i < 20; i += 1) {
      const step = integrateOxygenKinetics(doFine, bodFine, sewageEnv, 'frades', 0.1);
      doFine = step.nextDo;
      bodFine = step.nextBod;
    }

    // Diferença relativa entre os passos numéricos deve ser inferior a 2%
    expect(Math.abs(doCoarse - doFine) / doFine).toBeLessThan(0.02);
    expect(Math.abs(bodCoarse - bodFine) / bodFine).toBeLessThan(0.02);
  });

  it('relação entre profundidade e taxa de reaeração ka: Paraguaçu (H=5m) vs Barra (H=25m)', () => {
    const kaShallow = calculateReaerationRate(4.0, 5.0, 26.8);
    const kaDeep = calculateReaerationRate(4.0, 25.0, 26.8);
    // Em águas mais rasas, a área superficial por unidade de volume é maior, logo ka é estritamente maior
    expect(kaShallow).toBeGreaterThan(kaDeep);
    // O piso computacional de estabilidade é respeitado (ka >= 0.05 d^-1)
    expect(kaDeep).toBeGreaterThanOrEqual(0.05);
  });
});
