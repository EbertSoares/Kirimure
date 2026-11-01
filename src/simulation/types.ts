import type { ActiveIntervention } from './interventions';

export type ItemId =
  | 'temperature'
  | 'ph'
  | 'microplastics'
  | 'oil'
  | 'sewage'
  | 'turbidity'
  | 'fishing'
  | 'recovery';

export type ControlCategoryId = 'water' | 'pollution' | 'ecosystem';

export type ScaleType = 'linear' | 'logarithmic' | 'nonlinear';

/**
 * Classificação explícita do nível de evidência científica de cada parâmetro do modelo.
 * Distingue observações/publicações de hipóteses e convenções didáticas.
 */
export type EvidenceLevel =
  | 'Medido'
  | 'Publicado'
  | 'Calibrado'
  | 'Hipótese do Modelo'
  | 'Parâmetro Didático';

export interface ParameterEvidenceRecord {
  id: string;
  parameter: string;
  valueDisplay: string;
  unit: string;
  evidenceLevel: EvidenceLevel;
  sourceOrBasis: string;
  scopeNote: string;
}

export type SimulationSpeed = 1 | 3 | 5 | 10;

export type EpistemologicalBadge =
  | 'Dado Local BTS'
  | 'Modelo de Caixa (Ref. BTS)'
  | 'Produto de Modelo'
  | 'Padrão Operacional'
  | 'Referência Laboratorial Externa'
  | 'Cenário Didático'
  | 'Cenário Didático / Modelo de Caixa'
  | 'Regra do Modelo'
  | 'Efeito Visual';

export type EpistemicClass = EpistemologicalBadge;

export interface ScientificMetadata {
  recordId: string;
  variable: string;
  symbol?: string;
  value: number | string;
  unit: string;
  quantityKind:
    | 'source_input'
    | 'mass_inventory'
    | 'concentration'
    | 'exposure'
    | 'biological_endpoint'
    | 'pedagogical_index'
    | 'model_product';
  epistemicClass: EpistemologicalBadge;
  source: string;
  sourceUrl?: string;
  datasetId?: string;
  method?: string;
  spatialResolution?: string;
  temporalResolution?: string;
  uncertainty?: string | null;
  notes?: string;
}

export type BtsSectorId = 'frades' | 'paraguacu' | 'barra';

export interface BtsSectorDefinition {
  id: BtsSectorId;
  label: string;
  sublabel: string;
  description: string;
  badge: EpistemologicalBadge;
  dischargeDays: number;
  dischargeRange: [number, number];
  baselineSalinity: number;
  baselineTemperature: number;
  retentionDescriptor: 'moderada' | 'alta' | 'baixa';
  depthMeters: number;
  meanWindSpeed: number;
  mixingVolumeM3: number;
  coordinates: { latitude: number; longitude: number };
}

export interface Environment {
  temperature: number;
  ph: number;
  microplastics: number;
  oil: number;
  sewage: number;
  turbidity: number;
  fishing: number;
  recovery: number;
}

export interface Health {
  coral: number;
  fish: number;
}

/** Pressões que agem sobre o recife. Cada uma varia de 0 (nenhuma) a 1 (máxima). */
export type PressureId =
  | 'thermal'
  | 'acidification'
  | 'oil'
  | 'microplastics'
  | 'sewage'
  | 'turbidity'
  | 'fishing';

export type Pressures = Record<PressureId, number>;

/** Exposição acumulada: pressão média multiplicada pelos dias em que atuou. */
export type Exposure = Record<PressureId, number>;

export type FishSpeciesId = 'blue-tang' | 'sergeant-major' | 'parrotfish';

export interface FishSpeciesDefinition {
  id: FishSpeciesId;
  label: string;
  role: string;
  note: string;
  /** Dias de estresse máximo até a perda total do grupo. */
  collapseDays: number;
  /** Multiplicador de sensibilidade de cada pressão (1 = média do recife). */
  sensitivity: Record<PressureId, number>;
}

export interface HistoryPoint {
  day: number;
  coral: number;
  fish: number;
  overall: number;
  algae: number;
  temperature: number;
  ph: number;
  dhw: number;
  dissolvedOxygen: number;
  bod?: number;
  saturationOxygen?: number;
  sewage: number;
  microplastics: number;
  oil: number;
  species?: Record<FishSpeciesId, number>;
}

export interface ThermalDoseDay {
  day: number;
  degreeDays: number;
}

export interface CoralRestorationState {
  introducedColonies: number;
  establishedColonies: number;
  survivingColonies: number;
  transplantSurvivalRate: number; // 0..100%
  restoredCoverPercent: number;   // 0..100%
  environmentalSuitability: number; // 0..1 (fator de adequação biofísica para fixação e sobrevivência)
}

export interface SimulationState {
  /** Controles brutos configurados pelo usuário na bancada experimental. */
  controls: Environment;
  env: Environment;
  targets: Environment;
  health: Health;
  species: Record<FishSpeciesId, number>;
  pressures: Pressures;
  exposure: Exposure;
  /** Estresse térmico acumulado nos últimos 84 dias, em °C-semana. */
  degreeHeatingWeeks: number;
  /** Baldes diários usados para manter a janela móvel de 12 semanas do DHW. */
  thermalDose: ThermalDoseDay[];
  /** Concentração calculada de oxigênio dissolvido em mg/L (balanço de massa acoplado). */
  dissolvedOxygen: number;
  /** Concentração de Demanda Bioquímica de Oxigênio (CBOD remanescente) em mg O₂/L. */
  biochemicalOxygenDemand: number;
  /** Carbono inorgânico dissolvido (DIC) acumulado pela respiração microbiana integrada no tempo (µmol/kg). */
  respiratoryDicUmolKg?: number;
  /** Compartimento oceanográfico ativo na Baía de Todos-os-Santos. */
  sector: BtsSectorId;
  /** Regime de lançamento de efluente: carga diária contínua ou pulso de massa instantâneo. */
  sewageDischargeMode: 'continuous' | 'pulse';
  /** Provedor ou referência da condição inicial (ex: 'NOAA_CRW_OBSERVED' ou 'PADRAO_CALIBRADO'). */
  initialConditionSource?: string;
  overall: number;
  elapsedDays: number;
  speed: SimulationSpeed;
  paused: boolean;
  /** Indica se o recife já sofreu estresse/queda relevante (< 75%), necessário para validar restauração. */
  everDegraded: boolean;
  history: HistoryPoint[];
  firedMessages: Set<string>;
  /** Marcos disparados na simulação, em ordem cronológica. */
  events: Array<{ id: string; day: number }>;
  latestMessageId: string | null;
  /** Segundos reais restantes até o painel poder trocar de marco. */
  messageCooldown: number;
  /** Intervenções concretas de mitigação/recuperação ativas no cenário. */
  activeInterventions?: ActiveIntervention[];
  /** Massa acumulada de óleo superficial efetivamente recolhida por contenção e skimming (kg). */
  recoveredOilKg?: number;
  /** Idade acumulada da mancha de óleo atual em dias simulados para intemperismo físico. */
  oilSpillAgeDays?: number;
  /** Indicadores de fixação e sobrevivência de transplantes de corais quando ativos. */
  restoration?: CoralRestorationState;
}

export interface EducationalMessage {
  id: string;
  title: string;
  /** Selo epistemológico da informação. */
  badge?: EpistemologicalBadge;
  /** O que está acontecendo, em uma frase. */
  what: string;
  /** Por que acontece. */
  cause: string;
  /** O que muda no recife. */
  effect: string;
  /** Pergunta para o aluno formular uma hipótese. */
  ask: string;
  tone: 'alert' | 'positive' | 'neutral';
  matches: (state: SimulationState) => boolean;
}

export interface Indicator {
  id: string;
  label: string;
  display: string;
  value: number;
  unit: string;
  tone: 'healthy' | 'watch' | 'critical';
  note: string;
  badge?: EpistemologicalBadge;
  equation?: string;
  metadata?: ScientificMetadata;
}

export interface Challenge {
  id: string;
  title: string;
  brief: string;
  hint: string;
  /** Dias consecutivos que a condição precisa se manter. */
  windowDays: number;
  /** Avalia um dia do histórico. */
  holds: (point: HistoryPoint, state: SimulationState) => boolean;
}

export type MissionStepId =
  | 'intro'
  | 'hypothesis'
  | 'experiment'
  | 'solution'
  | 'conclusion';

export interface MissionHypothesisOption {
  id: string;
  label: string;
  isCorrectMechanism: boolean;
  explanation: string;
}

export interface MissionDefinition {
  id: string;
  title: string;
  subtitle: string;
  targetGrade: string;
  estimatedMinutes: number;
  question: string;
  hypotheses: MissionHypothesisOption[];
  focusFactor: ItemId;
  defaultControls: Partial<Environment>;
  targetLoad: number;
  solutionControls: Partial<Environment>;
  transferQuestion: string;
}

export interface MissionState {
  missionId: string;
  step: MissionStepId;
  selectedHypothesisId: string | null;
  customHypothesisText?: string;
  testedOrganicLoad?: number;
  solutionApplied?: boolean;
  completedAtDay?: number;
}
