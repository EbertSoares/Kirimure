import type { DatasetProvenance, MarineMeteoPoint } from './types';

/**
 * Cliente da Open-Meteo Marine API.
 *
 * Coordenadas de entrada da Baía de Todos-os-Santos (Canal de Salvador / Barra):
 * Latitude: -12.97°, Longitude: -38.50°.
 *
 * Resolução do modelo oceânico global: ~8 km (dados hidrodinâmicos modelados).
 * Nota de proveniência: campos contextuais de maré/onda; não substituem hidrodinâmica fina local.
 */

const BTS_METEO_LATITUDE = -12.97;
const BTS_METEO_LONGITUDE = -38.50;

const OPEN_METEO_PROVENANCE_BASE: Omit<DatasetProvenance, 'validTimeStartUtc' | 'validTimeEndUtc' | 'retrievedAtUtc' | 'isCachedFallback'> = {
  sourceName: 'Open-Meteo Marine Weather API',
  sourceUrl: 'https://open-meteo.com/en/docs/marine-weather-api',
  datasetId: 'OPEN_METEO_MARINE_GLOBAL',
  datasetVersion: 'v1 Global 5km/8km Models (Copernicus/MeteoFrance/ECMWF)',
  epistemicClass: 'Produto de Modelo',
  license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  citation: 'Open-Meteo Marine Weather API under CC BY 4.0 license.',
};

export const BTS_METEO_FALLBACK_SNAPSHOT: MarineMeteoPoint[] = [
  {
    timestampUtc: '2024-03-01T12:00:00Z',
    waveHeightM: 1.1,
    currentVelocityMs: 0.35,
    currentDirectionDeg: 145,
    seaLevelHeightM: 0.45,
    seaSurfaceTemperatureDegC: 28.2,
    gridCell: { latitude: BTS_METEO_LATITUDE, longitude: BTS_METEO_LONGITUDE },
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
      isCachedFallback: true,
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
    gridCell: { latitude: BTS_METEO_LATITUDE, longitude: BTS_METEO_LONGITUDE },
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
      isCachedFallback: true,
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
    gridCell: { latitude: BTS_METEO_LATITUDE, longitude: BTS_METEO_LONGITUDE },
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
      isCachedFallback: true,
      fallbackNote: 'Snapshot meteorológico de contingência marinho (Salvador/Barra). Não representa a previsão horária do dia atual.',
    },
  },
];

export async function fetchBtsMarineMeteo(): Promise<MarineMeteoPoint[]> {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine');
  url.search = new URLSearchParams({
    latitude: BTS_METEO_LATITUDE.toString(),
    longitude: BTS_METEO_LONGITUDE.toString(),
    hourly: 'wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl',
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
      console.warn(`[Open-Meteo] HTTP ${response.status}. Usando snapshot de contingência.`);
      return BTS_METEO_FALLBACK_SNAPSHOT;
    }

    const data = await response.json();
    const hourly = data?.hourly;
    const units = data?.hourly_units ?? {};

    if (!hourly || !Array.isArray(hourly.time)) {
      return BTS_METEO_FALLBACK_SNAPSHOT;
    }

    // Se a unidade de velocidade for km/h, converter para m/s dividindo por 3.6
    const velocityIsKmH = units.ocean_current_velocity === 'km/h';
    const gridCell = {
      latitude: typeof data.latitude === 'number' ? data.latitude : BTS_METEO_LATITUDE,
      longitude: typeof data.longitude === 'number' ? data.longitude : BTS_METEO_LONGITUDE,
    };

    const retrievedAt = new Date().toISOString();
    const validStart = hourly.time[0] ?? retrievedAt;
    const validEnd = hourly.time[hourly.time.length - 1] ?? retrievedAt;

    const points: MarineMeteoPoint[] = [];
    const len = Math.min(hourly.time.length, 24);

    for (let i = 0; i < len; i += 1) {
      const rawVelocity = hourly.ocean_current_velocity?.[i];
      let velocityMs: number | null = null;
      if (typeof rawVelocity === 'number') {
        velocityMs = velocityIsKmH ? parseFloat((rawVelocity / 3.6).toFixed(3)) : parseFloat(rawVelocity.toFixed(3));
      }

      points.push({
        timestampUtc: hourly.time[i],
        // Preserva null quando o modelo não tiver o dado (sem substituição por números arbitrários)
        waveHeightM: typeof hourly.wave_height?.[i] === 'number' ? hourly.wave_height[i] : null,
        currentVelocityMs: velocityMs,
        currentDirectionDeg: typeof hourly.ocean_current_direction?.[i] === 'number' ? hourly.ocean_current_direction[i] : null,
        seaLevelHeightM: typeof hourly.sea_level_height_msl?.[i] === 'number' ? hourly.sea_level_height_msl[i] : null,
        seaSurfaceTemperatureDegC: typeof hourly.sea_surface_temperature?.[i] === 'number' ? hourly.sea_surface_temperature[i] : null,
        hourlyUnits: {
          ...units,
          ocean_current_velocity: 'm/s',
        },
        gridCell,
        provenance: {
          ...OPEN_METEO_PROVENANCE_BASE,
          validTimeStartUtc: validStart,
          validTimeEndUtc: validEnd,
          retrievedAtUtc: retrievedAt,
          queryUrl: url.toString(),
          isCachedFallback: false,
        },
      });
    }

    return points.length > 0 ? points : BTS_METEO_FALLBACK_SNAPSHOT;
  } catch (error) {
    console.info('[Open-Meteo] Conexão remota indisponível ou offline. Usando snapshot de contingência.');
    return BTS_METEO_FALLBACK_SNAPSHOT;
  }
}
