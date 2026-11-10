import { BASELINE, BTS_SECTORS, PARAMETERS } from './config';
import { calculateCarbonateSystem } from './carbonate';
import {
  calculateDeoxygenationRate,
  calculateReaerationRate,
  calculateWeissOxygenSaturation,
  convertBOD5ToUltimateBOD,
} from './oxygen';
import type { BtsSectorId, Environment } from './types';

/**
 * Módulo de Casos de Referência e Análise de Sensibilidade Paramétrica (Prioridade 2).
 *
 * Quantifica como incertezas em parâmetros cinéticos e hidrodinâmicos de caixa
 * (taxa de desoxigenação kd, demanda bentônica SOD, tempo de residência tau e volume de mistura)
 * propagam-se para o Oxigênio Dissolvido de equilíbrio no modelo acoplado da BTS.
 */

export interface ParameterSensitivityResult {
  parameterId: 'deoxygenationRate' | 'sodRate' | 'dischargeDays' | 'mixingVolumeM3';
  parameterLabel: string;
  baselineParameterValue: number;
  perturbationFraction: number;
  baselineOxygenMgL: number;
  lowParameterOxygenMgL: number;
  highParameterOxygenMgL: number;
  outputSwingMgL: number;
  /** Índice adimensional de sensibilidade normalizada: (ΔY / Y0) / (Δθ / θ0). */
  normalizedSensitivityIndex: number;
}

export interface BtsSectorThermodynamicReference {
  sectorId: BtsSectorId;
  label: string;
  temperatureDegC: number;
  salinityPsu: number;
  residenceDays: number;
  weissSaturationMgL: number;
  omegaAragoniteBaseline: number;
  pCO2BaselineUatm: number;
}

/**
 * Avalia o oxigênio dissolvido estacionário sob parâmetros cinéticos/hidrodinâmicos
 * explicitamente perturbados, sem alterar as constantes globais da aplicação.
 */
function evaluateSteadyStateOxygenWithOverrides(
  env: Environment,
  sectorId: BtsSectorId,
  overrides: {
    kd20?: number;
    sodRate?: number;
    dischargeDays?: number;
    mixingVolumeM3?: number;
    algaeCoverage?: number;
  } = {},
): number {
  const sector = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];
  const kd20 = overrides.kd20 ?? PARAMETERS.oxygen.deoxygenationRate;
  const sodRate = overrides.sodRate ?? PARAMETERS.oxygen.sodRate;
  const dischargeDays = Math.max(0.5, overrides.dischargeDays ?? sector.dischargeDays);
  const mixingVolumeM3 = Math.max(1e5, overrides.mixingVolumeM3 ?? sector.mixingVolumeM3);
  const algaeCoverage = overrides.algaeCoverage ?? 15;

  const saturation = calculateWeissOxygenSaturation(env.temperature, sector.baselineSalinity);
  const ka = calculateReaerationRate(sector.meanWindSpeed, sector.depthMeters, env.temperature);

  // Correção térmica de Arrhenius com kd20 customizável
  const baseKdRatio = kd20 / PARAMETERS.oxygen.deoxygenationRate;
  const kd = calculateDeoxygenationRate(env.temperature) * baseKdRatio;
  const hydroExportRate = 1 / dischargeDays;

  let bodEq = 0;
  if (env.sewage > 0) {
    // Escala estequiométrica CBODu consistente com kd20 perturbado
    const fraction5d = 1 - Math.exp(-5 * kd20);
    const cbodDailyKg = fraction5d > 0 ? env.sewage / fraction5d : convertBOD5ToUltimateBOD(env.sewage);
    const bodInputDailyMgL = (cbodDailyKg * 1000) / mixingVolumeM3;
    bodEq = bodInputDailyMgL / (kd + hydroExportRate);
  }

  const sodFlux = sodRate / sector.depthMeters;
  const lightBlock = Math.min(1, (env.turbidity / 100) * 0.7 + (env.oil > 0 ? 0.35 : 0));
  const photosynthesis = 0.5 * (1 - lightBlock);
  const respiration = 0.35 + (algaeCoverage / 100) * 0.4;
  const metabolicFlux = photosynthesis - respiration;

  const oxygenDeficit = (kd * bodEq + sodFlux - metabolicFlux) / ka;
  return Math.max(0.05, Math.min(saturation * 1.25, saturation - oxygenDeficit));
}

/**
 * Executa análise local de sensibilidade paramétrica (±fração, padrão ±25%) sobre os
 * parâmetros incertos do balanço de oxigênio em um cenário de carga orgânica contínua.
 */
export function evaluateParametricSensitivity(
  sectorId: BtsSectorId = 'frades',
  continuousSewageKgDay = 2500,
  perturbationFraction = 0.25,
): ParameterSensitivityResult[] {
  const sector = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];
  const env: Environment = {
    ...BASELINE,
    temperature: sector.baselineTemperature,
    sewage: continuousSewageKgDay,
  };

  const baselineDo = evaluateSteadyStateOxygenWithOverrides(env, sectorId);

  const specs: ReadonlyArray<{
    id: ParameterSensitivityResult['parameterId'];
    label: string;
    baseVal: number;
    apply: (val: number) => number;
  }> = [
    {
      id: 'deoxygenationRate',
      label: 'Taxa de desoxigenação bacteriana (kd20)',
      baseVal: PARAMETERS.oxygen.deoxygenationRate,
      apply: (val) => evaluateSteadyStateOxygenWithOverrides(env, sectorId, { kd20: val }),
    },
    {
      id: 'sodRate',
      label: 'Demanda bentônica do sedimento (SOD)',
      baseVal: PARAMETERS.oxygen.sodRate,
      apply: (val) => evaluateSteadyStateOxygenWithOverrides(env, sectorId, { sodRate: val }),
    },
    {
      id: 'dischargeDays',
      label: 'Tempo de residência hidrodinâmica (tau)',
      baseVal: sector.dischargeDays,
      apply: (val) => evaluateSteadyStateOxygenWithOverrides(env, sectorId, { dischargeDays: val }),
    },
    {
      id: 'mixingVolumeM3',
      label: 'Volume efetivo da caixa de mistura (V)',
      baseVal: sector.mixingVolumeM3,
      apply: (val) => evaluateSteadyStateOxygenWithOverrides(env, sectorId, { mixingVolumeM3: val }),
    },
  ];

  return specs.map((spec) => {
    const lowVal = spec.baseVal * (1 - perturbationFraction);
    const highVal = spec.baseVal * (1 + perturbationFraction);
    const lowDo = spec.apply(lowVal);
    const highDo = spec.apply(highVal);
    const deltaY = highDo - lowDo;
    const relativeParamSpan = 2 * perturbationFraction;
    const normalizedSensitivityIndex = baselineDo > 0
      ? (deltaY / baselineDo) / relativeParamSpan
      : 0;

    return {
      parameterId: spec.id,
      parameterLabel: spec.label,
      baselineParameterValue: spec.baseVal,
      perturbationFraction,
      baselineOxygenMgL: parseFloat(baselineDo.toFixed(3)),
      lowParameterOxygenMgL: parseFloat(lowDo.toFixed(3)),
      highParameterOxygenMgL: parseFloat(highDo.toFixed(3)),
      outputSwingMgL: parseFloat(Math.abs(deltaY).toFixed(3)),
      normalizedSensitivityIndex: parseFloat(normalizedSensitivityIndex.toFixed(3)),
    };
  });
}

/**
 * Gera os casos termodinâmicos e carbonáticos de referência para os três compartimentos
 * modelados na Baía de Todos-os-Santos.
 */
export function buildBtsThermodynamicReferenceCases(): BtsSectorThermodynamicReference[] {
  return BTS_SECTORS.map((sector) => {
    const scaledTa = 2350 * (sector.baselineSalinity / 35.0);
    const weissSaturationMgL = calculateWeissOxygenSaturation(
      sector.baselineTemperature,
      sector.baselineSalinity,
    );
    const carb = calculateCarbonateSystem(
      BASELINE.ph,
      scaledTa,
      sector.baselineTemperature,
      sector.baselineSalinity,
    );

    return {
      sectorId: sector.id,
      label: sector.label,
      temperatureDegC: sector.baselineTemperature,
      salinityPsu: sector.baselineSalinity,
      residenceDays: sector.dischargeDays,
      weissSaturationMgL: parseFloat(weissSaturationMgL.toFixed(2)),
      omegaAragoniteBaseline: carb.omegaAragonite,
      pCO2BaselineUatm: carb.pCO2Uatm,
    };
  });
}
