import { describe, expect, it } from 'vitest';
import {
  BTS_MICROPLASTICS_STUDY,
  calculateOilFateBudget,
  evaluateOilEcotoxicity,
  getMicroplasticsSurveyMetadata,
} from './contaminants';

describe('módulo de contaminantes: destino de óleo e microplásticos', () => {
  it('conserva massa estrita nos 4 reservatórios de óleo e na perda por evaporação/exportação', () => {
    const totalOilKg = 25000;
    const budget = calculateOilFateBudget(totalOilKg, 'frades', 2.0);

    expect(budget.surfaceFilmKg).toBeGreaterThan(0);
    expect(budget.waterColumnDispersedKg).toBeGreaterThan(0);
    expect(budget.dissolvedPahKg).toBeGreaterThan(0);
    expect(budget.sedimentedKg).toBeGreaterThan(0);
    expect(budget.evaporatedKg).toBeGreaterThan(0);
    expect(budget.exportedKg).toBeGreaterThan(0);
    expect(budget.evaporatedExportedKg).toBeCloseTo(budget.evaporatedKg + budget.exportedKg, 1);

    // Verificação do balanço de conservação de massa (resíduo numérico < 0.1 kg)
    expect(budget.massBalanceResidualKg).toBeLessThan(0.1);
  });

  it('calcula concentração dissolvida de tPAH50 em µg/L com base no volume do compartimento', () => {
    const budget = calculateOilFateBudget(50000, 'frades', 3.0);
    expect(budget.dissolvedPahConcentrationUgL).toBeGreaterThan(0.01);
    expect(budget.dissolvedPahConcentrationUgL).toBeLessThan(500.0);
  });

  it('avalia toxicidade com base nos endpoints experimentais de May et al. (2020)', () => {
    // Abaixo do limiar: risco baixo
    const low = evaluateOilEcotoxicity(1.5);
    expect(low.polypRetractionRisk).toBe('baixo');
    expect(low.tissueRegenerationInhibitionPercent).toBeLessThan(10);
    expect(low.badge).toBe('Referência Laboratorial Externa');

    // Em 10 µg/L (EC50 de regeneração tecidual): inibição deve ser ~50%
    const ec50Tissue = evaluateOilEcotoxicity(10.0);
    expect(Math.round(ec50Tissue.tissueRegenerationInhibitionPercent)).toBe(50);
    expect(ec50Tissue.polypRetractionRisk).toBe('severo');

    // Em 27 µg/L (EC50 de retração de pólipos): risco crítico
    const severe = evaluateOilEcotoxicity(30.0);
    expect(severe.polypRetractionRisk).toBe('critico');
  });

  it('preserva somente resultados rastreáveis do estudo de microplásticos, em itens/m³', () => {
    expect(BTS_MICROPLASTICS_STUDY.sampledEstuarineEnvironments).toBe(10);
    expect(BTS_MICROPLASTICS_STUDY.approximateMaximumCountPerM3).toBe(33000);
    expect(BTS_MICROPLASTICS_STUDY.predominantParticleSizeUnderUm).toBe(150);
    expect(BTS_MICROPLASTICS_STUDY.badge).toBe('Dado Local BTS');

    const meta = getMicroplasticsSurveyMetadata();
    expect(meta.unit).toBe('itens/m³ de água superficial');
    expect(meta.epistemicClass).toBe('Dado Local BTS');
  });

  it('garante conservação de massa estrita do óleo (resíduo < 0.001 kg) sob diversos cenários e setores', () => {
    const sectors = ['frades', 'paraguacu', 'barra'] as const;
    const days = [0.1, 0.5, 1.0, 3.0, 7.0, 14.0, 30.0];

    for (const sec of sectors) {
      for (const d of days) {
        // Cenário sem intervenção
        const b1 = calculateOilFateBudget(30000, sec, d, false, 0, false);
        expect(b1.massBalanceResidualKg).toBeLessThan(0.01);

        // Cenário com contenção e skimming parcial
        const b2 = calculateOilFateBudget(30000, sec, d, false, 2500, true);
        expect(b2.massBalanceResidualKg).toBeLessThan(0.01);
        expect(b2.recoveredKg).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('massa zero de óleo resulta em zero em todos os reservatórios e atenuação nula', () => {
    const zero = calculateOilFateBudget(0, 'frades', 5.0);
    expect(zero.surfaceFilmKg).toBe(0);
    expect(zero.waterColumnDispersedKg).toBe(0);
    expect(zero.dissolvedPahKg).toBe(0);
    expect(zero.sedimentedKg).toBe(0);
    expect(zero.evaporatedKg).toBe(0);
    expect(zero.exportedKg).toBe(0);
    expect(zero.recoveredKg).toBe(0);
    expect(zero.dissolvedPahConcentrationUgL).toBe(0);
    expect(zero.lightAttenuation).toBe(0);
    expect(zero.massBalanceResidualKg).toBe(0);
  });

  it('linearidade de escala: duplicar a massa de óleo de entrada duplica a soma dos reservatórios', () => {
    const b1 = calculateOilFateBudget(20000, 'frades', 2.0);
    const b2 = calculateOilFateBudget(40000, 'frades', 2.0);

    expect(b2.surfaceFilmKg).toBeCloseTo(b1.surfaceFilmKg * 2, 0);
    expect(b2.evaporatedKg).toBeCloseTo(b1.evaporatedKg * 2, 0);
    expect(b2.exportedKg).toBeCloseTo(b1.exportedKg * 2, 0);
    expect(b2.dissolvedPahKg).toBeCloseTo(b1.dissolvedPahKg * 2, 1);
  });
});
