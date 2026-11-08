import type { BtsSectorId } from '../simulation/types';
import type { DatasetProvenance, MarineMeteoPoint } from './types';

/**
 * Snapshots históricos da previsão marinha Open-Meteo (mar/2024).
 * Uso exclusivo como EXEMPLO HISTÓRICO solicitado explicitamente pelo usuário.
 */

export const OPEN_METEO_PROVENANCE_BASE: Omit<DatasetProvenance, 'validTimeStartUtc' | 'validTimeEndUtc' | 'retrievedAtUtc' | 'isCachedFallback'> = {
  sourceName: 'Open-Meteo Marine Weather API',
  sourceUrl: 'https://open-meteo.com/en/docs/marine-weather-api',
  datasetId: 'OPEN_METEO_MARINE_GLOBAL',
  datasetVersion: 'v1 Best Match (resolução e provedor variam por campo)',
  epistemicClass: 'Produto de Modelo',
  license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  citation: 'Open-Meteo Marine Weather API under CC BY 4.0. Combina MeteoFrance/Copernicus, ECMWF, NOAA NCEP, DWD e ERA5-Ocean conforme a variável; não é medição in situ.',
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
