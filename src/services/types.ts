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
}

export interface ThermalForcingPoint {
  timestampUtc: string;
  seaSurfaceTemperatureDegC: number;
  sstAnomalyDegC: number;
  hotSpotDegC: number;
  degreeHeatingWeeks: number;
  /** Nível ordinal de estresse térmico NOAA (0 = Nenhum, 1 = Atenção/Watch, 2 = Aviso/Warning, 3 = Alerta 1, 4 = Alerta 2). */
  bleachingAlertLevel: number;
  /** Campo mantido para retrocompatibilidade semântica. */
  bleachingAlertArea?: number;
  bleachingAlertMax7d?: number;
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
  provenance: DatasetProvenance;
}

