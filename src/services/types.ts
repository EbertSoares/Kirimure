import type { EpistemologicalBadge, ScientificMetadata } from '../simulation/types';

export interface DatasetProvenance {
  sourceName: string;
  sourceUrl: string;
  datasetId: string;
  datasetVersion: string;
  retrievedAtUtc: string;
  epistemicClass: EpistemologicalBadge;
  license: string;
  citation: string;
  isCachedFallback: boolean;
}

export interface ThermalForcingPoint {
  timestampUtc: string;
  seaSurfaceTemperatureDegC: number;
  sstAnomalyDegC: number;
  hotSpotDegC: number;
  degreeHeatingWeeks: number;
  bleachingAlertArea: number; // 0 = No stress, 1 = Watch, 2 = Warning, 3 = Alert 1, 4 = Alert 2
  provenance: DatasetProvenance;
}

export interface MarineMeteoPoint {
  timestampUtc: string;
  waveHeightM: number;
  currentVelocityMs: number;
  seaLevelHeightM: number;
  seaSurfaceTemperatureDegC: number;
  provenance: DatasetProvenance;
}
