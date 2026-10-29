import type { BtsSectorId } from '../simulation/types';
import type { DatasetProvenance, ThermalForcingPoint } from './types';

/**
 * Snapshots históricos do NOAA Coral Reef Watch para a BTS (onda de calor marinha de mar/abr 2024).
 * Uso exclusivo como EXEMPLO HISTÓRICO solicitado explicitamente pelo usuário.
 * Nunca substituem silenciosamente uma consulta ao vivo que falhou.
 */

export const NOAA_CRW_PROVENANCE_BASE: Omit<DatasetProvenance, 'validTimeStartUtc' | 'validTimeEndUtc' | 'retrievedAtUtc' | 'isCachedFallback'> = {
  sourceName: 'NOAA Coral Reef Watch (CRW)',
  sourceUrl: 'https://coralreefwatch.noaa.gov/product/5km/',
  datasetId: 'NOAA_DHW',
  datasetVersion: 'v3.1 Daily Global 5km Satellite Coral Bleaching Heat Stress Monitoring',
  epistemicClass: 'Produto de Modelo',
  license: 'U.S. Government Public Domain / Open Data',
  citation: 'NOAA Coral Reef Watch. Version 3.1 Daily Global 5km Satellite Coral Bleaching Heat Stress Monitoring. NOAA CoastWatch ERDDAP.',
};

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
    bleachingAlertMax7d: 1,
    bleachingAlertSourceVariable: 'CRW_BAA',
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
    bleachingAlertMax7d: 2,
    bleachingAlertSourceVariable: 'CRW_BAA',
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
    bleachingAlertMax7d: 3,
    bleachingAlertSourceVariable: 'CRW_BAA',
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
    bleachingAlertMax7d: 4,
    bleachingAlertSourceVariable: 'CRW_BAA',
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
    bleachingAlertMax7d: 1,
    bleachingAlertSourceVariable: 'CRW_BAA',
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
    bleachingAlertMax7d: 2,
    bleachingAlertSourceVariable: 'CRW_BAA',
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
    bleachingAlertMax7d: 3,
    bleachingAlertSourceVariable: 'CRW_BAA',
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
    bleachingAlertMax7d: 3,
    bleachingAlertSourceVariable: 'CRW_BAA',
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
