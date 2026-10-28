import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchBtsThermalForcing, BTS_CRW_SECTOR_FALLBACKS } from '../services/noaaCrw';
import { fetchBtsMarineMeteo, BTS_METEO_SECTOR_FALLBACKS, findClosestHourlyPoint } from '../services/openMeteo';
import type { MarineMeteoPoint, ThermalForcingPoint } from '../services/types';
import type { BtsSectorId } from '../simulation/types';

export interface DataSourceStatus {
  state: 'idle' | 'loading' | 'success' | 'fallback' | 'error';
  lastAttemptUtc: string | null;
  lastSuccessUtc: string | null;
  error: string | null;
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
}

const INITIAL_STATUS: DataSourceStatus = {
  state: 'idle',
  lastAttemptUtc: null,
  lastSuccessUtc: null,
  error: null,
  isFallback: true,
};

export function useOceanData(sectorId: BtsSectorId = 'frades', enabled = true): OceanDataState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [noaaStatus, setNoaaStatus] = useState<DataSourceStatus>(INITIAL_STATUS);
  const [meteoStatus, setMeteoStatus] = useState<DataSourceStatus>(INITIAL_STATUS);

  const [crwData, setCrwData] = useState<ThermalForcingPoint[]>(() => BTS_CRW_SECTOR_FALLBACKS[sectorId] ?? []);
  const [meteoData, setMeteoData] = useState<MarineMeteoPoint[]>(() => BTS_METEO_SECTOR_FALLBACKS[sectorId] ?? []);
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

    try {
      const [thermalResults, meteoResults] = await Promise.allSettled([
        fetchBtsThermalForcing(requestSector),
        fetchBtsMarineMeteo(requestSector),
      ]);

      // Proteção contra concorrência: descarta resposta de requisição antiga se o setor mudou
      if (activeSectorRef.current !== requestSector) {
        return;
      }

      if (thermalResults.status === 'fulfilled') {
        const points = thermalResults.value;
        const isFallback = points.length === 0 || Boolean(points[0]?.provenance.isCachedFallback);
        setCrwData(points);
        setNoaaStatus({
          state: isFallback ? 'fallback' : 'success',
          lastAttemptUtc: nowUtc,
          lastSuccessUtc: isFallback ? null : nowUtc,
          error: null,
          isFallback,
        });
      } else {
        const errMessage = thermalResults.reason instanceof Error ? thermalResults.reason.message : 'Falha na consulta NOAA';
        setNoaaStatus({
          state: 'error',
          lastAttemptUtc: nowUtc,
          lastSuccessUtc: null,
          error: errMessage,
          isFallback: true,
        });
      }

      if (meteoResults.status === 'fulfilled') {
        const points = meteoResults.value;
        const isFallback = points.length === 0 || Boolean(points[0]?.provenance.isCachedFallback);
        setMeteoData(points);
        setMeteoStatus({
          state: isFallback ? 'fallback' : 'success',
          lastAttemptUtc: nowUtc,
          lastSuccessUtc: isFallback ? null : nowUtc,
          error: null,
          isFallback,
        });
      } else {
        const errMessage = meteoResults.reason instanceof Error ? meteoResults.reason.message : 'Falha na consulta Open-Meteo';
        setMeteoStatus({
          state: 'error',
          lastAttemptUtc: nowUtc,
          lastSuccessUtc: null,
          error: errMessage,
          isFallback: true,
        });
      }

      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar dados oceanográficos externos');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

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
  };
}
