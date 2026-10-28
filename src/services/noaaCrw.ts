import { BTS_SECTORS } from '../simulation/config';
import type { BtsSectorId } from '../simulation/types';
import { RemoteDataError, fetchTextWithTimeout, withRetry } from './http';
import { BTS_CRW_SECTOR_FALLBACKS, NOAA_CRW_PROVENANCE_BASE } from './noaaCrwSnapshots';
import type { ThermalForcingPoint } from './types';

export {
  BTS_CRW_BARRA_FALLBACK_SNAPSHOT,
  BTS_CRW_FALLBACK_SNAPSHOT,
  BTS_CRW_SECTOR_FALLBACKS,
} from './noaaCrwSnapshots';

/**
 * Cliente do NOAA Coral Reef Watch (CRW v3.1, produto diário global de 5 km) via ERDDAP.
 *
 * Variáveis oficiais consultadas:
 * - CRW_SST: temperatura da superfície do mar (°C)
 * - CRW_SSTANOMALY: anomalia de SST contra a climatologia diária do pixel (°C)
 * - CRW_HOTSPOT: SST − MMM do pixel (°C); valores ≤ 0 indicam ausência de estresse térmico
 * - CRW_DHW: Degree Heating Weeks oficial (°C-semana, janela de 84 dias)
 * - CRW_BAA / CRW_BAA_7D_MAX: nível de alerta de branqueamento (0 a 4)
 *
 * Diagnóstico realizado (out/2026): o servidor coastwatch.pfeg.noaa.gov estava inacessível já na
 * conexão TCP (inclusive na página leve /info), enquanto o mesmo produto NOAA CRW é redistribuído
 * pelo ERDDAP do PacIOOS (dataset `dhw_5km`, mesmas variáveis, CORS liberado). Por isso o cliente
 * consulta distribuidores em ordem e registra na proveniência qual deles serviu o dado.
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

/** Timeout por distribuidor, cobrindo cabeçalhos e corpo. */
export const CRW_TIMEOUT_MS = 10000;

/**
 * Pixels oceânicos válidos da grade NOAA de 5 km para cada setor.
 * As coordenadas nominais da Barra (-12.97, -38.50) caem sobre a península de Salvador e o canal do
 * Paraguaçu é mascarado como terra; nesses casos a consulta retornava apenas NaN. Os pixels abaixo
 * foram verificados com valores válidos de SST.
 */
export const NOAA_CRW_PIXELS: Record<BtsSectorId, { latitude: number; longitude: number; note: string }> = {
  frades: {
    latitude: -12.875,
    longitude: -38.525,
    note: 'Pixel da Baía Central adjacente à Ilha dos Frades.',
  },
  barra: {
    latitude: -13.025,
    longitude: -38.525,
    note: 'Pixel oceânico na entrada da baía (a coordenada nominal do setor cai sobre a península de Salvador, mascarada como terra).',
  },
  paraguacu: {
    latitude: -12.825,
    longitude: -38.775,
    note: 'Pixel válido mais próximo na baía interior, a leste da foz do Paraguaçu. Não representa o canal estuarino, que é mascarado como terra na grade de 5 km.',
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
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return [{ startUtc, endUtc }];
  }

  const chunkMs = maxChunkDays * 24 * 3600 * 1000;
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10) + 'T12:00:00Z';
  const chunks: Array<{ startUtc: string; endUtc: string }> = [];
  for (let cursor = startMs; cursor < endMs; cursor += chunkMs) {
    chunks.push({ startUtc: fmt(cursor), endUtc: fmt(Math.min(cursor + chunkMs, endMs)) });
  }
  return chunks;
}

/** Monta a URL griddap. `timeSelector` aceita `last-6:1:last` ou `(início):1:(fim)`. */
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
    const baa = get(idx.baa);
    rows.push({
      timestampUtc,
      latitude: get(idx.latitude),
      longitude: get(idx.longitude),
      sst: get(idx.sst),
      sstAnomaly: get(idx.anomaly),
      hotSpot: get(idx.hotSpot),
      dhw: get(idx.dhw),
      baa,
      baa7d: idx.baa7d >= 0 ? get(idx.baa7d) : baa,
    });
  }
  return rows;
}

async function querySingleDistributor(
  distributor: CrwDistributor,
  sectorId: BtsSectorId,
  timeSelector: string,
  window: { startUtc: string; endUtc: string } | null,
): Promise<ThermalForcingPoint[]> {
  const pixel = getNoaaPixel(sectorId);
  const queryUrl = buildCrwQueryUrl(distributor, pixel, timeSelector);
  const source = distributor.label;

  const response = await withRetry(
    () => fetchTextWithTimeout(queryUrl, { timeoutMs: CRW_TIMEOUT_MS, accept: 'text/csv', source }),
    1,
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
    bleachingAlertArea: row.baa,
    bleachingAlertMax7d: row.baa7d,
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
 * Consulta distribuidores em ordem; devolve o primeiro resultado válido.
 * Se todos falharem, lança o erro do primeiro distribuidor com o resumo de todos.
 */
async function queryWithFailover(
  sectorId: BtsSectorId,
  timeSelector: string,
  window: { startUtc: string; endUtc: string } | null,
  distributors: readonly CrwDistributor[],
): Promise<ThermalForcingPoint[]> {
  const failures: RemoteDataError[] = [];
  for (const distributor of distributors) {
    try {
      return await querySingleDistributor(distributor, sectorId, timeSelector, window);
    } catch (err) {
      failures.push(err instanceof RemoteDataError
        ? err
        : new RemoteDataError('parse', err instanceof Error ? err.message : String(err), { source: distributor.label }));
    }
  }

  // Prioriza a falha mais informativa: dado ausente > HTTP > parse > timeout > rede
  const priority: Record<string, number> = { no_data: 0, http: 1, parse: 2, timeout: 3, network: 4 };
  const primary = [...failures].sort((a, b) => priority[a.kind] - priority[b.kind])[0];
  const summary = failures.map((f) => `• ${f.message}`).join('\n');
  throw new RemoteDataError(primary.kind, summary, {
    status: primary.status,
    url: primary.url,
    elapsedMs: primary.elapsedMs,
    serverMessage: primary.serverMessage,
    source: primary.source,
  });
}

/**
 * Indicador atual: consulta apenas os últimos CRW_RECENT_DAYS dias disponíveis no servidor
 * (seleção por índice `last`, que dispensa adivinhar a data da última atualização).
 *
 * Com `startUtc`/`endUtc` explícitos, consulta a série histórica em blocos de ≤ 15 dias em paralelo,
 * preservando os blocos bem-sucedidos mesmo que algum falhe.
 *
 * Nunca devolve lista vazia como sucesso: ausência de SST válida gera RemoteDataError('no_data').
 */
export async function fetchBtsThermalForcing(
  sectorId: BtsSectorId = 'frades',
  startUtc?: string,
  endUtc?: string,
  distributors: readonly CrwDistributor[] = CRW_DISTRIBUTORS,
): Promise<ThermalForcingPoint[]> {
  // Setores estuarinos interiores estreitos (como o Paraguaçu) sofrem mascaramento de terra na grade de 5 km
  if (sectorId === 'paraguacu') {
    return [];
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
