import type { SimulationSpeed } from './types';

export const SIMULATION_SPEEDS: readonly SimulationSpeed[] = [1, 3, 5, 10];

/** Ano médio gregoriano e mês médio didático para durações simuladas. */
const DAY_PER_YEAR = 365.2425;
const DAY_PER_MONTH = DAY_PER_YEAR / 12; // 30.436875 dias

const plural = (n: number, singular: string, pluralForm: string) =>
  `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : pluralForm}`;

/**
 * Formata durações temporais de marcos e horizontes ecológicos em anos, meses e dias
 * sem arredondar para decimais confusos (ex.: "9 anos, 2 meses" em vez de "9,2 anos").
 * Utiliza no máximo as 2 maiores unidades não nulas para concisão na tela.
 */
export function formatSimulatedDuration(days: number): string {
  let remaining = Math.max(0, days);
  if (remaining < 1) {
    return '0 dias';
  }

  const years = Math.floor(remaining / DAY_PER_YEAR);
  remaining -= years * DAY_PER_YEAR;

  const months = Math.floor(remaining / DAY_PER_MONTH);
  remaining -= months * DAY_PER_MONTH;

  const wholeDays = Math.floor(remaining);

  const parts: string[] = [];
  if (years > 0) parts.push(plural(years, 'ano', 'anos'));
  if (months > 0 && parts.length < 2) parts.push(plural(months, 'mês', 'meses'));
  if (wholeDays > 0 && parts.length < 2) parts.push(plural(wholeDays, 'dia', 'dias'));

  return parts.length ? parts.join(', ') : '0 dias';
}

/**
 * Formata o relógio principal do laboratório em dias, meses ou anos.
 */
export function formatSimulatedTime(days: number): string {
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
