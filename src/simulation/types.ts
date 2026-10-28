export type ItemId =
  | 'temperature'
  | 'ph'
  | 'microplastics'
  | 'oil'
  | 'sewage'
  | 'turbidity'
  | 'fishing'
  | 'recovery';

export type SimulationSpeed = 1 | 3 | 5 | 10;

export type EpistemologicalBadge =
  | 'Dado Local BTS'
  | 'Produto de Modelo'
  | 'Padrão Operacional'
  | 'Referência Laboratorial Externa'
  | 'Cenário Didático'
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
  /** Compartimento oceanográfico ativo na Baía de Todos-os-Santos. */
  sector: BtsSectorId;
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
