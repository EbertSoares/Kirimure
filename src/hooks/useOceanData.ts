import { useEffect, useState, useCallback, useRef } from 'react';
import { RemoteDataError, type RemoteErrorKind } from '../services/http';
import { fetchBtsThermalForcing, getBtsCrwHistoricalSnapshot } from '../services/noaaCrw';
import { fetchBtsMarineMeteo, getBtsMeteoHistoricalSnapshot, findClosestHourlyPoint } from '../services/openMeteo';
import type { MarineMeteoPoint, ThermalForcingPoint } from '../services/types';
import type { BtsSectorId } from '../simulation/types';

interface DataSourceStatus {
  state: 'idle' | 'loading' | 'success' | 'fallback' | 'no_coverage' | 'error';
  lastAttemptUtc: string | null;
  lastSuccessUtc: string | null;
  error: string | null;
  errorKind?: RemoteErrorKind;
  errorStatus?: number;
  errorUrl?: string;
  errorElapsedMs?: number;
  serverMessage?: string;
  isFallback: boolean;
}

export interface OceanDataState {
  loading: boolean;
  noaaLoading: boolean;
  meteoLoading: boolean;
  error: string | null;
  noaaStatus: DataSourceStatus;
  meteoStatus: DataSourceStatus;
  crwData: ThermalForcingPoint[];
  latestCrw: ThermalForcingPoint | null;
  /** Setor ao qual `crwData` pertence; evita aplicar dados antigos após trocar de setor. */
  crwSectorId: BtsSectorId | null;
  meteoData: MarineMeteoPoint[];
  latestMeteo: MarineMeteoPoint | null;
  /** Setor ao qual `meteoData` pertence. */
  meteoSectorId: BtsSectorId | null;
  lastUpdated: Date | null;
  isFallback: boolean;
  sectorId: BtsSectorId;
  refresh: () => Promise<void>;
  refreshNoaa: () => Promise<void>;
  refreshMeteo: () => Promise<void>;
  loadHistoricalCrwSnapshot: () => void;
  loadHistoricalMeteoSnapshot: () => void;
}

const INITIAL_STATUS: DataSourceStatus = {
  state: 'idle',
  lastAttemptUtc: null,
  lastSuccessUtc: null,
  error: null,
  isFallback: false,
};

export interface SectorOceanCache {
  crwData: ThermalForcingPoint[];
  meteoData: MarineMeteoPoint[];
  noaaStatus: DataSourceStatus;
  meteoStatus: DataSourceStatus;
  lastUpdated: Date;
  fetchedAtMs: number;
}

const sectorOceanCache = new Map<BtsSectorId, SectorOceanCache>();
/** TTL do cache em memória: 15 minutos (dados de satélite NOAA são diários e previsões meteo horárias) */
export const OCEAN_CACHE_TTL_MS = 15 * 60 * 1000;

export function isOceanCacheFresh(
  cached: SectorOceanCache | undefined,
  nowMs = Date.now(),
): cached is SectorOceanCache {
  return Boolean(cached && nowMs - cached.fetchedAtMs < OCEAN_CACHE_TTL_MS);
}

/**
 * Em caso de falha de rede, nunca grava um cache vazio como se fosse leitura
 * válida. Se já existe cache do setor, preserva dados e idade do último
 * sucesso, atualizando apenas o diagnóstico; sem cache, a falha não é
 * armazenada e a próxima montagem tenta a rede novamente.
 */
export function mergeSectorCacheOnFailure(
  existing: SectorOceanCache | undefined,
  updates: Pick<Partial<SectorOceanCache>, 'noaaStatus' | 'meteoStatus' | 'crwData' | 'meteoData'>,
): SectorOceanCache | null {
  if (!existing) return null;
  return {
    ...existing,
    ...updates,
    fetchedAtMs: existing.fetchedAtMs,
  };
}

export function useOceanData(sectorId: BtsSectorId = 'frades', enabled = true): OceanDataState {
  const [cachedInitial] = useState<SectorOceanCache | undefined>(() => {
    const cached = sectorOceanCache.get(sectorId);
    return isOceanCacheFresh(cached) ? cached : undefined;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [noaaStatus, setNoaaStatus] = useState<DataSourceStatus>(() => (
    cachedInitial ? cachedInitial.noaaStatus : INITIAL_STATUS
  ));
  const [meteoStatus, setMeteoStatus] = useState<DataSourceStatus>(() => (
    cachedInitial ? cachedInitial.meteoStatus : INITIAL_STATUS
  ));

  const [crwData, setCrwData] = useState<ThermalForcingPoint[]>(() => (
    cachedInitial ? cachedInitial.crwData : []
  ));
  const [meteoData, setMeteoData] = useState<MarineMeteoPoint[]>(() => (
    cachedInitial ? cachedInitial.meteoData : []
  ));
  const [crwSectorId, setCrwSectorId] = useState<BtsSectorId | null>(() => (
    cachedInitial ? sectorId : null
  ));
  const [meteoSectorId, setMeteoSectorId] = useState<BtsSectorId | null>(() => (
    cachedInitial ? sectorId : null
  ));
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => (
    cachedInitial ? cachedInitial.lastUpdated : null
  ));

  const activeSectorRef = useRef(sectorId);

  useEffect(() => {
    activeSectorRef.current = sectorId;
  }, [sectorId]);

  const updateSectorCache = useCallback((
    sector: BtsSectorId,
    updates: Partial<SectorOceanCache>,
  ) => {
    const existing = sectorOceanCache.get(sector);
    sectorOceanCache.set(sector, {
      crwData: updates.crwData ?? existing?.crwData ?? [],
      meteoData: updates.meteoData ?? existing?.meteoData ?? [],
      noaaStatus: updates.noaaStatus ?? existing?.noaaStatus ?? INITIAL_STATUS,
      meteoStatus: updates.meteoStatus ?? existing?.meteoStatus ?? INITIAL_STATUS,
      lastUpdated: updates.lastUpdated ?? existing?.lastUpdated ?? new Date(),
      fetchedAtMs: Date.now(),
    });
  }, []);

  const updateSectorStatus = useCallback((
    sector: BtsSectorId,
    updates: Pick<Partial<SectorOceanCache>, 'noaaStatus' | 'meteoStatus'>,
  ) => {
    const merged = mergeSectorCacheOnFailure(sectorOceanCache.get(sector), updates);
    if (merged) sectorOceanCache.set(sector, merged);
  }, []);

  const refreshNoaa = useCallback(async () => {
    if (!enabled) return;
    const nowUtc = new Date().toISOString();
    const requestSector = activeSectorRef.current;
    setNoaaStatus((prev) => ({ ...prev, state: 'loading', lastAttemptUtc: nowUtc }));

    try {
      const points = await fetchBtsThermalForcing(requestSector);
      if (activeSectorRef.current !== requestSector) return;

      const isFallback = points.length > 0 && Boolean(points[0]?.provenance.isCachedFallback);
      const nextStatus: DataSourceStatus = {
        state: isFallback ? 'fallback' : 'success',
        lastAttemptUtc: nowUtc,
        lastSuccessUtc: isFallback ? null : nowUtc,
        error: null,
        isFallback,
      };
      setCrwData(points);
      setCrwSectorId(requestSector);
      setNoaaStatus(nextStatus);
      const now = new Date();
      setLastUpdated(now);
      updateSectorCache(requestSector, { crwData: points, noaaStatus: nextStatus, lastUpdated: now });
    } catch (err) {
      if (activeSectorRef.current !== requestSector) return;
      const remoteErr = err instanceof RemoteDataError ? err : undefined;
      setCrwData([]);
      setCrwSectorId(requestSector);

      const nextStatus: DataSourceStatus = remoteErr?.kind === 'no_coverage'
        ? {
            state: 'no_coverage',
            lastAttemptUtc: nowUtc,
            lastSuccessUtc: null,
            error: remoteErr.message,
            errorKind: 'no_coverage',
            isFallback: false,
          }
        : {
            state: 'error',
            lastAttemptUtc: nowUtc,
            lastSuccessUtc: null,
            error: err instanceof Error ? err.message : 'Falha na consulta remota ao NOAA CRW',
            errorKind: remoteErr?.kind ?? 'network',
            errorStatus: remoteErr?.status,
            errorUrl: remoteErr?.url,
            errorElapsedMs: remoteErr?.elapsedMs,
            serverMessage: remoteErr?.serverMessage,
            isFallback: false,
          };
      setNoaaStatus(nextStatus);
      updateSectorStatus(requestSector, { noaaStatus: nextStatus });
    }
  }, [enabled, updateSectorCache, updateSectorStatus]);

  const refreshMeteo = useCallback(async () => {
    if (!enabled) return;
    const nowUtc = new Date().toISOString();
    const requestSector = activeSectorRef.current;
    setMeteoStatus((prev) => ({ ...prev, state: 'loading', lastAttemptUtc: nowUtc }));

    try {
      const points = await fetchBtsMarineMeteo(requestSector);
      if (activeSectorRef.current !== requestSector) return;

      const isFallback = points.length > 0 && Boolean(points[0]?.provenance.isCachedFallback);
      const nextStatus: DataSourceStatus = {
        state: isFallback ? 'fallback' : 'success',
        lastAttemptUtc: nowUtc,
        lastSuccessUtc: isFallback ? null : nowUtc,
        error: null,
        isFallback,
      };
      setMeteoData(points);
      setMeteoSectorId(requestSector);
      setMeteoStatus(nextStatus);
      const now = new Date();
      setLastUpdated(now);
      updateSectorCache(requestSector, { meteoData: points, meteoStatus: nextStatus, lastUpdated: now });
    } catch (err) {
      if (activeSectorRef.current !== requestSector) return;
      const remoteErr = err instanceof RemoteDataError ? err : undefined;
      setMeteoData([]);
      setMeteoSectorId(requestSector);
      const nextStatus: DataSourceStatus = {
        state: 'error',
        lastAttemptUtc: nowUtc,
        lastSuccessUtc: null,
        error: err instanceof Error ? err.message : 'Falha na consulta ao Open-Meteo Marine',
        errorKind: remoteErr?.kind ?? 'network',
        errorStatus: remoteErr?.status,
        errorUrl: remoteErr?.url,
        errorElapsedMs: remoteErr?.elapsedMs,
        serverMessage: remoteErr?.serverMessage,
        isFallback: false,
      };
      setMeteoStatus(nextStatus);
      updateSectorStatus(requestSector, { meteoStatus: nextStatus });
    }
  }, [enabled, updateSectorCache, updateSectorStatus]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      await Promise.allSettled([refreshNoaa(), refreshMeteo()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar dados oceanográficos externos');
    } finally {
      setLoading(false);
    }
  }, [enabled, refreshNoaa, refreshMeteo]);

  const loadHistoricalCrwSnapshot = useCallback(() => {
    const snapshot = getBtsCrwHistoricalSnapshot(activeSectorRef.current);
    setCrwData(snapshot);
    setCrwSectorId(activeSectorRef.current);
    setNoaaStatus({
      state: 'fallback',
      lastAttemptUtc: new Date().toISOString(),
      lastSuccessUtc: null,
      error: null,
      isFallback: true,
    });
  }, []);

  const loadHistoricalMeteoSnapshot = useCallback(() => {
    const snapshot = getBtsMeteoHistoricalSnapshot(activeSectorRef.current);
    setMeteoData(snapshot);
    setMeteoSectorId(activeSectorRef.current);
    setMeteoStatus({
      state: 'fallback',
      lastAttemptUtc: new Date().toISOString(),
      lastSuccessUtc: null,
      error: null,
      isFallback: true,
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Se já houver dados válidos em cache para o setor consultado dentro do TTL, reaproveita
    // imediatamente sem disparar novas chamadas de rede redundantes a cada troca de tela
    const cached = sectorOceanCache.get(sectorId);
    if (isOceanCacheFresh(cached)) {
      const timer = window.setTimeout(() => {
        setCrwData(cached.crwData);
        setMeteoData(cached.meteoData);
        setCrwSectorId(sectorId);
        setMeteoSectorId(sectorId);
        setNoaaStatus(cached.noaaStatus);
        setMeteoStatus(cached.meteoStatus);
        setLastUpdated(cached.lastUpdated);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [enabled, sectorId, refresh]);

  // Enquanto o novo setor carrega, dados do setor anterior permanecem no estado interno,
  // mas nunca são expostos como leitura atual do setor selecionado.
  const crwDataForSector = crwSectorId === sectorId ? crwData : [];
  const meteoDataForSector = meteoSectorId === sectorId ? meteoData : [];
  const latestCrw = crwDataForSector.length > 0
    ? crwDataForSector[crwDataForSector.length - 1]
    : null;
  const latestMeteo = meteoDataForSector.length > 0
    ? findClosestHourlyPoint(meteoDataForSector)
    : null;
  const isFallback = Boolean(noaaStatus.isFallback || meteoStatus.isFallback);
  const noaaLoading = noaaStatus.state === 'loading';
  const meteoLoading = meteoStatus.state === 'loading';

  return {
    loading: loading || noaaLoading || meteoLoading,
    noaaLoading,
    meteoLoading,
    error,
    noaaStatus,
    meteoStatus,
    crwData: crwDataForSector,
    latestCrw,
    crwSectorId,
    meteoData: meteoDataForSector,
    latestMeteo,
    meteoSectorId,
    lastUpdated,
    isFallback,
    sectorId,
    refresh,
    refreshNoaa,
    refreshMeteo,
    loadHistoricalCrwSnapshot,
    loadHistoricalMeteoSnapshot,
  };
}
