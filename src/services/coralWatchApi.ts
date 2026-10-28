import { RemoteDataError, fetchTextWithTimeout, finiteOrNull, withRetry } from './http';
import type { ThermalForcingPoint } from './types';
import type { BtsSectorId } from '../simulation/types';

/**
 * Adaptador da Coral Watch API (https://api.coral.tsr.lol)
 *
 * Fornece acesso aos dados de estresse térmico da NOAA Coral Reef Watch (grade 5 km)
 * organizados por estações virtuais regionais através de endpoints REST/JSON modernos.
 *
 * Estação virtual para a Baía de Todos-os-Santos:
 * - Slug: 'todos_os_santos'
 * - Nome: 'Todos os Santos, Brazil'
 * - Coordenadas: Lat -13.375°, Lon -38.375°
 * - Média Máxima Mensal (MMM): 27.92 °C
 * - Limiar de Branqueamento: 28.92 °C
 *
 * NOTA GEOGRÁFICA / PROVENIÊNCIA:
 * A estação virtual oficial da NOAA CRW 'Todos os Santos' está posicionada na plataforma
 * costeira adjacente à entrada da Baía (-13.375°, -38.375°), cobrindo a província de recifes
 * externos. Não se localiza no interior estuarino estreito (Paraguaçu).
 */

export const CORAL_WATCH_API_BASE = 'https://api.coral.tsr.lol';

export interface CoralWatchStation {
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  region: string;
  subregion: string;
  avg_max_monthly_mean: number;
  bleaching_threshold: number;
}

export interface CoralWatchCurrentRecord {
  date: string;
  sst_min: number | null;
  sst_max: number | null;
  sst_90th_hs: number | null;
  ssta_90th_hs: number | null;
  hs_90th: number | null;
  dhw: number | null;
  baa_7day_max: number | null;
  stress_level: number | null;
}

export interface CoralWatchCurrentResponse extends CoralWatchStation {
  current: CoralWatchCurrentRecord;
}

export interface CoralWatchStationHistoryResponse extends CoralWatchStation {
  data: CoralWatchCurrentRecord[];
}

/**
 * Valida o nível de alerta (BAA / Bleaching Alert Area) no domínio estendido oficial da NOAA CRW [0 a 7].
 * - 0: Nenhum estresse
 * - 1: Vigilância (Watch)
 * - 2: Aviso (Warning)
 * - 3: Alerta Nível 1
 * - 4: Alerta Nível 2
 * - 5: Alerta Nível 3 (Mortalidade Extrema)
 * - 6: Alerta Nível 4 (Catastrófico)
 * - 7: Alerta Nível 5 (Colapso Estrutural)
 * Valores de preenchimento (_FillValue = 251 na NOAA/PacIOOS) ou inválidos tornam-se null.
 */
export function validateAlertLevel(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num)) return null;
  if (num >= 0 && num <= 7) return num;
  return null;
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
 * Mapeamento dos setores da BTS para a estação virtual regional da Coral Watch API.
 * Frades e Barra compartilham a mesma estação externa da província recifal da Bahia.
 * Paraguaçu é identificado como canal estuarino interior sem cobertura na grade de 5 km.
 */
export const SECTOR_CORAL_WATCH_STATIONS: Record<
  BtsSectorId,
  { slug: string; isRegionalReference: boolean; note: string }
> = {
  frades: {
    slug: 'todos_os_santos',
    isRegionalReference: true,
    note: "Estação virtual regional NOAA CRW 'Todos os Santos' (-13.375°, -38.375°) na plataforma oceânica sul. Referência regional externa representativa da província recifal da Bahia; não constitui medição local in-situ dentro da Ilha dos Frades.",
  },
  barra: {
    slug: 'todos_os_santos',
    isRegionalReference: true,
    note: "Estação virtual regional NOAA CRW 'Todos os Santos' (-13.375°, -38.375°) na plataforma oceânica sul. Referência regional externa; não equivale à célula costeira local da Boca da Barra.",
  },
  paraguacu: {
    slug: 'todos_os_santos',
    isRegionalReference: false,
    note: 'Canal estuarino interior sem estação virtual direta na grade de 5 km da NOAA (mascaramento de terra).',
  },
};

/**
 * Converte um registro da Coral Watch API no formato padrão ThermalForcingPoint.
 * Preserva explicitamente a distinção entre SST média, percentil 90 (sst_90th_hs) e faixa min/max.
 */
export function mapCoralWatchRecordToThermalPoint(
  record: CoralWatchCurrentRecord,
  station: CoralWatchStation,
  provenanceMeta: {
    queryUrl: string;
    responseHash: string;
    responseTimeMs: number;
    retrievedAtUtc: string;
    note: string;
  },
): ThermalForcingPoint {
  const baa7d = validateAlertLevel(record.baa_7day_max);
  const stationStress = validateAlertLevel(record.stress_level);
  const sst90th = finiteOrNull(record.sst_90th_hs);
  const sstMin = finiteOrNull(record.sst_min);
  const sstMax = finiteOrNull(record.sst_max);

  // Determina a melhor estimativa de SST da estação:
  // Se houver min e max, usa a média do cluster da estação; caso contrário, recorre ao percentil 90 ou extremos.
  const representativeSst = sstMin !== null && sstMax !== null
    ? (sstMin + sstMax) / 2
    : (sst90th ?? sstMax ?? sstMin);

  if (representativeSst === null) {
    throw new RemoteDataError('no_data', `Coral Watch API: registro de ${record.date} sem SST válida.`);
  }

  // Normaliza data para timestamp UTC ao meio-dia
  const timestampUtc = record.date.includes('T') ? record.date : `${record.date}T12:00:00Z`;

  return {
    timestampUtc,
    seaSurfaceTemperatureDegC: representativeSst,
    sst90thPercentileDegC: sst90th,
    sstMinDegC: sstMin,
    sstMaxDegC: sstMax,
    sstAnomalyDegC: finiteOrNull(record.ssta_90th_hs),
    hotSpotDegC: finiteOrNull(record.hs_90th),
    degreeHeatingWeeks: finiteOrNull(record.dhw),
    bleachingAlertLevel: stationStress ?? baa7d,
    bleachingAlertArea: baa7d ?? stationStress,
    bleachingAlertMax7d: baa7d,
    virtualStationStressLevel: stationStress,
    isVirtualStation: true,
    virtualStationName: station.name,
    gridCell: {
      latitude: station.latitude,
      longitude: station.longitude,
    },
    requestedCoordinates: {
      latitude: station.latitude,
      longitude: station.longitude,
    },
    spatialResolution: '5 km (Estação Virtual Regional NOAA CRW)',
    provenance: {
      sourceName: 'Coral Watch Virtual Station API (NOAA CRW 5km)',
      sourceUrl: 'https://api.coral.tsr.lol',
      datasetId: `coral_watch_${station.slug}`,
      datasetVersion: 'v3.1 Virtual Stations (NOAA Coral Reef Watch 5km)',
      license: 'Open Data / U.S. Government Public Domain',
      citation: 'NOAA Coral Reef Watch (CRW) 5km Satellite Coral Bleaching Heat Stress Monitoring via Coral Watch API.',
      distributor: 'Coral Watch API (api.coral.tsr.lol)',
      pixelNote: provenanceMeta.note,
      validTimeStartUtc: timestampUtc,
      validTimeEndUtc: timestampUtc,
      retrievedAtUtc: provenanceMeta.retrievedAtUtc,
      queryUrl: provenanceMeta.queryUrl,
      responseHash: provenanceMeta.responseHash,
      responseTimeMs: provenanceMeta.responseTimeMs,
      epistemicClass: 'Produto de Modelo',
      isCachedFallback: false,
      fetchStatus: 'online_valid',
    },
  };
}

/**
 * Consulta a Coral Watch API para a estação virtual da BTS.
 *
 * @param sectorId Setor da BTS
 * @param timeoutMs Limite de tempo em milissegundos
 */
export async function fetchCoralWatchCurrent(
  sectorId: BtsSectorId = 'frades',
  timeoutMs = 6000,
): Promise<ThermalForcingPoint[]> {
  const mapping = SECTOR_CORAL_WATCH_STATIONS[sectorId];
  if (!mapping.isRegionalReference) {
    throw new RemoteDataError(
      'no_coverage',
      'O produto de satélite NOAA CRW de 5 km não fornece dados válidos para representar este canal interno (mascaramento de terra).',
    );
  }

  const queryUrl = `${CORAL_WATCH_API_BASE}/stations/${mapping.slug}/current`;
  const response = await withRetry(
    () =>
      fetchTextWithTimeout(queryUrl, {
        timeoutMs,
        accept: 'application/json',
        source: 'Coral Watch API',
      }),
    0, // Não repete internamente para não esgotar o orçamento total da cadeia
  );

  let json: CoralWatchCurrentResponse;
  try {
    json = JSON.parse(response.text) as CoralWatchCurrentResponse;
  } catch {
    throw new RemoteDataError('parse', 'Resposta da Coral Watch API não pôde ser interpretada como JSON.', {
      url: queryUrl,
      elapsedMs: response.elapsedMs,
      source: 'Coral Watch API',
    });
  }

  if (!json.current || !json.current.date) {
    throw new RemoteDataError('no_data', 'Coral Watch API retornou objeto sem o bloco "current" esperado.', {
      url: queryUrl,
      elapsedMs: response.elapsedMs,
      source: 'Coral Watch API',
    });
  }

  const point = mapCoralWatchRecordToThermalPoint(json.current, json, {
    queryUrl,
    responseHash: computeSimpleHash(response.text),
    responseTimeMs: response.elapsedMs,
    retrievedAtUtc: new Date().toISOString(),
    note: mapping.note,
  });

  return [point];
}
