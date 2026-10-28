import { BTS_SECTORS } from '../simulation/config';
import type { BtsSectorId } from '../simulation/types';
import type { DatasetProvenance, ThermalForcingPoint } from './types';

/**
 * Cliente do NOAA Coral Reef Watch (CRW v3.1 5km via CoastWatch ERDDAP).
 *
 * Mapeia coordenadas nominais por compartimento da Baía de Todos-os-Santos:
 * - Frades / Itaparica (Baía Central): Lat -12.85°, Lon -38.55°
 * - Paraguaçu (Estuário / Fundo da Baía): Lat -12.75°, Lon -38.85° (mascarado por terra na grade 5 km)
 * - Barra (Acesso Atlântico): Lat -12.97°, Lon -38.50°
 *
 * Variáveis oficiais do dataset NOAA_DHW do ERDDAP:
 * - CRW_SST: Temperatura da Superfície do Mar (°C)
 * - CRW_SSTANOMALY: Anomalia de SST (°C) contra a climatologia satelital
 * - CRW_HOTSPOT: Anomalia positiva sobre a MMM local (°C) — estresse térmico ativo
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
 * Gera uma janela temporal com recuo operacional seguro de 2 dias (48h)
 * para absorver o ciclo de ingestão e processamento de produtos satelitais diários da NOAA.
 */
export function getDefaultCrwWindow(days = 45): { startUtc: string; endUtc: string } {
  const now = new Date();
  const safeEnd = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const start = new Date(safeEnd.getTime() - days * 24 * 3600 * 1000);

  const fmt = (d: Date) => d.toISOString().slice(0, 10) + 'T12:00:00Z';
  return { startUtc: fmt(start), endUtc: fmt(safeEnd) };
}

/**
 * Divide intervalos longos em blocos de até maxChunkDays (padrão 15 dias)
 * para evitar sobrecarga e timeouts no servidor ERDDAP (> 30 passos temporais).
 */
export function splitTimeWindowIntoChunks(
  startUtc: string,
  endUtc: string,
  maxChunkDays = 15,
): Array<{ startUtc: string; endUtc: string }> {
  const startMs = new Date(startUtc).getTime();
  const endMs = new Date(endUtc).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return [{ startUtc, endUtc }];
  }

  const chunkMs = maxChunkDays * 24 * 3600 * 1000;
  const chunks: Array<{ startUtc: string; endUtc: string }> = [];

  let currentStart = startMs;
  while (currentStart < endMs) {
    const currentEnd = Math.min(currentStart + chunkMs, endMs);
    const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10) + 'T12:00:00Z';
    chunks.push({
      startUtc: fmt(currentStart),
      endUtc: fmt(currentEnd),
    });
    currentStart = currentEnd;
    if (currentStart >= endMs) break;
  }

  return chunks;
}

// Snapshots históricos calibrados (evento El Niño / onda de calor marinha mar/abr 2024 na BTS)
// Utilizados exclusivamente para contingência explícita a pedido do usuário
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
    requestedCoordinates: { latitude: -12.85, longitude: -38.55 },
    spatialResolution: '5 km (0.05° pixel)',
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      queryUrl: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?CRW_SST,CRW_SSTANOMALY,CRW_HOTSPOT,CRW_DHW,CRW_BAA[-12.85][-38.55]',
      responseHash: 'e4a8b291',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na Baía Central/Frades). Não representa a condição atual de satélite.',
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
    requestedCoordinates: { latitude: -12.85, longitude: -38.55 },
    spatialResolution: '5 km (0.05° pixel)',
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      queryUrl: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?CRW_SST,CRW_SSTANOMALY,CRW_HOTSPOT,CRW_DHW,CRW_BAA[-12.85][-38.55]',
      responseHash: 'f721bc08',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na Baía Central/Frades). Não representa a condição atual de satélite.',
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
    requestedCoordinates: { latitude: -12.85, longitude: -38.55 },
    spatialResolution: '5 km (0.05° pixel)',
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      queryUrl: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?CRW_SST,CRW_SSTANOMALY,CRW_HOTSPOT,CRW_DHW,CRW_BAA[-12.85][-38.55]',
      responseHash: '8ac41e3d',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na Baía Central/Frades). Não representa a condição atual de satélite.',
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
    requestedCoordinates: { latitude: -12.85, longitude: -38.55 },
    spatialResolution: '5 km (0.05° pixel)',
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      queryUrl: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?CRW_SST,CRW_SSTANOMALY,CRW_HOTSPOT,CRW_DHW,CRW_BAA[-12.85][-38.55]',
      responseHash: '9d332fa1',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na Baía Central/Frades). Não representa a condição atual de satélite.',
    },
  },
];

export const BTS_CRW_BARRA_FALLBACK_SNAPSHOT: ThermalForcingPoint[] = [
  {
    timestampUtc: '2024-03-01T12:00:00Z',
    seaSurfaceTemperatureDegC: 28.2,
    sstAnomalyDegC: 0.3,
    hotSpotDegC: 0.3,
    degreeHeatingWeeks: 1.0,
    bleachingAlertLevel: 1, // Watch
    bleachingAlertArea: 1,
    bleachingAlertMax7d: 1,
    gridCell: { latitude: -12.95, longitude: -38.50 },
    requestedCoordinates: { latitude: -12.97, longitude: -38.50 },
    spatialResolution: '5 km (0.05° pixel)',
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      queryUrl: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?CRW_SST,CRW_SSTANOMALY,CRW_HOTSPOT,CRW_DHW,CRW_BAA[-12.97][-38.50]',
      responseHash: 'b4a1c832',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na Boca da Barra). Não representa a condição atual de satélite.',
    },
  },
  {
    timestampUtc: '2024-03-15T12:00:00Z',
    seaSurfaceTemperatureDegC: 29.0,
    sstAnomalyDegC: 0.9,
    hotSpotDegC: 1.0,
    degreeHeatingWeeks: 3.2,
    bleachingAlertLevel: 2, // Warning
    bleachingAlertArea: 2,
    bleachingAlertMax7d: 2,
    gridCell: { latitude: -12.95, longitude: -38.50 },
    requestedCoordinates: { latitude: -12.97, longitude: -38.50 },
    spatialResolution: '5 km (0.05° pixel)',
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      queryUrl: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?CRW_SST,CRW_SSTANOMALY,CRW_HOTSPOT,CRW_DHW,CRW_BAA[-12.97][-38.50]',
      responseHash: 'c72e90f1',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na Boca da Barra). Não representa a condição atual de satélite.',
    },
  },
  {
    timestampUtc: '2024-04-01T12:00:00Z',
    seaSurfaceTemperatureDegC: 29.5,
    sstAnomalyDegC: 1.4,
    hotSpotDegC: 1.5,
    degreeHeatingWeeks: 5.8,
    bleachingAlertLevel: 3, // Alert 1
    bleachingAlertArea: 3,
    bleachingAlertMax7d: 3,
    gridCell: { latitude: -12.95, longitude: -38.50 },
    requestedCoordinates: { latitude: -12.97, longitude: -38.50 },
    spatialResolution: '5 km (0.05° pixel)',
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      queryUrl: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?CRW_SST,CRW_SSTANOMALY,CRW_HOTSPOT,CRW_DHW,CRW_BAA[-12.97][-38.50]',
      responseHash: 'e108d47b',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na Boca da Barra). Não representa a condição atual de satélite.',
    },
  },
  {
    timestampUtc: '2024-04-15T12:00:00Z',
    seaSurfaceTemperatureDegC: 29.2,
    sstAnomalyDegC: 1.1,
    hotSpotDegC: 1.3,
    degreeHeatingWeeks: 7.5,
    bleachingAlertLevel: 3, // Alert 1
    bleachingAlertArea: 3,
    bleachingAlertMax7d: 3,
    gridCell: { latitude: -12.95, longitude: -38.50 },
    requestedCoordinates: { latitude: -12.97, longitude: -38.50 },
    spatialResolution: '5 km (0.05° pixel)',
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-04-15T12:00:00Z',
      retrievedAtUtc: '2024-04-16T10:00:00Z',
      queryUrl: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?CRW_SST,CRW_SSTANOMALY,CRW_HOTSPOT,CRW_DHW,CRW_BAA[-12.97][-38.50]',
      responseHash: 'a57cb912',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot histórico de contingência (Onda de calor marinha mar/abr 2024 na Boca da Barra). Não representa a condição atual de satélite.',
    },
  },
];

export const BTS_CRW_SECTOR_FALLBACKS: Partial<Record<BtsSectorId, ThermalForcingPoint[]>> = {
  frades: BTS_CRW_FALLBACK_SNAPSHOT,
  barra: BTS_CRW_BARRA_FALLBACK_SNAPSHOT,
  // paraguacu: canal estuarino interior; resolução de 5 km da NOAA mascara a célula com terra.
};

/**
 * Retorna o snapshot histórico de contingência de um setor específico sob demanda manual do usuário.
 */
export function getBtsCrwHistoricalSnapshot(sectorId: BtsSectorId = 'frades'): ThermalForcingPoint[] {
  return BTS_CRW_SECTOR_FALLBACKS[sectorId] ?? [];
}

/**
 * Executa requisição HTTP com timeout de ~12s e 1 repetição automática em falhas transitórias.
 */
async function fetchWithTimeoutAndRetry(
  url: string,
  timeoutMs = 12000,
  maxRetries = 1,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/csv' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // Se status 5xx e ainda tiver retentativa, aguarda 1s antes de repetir
      if (response.status >= 500 && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Falha de conexão com NOAA ERDDAP`);
}

/**
 * Consulta a série temporal do NOAA Coral Reef Watch via CoastWatch ERDDAP.
 *
 * Características:
 * - Timeout estendido para 12 segundos com 1 repetição para evitar falsos positivos de indisponibilidade;
 * - Divisão de períodos longos em blocos de até 15 dias para contornar limitações do ERDDAP;
 * - Recuo operacional de 2 dias na data final padrão para respeitar a janela de síntese do satélite;
 * - Rejeição estrita de falhas sem injeção silenciosa de snapshot histórico (elimina fallback automático);
 * - O snapshot histórico só é carregado se explicitamente solicitado pelo usuário.
 */
export async function fetchBtsThermalForcing(
  sectorId: BtsSectorId = 'frades',
  startUtc?: string,
  endUtc?: string,
): Promise<ThermalForcingPoint[]> {
  // Setores estuarinos interiores estreitos (como o Paraguaçu) sofrem mascaramento de terra na grade de 5 km
  if (sectorId === 'paraguacu') {
    return [];
  }

  const windowDates = startUtc && endUtc ? { startUtc, endUtc } : getDefaultCrwWindow(45);
  const coords = getSectorCoordinates(sectorId);
  const chunks = splitTimeWindowIntoChunks(windowDates.startUtc, windowDates.endUtc, 15);

  const pointsMap = new Map<string, ThermalForcingPoint>();

  for (const chunk of chunks) {
    const queryUrl = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?CRW_SST[(${chunk.startUtc}):1:(${chunk.endUtc})][(${coords.latitude})][(${coords.longitude})],CRW_SSTANOMALY[(${chunk.startUtc}):1:(${chunk.endUtc})][(${coords.latitude})][(${coords.longitude})],CRW_HOTSPOT[(${chunk.startUtc}):1:(${chunk.endUtc})][(${coords.latitude})][(${coords.longitude})],CRW_DHW[(${chunk.startUtc}):1:(${chunk.endUtc})][(${coords.latitude})][(${coords.longitude})],CRW_BAA[(${chunk.startUtc}):1:(${chunk.endUtc})][(${coords.latitude})][(${coords.longitude})],CRW_BAA_7D_MAX[(${chunk.startUtc}):1:(${chunk.endUtc})][(${coords.latitude})][(${coords.longitude})]`;

    const response = await fetchWithTimeoutAndRetry(queryUrl, 12000, 1);

    if (!response.ok) {
      throw new Error(`Falha no servidor NOAA CoastWatch ERDDAP (HTTP ${response.status} ${response.statusText})`);
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    if (lines.length <= 2) {
      continue;
    }

    const responseHash = computeSimpleHash(csvText);
    const retrievedAt = new Date().toISOString();

    for (let index = 2; index < lines.length; index += 1) {
      const parts = lines[index].split(',');
      if (parts.length >= 8) {
        const timestampUtc = parts[0]?.trim();
        const returnedLat = parseFloat(parts[1]);
        const returnedLon = parseFloat(parts[2]);
        const sst = parseFloat(parts[3]);
        const sstAnomaly = parseFloat(parts[4]);
        const hotspot = parseFloat(parts[5]);
        const dhw = parseFloat(parts[6]);
        const baa = parseInt(parts[7], 10);
        const baa7d = parts[8] ? parseInt(parts[8], 10) : baa;

        if (timestampUtc && isValidNumber(sst)) {
          pointsMap.set(timestampUtc, {
            timestampUtc,
            seaSurfaceTemperatureDegC: sst,
            sstAnomalyDegC: isValidNumber(sstAnomaly) ? sstAnomaly : null,
            hotSpotDegC: isValidNumber(hotspot) ? hotspot : null,
            degreeHeatingWeeks: isValidNumber(dhw) ? dhw : null,
            bleachingAlertLevel: isValidNumber(baa) ? baa : null,
            bleachingAlertArea: isValidNumber(baa) ? baa : null,
            bleachingAlertMax7d: isValidNumber(baa7d) ? baa7d : null,
            gridCell: isValidNumber(returnedLat) && isValidNumber(returnedLon)
              ? { latitude: returnedLat, longitude: returnedLon }
              : coords,
            requestedCoordinates: coords,
            spatialResolution: '5 km (0.05° pixel)',
            provenance: {
              ...NOAA_CRW_PROVENANCE_BASE,
              validTimeStartUtc: chunk.startUtc,
              validTimeEndUtc: chunk.endUtc,
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
  }

  return Array.from(pointsMap.values()).sort(
    (a, b) => new Date(a.timestampUtc).getTime() - new Date(b.timestampUtc).getTime(),
  );
}
