import type { SimulationSpeed } from './types';

export const SIMULATION_SPEEDS: readonly SimulationSpeed[] = [1, 3, 5, 10];

const plural = (value: number, singular: string, multiple: string) =>
  `${value.toLocaleString('pt-BR')} ${value === 1 ? singular : multiple}`;

export function formatSimulatedTime(days: number) {
  const safeDays = Math.max(0, days);

  if (safeDays < 45) {
    return plural(Math.max(0, Math.round(safeDays)), 'dia', 'dias');
  }

  if (safeDays < 365) {
    const months = Number((safeDays / 30.4375).toFixed(1));
    return plural(months, 'mês', 'meses');
  }

  const years = Number((safeDays / 365.25).toFixed(1));
  return plural(years, 'ano', 'anos');
}
