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
    brief: 'Mantenha esgoto abaixo de 15 e microplásticos até 10, por 30 dias seguidos.',
    hint: 'Esgoto e plástico se somam. Reduza os dois ao mesmo tempo em vez de focar em um só.',
    windowDays: 30,
    holds: (_point: HistoryPoint, state: SimulationState) =>
      state.env.sewage <= 15 && state.env.microplastics <= 10,
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
    brief: 'Mantenha a comunidade de peixes em 75% ou mais por 45 dias seguidos.',
    hint: 'O peixe-papagaio é o mais sensível às mudanças da água. Mantenha o estresse baixo para a comunidade se recuperar.',
    windowDays: 45,
    holds: (point: HistoryPoint) => point.fish >= 75,
  },
  {
    id: 'restored-reef',
    title: 'Restaurar o recife em 30 dias',
    brief: 'Leve a saúde geral a 70% e mantenha por 30 dias seguidos.',
    hint: 'Recuperar é mais lento do que degradar: devolva os fatores para perto do natural e espere.',
    windowDays: 30,
    holds: (point: HistoryPoint) => point.overall >= 70,
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
