import { BTS_SECTORS, PARAMETERS } from './config';
import { calculateOilFateBudget } from './contaminants';
import {
  INTERVENTIONS,
  type ActiveIntervention,
  type InterventionDefinition,
  type InterventionId,
} from './interventions';
import type {
  BtsSectorDefinition,
  BtsSectorId,
  CoralRestorationState,
  Environment,
  ItemId,
  SimulationState,
} from './types';

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

  // Ações globais/climáticas (co2Mitigation) não alteram diretamente forçantes locais no MVP
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
 * Modela a adequação ambiental e a resposta biofísica de fragmentos de corais
 * introduzidos em programas de restauração e transplante.
 */
export function calculateCoralEnvironmentalSuitability(
  temperature: number,
  dhw: number,
  dissolvedOxygen: number,
  ph: number,
  turbidity: number,
  oilKg: number,
  _baselineTemperature: number,
): {
  suitability: number;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Oxigênio dissolvido: ideal >= 5.0 mg/L, estresse < 4.0, letal < 2.5
  let doScore = 1;
  if (dissolvedOxygen < 5.0) {
    doScore = Math.max(0, Math.min(1, (dissolvedOxygen - 2.5) / 2.5));
    if (doScore < 0.6) {
      reasons.push(dissolvedOxygen < 3.5 ? 'hipóxia severa' : 'baixo oxigênio dissolvido');
    }
  }

  // Estresse térmico: letal com DHW elevado ou temperatura muito acima do limiar de branqueamento
  let tempScore = 1;
  if (dhw > 0 || temperature > 28.5) {
    const dhwPenalty = Math.max(0, 1 - dhw / 6);
    const sstPenalty = Math.max(0, 1 - Math.max(0, temperature - 28.5) / 2.5);
    tempScore = Math.max(0, Math.min(1, dhwPenalty * sstPenalty));
    if (tempScore < 0.6) {
      reasons.push(dhw >= 4 ? 'onda de calor / branqueamento' : 'água excessivamente quente');
    }
  }

  // Acidificação (pH): ideal >= 8.05; estresse < 7.9
  let phScore = 1;
  if (ph < 8.0) {
    phScore = Math.max(0, Math.min(1, (ph - 7.5) / 0.5));
    if (phScore < 0.6) {
      reasons.push('acidificação desfavorável à calcificação');
    }
  }

  // Turbidez (sedimentação e perda de luz fotossintética): ideal <= 8%, estresse > 15%, letal > 40%
  let turbScore = 1;
  if (turbidity > 8) {
    turbScore = Math.max(0, Math.min(1, 1 - (turbidity - 8) / 32));
    if (turbScore < 0.6) {
      reasons.push('sedimentação excessiva / turbidez');
    }
  }

  // Óleo: toxicidade aguda e recobrimento por hidrocarbonetos
  let oilScore = 1;
  if (oilKg > 2) {
    oilScore = Math.max(0, Math.min(1, 1 - oilKg / 30));
    if (oilScore < 0.6) {
      reasons.push('contaminação por óleo');
    }
  }

  const suitability = Math.max(0, Math.min(1, doScore * tempScore * phScore * turbScore * oilScore));

  return { suitability, reasons };
}

/**
 * Modela o estabelecimento e a sobrevivência de colônias de corais transplantadas.
 *
 * Princípios científicos e ecológicos:
 * 1. Não adiciona bônus arbitrário à saúde do recife nativo (`health.coral`).
 * 2. Transplantes são organismos vivos vulneráveis: sua sobrevivência depende
 *    da adequação ambiental (OD >= 5 mg/L, SST abaixo do limiar de branqueamento,
 *    DHW baixo, pH favorável, água límpida e ausência de óleo).
 * 3. Se as condições ambientais forem desfavoráveis (hipóxia, onda de calor, óleo ou turbidez),
 *    a sobrevivência cai drasticamente e as colônias transplantadas morrem.
 * 4. Sob condições favoráveis, as colônias sobrevivem e gradualmente se estabelecem no substrato,
 *    incrementando a cobertura coralina restaurada.
 */
export function stepCoralRestoration(
  currentRestoration: CoralRestorationState | undefined,
  interventions: readonly ActiveIntervention[] | undefined,
  env: Environment,
  dhw: number,
  dissolvedOxygen: number,
  sector: BtsSectorDefinition,
  dtDays: number,
): CoralRestorationState {
  const intensity = getInterventionIntensity(interventions, 'coralRestoration');
  const isActive = intensity > 0;

  const prev = currentRestoration ?? {
    introducedColonies: 0,
    establishedColonies: 0,
    survivingColonies: 0,
    transplantSurvivalRate: 0,
    restoredCoverPercent: 0,
    environmentalSuitability: 1,
  };

  if (!isActive) {
    if (prev.introducedColonies <= 0) {
      return prev;
    }
  }

  const { suitability } = calculateCoralEnvironmentalSuitability(
    env.temperature,
    dhw,
    dissolvedOxygen,
    env.ph,
    env.turbidity,
    env.oil,
    sector.baselineTemperature,
  );

  // Capacidade de transplante proporcional à intensidade: até 1200 colônias
  const targetColonies = Math.round(1200 * intensity);

  // Taxa de introdução de novos fragmentos
  let introduced = prev.introducedColonies;
  if (isActive && introduced < targetColonies) {
    const introductionRate = 60 * dtDays;
    introduced = Math.min(targetColonies, introduced + introductionRate);
  }

  // Inicialização ou adição de novas colônias
  let surviving = prev.survivingColonies;
  if (introduced > 0 && surviving < introduced && prev.survivingColonies === 0) {
    surviving = introduced;
  } else if (introduced > prev.introducedColonies) {
    surviving += (introduced - prev.introducedColonies);
  }

  // Aplicação da taxa de mortalidade dependente do ambiente
  const baseMortalityRate = 0.002; // mortalidade basal natural (~0.2% por dia)
  const stressMortalityRate = 0.15 * Math.pow(1 - suitability, 2);
  const totalMortalityRate = baseMortalityRate + stressMortalityRate;

  surviving = Math.max(0, surviving * Math.exp(-totalMortalityRate * dtDays));
  surviving = Math.min(introduced, surviving);

  // Estabelecimento no substrato calcário
  let established = prev.establishedColonies;
  if (suitability >= 0.6) {
    const establishmentRate = 0.03 * suitability * dtDays;
    const potentialEstablished = Math.min(surviving, established + (surviving - established) * establishmentRate);
    established = Math.max(0, potentialEstablished);
  } else {
    established = Math.min(surviving, established * Math.exp(-stressMortalityRate * dtDays));
  }

  const transplantSurvivalRate = introduced > 0 ? (surviving / introduced) * 100 : 0;
  const restoredCoverPercent = Math.min(18, established * 0.0125);

  return {
    introducedColonies: Math.round(introduced),
    establishedColonies: Math.round(established),
    survivingColonies: Math.round(surviving),
    transplantSurvivalRate: Number(transplantSurvivalRate.toFixed(1)),
    restoredCoverPercent: Number(restoredCoverPercent.toFixed(1)),
    environmentalSuitability: Number(suitability.toFixed(2)),
  };
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
