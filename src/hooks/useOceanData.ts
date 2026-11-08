import { useEffect, useState, useCallback, useRef } from 'react';
import { RemoteDataError, type RemoteErrorKind } from '../services/http';
import { fetchBtsThermalForcing, getBtsCrwHistoricalSnapshot } from '../services/noaaCrw';
import { fetchBtsMarineMeteo, getBtsMeteoHistoricalSnapshot, findClosestHourlyPoint } from '../services/openMeteo';
import type { MarineMeteoPoint, ThermalForcingPoint } from '../services/types';
import type { BtsSectorId } from '../simulation/types';

export interface DataSourceStatus {
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
  meteoData: MarineMeteoPoint[];
  latestMeteo: MarineMeteoPoint | null;
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

interface SectorOceanCache {
  crwData: ThermalForcingPoint[];
  meteoData: MarineMeteoPoint[];
  noaaStatus: DataSourceStatus;
  meteoStatus: DataSourceStatus;
  lastUpdated: Date;
  fetchedAtMs: number;
}

const sectorOceanCache = new Map<BtsSectorId, SectorOceanCache>();
/** TTL do cache em memória: 15 minutos (dados de satélite NOAA são diários e previsões meteo horárias) */
const OCEAN_CACHE_TTL_MS = 15 * 60 * 1000;

export function useOceanData(sectorId: BtsSectorId = 'frades', enabled = true): OceanDataState {
  const [cachedInitial] = useState<SectorOceanCache | undefined>(() => {
    const cached = sectorOceanCache.get(sectorId);
    return cached && Date.now() - cached.fetchedAtMs < OCEAN_CACHE_TTL_MS ? cached : undefined;
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
      setNoaaStatus(nextStatus);
      const now = new Date();
      setLastUpdated(now);
      updateSectorCache(requestSector, { crwData: points, noaaStatus: nextStatus, lastUpdated: now });
    } catch (err) {
      if (activeSectorRef.current !== requestSector) return;
      const remoteErr = err instanceof RemoteDataError ? err : undefined;
      setCrwData([]);

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
      updateSectorCache(requestSector, { crwData: [], noaaStatus: nextStatus });
    }
  }, [enabled, updateSectorCache]);

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
      setMeteoStatus(nextStatus);
      const now = new Date();
      setLastUpdated(now);
      updateSectorCache(requestSector, { meteoData: points, meteoStatus: nextStatus, lastUpdated: now });
    } catch (err) {
      if (activeSectorRef.current !== requestSector) return;
      const remoteErr = err instanceof RemoteDataError ? err : undefined;
      setMeteoData([]);
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
      updateSectorCache(requestSector, { meteoData: [], meteoStatus: nextStatus });
    }
  }, [enabled, updateSectorCache]);

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
    if (cached && Date.now() - cached.fetchedAtMs < OCEAN_CACHE_TTL_MS) {
      const timer = window.setTimeout(() => {
        setCrwData(cached.crwData);
        setMeteoData(cached.meteoData);
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

  const latestCrw = crwData.length > 0 ? crwData[crwData.length - 1] : null;
  const latestMeteo = meteoData.length > 0 ? findClosestHourlyPoint(meteoData) : null;
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
    crwData,
    latestCrw,
    meteoData,
    latestMeteo,
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
