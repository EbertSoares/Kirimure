import type { DatasetProvenance, ThermalForcingPoint } from './types';

/**
 * Cliente do NOAA Coral Reef Watch (CRW v3.1 5km via CoastWatch ERDDAP).
 *
 * Coordenadas nominais do pixel recifal central da Baía de Todos-os-Santos:
 * Latitude: -12.85°, Longitude: -38.55° (Ilha dos Frades / Itaparica).
 *
 * Mantém snapshot calibrado em cache para resiliência offline.
 */

const BTS_LATITUDE = -12.85;
const BTS_LONGITUDE = -38.55;

const NOAA_CRW_PROVENANCE: DatasetProvenance = {
  sourceName: 'NOAA Coral Reef Watch (CRW)',
  sourceUrl: 'https://coralreefwatch.noaa.gov/product/5km/',
  datasetId: 'NOAA_DHW',
  datasetVersion: 'v3.1 Daily Global 5km',
  retrievedAtUtc: '2026-10-24T12:00:00Z',
  epistemicClass: 'Produto de Modelo',
  license: 'U.S. Government Public Domain / Open Data',
  citation: 'NOAA Coral Reef Watch. 2018, updated daily. NOAA Coral Reef Watch Version 3.1 Daily Global 5km Satellite Coral Bleaching Heat Stress Monitoring.',
  isCachedFallback: false,
};

// Snapshot calibrado de referência histórica (anomalias e ondas de calor marinhas na BTS)
export const BTS_CRW_FALLBACK_SNAPSHOT: ThermalForcingPoint[] = [
  {
    timestampUtc: '2024-03-01T12:00:00Z',
    seaSurfaceTemperatureDegC: 28.4,
    sstAnomalyDegC: 0.4,
    hotSpotDegC: 0.4,
    degreeHeatingWeeks: 1.2,
    bleachingAlertArea: 1, // Watch
    provenance: { ...NOAA_CRW_PROVENANCE, isCachedFallback: true },
  },
  {
    timestampUtc: '2024-03-15T12:00:00Z',
    seaSurfaceTemperatureDegC: 29.2,
    sstAnomalyDegC: 1.1,
    hotSpotDegC: 1.2,
    degreeHeatingWeeks: 3.8,
    bleachingAlertArea: 2, // Warning
    provenance: { ...NOAA_CRW_PROVENANCE, isCachedFallback: true },
  },
  {
    timestampUtc: '2024-04-01T12:00:00Z',
    seaSurfaceTemperatureDegC: 29.8,
    sstAnomalyDegC: 1.6,
    hotSpotDegC: 1.8,
    degreeHeatingWeeks: 6.4,
    bleachingAlertArea: 3, // Alert 1
    provenance: { ...NOAA_CRW_PROVENANCE, isCachedFallback: true },
  },
  {
    timestampUtc: '2024-04-15T12:00:00Z',
    seaSurfaceTemperatureDegC: 29.5,
    sstAnomalyDegC: 1.3,
    hotSpotDegC: 1.5,
    degreeHeatingWeeks: 8.2,
    bleachingAlertArea: 4, // Alert 2
    provenance: { ...NOAA_CRW_PROVENANCE, isCachedFallback: true },
  },
];

/**
 * Consulta a série temporal do NOAA Coral Reef Watch via CoastWatch ERDDAP
 * com fallback transparente para o snapshot em cache caso não haja conexão.
 */
export async function fetchBtsThermalForcing(
  startUtc = '2024-03-01T12:00:00Z',
  endUtc = '2024-04-15T12:00:00Z',
): Promise<ThermalForcingPoint[]> {
  const queryUrl = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?CRW_SST[(${startUtc}):1:(${endUtc})][(${BTS_LATITUDE})][(${BTS_LONGITUDE})],CRW_HOTSPOT[(${startUtc}):1:(${endUtc})][(${BTS_LATITUDE})][(${BTS_LONGITUDE})],CRW_DHW[(${startUtc}):1:(${endUtc})][(${BTS_LATITUDE})][(${BTS_LONGITUDE})],CRW_BAA[(${startUtc}):1:(${endUtc})][(${BTS_LATITUDE})][(${BTS_LONGITUDE})]`;

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
      console.warn(`[NOAA CRW] HTTP ${response.status}. Utilizando snapshot calibrado em cache.`);
      return BTS_CRW_FALLBACK_SNAPSHOT;
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    // As duas primeiras linhas do ERDDAP são cabeçalhos de nomes e unidades
    if (lines.length <= 2) return BTS_CRW_FALLBACK_SNAPSHOT;

    const points: ThermalForcingPoint[] = [];
    for (let index = 2; index < lines.length; index += 1) {
      const parts = lines[index].split(',');
      if (parts.length >= 7) {
        const timestampUtc = parts[0];
        const sst = parseFloat(parts[3]);
        const hotspot = parseFloat(parts[4]);
        const dhw = parseFloat(parts[5]);
        const baa = parseInt(parts[6], 10);

        if (!isNaN(sst) && !isNaN(dhw)) {
          points.push({
            timestampUtc,
            seaSurfaceTemperatureDegC: sst,
            sstAnomalyDegC: parseFloat((sst - 28.0).toFixed(2)),
            hotSpotDegC: hotspot,
            degreeHeatingWeeks: dhw,
            bleachingAlertArea: isNaN(baa) ? 0 : baa,
            provenance: {
              ...NOAA_CRW_PROVENANCE,
              retrievedAtUtc: new Date().toISOString(),
              isCachedFallback: false,
            },
          });
        }
      }
    }

    return points.length > 0 ? points : BTS_CRW_FALLBACK_SNAPSHOT;
  } catch (error) {
    console.info('[NOAA CRW] Conexão remota indisponível ou offline. Usando snapshot calibrado.');
    return BTS_CRW_FALLBACK_SNAPSHOT;
  }
}
