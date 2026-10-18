export type ItemId =
  | 'temperature'
  | 'ph'
  | 'microplastics'
  | 'oil'
  | 'sewage'
  | 'turbidity'
  | 'fishing'
  | 'recovery';

export type SimulationSpeed = 1 | 2 | 3 | 5 | 10;

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
}

export interface SimulationState {
  env: Environment;
  targets: Environment;
  health: Health;
  species: Record<FishSpeciesId, number>;
  pressures: Pressures;
  exposure: Exposure;
  overall: number;
  elapsedDays: number;
  speed: SimulationSpeed;
  paused: boolean;
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
