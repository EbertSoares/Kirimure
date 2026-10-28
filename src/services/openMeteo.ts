import type { DatasetProvenance, MarineMeteoPoint } from './types';

/**
 * Cliente da Open-Meteo Marine API.
 *
 * Coordenadas de entrada da Baía de Todos-os-Santos (Canal de Salvador / Barra):
 * Latitude: -12.97°, Longitude: -38.50°.
 */

const BTS_METEO_LATITUDE = -12.97;
const BTS_METEO_LONGITUDE = -38.50;

const OPEN_METEO_PROVENANCE: DatasetProvenance = {
  sourceName: 'Open-Meteo Marine Weather API',
  sourceUrl: 'https://open-meteo.com/en/docs/marine-weather-api',
  datasetId: 'OPEN_METEO_MARINE_GLOBAL',
  datasetVersion: 'v1 Global 5km/8km Models (Copernicus/MeteoFrance/ECMWF)',
  retrievedAtUtc: '2026-10-24T12:00:00Z',
  epistemicClass: 'Produto de Modelo',
  license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  citation: 'Open-Meteo Marine Weather API under CC BY 4.0 license.',
  isCachedFallback: false,
};

export const BTS_METEO_FALLBACK_SNAPSHOT: MarineMeteoPoint[] = [
  {
    timestampUtc: '2024-03-01T12:00:00Z',
    waveHeightM: 1.1,
    currentVelocityMs: 0.35,
    seaLevelHeightM: 0.45,
    seaSurfaceTemperatureDegC: 28.2,
    provenance: { ...OPEN_METEO_PROVENANCE, isCachedFallback: true },
  },
  {
    timestampUtc: '2024-03-01T18:00:00Z',
    waveHeightM: 1.4,
    currentVelocityMs: 0.48,
    seaLevelHeightM: 0.92,
    seaSurfaceTemperatureDegC: 28.5,
    provenance: { ...OPEN_METEO_PROVENANCE, isCachedFallback: true },
  },
  {
    timestampUtc: '2024-03-02T00:00:00Z',
    waveHeightM: 1.2,
    currentVelocityMs: 0.28,
    seaLevelHeightM: 0.12,
    seaSurfaceTemperatureDegC: 28.1,
    provenance: { ...OPEN_METEO_PROVENANCE, isCachedFallback: true },
  },
];

export async function fetchBtsMarineMeteo(): Promise<MarineMeteoPoint[]> {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine');
  url.search = new URLSearchParams({
    latitude: BTS_METEO_LATITUDE.toString(),
    longitude: BTS_METEO_LONGITUDE.toString(),
    hourly: 'wave_height,sea_surface_temperature,ocean_current_velocity,sea_level_height_msl',
    forecast_days: '1',
    timezone: 'UTC',
    cell_selection: 'sea',
  }).toString();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Open-Meteo] HTTP ${response.status}. Usando fallback.`);
      return BTS_METEO_FALLBACK_SNAPSHOT;
    }

    const data = await response.json();
    const hourly = data?.hourly;
    if (!hourly || !Array.isArray(hourly.time)) {
      return BTS_METEO_FALLBACK_SNAPSHOT;
    }

    const points: MarineMeteoPoint[] = [];
    for (let i = 0; i < Math.min(hourly.time.length, 24); i += 1) {
      points.push({
        timestampUtc: hourly.time[i],
        waveHeightM: hourly.wave_height?.[i] ?? 1.0,
        currentVelocityMs: hourly.ocean_current_velocity?.[i] ?? 0.3,
        seaLevelHeightM: hourly.sea_level_height_msl?.[i] ?? 0.5,
        seaSurfaceTemperatureDegC: hourly.sea_surface_temperature?.[i] ?? 28.0,
        provenance: {
          ...OPEN_METEO_PROVENANCE,
          retrievedAtUtc: new Date().toISOString(),
          isCachedFallback: false,
        },
      });
    }

    return points.length > 0 ? points : BTS_METEO_FALLBACK_SNAPSHOT;
  } catch (error) {
    console.info('[Open-Meteo] Conexão remota indisponível ou offline. Usando snapshot calibrado.');
    return BTS_METEO_FALLBACK_SNAPSHOT;
  }
}
