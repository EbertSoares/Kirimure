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

export function useOceanData(sectorId: BtsSectorId = 'frades', enabled = true): OceanDataState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [noaaStatus, setNoaaStatus] = useState<DataSourceStatus>(INITIAL_STATUS);
  const [meteoStatus, setMeteoStatus] = useState<DataSourceStatus>(INITIAL_STATUS);

  const [crwData, setCrwData] = useState<ThermalForcingPoint[]>([]);
  const [meteoData, setMeteoData] = useState<MarineMeteoPoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const activeSectorRef = useRef(sectorId);
  activeSectorRef.current = sectorId;

  const refreshNoaa = useCallback(async () => {
    if (!enabled) return;
    const nowUtc = new Date().toISOString();
    const requestSector = activeSectorRef.current;
    setNoaaStatus((prev) => ({ ...prev, state: 'loading', lastAttemptUtc: nowUtc }));

    try {
      const points = await fetchBtsThermalForcing(requestSector);
      if (activeSectorRef.current !== requestSector) return;

      const isFallback = points.length > 0 && Boolean(points[0]?.provenance.isCachedFallback);
      setCrwData(points);
      setNoaaStatus({
        state: isFallback ? 'fallback' : 'success',
        lastAttemptUtc: nowUtc,
        lastSuccessUtc: isFallback ? null : nowUtc,
        error: null,
        isFallback,
      });
      setLastUpdated(new Date());
    } catch (err) {
      if (activeSectorRef.current !== requestSector) return;
      const remoteErr = err instanceof RemoteDataError ? err : undefined;
      setCrwData([]);

      if (remoteErr?.kind === 'no_coverage') {
        setNoaaStatus({
          state: 'no_coverage',
          lastAttemptUtc: nowUtc,
          lastSuccessUtc: null,
          error: remoteErr.message,
          errorKind: 'no_coverage',
          isFallback: false,
        });
      } else {
        setNoaaStatus({
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
        });
      }
    }
  }, [enabled]);

  const refreshMeteo = useCallback(async () => {
    if (!enabled) return;
    const nowUtc = new Date().toISOString();
    const requestSector = activeSectorRef.current;
    setMeteoStatus((prev) => ({ ...prev, state: 'loading', lastAttemptUtc: nowUtc }));

    try {
      const points = await fetchBtsMarineMeteo(requestSector);
      if (activeSectorRef.current !== requestSector) return;

      const isFallback = points.length > 0 && Boolean(points[0]?.provenance.isCachedFallback);
      setMeteoData(points);
      setMeteoStatus({
        state: isFallback ? 'fallback' : 'success',
        lastAttemptUtc: nowUtc,
        lastSuccessUtc: isFallback ? null : nowUtc,
        error: null,
        isFallback,
      });
      setLastUpdated(new Date());
    } catch (err) {
      if (activeSectorRef.current !== requestSector) return;
      const remoteErr = err instanceof RemoteDataError ? err : undefined;
      setMeteoData([]);
      setMeteoStatus({
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
      });
    }
  }, [enabled]);

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
    refresh();
  }, [refresh, sectorId]);

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
