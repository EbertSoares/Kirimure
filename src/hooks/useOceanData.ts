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

  const loadData = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);
    const nowUtc = new Date().toISOString();
    const requestSector = activeSectorRef.current;

    setNoaaStatus((prev) => ({ ...prev, state: 'loading', lastAttemptUtc: nowUtc }));
    setMeteoStatus((prev) => ({ ...prev, state: 'loading', lastAttemptUtc: nowUtc }));

    // Executa as consultas de forma desacoplada e independente:
    // O resultado mais rápido (ex: Open-Meteo em ~800ms) atualiza a interface imediatamente,
    // sem ficar bloqueado aguardando o término da consulta de estresse térmico NOAA.
    const runNoaa = async () => {
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
    };

    const runMeteo = async () => {
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
    };

    try {
      await Promise.allSettled([runNoaa(), runMeteo()]);
      if (activeSectorRef.current === requestSector) {
        setLastUpdated(new Date());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar dados oceanográficos externos');
    } finally {
      if (activeSectorRef.current === requestSector) {
        setLoading(false);
      }
    }
  }, [enabled]);

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
    loadData();
  }, [loadData, sectorId]);

  const latestCrw = crwData.length > 0 ? crwData[crwData.length - 1] : null;
  const latestMeteo = meteoData.length > 0 ? findClosestHourlyPoint(meteoData) : null;
  const isFallback = Boolean(noaaStatus.isFallback || meteoStatus.isFallback);

  return {
    loading,
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
    refresh: loadData,
    loadHistoricalCrwSnapshot,
    loadHistoricalMeteoSnapshot,
  };
}
