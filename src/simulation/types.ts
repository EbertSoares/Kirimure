export type ItemId = 'microplastics' | 'oil' | 'temperature' | 'ph';

export interface Environment {
  microplastics: number;
  oil: number;
  temperature: number;
  ph: number;
}

export interface Health {
  coral: number;
  fish: number;
}

export interface SimulationState {
  env: Environment;
  targets: Environment;
  health: Health;
  overall: number;
  firedMessages: Set<string>;
  latestMessageId: string | null;
}

export interface EducationalMessage {
  id: string;
  title: string;
  text: string;
  matches: (state: SimulationState) => boolean;
}
