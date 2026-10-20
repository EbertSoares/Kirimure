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
    brief: 'Mantenha a carga de nitrogênio abaixo de 300 kg/dia e microplásticos até 100 kg, por 30 dias.',
    hint: 'Esgoto e plástico se somam. Reduza os dois ao mesmo tempo em vez de focar em um só.',
    windowDays: 30,
    holds: (point: HistoryPoint) =>
      point.sewage <= 300 && point.microplastics <= 100,
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
    title: 'Estabilizar o recife por 30 dias',
    brief: 'Depois de causar estresse, interrompa a queda e mantenha saúde geral de 70% por 30 dias.',
    hint: 'Estabilizar sobreviventes não recompõe a cobertura perdida. Recolonização leva anos e não ocorre neste experimento curto.',
    windowDays: 30,
    holds: (point: HistoryPoint) => point.overall >= 70,
  },
];

export function evaluateChallenge(challenge: Challenge, state: SimulationState): ChallengeProgress {
  const points: HistoryPoint[] = [];
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    if (!challenge.holds(state.history[index], state)) break;
    points.push(state.history[index]);
  }

  // Um ponto no dia zero não equivale a um dia completo. Usar a diferença de
  // tempo também evita o erro de +1 quando o histórico começa em zero.
  const daysHeld = points.length < 2
    ? 0
    : Math.max(0, points[0].day - points[points.length - 1].day);

  const degradedBefore = state.history.some((point) => point.overall < 70);
  const eligible = challenge.id !== 'restored-reef' || degradedBefore;

  const progress = eligible ? Math.min(1, daysHeld / challenge.windowDays) : 0;
  const status = !eligible
    ? 'pending'
    : daysHeld >= challenge.windowDays ? 'done' : daysHeld > 0 ? 'running' : 'pending';

  return { status, progress, daysHeld };
}

export function getChallenge(id: string | null) {
  return CHALLENGES.find((challenge) => challenge.id === id) ?? null;
}
