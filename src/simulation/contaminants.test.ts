import { describe, expect, it } from 'vitest';
import {
  BTS_MICROPLASTICS_SURVEY,
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

  it('preserva dados observacionais reais de microplásticos da BTS em itens/m³ sem conversão em kg', () => {
    expect(BTS_MICROPLASTICS_SURVEY).toHaveLength(4);
    const paraguacu = BTS_MICROPLASTICS_SURVEY.find((p) => p.riverName === 'Rio Paraguaçu');
    expect(paraguacu).toBeDefined();
    expect(paraguacu?.badge).toBe('Dado Local BTS');
    expect(paraguacu?.maxCountPerM3).toBe(32784);
    expect(paraguacu?.particleSizeFractionUnder300Um).toBeGreaterThan(90);

    const meta = getMicroplasticsSurveyMetadata();
    expect(meta.unit).toBe('itens/m³ de água superficial');
    expect(meta.epistemicClass).toBe('Dado Local BTS');
  });
});
