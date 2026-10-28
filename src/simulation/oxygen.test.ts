import { describe, expect, it } from 'vitest';
import {
  calculateDeoxygenationRate,
  calculateReaerationRate,
  calculateWeissOxygenSaturation,
  classifyDissolvedOxygen,
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
    let doConc = 7.12;
    let bodConc = 0;
    const sewageEnv = { ...BASELINE, sewage: 50000 };

    for (let day = 0; day < 10; day += 0.5) {
      const step = integrateOxygenKinetics(doConc, bodConc, sewageEnv, 'frades', 0.5);
      doConc = step.nextDo;
      bodConc = step.nextBod;
    }

    expect(bodConc).toBeGreaterThan(0);
    expect(doConc).toBeLessThan(7.0);
    expect(doConc).toBeGreaterThan(0.5);
  });

  it('gera metadados científicos rastreáveis com selo epistemológico', () => {
    const meta = getOxygenMetadata(4.5, 27.0, 35.0);
    expect(meta.unit).toBe('mg O₂/L');
    expect(meta.epistemicClass).toBe('Padrão Operacional');
    expect(meta.recordId).toBe('do-bts-coupled-model');
  });
});
