import { BTS_SECTORS } from '../simulation/config';
import type { BtsSectorId } from '../simulation/types';
import { RemoteDataError, fetchTextWithTimeout, finiteOrNull, withRetry } from './http';
import {
  BTS_METEO_SECTOR_FALLBACKS,
  OPEN_METEO_PROVENANCE_BASE,
} from './openMeteoSnapshots';
import type { MarineMeteoPoint } from './types';

interface OpenMeteoMarineResponse {
  latitude?: number;
  longitude?: number;
  model?: string;
  hourly_units?: Record<string, string>;
  hourly?: {
    time?: string[];
    wave_height?: unknown[];
    sea_surface_temperature?: unknown[];
    ocean_current_velocity?: unknown[];
    ocean_current_direction?: unknown[];
    sea_level_height_msl?: unknown[];
  };
}

export {
  BTS_METEO_FALLBACK_SNAPSHOT,
  BTS_METEO_FRADES_FALLBACK_SNAPSHOT,
  BTS_METEO_SECTOR_FALLBACKS,
} from './openMeteoSnapshots';

/**
 * Cliente da Open-Meteo Marine API.
 *
 * Coordenadas por compartimento da Baía de Todos-os-Santos:
 * - Barra / Entrada Oceânica (padrão hidrodinâmico): Lat -12.97°, Lon -38.50°
 * - Frades / Baía Central: Lat -12.85°, Lon -38.55°
 * - Paraguaçu / Fundo da Baía: Lat -12.75°, Lon -38.85°
 *
 * Resolução variável por campo no conjunto Best Match: correntes, maré e SST
 * tipicamente em ~8 km; ondas podem vir de grades globais de 9 a 25 km.
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

/**
 * Normaliza timestamps da API para UTC estrito.
 * Open-Meteo com timezone=UTC pode devolver strings no formato "YYYY-MM-DDTHH:mm" sem o sufixo "Z".
 * Se não tiver offset explícito, anexa 'Z' para evitar que o navegador interprete no fuso local.
 */
export function normalizeUtcTimestamp(rawTime: string): string {
  if (!rawTime) return rawTime;
  const trimmed = rawTime.trim();
  if (trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  // Se for "YYYY-MM-DDTHH:mm", anexa ":00Z" ou "Z"
  return trimmed.length === 16 ? `${trimmed}:00Z` : `${trimmed}Z`;
}

/**
 * Retorna o snapshot meteorológico histórico de contingência sob demanda manual do usuário.
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
 * Consulta a previsão horária da Open-Meteo Marine API.
 *
 * Características:
 * - O timeout cobre a leitura completa da resposta (cabeçalhos + corpo JSON);
 * - Normaliza explicitamente timestamps sem fuso horário para UTC;
 * - Verifica finitude estrita de todos os valores numéricos;
 * - Rejeita e propaga erros reais via RemoteDataError em vez de substituir silenciosamente por contingência.
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

  const source = 'Open-Meteo Marine API';
  const response = await withRetry(
    () => fetchTextWithTimeout(url.toString(), { timeoutMs: 8000, accept: 'application/json', source }),
    1,
  );

  let data: OpenMeteoMarineResponse;
  try {
    data = JSON.parse(response.text) as OpenMeteoMarineResponse;
  } catch {
    throw new RemoteDataError('parse', `${source}: resposta JSON inválida ou truncada.`, {
      url: url.toString(),
      elapsedMs: response.elapsedMs,
      source,
    });
  }

  const hourly = data?.hourly;
  const units = data?.hourly_units ?? {};

  if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
    throw new RemoteDataError('no_data', `${source}: resposta sem série temporal horária válida.`, {
      url: url.toString(),
      elapsedMs: response.elapsedMs,
      source,
    });
  }

  // Se a unidade de velocidade for km/h, converter para m/s dividindo por 3.6
  const velocityIsKmH = units.ocean_current_velocity === 'km/h';
  const gridCell = {
    latitude: typeof data.latitude === 'number' ? data.latitude : coords.latitude,
    longitude: typeof data.longitude === 'number' ? data.longitude : coords.longitude,
  };

  const responseHash = computeSimpleHash(response.text);
  const retrievedAt = new Date().toISOString();
  const validStart = normalizeUtcTimestamp(hourly.time[0] ?? retrievedAt);
  const validEnd = normalizeUtcTimestamp(hourly.time[hourly.time.length - 1] ?? retrievedAt);
  const modelName = typeof data.model === 'string'
    ? data.model
    : 'Open-Meteo Best Match (provedor selecionado por variável)';

  const points: MarineMeteoPoint[] = [];
  const len = Math.min(hourly.time.length, 24);

  for (let i = 0; i < len; i += 1) {
    const rawTime = hourly.time[i];
    if (!rawTime) continue;

    const rawVelocity = finiteOrNull(hourly.ocean_current_velocity?.[i]);
    let velocityMs: number | null = null;
    if (rawVelocity !== null) {
      velocityMs = velocityIsKmH ? parseFloat((rawVelocity / 3.6).toFixed(3)) : parseFloat(rawVelocity.toFixed(3));
    }

    const rawWave = finiteOrNull(hourly.wave_height?.[i]);
    const rawDirection = finiteOrNull(hourly.ocean_current_direction?.[i]);
    const rawSeaLevel = finiteOrNull(hourly.sea_level_height_msl?.[i]);
    const rawSst = finiteOrNull(hourly.sea_surface_temperature?.[i]);

    points.push({
      timestampUtc: normalizeUtcTimestamp(rawTime),
      waveHeightM: rawWave,
      currentVelocityMs: velocityMs,
      currentDirectionDeg: rawDirection,
      seaLevelHeightM: rawSeaLevel,
      seaSurfaceTemperatureDegC: rawSst,
      hourlyUnits: {
        ...units,
        ocean_current_velocity: 'm/s',
      },
      gridCell,
      requestedCoordinates: coords,
      spatialResolution: 'Variável por campo (Best Match: ~8–25 km)',
      provenance: {
        ...OPEN_METEO_PROVENANCE_BASE,
        validTimeStartUtc: validStart,
        validTimeEndUtc: validEnd,
        retrievedAtUtc: retrievedAt,
        queryUrl: url.toString(),
        responseHash,
        responseTimeMs: response.elapsedMs,
        modelName,
        isCachedFallback: false,
        fetchStatus: 'online_valid',
      },
    });
  }

  if (points.length === 0) {
    throw new RemoteDataError('no_data', `${source}: nenhum ponto horário pôde ser processado.`, {
      url: url.toString(),
      elapsedMs: response.elapsedMs,
      source,
    });
  }

  return points;
}
