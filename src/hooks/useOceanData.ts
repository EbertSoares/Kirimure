import { useEffect, useState, useCallback } from 'react';
import { fetchBtsThermalForcing, BTS_CRW_FALLBACK_SNAPSHOT } from '../services/noaaCrw';
import { fetchBtsMarineMeteo, BTS_METEO_FALLBACK_SNAPSHOT } from '../services/openMeteo';
import type { MarineMeteoPoint, ThermalForcingPoint } from '../services/types';

export interface OceanDataState {
  loading: boolean;
  error: string | null;
  crwData: ThermalForcingPoint[];
  latestCrw: ThermalForcingPoint | null;
  meteoData: MarineMeteoPoint[];
  latestMeteo: MarineMeteoPoint | null;
  lastUpdated: Date | null;
  isFallback: boolean;
  refresh: () => Promise<void>;
}

export function useOceanData(): OceanDataState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [crwData, setCrwData] = useState<ThermalForcingPoint[]>(BTS_CRW_FALLBACK_SNAPSHOT);
  const [meteoData, setMeteoData] = useState<MarineMeteoPoint[]>(BTS_METEO_FALLBACK_SNAPSHOT);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [thermalResults, meteoResults] = await Promise.allSettled([
        fetchBtsThermalForcing(),
        fetchBtsMarineMeteo(),
      ]);

      if (thermalResults.status === 'fulfilled') {
        setCrwData(thermalResults.value);
      } else {
        console.warn('Falha na consulta NOAA CRW:', thermalResults.reason);
      }

      if (meteoResults.status === 'fulfilled') {
        setMeteoData(meteoResults.value);
      } else {
        console.warn('Falha na consulta Open-Meteo:', meteoResults.reason);
      }

      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar dados oceanográficos externos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const latestCrw = crwData.length > 0 ? crwData[crwData.length - 1] : null;
  const latestMeteo = meteoData.length > 0 ? meteoData[0] : null;
  const isFallback = Boolean(latestCrw?.provenance.isCachedFallback || latestMeteo?.provenance.isCachedFallback);

  return {
    loading,
    error,
    crwData,
    latestCrw,
    meteoData,
    latestMeteo,
    lastUpdated,
    isFallback,
    refresh: loadData,
  };
}
