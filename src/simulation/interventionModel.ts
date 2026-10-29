import { BTS_SECTORS, PARAMETERS } from './config';
import { calculateOilFateBudget } from './contaminants';
import {
  INTERVENTIONS,
  type ActiveIntervention,
  type InterventionDefinition,
  type InterventionId,
} from './interventions';
import type { BtsSectorDefinition, BtsSectorId, Environment, ItemId, SimulationState } from './types';

export function isInterventionActive(
  interventions: readonly ActiveIntervention[] | undefined,
  id: InterventionId,
): boolean {
  if (!interventions) return false;
  return interventions.some((item) => item.id === id && item.status === 'active');
}

export function getInterventionIntensity(
  interventions: readonly ActiveIntervention[] | undefined,
  id: InterventionId,
): number {
  if (!interventions) return 0;
  const match = interventions.find((item) => item.id === id && item.status === 'active');
  return match ? Math.max(0, Math.min(1, match.intensity)) : 0;
}

/**
 * Calcula os alvos ambientais efetivos após a aplicação de intervenções de redução de aporte.
 * Intervenções atuam sobre novos aportes (fluxos de entrada), não sobre o estoque já acumulado.
 */
export function computeEffectiveTargets(
  rawTargets: Environment,
  interventions: readonly ActiveIntervention[] | undefined,
): Environment {
  const effective = { ...rawTargets };

  // 1. Tratar esgoto: reduz carga contínua de DBO₅ lançada (eficiência de remoção de até 75% no cenário)
  const sewageIntensity = getInterventionIntensity(interventions, 'wastewaterTreatment');
  if (sewageIntensity > 0 && effective.sewage > 0) {
    const inputReductionFactor = 1 - 0.75 * sewageIntensity;
    effective.sewage = rawTargets.sewage * inputReductionFactor;
  }

  // 2. Interceptar microplásticos: reduz o aporte futuro na drenagem/efluentes (até 65% retido na fonte)
  const mpIntensity = getInterventionIntensity(interventions, 'microplasticInterception');
  if (mpIntensity > 0 && effective.microplastics > 0) {
    const inputReductionFactor = 1 - 0.65 * mpIntensity;
    effective.microplastics = rawTargets.microplastics * inputReductionFactor;
  }

  // 3. Controlar erosão: reduz nova entrada de sedimentos em suspensão (até 60% retido a montante)
  const erosionIntensity = getInterventionIntensity(interventions, 'erosionControl');
  if (erosionIntensity > 0 && effective.turbidity > 0) {
    const inputReductionFactor = 1 - 0.60 * erosionIntensity;
    effective.turbidity = rawTargets.turbidity * inputReductionFactor;
  }

  // Ações conceituais (coralRestoration, co2Mitigation) não alteram variáveis numéricas
  return effective;
}

/**
 * Integra as variáveis de estado do ambiente diferenciando o acúmulo de novos aportes
 * da depuração do estoque já disperso na baía.
 *
 * Microplásticos e sedimentos já presentes na água não caem abruptamente; seu declínio
 * é governado pelo tempo de residência hidrodinâmica do setor e pela deposição.
 */
export function stepEnvironmentalStocks(
  currentEnv: Environment,
  effectiveTargets: Environment,
  interventions: readonly ActiveIntervention[] | undefined,
  sector: BtsSectorDefinition,
  dtDays: number,
): Environment {
  const nextEnv = { ...currentEnv };
  const factorKeys = Object.keys(currentEnv) as ItemId[];

  for (const id of factorKeys) {
    const target = effectiveTargets[id];
    const current = currentEnv[id];

    // Se o alvo for menor que o estoque atual e houver intervenção de retenção ativa,
    // o estoque decai no tempo hidrodinâmico real da baía, não em poucos dias.
    let effectiveTau = PARAMETERS.tauDays[id];

    if (id === 'microplastics' && target < current) {
      // Depuração por lavagem de maré: tempo de descarga do setor (38 a 75 dias)
      const mpInterceptionActive = isInterventionActive(interventions, 'microplasticInterception');
      if (mpInterceptionActive) {
        effectiveTau = Math.max(PARAMETERS.tauDays.microplastics, sector.dischargeDays);
      }
    } else if (id === 'turbidity' && target < current) {
      // Depuração de sedimentos por decantação e troca estuarina
      const erosionControlActive = isInterventionActive(interventions, 'erosionControl');
      if (erosionControlActive) {
        effectiveTau = Math.max(PARAMETERS.tauDays.turbidity, sector.dischargeDays * 0.35);
      }
    }

    const factor = 1 - Math.exp(-dtDays / effectiveTau);
    nextEnv[id] = current + (target - current) * factor;
  }

  return nextEnv;
}

/**
 * Simula a contenção e recolhimento mecânico (skimming) do filme superficial de óleo.
 *
 * Princípios físicos (NOAA Ocean Service / WebGNOME):
 * - Skimmers atuam exclusivamente sobre o filme superficial acessível (surfaceFilmKg);
 * - Não removem HPAs já dissolvidos (tPAH50), gotículas dispersas ou óleo sedimentado;
 * - A taxa diária de recolhimento depende da mobilização e espessura da mancha;
 * - O óleo recuperado é acumulado na variável `recoveredOilKg`.
 */
export function stepOilContainmentSkimming(
  envOilKg: number,
  currentRecoveredKg: number,
  spillAgeDays: number,
  sectorId: BtsSectorId,
  interventions: readonly ActiveIntervention[] | undefined,
  dtDays: number,
): { nextRecoveredKg: number; containmentActive: boolean } {
  const skimmingIntensity = getInterventionIntensity(interventions, 'oilContainmentSkimming');
  const containmentActive = skimmingIntensity > 0;

  if (!containmentActive || envOilKg <= 0) {
    return { nextRecoveredKg: currentRecoveredKg, containmentActive };
  }

  // Orçamento físico atual com o que já foi recolhido previamente
  const budget = calculateOilFateBudget(
    envOilKg,
    sectorId,
    Math.max(0.1, spillAgeDays),
    true,
    currentRecoveredKg,
    true,
  );

  // Skimming só atua se houver filme superficial mensurável (película > 2 kg e espessura > 0.05 µm)
  const recoverableSurfaceKg = Math.max(0, budget.surfaceFilmKg - 2);
  if (recoverableSurfaceKg <= 0) {
    return { nextRecoveredKg: currentRecoveredKg, containmentActive };
  }

  // Taxa operacional de recolhimento: k = 0.85 dia⁻¹ sob intensidade máxima
  const operationalRate = 0.85 * skimmingIntensity;
  const deltaRecovered = Math.min(recoverableSurfaceKg, recoverableSurfaceKg * operationalRate * dtDays);
  const nextRecoveredKg = Math.max(0, currentRecoveredKg + deltaRecovered);

  return { nextRecoveredKg, containmentActive };
}

/**
 * Calcula a pressão pesqueira efetiva sobre as espécies considerando áreas de exclusão / defeso.
 * A área protegida reduz a mortalidade pesqueira diretamente no cenário, sem conceder bônus geral de saúde.
 */
export function computeEffectiveFishingPressure(
  rawFishing: number,
  interventions: readonly ActiveIntervention[] | undefined,
): number {
  const mpaIntensity = getInterventionIntensity(interventions, 'marineProtectedArea');
  if (mpaIntensity <= 0 || rawFishing <= 0) {
    return rawFishing;
  }
  // Redução de até 75% da mortalidade pesqueira dentro da área protegida
  return rawFishing * (1 - 0.75 * mpaIntensity);
}

/**
 * Sugere intervenções pertinentes ao cenário atual com base nas pressões ativas.
 * Retorna uma lista de prioritárias (máx. 3 recomendadas) e as demais como secundárias/conceituais.
 */
export function getRecommendedInterventions(state: SimulationState): {
  recommended: InterventionDefinition[];
  others: InterventionDefinition[];
} {
  const activeIds = new Set(
    (state.activeInterventions ?? [])
      .filter((item) => item.status === 'active')
      .map((item) => item.id),
  );

  const sector = BTS_SECTORS.find((s) => s.id === state.sector) ?? BTS_SECTORS[0];
  const isSewageActive = state.controls.sewage > 0 || state.biochemicalOxygenDemand > 0.1 || state.dissolvedOxygen < 5.2;
  const isOilActive = state.controls.oil > 0 || state.env.oil > 0.5;
  const isMicroplasticsActive = state.controls.microplastics > 0 || state.env.microplastics > 100;
  const isTurbidityActive = state.controls.turbidity > 0 || state.env.turbidity > 1;
  const isFishingActive = state.controls.fishing > 0 || state.env.fishing > 0.5;
  const isWarmingActive = state.controls.temperature > sector.baselineTemperature || state.degreeHeatingWeeks > 0.2;
  const isAcidActive = state.controls.ph < 8.1;
  const isCoralDegraded = state.health.coral < 90 || state.everDegraded;

  const scores: Record<InterventionId, number> = {
    wastewaterTreatment: isSewageActive ? 10 : 0,
    oilContainmentSkimming: isOilActive ? 10 : 0,
    microplasticInterception: isMicroplasticsActive ? 9 : 0,
    erosionControl: isTurbidityActive ? 8 : 0,
    marineProtectedArea: isFishingActive ? 7 : 0,
    coralRestoration: isCoralDegraded ? 4 : 0,
    co2Mitigation: isWarmingActive || isAcidActive ? 3 : 0,
  };

  // Garante que intervenções já ativas pelo usuário fiquem no topo
  for (const id of activeIds) {
    scores[id] = (scores[id] ?? 0) + 100;
  }

  const sorted = [...INTERVENTIONS].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const hasAnyPressure = Object.values(scores).some((val) => val > 0);

  if (!hasAnyPressure) {
    return {
      recommended: [],
      others: [...INTERVENTIONS],
    };
  }

  const recommended = sorted.filter((item) => (scores[item.id] ?? 0) > 0).slice(0, 3);
  const recIds = new Set(recommended.map((item) => item.id));
  const others = sorted.filter((item) => !recIds.has(item.id));

  return { recommended, others };
}
