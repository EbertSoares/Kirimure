import type { BtsSectorId, EpistemologicalBadge, ScientificMetadata } from './types';
import { BTS_SECTORS } from './config';

/**
 * Módulo de Ecotoxicologia e Destino Físico de Contaminantes.
 *
 * 1. Óleo: Orçamento de massa particionado em 4 reservatórios físicos
 *    (filme superficial, gotículas dispersas, HPAs dissolvidos e óleo sedimentado).
 * 2. Microplásticos: Dados observacionais estuarinos da BTS em itens/m³
 *    (Trindade et al., 2023), diferenciando contagem amostral de massa em kg.
 */

export interface OilFateBudget {
  surfaceFilmKg: number;
  waterColumnDispersedKg: number;
  dissolvedPahKg: number;
  sedimentedKg: number;
  evaporatedKg: number;
  exportedKg: number;
  evaporatedExportedKg: number;
  /** Massa de óleo superficial transferida para armazenamento/destinação por contenção e skimming (kg). */
  recoveredKg: number;
  /** Concentração da fração dissolvida biodisponível (tPAH50) em µg/L. */
  dissolvedPahConcentrationUgL: number;
  /** Espessura nominal média do filme superficial em micrômetros (µm). */
  surfaceFilmThicknessUm: number;
  /** Atenuação relativa da radiação fotossinteticamente ativa (PAR) pela mancha (0 a 1). */
  lightAttenuation: number;
  /** Balanço de conservação de massa (diferença deve ser ~0). */
  massBalanceResidualKg: number;
}

export interface MicroplasticSurveyPoint {
  estuaryName: string;
  riverName: string;
  meanCountPerM3: number;
  maxCountPerM3: number;
  minCountPerM3: number;
  particleSizeFractionUnder300Um: number; // percentual (ex: 94%)
  badge: EpistemologicalBadge;
  citation: string;
}

/**
 * Dados empíricos publicados de microplásticos nos estuários da BTS
 * (Trindade et al., 2023; Environmental Pollution, v. 323, 121224).
 * Apresenta uma seleção representativa de 4 dos 10 ambientes estuarinos investigados no estudo.
 */
export const BTS_MICROPLASTICS_SURVEY: readonly MicroplasticSurveyPoint[] = [
  {
    estuaryName: 'Estuário do Rio Paraguaçu',
    riverName: 'Rio Paraguaçu',
    meanCountPerM3: 6840,
    maxCountPerM3: 32784,
    minCountPerM3: 1240,
    particleSizeFractionUnder300Um: 94.2,
    badge: 'Dado Local BTS',
    citation: 'Trindade et al. (2023, v. 323) / UFRB',
  },
  {
    estuaryName: 'Estuário do Rio Jaguaripe',
    riverName: 'Rio Jaguaripe',
    meanCountPerM3: 4920,
    maxCountPerM3: 18560,
    minCountPerM3: 850,
    particleSizeFractionUnder300Um: 93.8,
    badge: 'Dado Local BTS',
    citation: 'Trindade et al. (2023, v. 323) / UFRB',
  },
  {
    estuaryName: 'Estuário do Rio Subaé',
    riverName: 'Rio Subaé',
    meanCountPerM3: 5310,
    maxCountPerM3: 24110,
    minCountPerM3: 980,
    particleSizeFractionUnder300Um: 95.1,
    badge: 'Dado Local BTS',
    citation: 'Trindade et al. (2023, v. 323) / UFRB',
  },
  {
    estuaryName: 'Estuário do Rio São Paulo',
    riverName: 'Rio São Paulo',
    meanCountPerM3: 3635,
    maxCountPerM3: 14200,
    minCountPerM3: 637,
    particleSizeFractionUnder300Um: 92.6,
    badge: 'Dado Local BTS',
    citation: 'Trindade et al. (2023, v. 323) / UFRB',
  },
] as const;

/** Média aritmética das médias dos 4 estuários selecionados (itens/m³). */
export const BTS_MICROPLASTICS_SELECTION_MEAN_COUNT_PER_M3 = 5176;
/** Média estuarina global reportada em Trindade et al. (2023) nos 10 ambientes (itens/m³). */
export const BTS_MICROPLASTICS_STUDY_GLOBAL_MEAN_COUNT_PER_M3 = 5180;

/**
 * Calcula a partição e destino do derramamento de óleo em 4 reservatórios
 * físicos na caixa de mistura do compartimento da BTS.
 *
 * @param totalInputKg Massa total de óleo introduzida no cenário (kg).
 * @param sectorId Compartimento ativo da Baía de Todos-os-Santos.
 * @param elapsedDays Dias desde o início do evento.
 */
export function calculateOilFateBudget(
  totalInputKg: number,
  sectorId: BtsSectorId = 'frades',
  elapsedDays = 1,
  isAlreadyRetained = false,
  skimmedSurfaceKg = 0,
  containmentActive = false,
): OilFateBudget {
  if (totalInputKg <= 0) {
    return {
      surfaceFilmKg: 0,
      waterColumnDispersedKg: 0,
      dissolvedPahKg: 0,
      sedimentedKg: 0,
      evaporatedKg: 0,
      exportedKg: 0,
      evaporatedExportedKg: 0,
      recoveredKg: 0,
      dissolvedPahConcentrationUgL: 0,
      surfaceFilmThicknessUm: 0,
      lightAttenuation: 0,
      massBalanceResidualKg: 0,
    };
  }

  const sector = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];

  // 1. Evaporação atmosférica de voláteis leves (C1-C10) segundo cinética ADIOS:
  // Decaimento exponencial rápido atingindo assíntota de 25% a 35% nas primeiras 72h
  const maxEvapFraction = 0.30;
  const evapFraction = maxEvapFraction * (1 - Math.exp(-elapsedDays / 1.5));
  const evaporatedKg = totalInputKg * evapFraction;

  // 2. Exportação hidrodinâmica advectiva para o oceano externo via tempo de renovação (tau):
  // Se a massa fornecida já representa a carga retida após a janela de transporte (isAlreadyRetained),
  // não reaplica exportação advectiva para evitar dupla atenuação temporal.
  const exportFraction = isAlreadyRetained ? 0 : 0.20 * (1 - Math.exp(-elapsedDays / sector.dischargeDays));
  const exportedKg = totalInputKg * exportFraction;

  // Massa disponível para partição nos reservatórios internos da baía
  const internalAvailableKg = Math.max(0, totalInputKg - evaporatedKg - exportedKg);

  // 3. Partição entre os 4 reservatórios físicos internos da baía:
  // Filme superficial: espalhamento inicial com afundamento gradual
  const surfCoeff = 0.60 * Math.exp(-elapsedDays / 4.0);
  // Coluna d'água: gotículas dispersas por ondas/turbulência
  const dispCoeff = 0.25 * (1 - Math.exp(-elapsedDays / 2.0)) * Math.exp(-elapsedDays / 8.0);
  // Sedimento bentônico: deposição e agregação mineral
  const sedCoeff = Math.min(0.25, 0.05 + (1 - Math.exp(-elapsedDays / 6.0)) * 0.15);
  // HPAs solúveis dissolvidos (fração tPAH50 de 2 a 4 anéis): ~1,5% da massa disponível
  const pahCoeff = 0.015 * (1 - Math.exp(-elapsedDays / 2.5));

  const totalCoeff = surfCoeff + dispCoeff + sedCoeff + pahCoeff;
  const normFactor = totalCoeff > 0 ? 1 / totalCoeff : 1;

  const rawSurfaceFilmKg = internalAvailableKg * (surfCoeff * normFactor);
  const waterColumnDispersedKg = internalAvailableKg * (dispCoeff * normFactor);
  const dissolvedPahKg = internalAvailableKg * (pahCoeff * normFactor);
  const sedimentedKg = internalAvailableKg * (sedCoeff * normFactor);

  // Skimming mecânico atua exclusivamente sobre o filme superficial acessível,
  // preservando intactas as frações já evaporadas, dispersas, dissolvidas (tPAH50) e sedimentadas.
  const recoveredKg = Math.max(0, Math.min(skimmedSurfaceKg, rawSurfaceFilmKg));
  const surfaceFilmKg = Math.max(0, rawSurfaceFilmKg - recoveredKg);

  const totalLostKg = evaporatedKg + exportedKg;

  // Concentração de tPAH50 dissolvido na coluna d'água:
  // kg * 1e9 ug / (volumeM3 * 1000 L) = ug/L
  const dissolvedPahConcentrationUgL = (dissolvedPahKg * 1e9) / (sector.mixingVolumeM3 * 1000);

  // Espessura estimada do filme superficial; barreiras de contenção limitam a área de espalhamento
  const spreadingFactor = containmentActive ? 85 : 150;
  const slickAreaM2 = surfaceFilmKg > 0
    ? Math.max(5e3, Math.min(containmentActive ? 1.1e6 : 2e6, surfaceFilmKg * spreadingFactor))
    : 1e4;
  const surfaceFilmThicknessUm = surfaceFilmKg > 0 ? (surfaceFilmKg / 880 / slickAreaM2) * 1e6 : 0;
  const areaExposureFactor = containmentActive ? 0.65 : 1.0;
  const lightAttenuation = Math.min(
    0.95,
    (surfaceFilmThicknessUm > 0.1 ? 0.3 + Math.log10(1 + surfaceFilmThicknessUm) * 0.25 : 0) * areaExposureFactor,
  );

  // Resíduo numérico de conservação de massa independente (inclui óleo superficial recolhido)
  const sumReservoirs =
    surfaceFilmKg
    + waterColumnDispersedKg
    + dissolvedPahKg
    + sedimentedKg
    + evaporatedKg
    + exportedKg
    + recoveredKg;
  const massBalanceResidualKg = Math.abs(totalInputKg - sumReservoirs);

  return {
    surfaceFilmKg: parseFloat(surfaceFilmKg.toFixed(1)),
    waterColumnDispersedKg: parseFloat(waterColumnDispersedKg.toFixed(1)),
    dissolvedPahKg: parseFloat(dissolvedPahKg.toFixed(2)),
    sedimentedKg: parseFloat(sedimentedKg.toFixed(1)),
    evaporatedKg: parseFloat(evaporatedKg.toFixed(1)),
    exportedKg: parseFloat(exportedKg.toFixed(1)),
    evaporatedExportedKg: parseFloat(totalLostKg.toFixed(1)),
    recoveredKg: parseFloat(recoveredKg.toFixed(1)),
    dissolvedPahConcentrationUgL: parseFloat(dissolvedPahConcentrationUgL.toFixed(3)),
    surfaceFilmThicknessUm: parseFloat(surfaceFilmThicknessUm.toFixed(2)),
    lightAttenuation: parseFloat(lightAttenuation.toFixed(2)),
    massBalanceResidualKg: parseFloat(massBalanceResidualKg.toFixed(4)),
  };
}

/**
 * Avalia o risco ecotoxicológico subletal para corais recifais
 * com base no limiar experimental de May et al. (2020) para Pocillopora/Siderastrea:
 * - EC50 de regeneração tecidual: 10 µg/L tPAH50;
 * - EC50 de comportamento de pólipos: 27 µg/L tPAH50.
 */
export function evaluateOilEcotoxicity(dissolvedPahConcentrationUgL: number): {
  tissueRegenerationInhibitionPercent: number;
  polypRetractionRisk: 'baixo' | 'moderado' | 'severo' | 'critico';
  badge: EpistemologicalBadge;
  note: string;
} {
  const c = dissolvedPahConcentrationUgL;
  // Curva de Hill (n = 2): E = 100 * C^2 / (EC50^2 + C^2)
  const tissueInhibition = (100 * Math.pow(c, 2)) / (Math.pow(10, 2) + Math.pow(c, 2));

  let polypRisk: 'baixo' | 'moderado' | 'severo' | 'critico' = 'baixo';
  if (c >= 27.0) polypRisk = 'critico';
  else if (c >= 10.0) polypRisk = 'severo';
  else if (c >= 3.0) polypRisk = 'moderado';

  return {
    tissueRegenerationInhibitionPercent: parseFloat(tissueInhibition.toFixed(1)),
    polypRetractionRisk: polypRisk,
    badge: 'Referência Laboratorial Externa',
    note: 'Curva toxicocinética derivada de May et al. (2020) em bioensaio controlado de 96h com fração hidrossolúvel HEWAF. Não é dose letal instantânea de campo.',
  };
}

export function getMicroplasticsSurveyMetadata(): ScientificMetadata {
  return {
    recordId: 'bts-estuarine-microplastics-trindade-2023',
    variable: 'Abundância de Microplásticos em Estuários da BTS',
    symbol: 'MP',
    value: '5.176 a 32.784',
    unit: 'itens/m³ de água superficial',
    quantityKind: 'concentration',
    epistemicClass: 'Dado Local BTS',
    source: 'Trindade et al. (2023, v. 323, 121224) / Environmental Pollution / UFRB',
    sourceUrl: 'doi:10.1016/j.envpol.2023.121224',
    method: 'Arrasto superficial com rede de plâncton (malhas 64 µm e 300 µm); ~94% dos itens < 300 µm',
    uncertainty: 'Aporte fluvial anual estimado em 3,88 trilhões de partículas (média global do estudo: ~5.180 itens/m³)',
    notes: 'Amostragem empírica in situ representando seleção de 4 dos 10 ambientes estuarinos da BTS. Valores preservados estritamente em itens/m³ (sem conversão genérica para massa em kg).',
  };
}
