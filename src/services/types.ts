import type { EpistemologicalBadge } from '../simulation/types';

export interface DatasetProvenance {
  sourceName: string;
  sourceUrl: string;
  datasetId: string;
  datasetVersion: string;
  validTimeStartUtc: string;
  validTimeEndUtc: string;
  retrievedAtUtc: string;
  epistemicClass: EpistemologicalBadge;
  license: string;
  citation: string;
  queryUrl?: string;
  responseHash?: string;
  isCachedFallback: boolean;
  fallbackNote?: string;
  fetchStatus?: 'online_valid' | 'fallback_cached' | 'network_error' | 'invalid_response';
  /** Servidor que efetivamente entregou o dado (ex.: redistribuidor ERDDAP). */
  distributor?: string;
  /** Observação sobre a representatividade da célula de grade consultada. */
  pixelNote?: string;
  /** Tempo total da resposta (cabeçalhos + corpo), em ms. */
  responseTimeMs?: number;
  /** Modelo numérico efetivamente utilizado, quando informado pela fonte. */
  modelName?: string;
}

export interface ThermalForcingPoint {
  timestampUtc: string;
  seaSurfaceTemperatureDegC: number;
  sstAnomalyDegC: number | null;
  hotSpotDegC: number | null;
  degreeHeatingWeeks: number | null;
  /** Nível ordinal de estresse térmico NOAA CRW (0 = Nenhum, 1 = Atenção, 2 = Aviso, 3 = Alerta 1, 4 = Alerta 2, 5 = Alerta 3, 6 = Alerta 4, 7 = Alerta 5). */
  bleachingAlertLevel: number | null;
  /** Campo mantido para retrocompatibilidade semântica. */
  bleachingAlertArea?: number | null;
  bleachingAlertMax7d?: number | null;
  /** Nível de estresse próprio da estação virtual, quando informado separadamente do BAA 7d. */
  virtualStationStressLevel?: number | null;
  /** SST no percentil 90 de estresse da estação virtual (°C). */
  sst90thPercentileDegC?: number | null;
  /** Faixa de SST observada no cluster da estação (°C). */
  sstMinDegC?: number | null;
  sstMaxDegC?: number | null;
  /** Identifica se o registro é de estação virtual regional (vs pixel satelital direto de grade). */
  isVirtualStation?: boolean;
  virtualStationName?: string;
  gridCell?: { latitude: number; longitude: number };
  requestedCoordinates?: { latitude: number; longitude: number };
  spatialResolution?: string;
  provenance: DatasetProvenance;
}

export interface MarineMeteoPoint {
  timestampUtc: string;
  waveHeightM: number | null;
  currentVelocityMs: number | null;
  currentDirectionDeg?: number | null;
  seaLevelHeightM: number | null;
  seaSurfaceTemperatureDegC: number | null;
  hourlyUnits?: Record<string, string>;
  gridCell?: { latitude: number; longitude: number };
  requestedCoordinates?: { latitude: number; longitude: number };
  spatialResolution?: string;
  provenance: DatasetProvenance;
}

