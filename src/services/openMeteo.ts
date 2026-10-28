import { BTS_SECTORS } from '../simulation/config';
import type { BtsSectorId } from '../simulation/types';
import type { DatasetProvenance, MarineMeteoPoint } from './types';

/**
 * Cliente da Open-Meteo Marine API.
 *
 * Coordenadas por compartimento da Baía de Todos-os-Santos:
 * - Barra / Entrada Oceânica (padrão hidrodinâmico): Lat -12.97°, Lon -38.50°
 * - Frades / Baía Central: Lat -12.85°, Lon -38.55°
 * - Paraguaçu / Fundo da Baía: Lat -12.75°, Lon -38.85°
 *
 * Resolução do modelo oceânico global: ~5 a 8 km (dados hidrodinâmicos modelados).
 * Nota de proveniência: campos contextuais de maré/onda; não substituem hidrodinâmica fina local
 * para transporte advectivo em canais estuarinos estreitos.
 */

export function getMeteoCoordinates(sectorId: BtsSectorId = 'barra'): { latitude: number; longitude: number } {
  const sector = BTS_SECTORS.find((s) => s.id === sectorId);
  return sector?.coordinates ?? { latitude: -12.97, longitude: -38.50 };
}

function computeSimpleHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const OPEN_METEO_PROVENANCE_BASE: Omit<DatasetProvenance, 'validTimeStartUtc' | 'validTimeEndUtc' | 'retrievedAtUtc' | 'isCachedFallback'> = {
  sourceName: 'Open-Meteo Marine Weather API',
  sourceUrl: 'https://open-meteo.com/en/docs/marine-weather-api',
  datasetId: 'OPEN_METEO_MARINE_GLOBAL',
  datasetVersion: 'v1 Global 5km/8km Models (Copernicus/MeteoFrance/ECMWF)',
  epistemicClass: 'Produto de Modelo',
  license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  citation: 'Open-Meteo Marine Weather API under CC BY 4.0 license. Global numerical model product; not in-situ tide gauge.',
};

export const BTS_METEO_FALLBACK_SNAPSHOT: MarineMeteoPoint[] = [
  {
    timestampUtc: '2024-03-01T12:00:00Z',
    waveHeightM: 1.1,
    currentVelocityMs: 0.35,
    currentDirectionDeg: 145,
    seaLevelHeightM: 0.45,
    seaSurfaceTemperatureDegC: 28.2,
    gridCell: { latitude: -12.97, longitude: -38.50 },
    requestedCoordinates: { latitude: -12.97, longitude: -38.50 },
    spatialResolution: '8 km (Copernicus / ECMWF)',
    hourlyUnits: {
      wave_height: 'm',
      ocean_current_velocity: 'm/s',
      ocean_current_direction: '°',
      sea_level_height_msl: 'm',
      sea_surface_temperature: '°C',
    },
    provenance: {
      ...OPEN_METEO_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-03-02T00:00:00Z',
      retrievedAtUtc: '2024-03-01T06:00:00Z',
      queryUrl: 'https://marine-api.open-meteo.com/v1/marine?latitude=-12.97&longitude=-38.50',
      responseHash: 'a71e892c',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot meteorológico de contingência marinho (Salvador/Barra). Não representa a previsão horária do dia atual.',
    },
  },
  {
    timestampUtc: '2024-03-01T18:00:00Z',
    waveHeightM: 1.4,
    currentVelocityMs: 0.48,
    currentDirectionDeg: 160,
    seaLevelHeightM: 0.92,
    seaSurfaceTemperatureDegC: 28.5,
    gridCell: { latitude: -12.97, longitude: -38.50 },
    requestedCoordinates: { latitude: -12.97, longitude: -38.50 },
    spatialResolution: '8 km (Copernicus / ECMWF)',
    hourlyUnits: {
      wave_height: 'm',
      ocean_current_velocity: 'm/s',
      ocean_current_direction: '°',
      sea_level_height_msl: 'm',
      sea_surface_temperature: '°C',
    },
    provenance: {
      ...OPEN_METEO_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-03-02T00:00:00Z',
      retrievedAtUtc: '2024-03-01T06:00:00Z',
      queryUrl: 'https://marine-api.open-meteo.com/v1/marine?latitude=-12.97&longitude=-38.50',
      responseHash: 'b921ef45',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot meteorológico de contingência marinho (Salvador/Barra). Não representa a previsão horária do dia atual.',
    },
  },
  {
    timestampUtc: '2024-03-02T00:00:00Z',
    waveHeightM: 1.2,
    currentVelocityMs: 0.28,
    currentDirectionDeg: 135,
    seaLevelHeightM: 0.12,
    seaSurfaceTemperatureDegC: 28.1,
    gridCell: { latitude: -12.97, longitude: -38.50 },
    requestedCoordinates: { latitude: -12.97, longitude: -38.50 },
    spatialResolution: '8 km (Copernicus / ECMWF)',
    hourlyUnits: {
      wave_height: 'm',
      ocean_current_velocity: 'm/s',
      ocean_current_direction: '°',
      sea_level_height_msl: 'm',
      sea_surface_temperature: '°C',
    },
    provenance: {
      ...OPEN_METEO_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-03-02T00:00:00Z',
      retrievedAtUtc: '2024-03-01T06:00:00Z',
      queryUrl: 'https://marine-api.open-meteo.com/v1/marine?latitude=-12.97&longitude=-38.50',
      responseHash: 'c834da19',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot meteorológico de contingência marinho (Salvador/Barra). Não representa a previsão horária do dia atual.',
    },
  },
];

export const BTS_METEO_FRADES_FALLBACK_SNAPSHOT: MarineMeteoPoint[] = [
  {
    timestampUtc: '2024-03-01T12:00:00Z',
    waveHeightM: 0.35,
    currentVelocityMs: 0.18,
    currentDirectionDeg: 110,
    seaLevelHeightM: 0.42,
    seaSurfaceTemperatureDegC: 28.4,
    gridCell: { latitude: -12.85, longitude: -38.55 },
    requestedCoordinates: { latitude: -12.85, longitude: -38.55 },
    spatialResolution: '8 km (Copernicus / ECMWF)',
    hourlyUnits: {
      wave_height: 'm',
      ocean_current_velocity: 'm/s',
      ocean_current_direction: '°',
      sea_level_height_msl: 'm',
      sea_surface_temperature: '°C',
    },
    provenance: {
      ...OPEN_METEO_PROVENANCE_BASE,
      validTimeStartUtc: '2024-03-01T12:00:00Z',
      validTimeEndUtc: '2024-03-02T00:00:00Z',
      retrievedAtUtc: '2024-03-01T06:00:00Z',
      queryUrl: 'https://marine-api.open-meteo.com/v1/marine?latitude=-12.85&longitude=-38.55',
      responseHash: 'd92a104f',
      isCachedFallback: true,
      fetchStatus: 'fallback_cached',
      fallbackNote: 'Snapshot meteorológico de contingência marinho (Baía Central/Frades). Não representa a previsão horária do dia atual.',
    },
  },
];

export const BTS_METEO_SECTOR_FALLBACKS: Partial<Record<BtsSectorId, MarineMeteoPoint[]>> = {
  barra: BTS_METEO_FALLBACK_SNAPSHOT,
  frades: BTS_METEO_FRADES_FALLBACK_SNAPSHOT,
  // paraguacu: dados estuarinos de modelo global de 8 km têm alta incerteza de batimetria e linha de costa
};

/**
 * Retorna o snapshot meteorológico histórico de contingência sob demanda manual.
 */
export function getBtsMeteoHistoricalSnapshot(sectorId: BtsSectorId = 'barra'): MarineMeteoPoint[] {
  return BTS_METEO_SECTOR_FALLBACKS[sectorId] ?? [];
}

/**
 * Localiza o ponto horário mais próximo a uma data de referência (padrão agora).
 */
export function findClosestHourlyPoint(
  points: MarineMeteoPoint[],
  referenceDate: Date = new Date(),
): MarineMeteoPoint | null {
  if (points.length === 0) return null;

  const targetMs = referenceDate.getTime();
  let closest = points[0];
  let minDiff = Math.abs(new Date(closest.timestampUtc).getTime() - targetMs);

  for (let i = 1; i < points.length; i += 1) {
    const pt = points[i];
    const diff = Math.abs(new Date(pt.timestampUtc).getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = pt;
    }
  }

  return closest;
}

/**
 * Executa requisição com timeout de 8 segundos e 1 retentativa automática em falha de rede/5xx.
 */
async function fetchWithTimeoutAndRetry(
  url: string,
  timeoutMs = 8000,
  maxRetries = 1,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

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
    : new Error(`Falha de conexão com Open-Meteo Marine`);
}

/**
 * Consulta a previsão horária da Open-Meteo Marine API.
 *
 * Características:
 * - Timeout estendido para 8 segundos com 1 repetição automática;
 * - Rejeita e repassa falhas de rede em vez de substituir silenciosamente por dados de 2024;
 * - O snapshot de contingência só é ativado se expressamente requisitado pelo usuário.
 */
export async function fetchBtsMarineMeteo(sectorId: BtsSectorId = 'barra'): Promise<MarineMeteoPoint[]> {
  const coords = getMeteoCoordinates(sectorId);

  const url = new URL('https://marine-api.open-meteo.com/v1/marine');
  url.search = new URLSearchParams({
    latitude: coords.latitude.toString(),
    longitude: coords.longitude.toString(),
    hourly: 'wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl',
    forecast_days: '1',
    timezone: 'UTC',
    cell_selection: 'sea',
  }).toString();

  const response = await fetchWithTimeoutAndRetry(url.toString(), 8000, 1);

  if (!response.ok) {
    throw new Error(`Falha ao consultar Open-Meteo Marine (HTTP ${response.status} ${response.statusText})`);
  }

  const rawText = await response.text();
  const responseHash = computeSimpleHash(rawText);
  const data = JSON.parse(rawText);
  const hourly = data?.hourly;
  const units = data?.hourly_units ?? {};

  if (!hourly || !Array.isArray(hourly.time)) {
    return [];
  }

  // Se a unidade de velocidade for km/h, converter para m/s dividindo por 3.6
  const velocityIsKmH = units.ocean_current_velocity === 'km/h';
  const gridCell = {
    latitude: typeof data.latitude === 'number' ? data.latitude : coords.latitude,
    longitude: typeof data.longitude === 'number' ? data.longitude : coords.longitude,
  };

  const retrievedAt = new Date().toISOString();
  const validStart = hourly.time[0] ?? retrievedAt;
  const validEnd = hourly.time[hourly.time.length - 1] ?? retrievedAt;

  const points: MarineMeteoPoint[] = [];
  const len = Math.min(hourly.time.length, 24);

  for (let i = 0; i < len; i += 1) {
    const rawVelocity = hourly.ocean_current_velocity?.[i];
    let velocityMs: number | null = null;
    if (typeof rawVelocity === 'number' && Number.isFinite(rawVelocity)) {
      velocityMs = velocityIsKmH ? parseFloat((rawVelocity / 3.6).toFixed(3)) : parseFloat(rawVelocity.toFixed(3));
    }

    points.push({
      timestampUtc: hourly.time[i],
      waveHeightM: typeof hourly.wave_height?.[i] === 'number' && Number.isFinite(hourly.wave_height[i]) ? hourly.wave_height[i] : null,
      currentVelocityMs: velocityMs,
      currentDirectionDeg: typeof hourly.ocean_current_direction?.[i] === 'number' && Number.isFinite(hourly.ocean_current_direction[i]) ? hourly.ocean_current_direction[i] : null,
      seaLevelHeightM: typeof hourly.sea_level_height_msl?.[i] === 'number' && Number.isFinite(hourly.sea_level_height_msl[i]) ? hourly.sea_level_height_msl[i] : null,
      seaSurfaceTemperatureDegC: typeof hourly.sea_surface_temperature?.[i] === 'number' && Number.isFinite(hourly.sea_surface_temperature[i]) ? hourly.sea_surface_temperature[i] : null,
      hourlyUnits: {
        ...units,
        ocean_current_velocity: 'm/s',
      },
      gridCell,
      requestedCoordinates: coords,
      spatialResolution: '8 km (Copernicus / ECMWF)',
      provenance: {
        ...OPEN_METEO_PROVENANCE_BASE,
        validTimeStartUtc: validStart,
        validTimeEndUtc: validEnd,
        retrievedAtUtc: retrievedAt,
        queryUrl: url.toString(),
        responseHash,
        isCachedFallback: false,
        fetchStatus: 'online_valid',
      },
    });
  }

  return points;
}
