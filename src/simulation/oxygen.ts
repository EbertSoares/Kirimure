import { PARAMETERS, BTS_SECTORS } from './config';
import type { BtsSectorId, Environment, EpistemologicalBadge, ScientificMetadata } from './types';

/**
 * Módulo de Oxigênio Dissolvido (OD) e Demanda Bioquímica de Oxigênio (DBO).
 *
 * Implementa balanço acoplado de transporte e cinética de primeira ordem:
 * - Solubilidade de equilíbrio ar-mar segundo Weiss (1970);
 * - Reaeração superficial ar-mar dependente de vento e profundidade;
 * - Oxidação bacteriana da DBO com correção térmica de Arrhenius;
 * - Demanda bentônica de oxigênio do sedimento (SOD);
 * - Saldo metabólico fotossíntese/respiração atenuado por turbidez e óleo.
 */

export type OxygenCategory =
  | 'normoxia'
  | 'respiratory_stress'
  | 'hypoxia'
  | 'severe_hypoxia'
  | 'anoxia';

export interface OxygenStatus {
  category: OxygenCategory;
  label: string;
  tone: 'healthy' | 'watch' | 'critical';
  description: string;
  badge: EpistemologicalBadge;
}

/**
 * Calcula a concentração de saturação de oxigênio dissolvido (Cs) em mg O₂/L
 * segundo a formulação oceanográfica de Weiss (1970).
 *
 * @param temperature Temperatura da água em °C.
 * @param salinity Salinidade prática (PSU).
 * @returns Concentração de saturação em mg/L.
 */
export function calculateWeissOxygenSaturation(temperature: number, salinity = 35.0): number {
  const tk = temperature + 273.15;
  const tk100 = tk / 100;
  const invTk100 = 100 / tk;

  // Constantes de Weiss (1970) para volume em mL O2 / L
  const A1 = -173.4292;
  const A2 = 249.6339;
  const A3 = 143.3483;
  const A4 = -21.8492;
  const B1 = -0.033096;
  const B2 = 0.014259;
  const B3 = -0.0017;

  const lnC =
    A1 +
    A2 * invTk100 +
    A3 * Math.log(tk100) +
    A4 * tk100 +
    salinity * (B1 + B2 * tk100 + B3 * tk100 * tk100);

  const mlPerLiter = Math.exp(lnC);
  // Conversão de mL/L para mg/L (densidade do O2 a STP = 1.42903 mg/mL)
  return mlPerLiter * 1.42903;
}

/**
 * Coeficiente de reaeração superficial ar-mar (ka) em dia^-1
 * baseado no vento (m/s), profundidade (m) e temperatura (°C).
 */
export function calculateReaerationRate(
  windSpeed = 4.0,
  depthMeters = 8.0,
  temperature = 26.8,
): number {
  const w = Math.max(0.1, windSpeed);
  const h = Math.max(0.5, depthMeters);
  const baseKa = (0.728 * Math.sqrt(w) - 0.317 * w + 0.0372 * w * w) / h;
  const tempCorrection = Math.pow(PARAMETERS.oxygen.thetaReaeration, temperature - 20);
  return Math.max(0.05, baseKa * tempCorrection);
}

/**
 * Coeficiente cinético de desoxigenação bacteriana (kd) em dia^-1
 * corrigido pela equação de Arrhenius para a temperatura do compartimento.
 */
export function calculateDeoxygenationRate(temperature = 26.8): number {
  const base = PARAMETERS.oxygen.deoxygenationRate; // 0.12 d^-1 a 20 °C
  const tempCorrection = Math.pow(PARAMETERS.oxygen.thetaDeoxygenation, temperature - 20);
  return base * tempCorrection;
}

/**
 * Classificação limnológica/oceanográfica rigorosa do oxigênio dissolvido
 * [Padrão US EPA / Resolução CONAMA 357].
 */
export function classifyDissolvedOxygen(dissolvedOxygen: number): OxygenStatus {
  if (dissolvedOxygen >= 5.0) {
    return {
      category: 'normoxia',
      label: 'Normóxia / Adequado',
      tone: 'healthy',
      description: 'Condição adequada para manutenção da ictiofauna e calcificação recifal plena.',
      badge: 'Padrão Operacional',
    };
  }
  if (dissolvedOxygen >= 3.0) {
    return {
      category: 'respiratory_stress',
      label: 'Estresse Respiratório',
      tone: 'watch',
      description: 'Redução da atividade metabólica e motora de peixes; retração parcial de pólipos.',
      badge: 'Padrão Operacional',
    };
  }
  if (dissolvedOxygen >= 2.0) {
    return {
      category: 'hypoxia',
      label: 'Hipóxia',
      tone: 'critical',
      description: 'Fuga de espécies móveis; perda de equilíbrio e estresse agudo em peixes sensíveis.',
      badge: 'Padrão Operacional',
    };
  }
  if (dissolvedOxygen >= 0.2) {
    return {
      category: 'severe_hypoxia',
      label: 'Hipóxia Severa',
      tone: 'critical',
      description: 'Risco crítico de asfixia e mortalidade sustentada; necrose de tecidos coralinos.',
      badge: 'Padrão Operacional',
    };
  }
  return {
    category: 'anoxia',
    label: 'Anóxia',
    tone: 'critical',
    description: 'Ausência de oxigênio dissolvido livre; colapso imediato da vida aeróbia.',
    badge: 'Padrão Operacional',
  };
}

export interface OxygenKineticsStep {
  nextDo: number;
  nextBod: number;
  saturation: number;
  reaerationFlux: number;
  bodDeoxFlux: number;
  sodFlux: number;
  metabolicFlux: number;
}

/**
 * Passo de integração do sistema acoplado DBO/OD para um intervalo dt (dias).
 */
export function integrateOxygenKinetics(
  currentDo: number,
  currentBod: number,
  env: Environment,
  sectorId: BtsSectorId,
  dtDays: number,
  algaeCoverage = 15,
): OxygenKineticsStep {
  const sector = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];
  const saturation = calculateWeissOxygenSaturation(env.temperature, sector.baselineSalinity);

  const ka = calculateReaerationRate(sector.meanWindSpeed, sector.depthMeters, env.temperature);
  const kd = calculateDeoxygenationRate(env.temperature);

  // Aporte diário de carga orgânica diluído no volume do compartimento (mg O2 / L / dia)
  // Massa de DBO em kg convertida para mg: kg * 1e6 mg / (mixingVolumeM3 * 1000 L) = kg / mixingVolumeM3 * 1000
  // Carga ativa do cenário: se esgoto > 0, taxa de entrada contínua
  const bodInputDailyMgL = env.sewage > 0
    ? (env.sewage * 1000) / sector.mixingVolumeM3
    : 0;

  // Taxa de exportação hidrodinâmica (troca com oceano adjacente)
  const hydroExportRate = 1 / sector.dischargeDays;

  // 1. Balanço de DBO: d[B]/dt = L_entrada - kd * [B] - [B]/tau
  const bodDecayRate = kd + hydroExportRate;
  const nextBod = Math.max(
    0,
    currentBod + (bodInputDailyMgL - bodDecayRate * currentBod) * dtDays,
  );

  // Fluxos de oxigênio em mg O2 / L / dia
  const reaerationFlux = ka * (saturation - currentDo);
  const bodDeoxFlux = kd * currentBod;
  const sodFlux = PARAMETERS.oxygen.sodRate / sector.depthMeters;

  // Metabolismo planctônico e bentônico (P - R)
  // Fotossíntese atenuada por turbidez e filme de óleo na superfície
  const lightBlock = Math.min(1, (env.turbidity / 100) * 0.7 + (env.oil > 0 ? 0.35 : 0));
  const photosynthesis = 0.5 * (1 - lightBlock);
  // Respiração basal do ecossistema, agravada por floração de algas
  const respiration = 0.35 + (algaeCoverage / 100) * 0.4;
  const metabolicFlux = photosynthesis - respiration;

  // 2. Balanço de OD: d[O]/dt = ka*(Cs - O) - kd*[B] - SOD/H + (P - R)
  const netDoRate = reaerationFlux - bodDeoxFlux - sodFlux + metabolicFlux;
  const nextDo = Math.max(0.05, Math.min(saturation * 1.25, currentDo + netDoRate * dtDays));

  return {
    nextDo,
    nextBod,
    saturation,
    reaerationFlux,
    bodDeoxFlux,
    sodFlux,
    metabolicFlux,
  };
}

/**
 * Gera os metadados científicos da variável Oxigênio Dissolvido para auditoria.
 */
export function getOxygenMetadata(
  dissolvedOxygen: number,
  temperature: number,
  salinity = 35.0,
): ScientificMetadata {
  const saturation = calculateWeissOxygenSaturation(temperature, salinity);
  const status = classifyDissolvedOxygen(dissolvedOxygen);

  return {
    recordId: 'do-bts-coupled-model',
    variable: 'Oxigênio Dissolvido (OD)',
    symbol: 'OD',
    value: parseFloat(dissolvedOxygen.toFixed(2)),
    unit: 'mg O₂/L',
    quantityKind: 'concentration',
    epistemicClass: status.badge,
    source: 'Balanço Acoplado Weiss (1970) / CONAMA 357 / Cirano & Lessa (2007)',
    sourceUrl: 'doi:10.1590/S0102-261X2007000400002',
    datasetId: 'BTS_DO_BOD_KINETICS',
    method: 'Balanço cinético de advecção-reaeração ar-mar e decomposição de DBO',
    spatialResolution: 'Compartimento homogêneo de mistura (Caixa)',
    temporalResolution: '0,1 dia simulado',
    uncertainty: `Saturação calculada: ${saturation.toFixed(2)} mg/L (±0,15 mg/L)`,
    notes: status.description,
  };
}
