export type ItemId = 'microplastics' | 'oil' | 'temperature' | 'ph';
export type SimulationSpeed = 1 | 2 | 3 | 5 | 10;

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

export interface Exposure {
  thermal: number;
  acidification: number;
  oil: number;
  microplastics: number;
}

export interface SimulationState {
  env: Environment;
  targets: Environment;
  health: Health;
  exposure: Exposure;
  overall: number;
  elapsedDays: number;
  speed: SimulationSpeed;
  paused: boolean;
  firedMessages: Set<string>;
  latestMessageId: string | null;
}

export interface EducationalMessage {
  id: string;
  title: string;
  text: string;
  matches: (state: SimulationState) => boolean;
}
