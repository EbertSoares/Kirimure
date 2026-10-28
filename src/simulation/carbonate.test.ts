import { describe, expect, it } from 'vitest';
import {
  calculateCalciumConcentration,
  calculateCarbonateSystem,
  calculateRespirationPhImpact,
  getCarbonateMetadata,
} from './carbonate';

describe('módulo do sistema carbonato marinho e saturação de aragonita', () => {
  it('calcula equilíbrio de carbonatos coerente na linha de base da BTS (pH 8,10, TA 2350 µmol/kg)', () => {
    const system = calculateCarbonateSystem(8.10, 2350, 26.8, 35.0);
    expect(system.phTotal).toBe(8.10);
    expect(system.totalAlkalinityUmolKg).toBe(2350);
    expect(system.pCO2Uatm).toBeGreaterThan(300);
    expect(system.pCO2Uatm).toBeLessThan(450);
    expect(system.omegaAragonite).toBeGreaterThan(3.5);
    expect(system.calcificationStatus).toBe('optimum');
  });

  it('demonstra acidificação oceânica: queda de pH deprime a saturação de aragonita', () => {
    const normal = calculateCarbonateSystem(8.10, 2350, 26.8, 35.0);
    const acidic = calculateCarbonateSystem(7.70, 2350, 26.8, 35.0);

    expect(acidic.omegaAragonite).toBeLessThan(normal.omegaAragonite);
    expect(acidic.pCO2Uatm).toBeGreaterThan(normal.pCO2Uatm);
    expect(acidic.carbonateIonUmolKg).toBeLessThan(normal.carbonateIonUmolKg);
    expect(acidic.calcificationStatus).toBe('stressed');
  });

  it('calcula cálcio livre proporcional à salinidade', () => {
    const marineCa = calculateCalciumConcentration(35.0);
    const brackishCa = calculateCalciumConcentration(17.5);
    expect(marineCa).toBeCloseTo(0.01028, 4);
    expect(brackishCa).toBeCloseTo(0.00514, 4);
  });

  it('responde à salinidade do compartimento: estuário do Paraguaçu (22 PSU) vs canal da Barra (36,5 PSU)', () => {
    const paraguacu = calculateCarbonateSystem(8.10, 2350 * (22 / 35), 27.2, 22.0);
    const barra = calculateCarbonateSystem(8.10, 2350 * (36.5 / 35), 26.4, 36.5);

    // No estuário, a diluição de cálcio livre e alcalinidade deprime omega de aragonita
    expect(paraguacu.omegaAragonite).toBeLessThan(barra.omegaAragonite);
  });

  it('valida contra referências padrão CO2SYS / Dickson & Goyet (1994) / Orr et al. (2018)', () => {
    // Condições padrão de água do mar: T = 25 °C, S = 35, pH = 8.10, TA = 2300 µmol/kg
    const std = calculateCarbonateSystem(8.10, 2300, 25.0, 35.0);

    // DIC esperado entre 1960 e 2030 µmol/kg (para TA = 2300 µmol/kg em água do mar a pH 8.10)
    expect(std.dissolvedInorganicCarbonUmolKg).toBeGreaterThan(1960);
    expect(std.dissolvedInorganicCarbonUmolKg).toBeLessThan(2030);

    // pCO2 esperado em torno de 320 - 430 µatm (na escala total de pH)
    expect(std.pCO2Uatm).toBeGreaterThan(320);
    expect(std.pCO2Uatm).toBeLessThan(430);

    // Bicarbonato como espécie carbonatada dominante (~1700 - 1850 µmol/kg)
    expect(std.bicarbonateIonUmolKg).toBeGreaterThan(1700);
    expect(std.bicarbonateIonUmolKg).toBeLessThan(1850);

    // Íon carbonato livre (~190 - 240 µmol/kg)
    expect(std.carbonateIonUmolKg).toBeGreaterThan(190);
    expect(std.carbonateIonUmolKg).toBeLessThan(240);

    // Omega aragonita (~3.6 a 4.3) e calcita (~5.5 a 6.5)
    expect(std.omegaAragonite).toBeGreaterThan(3.6);
    expect(std.omegaAragonite).toBeLessThan(4.3);
    expect(std.omegaCalcite).toBeGreaterThan(5.5);
    expect(std.omegaCalcite).toBeLessThan(6.5);
    expect(std.calcificationStatus).toBe('optimum');
  });

  it('valida vetores de referência reproduzíveis tipo CO2SYS com tolerâncias numéricas explícitas em condições diversas', () => {
    // Vetor A: Recife Tropical Quente (T = 28.0 °C, S = 35.0 PSU, TA = 2350 µmol/kg, pH_total = 8.15, P = 0 dbar)
    const warmReef = calculateCarbonateSystem(8.15, 2350, 28.0, 35.0);
    // Tolerâncias documentadas: DIC entre 1940 e 2010 µmol/kg, pCO2 entre 280 e 360 µatm, Ωarag entre 3.9 e 4.7
    expect(warmReef.dissolvedInorganicCarbonUmolKg).toBeGreaterThan(1940);
    expect(warmReef.dissolvedInorganicCarbonUmolKg).toBeLessThan(2010);
    expect(warmReef.pCO2Uatm).toBeGreaterThan(280);
    expect(warmReef.pCO2Uatm).toBeLessThan(360);
    expect(warmReef.omegaAragonite).toBeGreaterThan(3.9);
    expect(warmReef.omegaAragonite).toBeLessThan(4.7);
    expect(warmReef.calcificationStatus).toBe('optimum');

    // Vetor B: Acidificação Costeira Severa (T = 26.8 °C, S = 35.0 PSU, TA = 2350 µmol/kg, pH_total = 7.75)
    const acidified = calculateCarbonateSystem(7.75, 2350, 26.8, 35.0);
    // Sob acidificação: DIC sobe para ~2210 µmol/kg, pCO2 sobe para > 900 µatm, Ωarag cai para ~2.0 - 2.3
    expect(acidified.dissolvedInorganicCarbonUmolKg).toBeGreaterThan(2180);
    expect(acidified.dissolvedInorganicCarbonUmolKg).toBeLessThan(2250);
    expect(acidified.pCO2Uatm).toBeGreaterThan(850);
    expect(acidified.pCO2Uatm).toBeLessThan(1100);
    expect(acidified.omegaAragonite).toBeGreaterThan(1.8);
    expect(acidified.omegaAragonite).toBeLessThan(2.4);
    expect(acidified.calcificationStatus).toBe('marginal');

    // Vetor C: Estuário Salobro (T = 27.2 °C, S = 22.0 PSU, TA = 1477 µmol/kg [escalado por S/35], pH = 8.00)
    const estuarine = calculateCarbonateSystem(8.00, 2350 * (22 / 35), 27.2, 22.0);
    // No estuário salobro, o cálcio diluído deprime a saturação mineral (Ωarag < 2.5)
    expect(estuarine.omegaAragonite).toBeLessThan(2.5);
    expect(estuarine.omegaCalcite).toBeLessThan(3.8);
  });

  it('conecta respiração de DBO com liberação estequiométrica de CO2 e redução de pH', () => {
    const result = calculateRespirationPhImpact(8.10, 5.0, 2350, 26.8, 35.0);
    expect(result.effectivePh).toBeLessThanOrEqual(8.10);
    expect(result.effectivePh).toBeGreaterThan(7.75);
    expect(result.carbonateSystem.dissolvedInorganicCarbonUmolKg).toBeGreaterThan(
      calculateCarbonateSystem(8.10, 2350, 26.8, 35.0).dissolvedInorganicCarbonUmolKg,
    );
  });

  it('gera metadados científicos válidos para auditoria', () => {
    const system = calculateCarbonateSystem(8.05);
    const meta = getCarbonateMetadata(system);
    expect(meta.epistemicClass).toBe('Produto de Modelo');
    expect(meta.variable).toContain('Sistema Carbonato');
    expect(meta.unit).toBe('adimensional (escala de saturação)');
  });
});
