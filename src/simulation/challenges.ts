import type { Challenge, HistoryPoint, SimulationState } from './types';

export interface ChallengeProgress {
  status: 'pending' | 'running' | 'done';
  /** Fração do tempo exigido já cumprido (0 a 1). */
  progress: number;
  daysHeld: number;
}

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'clean-water',
    title: 'Água limpa por 30 dias',
    brief: 'Mantenha esgoto abaixo de 15, turbidez até 10 e microplásticos até 10, por 30 dias seguidos.',
    hint: 'Esgoto e sedimento se somam. Reduza os dois ao mesmo tempo em vez de focar em um só.',
    windowDays: 30,
    holds: (_point: HistoryPoint, state: SimulationState) =>
      state.env.sewage <= 15 && state.env.turbidity <= 10 && state.env.microplastics <= 10,
  },
  {
    id: 'living-reef',
    title: 'Recife vivo por 45 dias',
    brief: 'Mantenha a saúde geral em 80% ou mais durante 45 dias seguidos.',
    hint: 'Comece pela temperatura e pelo pH: são os fatores que agem de forma mais lenta e acumulativa.',
    windowDays: 45,
    holds: (point: HistoryPoint) => point.overall >= 80,
  },
  {
    id: 'protected-fish',
    title: 'Peixes protegidos por 45 dias',
    brief: 'Com a pesca em até 40, mantenha a comunidade de peixes em 75% ou mais por 45 dias.',
    hint: 'O peixe-papagaio é o mais sensível à pesca. A recuperação ambiental ajuda a compensar.',
    windowDays: 45,
    holds: (point: HistoryPoint, state: SimulationState) =>
      point.fish >= 75 && state.env.fishing <= 40,
  },
  {
    id: 'restored-reef',
    title: 'Restaurar o recife em 30 dias',
    brief: 'Com recuperação ambiental em 50 ou mais, leve a saúde geral a 70% e mantenha por 30 dias.',
    hint: 'A proteção reduz o dano e aumenta o limite de estresse que o recife tolera antes de piorar.',
    windowDays: 30,
    holds: (point: HistoryPoint, state: SimulationState) =>
      state.env.recovery >= 50 && point.overall >= 70,
  },
];

export function evaluateChallenge(challenge: Challenge, state: SimulationState): ChallengeProgress {
  let daysHeld = 0;
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    if (!challenge.holds(state.history[index], state)) break;
    daysHeld += 1;
  }

  const progress = Math.min(1, daysHeld / challenge.windowDays);
  const status = daysHeld >= challenge.windowDays ? 'done' : daysHeld > 0 ? 'running' : 'pending';

  return { status, progress, daysHeld };
}

export function getChallenge(id: string | null) {
  return CHALLENGES.find((challenge) => challenge.id === id) ?? null;
}
