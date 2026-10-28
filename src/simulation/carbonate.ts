import type { EpistemologicalBadge, ScientificMetadata } from './types';

/**
 * Módulo de Química do Sistema Carbonato Marinho.
 *
 * Implementa equilíbrio termodinâmico ácido-base do carbono inorgânico dissolvido (DIC),
 * alcalinidade total (TA), pH (escala total), pCO2 e estado de saturação de aragonita (Ωarag).
 *
 * Referência: Dickson, Sabine & Christian (2007) / NOAA PMEL CO2SYS / PyCO2SYS.
 */

export interface CarbonateSystemState {
  phTotal: number;
  totalAlkalinityUmolKg: number;
  dissolvedInorganicCarbonUmolKg: number;
  pCO2Uatm: number;
  carbonateIonUmolKg: number;
  bicarbonateIonUmolKg: number;
  omegaAragonite: number;
  omegaCalcite: number;
  calcificationStatus: 'optimum' | 'adequate' | 'marginal' | 'stressed' | 'corrosive';
}

/**
 * Constante aparente de produto de solubilidade da aragonita K'sp (mol^2/kg^2)
 * em função da temperatura (K) e salinidade (Mucci, 1983).
 */
export function calculateKspAragonite(tempCelsius: number, salinity = 35.0): number {
  const tk = tempCelsius + 273.15;
  const logKsp0 =
    -171.945 -
    0.077993 * tk +
    2903.293 / tk +
    71.595 * Math.log10(tk);

  const salCorr =
    (-0.068393 + 0.0017276 * tk + 88.135 / tk) * Math.sqrt(salinity) -
    0.10018 * salinity +
    0.0059415 * Math.pow(salinity, 1.5);

  return Math.pow(10, logKsp0 + salCorr);
}

/**
 * Constante aparente de produto de solubilidade da calcita K'sp (mol^2/kg^2)
 * segundo Mucci (1983) e Dickson et al. (2007) / CO2SYS.
 */
export function calculateKspCalcite(tempCelsius: number, salinity = 35.0): number {
  const tk = tempCelsius + 273.15;
  const logKsp0 =
    -171.9065 -
    0.077993 * tk +
    2839.319 / tk +
    71.595 * Math.log10(tk);

  const salCorr =
    (-0.77712 + 0.0028426 * tk + 178.34 / tk) * Math.sqrt(salinity) -
    0.07711 * salinity +
    0.0041249 * Math.pow(salinity, 1.5);

  return Math.pow(10, logKsp0 + salCorr);
}

/**
 * Concentração total de Cálcio livre na água do mar (mol/kg) proporcional à salinidade
 * (Riley & Tongudai, 1967): [Ca2+] = 0.01028 * (S / 35).
 */
export function calculateCalciumConcentration(salinity = 35.0): number {
  return 0.01028 * (salinity / 35.0);
}

/**
 * Resolve o sistema carbonato a partir de pH e Alcalinidade Total (TA)
 * sob condições tropicais da Baía de Todos-os-Santos.
 */
export function calculateCarbonateSystem(
  phTotal = 8.10,
  totalAlkalinityUmolKg = 2350,
  temperature = 26.8,
  salinity = 35.0,
): CarbonateSystemState {
  const tk = temperature + 273.15;

  // Constantes de dissociação do ácido carbônico em escala total (Lueker et al., 2000)
  const pk1 = 3633.86 / tk - 61.2172 + 9.6777 * Math.log(tk) - 0.011555 * salinity + 0.0001152 * salinity * salinity;
  const k1 = Math.pow(10, -pk1);

  const pk2 = 471.78 / tk + 25.929 - 3.16967 * Math.log(tk) - 0.01781 * salinity + 0.0001122 * salinity * salinity;
  const k2 = Math.pow(10, -pk2);

  // Concentração de íon hidrogênio [H+] em mol/kg
  const h = Math.pow(10, -phTotal);

  // Alcalinidade carbonática aproximada (TA menos contribuição de borato ~400 ueq/kg)
  const borateAlkalinity = 416 * (salinity / 35.0) / (1 + h / (Math.pow(10, -8.6)));
  const taCarbonateMolKg = Math.max(1e-4, (totalAlkalinityUmolKg - borateAlkalinity) * 1e-6);

  // Derivação das espécies de carbonato
  const denom = h + 2 * k2;
  const hco3MolKg = (taCarbonateMolKg * h) / denom;
  const co3MolKg = (taCarbonateMolKg * k2) / denom;
  const co2MolKg = (h * hco3MolKg) / k1;

  const dicMolKg = co2MolKg + hco3MolKg + co3MolKg;
  const dicUmolKg = dicMolKg * 1e6;
  const co3UmolKg = co3MolKg * 1e6;
  const hco3UmolKg = hco3MolKg * 1e6;

  // Solubilidade do CO2 (constante de Henry K0 em mol/kg/atm, Weiss 1974)
  const lnK0 =
    -58.0931 +
    90.5069 * (100 / tk) +
    22.294 * Math.log(tk / 100) +
    salinity * (0.027766 - 0.025888 * (tk / 100) + 0.0050578 * Math.pow(tk / 100, 2));
  const k0 = Math.exp(lnK0);
  const pCO2Uatm = (co2MolKg / k0) * 1e6;

  // Saturação termodinâmica estrita de aragonita e calcita (Mucci, 1983)
  const caMolKg = calculateCalciumConcentration(salinity);
  const kspArag = calculateKspAragonite(temperature, salinity);
  const kspCalc = calculateKspCalcite(temperature, salinity);
  const omegaAragonite = (caMolKg * co3MolKg) / kspArag;
  const omegaCalcite = (caMolKg * co3MolKg) / kspCalc;

  let calcificationStatus: CarbonateSystemState['calcificationStatus'] = 'optimum';
  if (omegaAragonite >= 3.5) calcificationStatus = 'optimum';
  else if (omegaAragonite >= 3.0) calcificationStatus = 'adequate';
  else if (omegaAragonite >= 2.0) calcificationStatus = 'marginal';
  else if (omegaAragonite >= 1.0) calcificationStatus = 'stressed';
  else calcificationStatus = 'corrosive';

  return {
    phTotal,
    totalAlkalinityUmolKg,
    dissolvedInorganicCarbonUmolKg: parseFloat(dicUmolKg.toFixed(1)),
    pCO2Uatm: parseFloat(pCO2Uatm.toFixed(1)),
    carbonateIonUmolKg: parseFloat(co3UmolKg.toFixed(1)),
    bicarbonateIonUmolKg: parseFloat(hco3UmolKg.toFixed(1)),
    omegaAragonite: parseFloat(omegaAragonite.toFixed(2)),
    omegaCalcite: parseFloat(omegaCalcite.toFixed(2)),
    calcificationStatus,
  };
}

/**
 * Resolve o impacto termodinâmico da adição de carbono respiratório (DIC)
 * no equilíbrio do sistema carbonato marinho (Lueker et al., 2000; Dickson, 1990).
 *
 * Classificação Epistemológica: Estimativa de Modelo Acoplado Didático / Teórico.
 * O carbono inorgânico dissolvido (DIC) aumenta com o fluxo de respiração microbiana
 * integrado ao longo do tempo (estequiometria RQ = 1,0 mol CO2 por mol O2 consumido).
 */
export function calculateRespirationPhImpact(
  baselinePh: number,
  addedDicUmolKg: number,
  totalAlkalinity = 2350,
  temperature = 26.8,
  salinity = 35.0,
): { effectivePh: number; carbonateSystem: CarbonateSystemState } {
  if (addedDicUmolKg <= 0.001) {
    return {
      effectivePh: baselinePh,
      carbonateSystem: calculateCarbonateSystem(baselinePh, totalAlkalinity, temperature, salinity),
    };
  }

  // Calculamos o estado baseline de DIC
  const baseSystem = calculateCarbonateSystem(baselinePh, totalAlkalinity, temperature, salinity);
  const targetDic = baseSystem.dissolvedInorganicCarbonUmolKg + addedDicUmolKg;

  // Bisseção rápida para encontrar o novo pH termodinâmico que equilibra (TA, targetDic)
  let lowPh = 6.5;
  let highPh = baselinePh;
  let estimatedPh = baselinePh;

  for (let iter = 0; iter < 14; iter += 1) {
    const midPh = (lowPh + highPh) / 2;
    const testSystem = calculateCarbonateSystem(midPh, totalAlkalinity, temperature, salinity);
    if (testSystem.dissolvedInorganicCarbonUmolKg > targetDic) {
      lowPh = midPh;
    } else {
      highPh = midPh;
    }
    estimatedPh = midPh;
  }

  const finalSystem = calculateCarbonateSystem(estimatedPh, totalAlkalinity, temperature, salinity);
  return {
    effectivePh: parseFloat(estimatedPh.toFixed(2)),
    carbonateSystem: finalSystem,
  };
}

export function getCarbonateMetadata(system: CarbonateSystemState): ScientificMetadata {
  return {
    recordId: 'carbonate-system-bts',
    variable: 'Sistema Carbonato & Aragonita (Ωarag)',
    symbol: 'Ωarag',
    value: system.omegaAragonite,
    unit: 'adimensional (escala de saturação)',
    quantityKind: 'model_product',
    epistemicClass: 'Produto de Modelo',
    source: 'Equilíbrio Termodinâmico Lueker et al. (2000) / Mucci (1983) / CO2SYS',
    sourceUrl: 'doi:10.1016/S0304-4203(00)00022-0',
    method: 'Resolução das espécies DIC a partir de TA, pH e constantes térmicas',
    uncertainty: `pCO₂: ${system.pCO2Uatm} µatm; CO₃²⁻: ${system.carbonateIonUmolKg} µmol/kg`,
    notes: `Estado de calcificação: ${system.calcificationStatus}. Ωarag > 3.0 é considerado referencial ótimo para escleractíneos em geral (Guinotte et al., 2003); corais da BTS (Siderastrea stellata e Mussismilia hispida) toleram variações, mas a calcificação decresce sob acidificação progressiva.`,
  };
}
