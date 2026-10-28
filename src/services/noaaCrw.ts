import { BTS_SECTORS } from '../simulation/config';
import type { BtsSectorId } from '../simulation/types';
import type { DatasetProvenance, ThermalForcingPoint } from './types';

/**
 * Cliente do NOAA Coral Reef Watch (CRW v3.1 5km via CoastWatch ERDDAP).
 *
 * Mapeia coordenadas nominais por compartimento da Baía de Todos-os-Santos:
 * - Frades / Itaparica (Baía Central): Lat -12.85°, Lon -38.55°
 * - Paraguaçu (Estuário / Fundo da Baía): Lat -12.75°, Lon -38.85°
 * - Barra (Acesso Atlântico): Lat -12.97°, Lon -38.50°
 *
 * Consulta direta ao dataset NOAA_DHW do ERDDAP:
 * - CRW_SST: Temperatura da Superfície do Mar (°C)
 * - CRW_SSTANOMALY: Anomalia de SST (°C) calculada contra a climatologia satelital
 * - CRW_HOTSPOT: Anomalia positiva sobre a MMM local (°C)
 * - CRW_DHW: Grau-semanas de aquecimento acumulado em 84 dias (°C-semana)
 * - CRW_BAA: Categoria operacional de estresse térmico (0 a 4)
 * - CRW_BAA_7D_MAX: Alerta máximo dos últimos 7 dias (0 a 4)
 */

export function getSectorCoordinates(sectorId: BtsSectorId = 'frades'): { latitude: number; longitude: number } {
  const sector = BTS_SECTORS.find((s) => s.id === sectorId);
  return sector?.coordinates ?? { latitude: -12.85, longitude: -38.55 };
}

function computeSimpleHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function isValidNumber(val: number): boolean {
  return Number.isFinite(val) && val > -500 && val < 500;
}

const NOAA_CRW_PROVENANCE_BASE: Omit<DatasetProvenance, 'validTimeStartUtc' | 'validTimeEndUtc' | 'retrievedAtUtc' | 'isCachedFallback'> = {
  sourceName: 'NOAA Coral Reef Watch (CRW)',
  sourceUrl: 'https://coralreefwatch.noaa.gov/product/5km/',
  datasetId: 'NOAA_DHW',
  datasetVersion: 'v3.1 Daily Global 5km Satellite Coral Bleaching Heat Stress Monitoring',
  epistemicClass: 'Produto de Modelo',
  license: 'U.S. Government Public Domain / Open Data',
  citation: 'NOAA Coral Reef Watch. Version 3.1 Daily Global 5km Satellite Coral Bleaching Heat Stress Monitoring. NOAA CoastWatch ERDDAP.',
};

/**
 * Gera uma janela temporal dinâmica padrão (últimos 45 dias até ontem)
 * para consultas à API do ERDDAP.
 */
export function getDefaultCrwWindow(): { startUtc: string; endUtc: string } {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const past45 = new Date(yesterday.getTime() - 45 * 24 * 3600 * 1000);

  const fmt = (d: Date) => d.toISOString().slice(0, 10) + 'T12:00:00Z';
  return { startUtc: fmt(past45), endUtc: fmt(yesterday) };
}

// Snapshot calibrado histórico (evento El Niño / onda de calor marinha mar/abr 2024 na BTS)
export const BTS_CRW_FALLBACK_SNAPSHOT: ThermalForcingPoint[] = [
  {
    timestampUtc: '2024-03-01T12:00:00Z',
    seaSurfaceTemperatureDegC: 28.4,
    sstAnomalyDegC: 0.4,
    hotSpotDegC: 0.4,
    degreeHeatingWeeks: 1.2,
    bleachingAlertLevel: 1, // Watch
    bleachingAlertArea: 1,
    bleachingAlertMax7d: 1,
    gridCell: { latitude: -12.85, longitude: -38.55 },
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na BTS). Não representa a condição atual de satélite.',
    },
  },
  {
    timestampUtc: '2024-03-15T12:00:00Z',
    seaSurfaceTemperatureDegC: 29.2,
    sstAnomalyDegC: 1.1,
    hotSpotDegC: 1.2,
    degreeHeatingWeeks: 3.8,
    bleachingAlertLevel: 2, // Warning
    bleachingAlertArea: 2,
    bleachingAlertMax7d: 2,
    gridCell: { latitude: -12.85, longitude: -38.55 },
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na BTS). Não representa a condição atual de satélite.',
    },
  },
  {
    timestampUtc: '2024-04-01T12:00:00Z',
    seaSurfaceTemperatureDegC: 29.8,
    sstAnomalyDegC: 1.6,
    hotSpotDegC: 1.8,
    degreeHeatingWeeks: 6.4,
    bleachingAlertLevel: 3, // Alert 1
    bleachingAlertArea: 3,
    bleachingAlertMax7d: 3,
    gridCell: { latitude: -12.85, longitude: -38.55 },
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na BTS). Não representa a condição atual de satélite.',
    },
  },
  {
    timestampUtc: '2024-04-15T12:00:00Z',
    seaSurfaceTemperatureDegC: 29.5,
    sstAnomalyDegC: 1.3,
    hotSpotDegC: 1.5,
    degreeHeatingWeeks: 8.2,
    bleachingAlertLevel: 4, // Alert 2
    bleachingAlertArea: 4,
    bleachingAlertMax7d: 4,
    gridCell: { latitude: -12.85, longitude: -38.55 },
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na BTS). Não representa a condição atual de satélite.',
    },
  },
];

/**
 * Consulta a série temporal do NOAA Coral Reef Watch via CoastWatch ERDDAP
 * utilizando o pixel específico do compartimento da Baía de Todos-os-Santos.
 *
 * Rejeita valores inválidos/flags de preenchimento e NÃO inventa anomalia nem HotSpot
 * a partir de limiar fixo caso estejam ausentes na resposta oficial.
 */
export async function fetchBtsThermalForcing(
  sectorId: BtsSectorId = 'frades',
  startUtc?: string,
  endUtc?: string,
): Promise<ThermalForcingPoint[]> {
  const windowDates = startUtc && endUtc ? { startUtc, endUtc } : getDefaultCrwWindow();
  const coords = getSectorCoordinates(sectorId);

  // Variáveis oficiais do produto NOAA CRW 5km v3.1:
  // CRW_SST, CRW_SSTANOMALY, CRW_HOTSPOT, CRW_DHW, CRW_BAA, CRW_BAA_7D_MAX
  const queryUrl = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?CRW_SST[(${windowDates.startUtc}):1:(${windowDates.endUtc})][(${coords.latitude})][(${coords.longitude})],CRW_SSTANOMALY[(${windowDates.startUtc}):1:(${windowDates.endUtc})][(${coords.latitude})][(${coords.longitude})],CRW_HOTSPOT[(${windowDates.startUtc}):1:(${endUtc ?? windowDates.endUtc})][(${coords.latitude})][(${coords.longitude})],CRW_DHW[(${windowDates.startUtc}):1:(${windowDates.endUtc})][(${coords.latitude})][(${coords.longitude})],CRW_BAA[(${windowDates.startUtc}):1:(${windowDates.endUtc})][(${coords.latitude})][(${coords.longitude})],CRW_BAA_7D_MAX[(${windowDates.startUtc}):1:(${windowDates.endUtc})][(${coords.latitude})][(${coords.longitude})]`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: { Accept: 'text/csv' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[NOAA CRW] HTTP ${response.status}. Utilizando snapshot histórico de contingência.`);
      return BTS_CRW_FALLBACK_SNAPSHOT;
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    // ERDDAP retorna linha 0 (nomes das colunas) e linha 1 (unidades das colunas)
    if (lines.length <= 2) return BTS_CRW_FALLBACK_SNAPSHOT;

    const responseHash = computeSimpleHash(csvText);
    const points: ThermalForcingPoint[] = [];
    const retrievedAt = new Date().toISOString();

    for (let index = 2; index < lines.length; index += 1) {
      const parts = lines[index].split(',');
      if (parts.length >= 8) {
        const timestampUtc = parts[0]?.trim();
        const sst = parseFloat(parts[3]);
        const sstAnomaly = parseFloat(parts[4]); // CRW_SSTANOMALY oficial
        const hotspot = parseFloat(parts[5]);    // CRW_HOTSPOT oficial
        const dhw = parseFloat(parts[6]);        // CRW_DHW oficial
        const baa = parseInt(parts[7], 10);      // CRW_BAA oficial
        const baa7d = parts[8] ? parseInt(parts[8], 10) : baa;

        // Validação estrita: descarta linhas com SST inválida ou flag de preenchimento (-999, etc.)
        if (timestampUtc && isValidNumber(sst)) {
          points.push({
            timestampUtc,
            seaSurfaceTemperatureDegC: sst,
            // Rejeição rigorosa de valores ausentes sem inventar dados
            sstAnomalyDegC: isValidNumber(sstAnomaly) ? sstAnomaly : null,
            hotSpotDegC: isValidNumber(hotspot) ? hotspot : null,
            degreeHeatingWeeks: isValidNumber(dhw) ? dhw : null,
            bleachingAlertLevel: isValidNumber(baa) ? baa : null,
            bleachingAlertArea: isValidNumber(baa) ? baa : null,
            bleachingAlertMax7d: isValidNumber(baa7d) ? baa7d : null,
            gridCell: coords,
            provenance: {
              ...NOAA_CRW_PROVENANCE_BASE,
              validTimeStartUtc: windowDates.startUtc,
              validTimeEndUtc: windowDates.endUtc,
              retrievedAtUtc: retrievedAt,
              queryUrl,
              responseHash,
              isCachedFallback: false,
              fetchStatus: 'online_valid',
            },
          });
        }
      }
    }

    return points.length > 0 ? points : BTS_CRW_FALLBACK_SNAPSHOT;
  } catch (error) {
    console.info('[NOAA CRW] Conexão remota indisponível ou offline. Usando snapshot histórico de contingência.');
    return BTS_CRW_FALLBACK_SNAPSHOT;
  }
}
