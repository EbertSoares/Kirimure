import { BTS_SECTORS } from '../simulation/config';
import type { BtsSectorId } from '../simulation/types';
import { RemoteDataError, fetchTextWithTimeout, withRetry } from './http';
import {
  BTS_CRW_SECTOR_FALLBACKS,
  NOAA_CRW_PROVENANCE_BASE,
} from './noaaCrwSnapshots';
import type { ThermalForcingPoint } from './types';

export {
  BTS_CRW_BARRA_FALLBACK_SNAPSHOT,
  BTS_CRW_FALLBACK_SNAPSHOT,
  BTS_CRW_SECTOR_FALLBACKS,
} from './noaaCrwSnapshots';

/**
 * Cliente de dados de estresse térmico da NOAA Coral Reef Watch (CRW) 5 km.
 *
 * Arquitetura multi-fonte com orçamento global de tempo e failover ordenado:
 * 1. PacIOOS ERDDAP (https://pae-paha.pacioos.hawaii.edu) - espelho oficial do dataset `dhw_5km` da NOAA com CORS liberado e pixel costeiro local
 * 2. NOAA CoastWatch ERDDAP PFEG (https://coastwatch.pfeg.noaa.gov) - dataset `NOAA_DHW` (distribuidor ERDDAP de contingência)
 * O adaptador de estação virtual de terceiros não participa do failover no navegador,
 * pois a origem não autoriza CORS. Ele só poderá ser reativado por um proxy próprio.
 *
 * Variáveis principais:
 * - CRW_SST: temperatura da superfície do mar (°C)
 * - CRW_SSTANOMALY: anomalia em relação à climatologia (°C)
 * - CRW_HOTSPOT: HotSpot térmico relativo ao MMM (°C)
 * - CRW_DHW: Degree Heating Weeks oficial (°C-semana, janela de 84 dias)
 * - CRW_BAA / CRW_BAA_7D_MAX: nível de alerta de branqueamento (escala estendida NOAA CRW de 0 a 7)
 */

export interface CrwDistributor {
  id: 'pacioos' | 'pfeg';
  label: string;
  baseUrl: string;
  datasetId: string;
}

export const CRW_DISTRIBUTORS: readonly CrwDistributor[] = [
  {
    id: 'pacioos',
    label: 'PacIOOS ERDDAP (redistribuição oficial do NOAA CRW 5 km)',
    baseUrl: 'https://pae-paha.pacioos.hawaii.edu/erddap',
    datasetId: 'dhw_5km',
  },
  {
    id: 'pfeg',
    label: 'NOAA CoastWatch ERDDAP (PFEG)',
    baseUrl: 'https://coastwatch.pfeg.noaa.gov/erddap',
    datasetId: 'NOAA_DHW',
  },
];

const CRW_VARIABLES = ['CRW_SST', 'CRW_SSTANOMALY', 'CRW_HOTSPOT', 'CRW_DHW', 'CRW_BAA', 'CRW_BAA_7D_MAX'] as const;

/** Número de dias recentes consultados para o indicador atual (o painel usa o dado mais recente). */
export const CRW_RECENT_DAYS = 7;

/** Orçamento total máximo para a operação de consulta (evita bloqueios prolongados da interface). */
export const CRW_TOTAL_BUDGET_MS = 16000;

/** Timeout por tentativa individual de consulta a distribuidor. */
export const CRW_ATTEMPT_TIMEOUT_MS = 6000;

/**
 * Pixels oceânicos da grade NOAA de 5 km para cada setor da BTS.
 *
 * - Frades: pixel da Baía Central (-12.875, -38.525).
 * - Barra: pixel adjacente oceânico na entrada da baía (-13.025, -38.525).
 * - Paraguaçu: canal estuarino interior 100% mascarado como continente na grade de 5 km.
 *   Não recebe consulta remota para não atribuir águas abertas ao manguezal interno.
 */
export const NOAA_CRW_PIXELS: Record<
  BtsSectorId,
  { latitude: number; longitude: number; hasDirectCoverage: boolean; note: string }
> = {
  frades: {
    latitude: -12.875,
    longitude: -38.525,
    hasDirectCoverage: true,
    note: 'Pixel oceânico da Baía Central adjacente à Ilha dos Frades.',
  },
  barra: {
    latitude: -13.025,
    longitude: -38.525,
    hasDirectCoverage: true,
    note: 'Pixel oceânico na entrada da baía (a coordenada nominal do setor cai sobre a península de Salvador, mascarada como terra).',
  },
  paraguacu: {
    latitude: -12.825,
    longitude: -38.775,
    hasDirectCoverage: false,
    note: 'Canal estuarino interior sem cobertura direta na grade de 5 km (mascarado como terra). O pixel externo na foz não é atribuído ao canal interno.',
  },
};

export function getSectorCoordinates(sectorId: BtsSectorId = 'frades'): { latitude: number; longitude: number } {
  const sector = BTS_SECTORS.find((s) => s.id === sectorId);
  return sector?.coordinates ?? { latitude: -12.85, longitude: -38.55 };
}

export function getNoaaPixel(sectorId: BtsSectorId = 'frades') {
  return NOAA_CRW_PIXELS[sectorId] ?? NOAA_CRW_PIXELS.frades;
}

function computeSimpleHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) && value > -500 && value < 500 ? value : null;
}

/**
 * Valida o nível de alerta (BAA / Bleaching Alert Area) no domínio oficial estendido da NOAA CRW [0 a 7].
 * - 0: Sem Alerta
 * - 1: Vigilância (Watch)
 * - 2: Aviso (Warning)
 * - 3: Alerta Nível 1
 * - 4: Alerta Nível 2
 * - 5: Alerta Nível 3
 * - 6: Alerta Nível 4
 * - 7: Alerta Nível 5
 * Valores de preenchimento (_FillValue = 251 na NOAA/PacIOOS) ou inválidos tornam-se null.
 */
export function parseAlertLevel(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
  if (value >= 0 && value <= 7) return value;
  return null;
}

/**
 * Janela temporal explícita (usada para séries históricas sob demanda).
 * Recuo de 2 dias absorve a latência operacional do produto diário.
 */
export function getDefaultCrwWindow(days = 45): { startUtc: string; endUtc: string } {
  const safeEnd = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  const start = new Date(safeEnd.getTime() - days * 24 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10) + 'T12:00:00Z';
  return { startUtc: fmt(start), endUtc: fmt(safeEnd) };
}

/** Divide intervalos longos em blocos de até `maxChunkDays` dias. */
export function splitTimeWindowIntoChunks(
  startUtc: string,
  endUtc: string,
  maxChunkDays = 15,
): Array<{ startUtc: string; endUtc: string }> {
  const startMs = new Date(startUtc).getTime();
  const endMs = new Date(endUtc).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs > endMs) {
    return [{ startUtc, endUtc }];
  }

  const chunkMs = maxChunkDays * 24 * 3600 * 1000;
  const chunks: Array<{ startUtc: string; endUtc: string }> = [];
  let currentStart = startMs;

  while (currentStart < endMs) {
    const currentEnd = Math.min(currentStart + chunkMs, endMs);
    chunks.push({
      startUtc: new Date(currentStart).toISOString().replace('.000Z', 'Z'),
      endUtc: new Date(currentEnd).toISOString().replace('.000Z', 'Z'),
    });
    currentStart = currentEnd;
  }
  return chunks;
}

export function buildCrwQueryUrl(
  distributor: CrwDistributor,
  pixel: { latitude: number; longitude: number },
  timeSelector: string,
): string {
  const constraint = `[${timeSelector}][(${pixel.latitude})][(${pixel.longitude})]`;
  return `${distributor.baseUrl}/griddap/${distributor.datasetId}.csv?${CRW_VARIABLES.map((v) => `${v}${constraint}`).join(',')}`;
}

export interface ParsedCrwRow {
  timestampUtc: string;
  latitude: number | null;
  longitude: number | null;
  sst: number | null;
  sstAnomaly: number | null;
  hotSpot: number | null;
  dhw: number | null;
  baa: number | null;
  baa7d: number | null;
}

/**
 * Interpreta o CSV do ERDDAP pelos NOMES das colunas (linha 0), ignorando a linha de unidades (linha 1).
 * Lança RemoteDataError('parse') se colunas obrigatórias estiverem ausentes.
 */
export function parseErddapCrwCsv(csvText: string): ParsedCrwRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new RemoteDataError('parse', 'Resposta NOAA sem cabeçalho CSV reconhecível.');
  }

  const header = lines[0].split(',').map((h) => h.trim());
  const column = (name: string) => header.indexOf(name);
  const idx = {
    time: column('time'),
    latitude: column('latitude'),
    longitude: column('longitude'),
    sst: column('CRW_SST'),
    anomaly: column('CRW_SSTANOMALY'),
    hotSpot: column('CRW_HOTSPOT'),
    dhw: column('CRW_DHW'),
    baa: column('CRW_BAA'),
    baa7d: column('CRW_BAA_7D_MAX'),
  };

  if (idx.time < 0 || idx.sst < 0) {
    throw new RemoteDataError(
      'parse',
      `Resposta NOAA sem as colunas obrigatórias "time" e "CRW_SST" (recebido: ${header.join(', ').slice(0, 160)}).`,
    );
  }

  const rows: ParsedCrwRow[] = [];
  for (let i = 2; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const parts = lines[i].split(',');
    const get = (index: number) => (index >= 0 ? parseNumber(parts[index]) : null);
    const timestampUtc = parts[idx.time]?.trim();
    if (!timestampUtc) continue;
    const baa = idx.baa >= 0 ? parseAlertLevel(parts[idx.baa]) : null;
    rows.push({
      timestampUtc,
      latitude: get(idx.latitude),
      longitude: get(idx.longitude),
      sst: get(idx.sst),
      sstAnomaly: get(idx.anomaly),
      hotSpot: get(idx.hotSpot),
      dhw: get(idx.dhw),
      baa,
      baa7d: idx.baa7d >= 0 ? parseAlertLevel(parts[idx.baa7d]) : null,
    });
  }
  return rows;
}

async function querySingleDistributor(
  distributor: CrwDistributor,
  sectorId: BtsSectorId,
  timeSelector: string,
  window: { startUtc: string; endUtc: string } | null,
  timeoutMs = CRW_ATTEMPT_TIMEOUT_MS,
): Promise<ThermalForcingPoint[]> {
  const pixel = getNoaaPixel(sectorId);
  const queryUrl = buildCrwQueryUrl(distributor, pixel, timeSelector);
  const source = distributor.label;

  const response = await withRetry(
    () => fetchTextWithTimeout(queryUrl, { timeoutMs, accept: 'text/csv', source }),
    0, // Retentativas orquestradas pelo orçamento em queryWithFailover
  ).catch((err: unknown) => {
    // ERDDAP responde HTTP 404 "Your query produced no matching results" quando não há dado no recorte.
    if (err instanceof RemoteDataError && err.kind === 'http' && err.status === 404
      && /no matching results|greater than the axis maximum|less than the axis minimum/i.test(err.serverMessage ?? '')) {
      throw new RemoteDataError('no_data', `${source}: sem dados no período/pixel solicitado (${err.serverMessage}).`, {
        status: 404, url: queryUrl, elapsedMs: err.elapsedMs, serverMessage: err.serverMessage, source,
      });
    }
    throw err;
  });

  let rows: ParsedCrwRow[];
  try {
    rows = parseErddapCrwCsv(response.text);
  } catch (err) {
    if (err instanceof RemoteDataError) {
      throw new RemoteDataError('parse', `${source}: ${err.message}`, { url: queryUrl, elapsedMs: response.elapsedMs, source });
    }
    throw err;
  }

  const valid = rows.filter((row) => row.sst !== null);
  if (valid.length === 0) {
    throw new RemoteDataError(
      'no_data',
      `${source} respondeu (${rows.length} linha(s)), mas sem SST válida para o pixel ${pixel.latitude}°, ${pixel.longitude}° — provável máscara terrestre ou lacuna do produto.`,
      { url: queryUrl, elapsedMs: response.elapsedMs, source },
    );
  }

  const responseHash = computeSimpleHash(response.text);
  const retrievedAt = new Date().toISOString();
  const validStart = window?.startUtc ?? valid[0].timestampUtc;
  const validEnd = window?.endUtc ?? valid[valid.length - 1].timestampUtc;

  return valid.map((row) => ({
    timestampUtc: row.timestampUtc,
    seaSurfaceTemperatureDegC: row.sst as number,
    sstAnomalyDegC: row.sstAnomaly,
    hotSpotDegC: row.hotSpot,
    degreeHeatingWeeks: row.dhw,
    bleachingAlertLevel: row.baa,
    bleachingAlertMax7d: row.baa7d,
    bleachingAlertSourceVariable: row.baa !== null ? 'CRW_BAA' : undefined,
    gridCell: row.latitude !== null && row.longitude !== null
      ? { latitude: row.latitude, longitude: row.longitude }
      : { latitude: pixel.latitude, longitude: pixel.longitude },
    requestedCoordinates: { latitude: pixel.latitude, longitude: pixel.longitude },
    spatialResolution: '5 km (0,05°)',
    provenance: {
      ...NOAA_CRW_PROVENANCE_BASE,
      datasetId: distributor.datasetId,
      distributor: distributor.label,
      pixelNote: pixel.note,
      validTimeStartUtc: validStart,
      validTimeEndUtc: validEnd,
      retrievedAtUtc: retrievedAt,
      queryUrl,
      responseHash,
      responseTimeMs: response.elapsedMs,
      isCachedFallback: false,
      fetchStatus: 'online_valid',
    },
  }));
}

/**
 * Consulta distribuidores em ordem operacional; devolve o primeiro resultado válido dentro do orçamento.
 * Ordem no navegador:
 * 1. PacIOOS ERDDAP (distribuição oficial NOAA CRW 5km com CORS '*' e pixel local exato)
 * 2. NOAA CoastWatch ERDDAP PFEG (distribuidor ERDDAP de contingência)
 */
async function queryWithFailover(
  sectorId: BtsSectorId,
  timeSelector: string,
  window: { startUtc: string; endUtc: string } | null,
  distributors: readonly CrwDistributor[],
  totalBudgetMs = CRW_TOTAL_BUDGET_MS,
): Promise<ThermalForcingPoint[]> {
  const startTime = Date.now();
  const failures: RemoteDataError[] = [];

  // 1. Distribuidores ERDDAP operacionais (PacIOOS primeiro, CoastWatch PFEG como contingência)
  for (const distributor of distributors) {
    const elapsed = Date.now() - startTime;
    const remaining = totalBudgetMs - elapsed;
    if (remaining <= 500) {
      failures.push(
        new RemoteDataError('timeout', `${distributor.label}: orçamento de tempo esgotado (${totalBudgetMs / 1000}s).`, {
          source: distributor.label,
          elapsedMs: elapsed,
        }),
      );
      break;
    }

    const attemptTimeout = Math.min(CRW_ATTEMPT_TIMEOUT_MS, remaining);
    try {
      return await querySingleDistributor(distributor, sectorId, timeSelector, window, attemptTimeout);
    } catch (err) {
      failures.push(
        err instanceof RemoteDataError
          ? err
          : new RemoteDataError('parse', err instanceof Error ? err.message : String(err), { source: distributor.label }),
      );
    }
  }

  // Prioriza a falha mais informativa: no_coverage > no_data > http > parse > timeout > rede
  const priority: Record<string, number> = { no_coverage: 0, no_data: 1, http: 2, parse: 3, timeout: 4, network: 5 };
  const primary = [...failures].sort((a, b) => (priority[a.kind] ?? 9) - (priority[b.kind] ?? 9))[0];
  const summary = failures.map((f) => `• [${f.source ?? 'Fonte'}] ${f.message}`).join('\n');
  throw new RemoteDataError(primary?.kind ?? 'network', summary || 'Todas as fontes remotas de estresse térmico falharam.', {
    status: primary?.status,
    url: primary?.url,
    elapsedMs: Date.now() - startTime,
    serverMessage: primary?.serverMessage,
    source: primary?.source,
  });
}

/**
 * Consulta de estresse térmico da Baía de Todos-os-Santos.
 *
 * Em caso de Paraguaçu (canal estuarino interno mascarado como terra),
 * lança RemoteDataError('no_coverage') para que o hook e o painel reflitam explicitamente
 * a ausência de cobertura sem disparar chamadas de rede nem classificar como sucesso falso.
 */
export async function fetchBtsThermalForcing(
  sectorId: BtsSectorId = 'frades',
  startUtc?: string,
  endUtc?: string,
  distributors: readonly CrwDistributor[] = CRW_DISTRIBUTORS,
): Promise<ThermalForcingPoint[]> {
  // Setores estuarinos interiores estreitos (como o Paraguaçu) sofrem mascaramento de terra na grade de 5 km
  if (sectorId === 'paraguacu') {
    throw new RemoteDataError(
      'no_coverage',
      'O produto de satélite NOAA CRW de 5 km não fornece dados válidos para representar este canal interno (mascaramento de terra).',
    );
  }

  if (!startUtc || !endUtc) {
    return queryWithFailover(sectorId, `last-${CRW_RECENT_DAYS - 1}:1:last`, null, distributors);
  }

  const chunks = splitTimeWindowIntoChunks(startUtc, endUtc, 15);
  const results = await Promise.allSettled(
    chunks.map((chunk) => queryWithFailover(sectorId, `(${chunk.startUtc}):1:(${chunk.endUtc})`, chunk, distributors)),
  );

  const merged = new Map<string, ThermalForcingPoint>();
  results.forEach((result) => {
    if (result.status === 'fulfilled') result.value.forEach((p) => merged.set(p.timestampUtc, p));
  });

  if (merged.size === 0) {
    const firstFailure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw firstFailure?.reason ?? new RemoteDataError('no_data', 'Nenhum bloco temporal retornou dados válidos.');
  }

  return [...merged.values()].sort(
    (a, b) => new Date(a.timestampUtc).getTime() - new Date(b.timestampUtc).getTime(),
  );
}

/** Exemplo histórico (mar/abr 2024) carregado apenas por ação explícita do usuário. */
export function getBtsCrwHistoricalSnapshot(sectorId: BtsSectorId = 'frades'): ThermalForcingPoint[] {
  return BTS_CRW_SECTOR_FALLBACKS[sectorId] ?? [];
}
