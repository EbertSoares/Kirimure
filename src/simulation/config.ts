import type {
  BtsSectorDefinition,
  BtsSectorId,
  ControlCategoryId,
  Environment,
  EvidenceLevel,
  FishSpeciesDefinition,
  ItemId,
  ParameterEvidenceRecord,
  PressureId,
  ScaleType,
} from './types';

export const BASELINE: Environment = {
  temperature: 26.8,
  ph: 8.1,
  microplastics: 0,
  oil: 0,
  sewage: 0,
  turbidity: 0,
  fishing: 0,
  recovery: 0,
};

export const MASS_LOAD_IDS = ['oil', 'sewage'] as const;
export type MassLoadId = (typeof MASS_LOAD_IDS)[number];

/**
 * Escala não linear de concentração de microplásticos em partículas/m³,
 * ancorada nos levantamentos estuarinos da Baía de Todos-os-Santos (Trindade et al., 2023):
 * - 0: condição de referência sem contaminação no cenário;
 * - 5.180 part./m³: média estuarina global reportada em 10 ambientes da BTS;
 * - 24.000 part./m³: patamar elevado observado em estuários urbanos (ex.: Subaé ~24.110 part./m³);
 * - 32.784 part./m³: concentração máxima observada no Estuário do Paraguaçu;
 * - 35.000 part./m³: teto experimental do cenário didático.
 */
export const MICROPLASTICS_OPTIONS_PARTICLES_M3 = [
  0,
  100,
  250,
  500,
  1000,
  2500,
  5180,
  10000,
  15000,
  24000,
  32784,
  35000,
] as const;

export const BTS_SECTORS: readonly BtsSectorDefinition[] = [
  {
    id: 'frades',
    label: 'Ilha dos Frades e Itaparica',
    sublabel: 'Baía Central · Recifes de Franja',
    description: 'Águas claras e circulação moderada com recifes de Siderastrea e Mussismilia. Tempo de descarga medido entre 38 e 62 dias (Cirano & Lessa, 2007); salinidade de 35,0 PSU e profundidade média recifal de 8 m.',
    badge: 'Modelo de Caixa (Ref. BTS)',
    dischargeDays: 38,
    dischargeRange: [38, 62],
    baselineSalinity: 35.0,
    baselineTemperature: 26.8,
    retentionDescriptor: 'moderada',
    depthMeters: 8.0,
    meanWindSpeed: 4.0,
    mixingVolumeM3: 3.2e7,
    coordinates: { latitude: -12.85, longitude: -38.55 },
  },
  {
    id: 'paraguacu',
    label: 'Estuário do Paraguaçu',
    sublabel: 'Fundo da Baía · Manguezais e Maragogipe',
    description: 'Águas estuarinas com gradiente salobro. Parâmetro provisório de modelagem de caixa: circulação lenta, alta retenção de efluentes e sensibilidade a hipóxia.',
    badge: 'Cenário Didático',
    dischargeDays: 75,
    dischargeRange: [60, 90],
    baselineSalinity: 22.0,
    baselineTemperature: 27.2,
    retentionDescriptor: 'alta',
    depthMeters: 5.0,
    meanWindSpeed: 3.0,
    mixingVolumeM3: 1.5e7,
    coordinates: { latitude: -12.75, longitude: -38.85 },
  },
  {
    id: 'barra',
    label: 'Boca da Baía / Barra',
    sublabel: 'Canal de Salvador · Acesso Atlântico',
    description: 'Águas oceânicas de alta energia com forte troca de maré e ondas. Parâmetro provisório de modelagem de caixa: rápida dispersão e baixa retenção de efluentes.',
    badge: 'Cenário Didático',
    dischargeDays: 9,
    dischargeRange: [6, 14],
    baselineSalinity: 36.5,
    baselineTemperature: 26.4,
    retentionDescriptor: 'baixa',
    depthMeters: 25.0,
    meanWindSpeed: 5.5,
    mixingVolumeM3: 1.0e8,
    coordinates: { latitude: -12.97, longitude: -38.50 },
  },
] as const;

export function isMassLoadId(id: ItemId): id is MassLoadId {
  return MASS_LOAD_IDS.includes(id as MassLoadId);
}

const LOAD_HORIZON_DAYS = 30;
const WINTER_DISCHARGE_DAYS = 38;
const SUMMER_DISCHARGE_DAYS = WINTER_DISCHARGE_DAYS * 1.6;
const WINTER_RETENTION = Math.exp(-LOAD_HORIZON_DAYS / WINTER_DISCHARGE_DAYS);
const SUMMER_RETENTION = Math.exp(-LOAD_HORIZON_DAYS / SUMMER_DISCHARGE_DAYS);
const CENTRAL_RETENTION = (WINTER_RETENTION + SUMMER_RETENTION) / 2;
const MASS_LOAD_OPTIONS_KG = [
  0,
  1, 2, 5,
  10, 20, 50,
  100, 200, 500,
  1000, 2000, 5000,
  10000, 20000, 50000, 100000,
] as const;

export const PRESSURE_IDS: readonly PressureId[] = [
  'thermal',
  'acidification',
  'oil',
  'microplastics',
  'sewage',
  'turbidity',
  'fishing',
];

export const PARAMETERS = {
  tickRate: 10,
  /**
   * Dias simulados por segundo real na velocidade 1×.
   *
   * 0,5 = um dia simulado a cada 2 segundos reais em 1× (1,5 d/s em 3×;
   * 2,5 d/s em 5×; 5 d/s em 10×).
   */
  daysPerRealSecond: 0.5,
  tauDays: {
    temperature: 7,
    ph: 12,
    microplastics: 5,
    oil: 3,
    sewage: 4,
    turbidity: 4,
    fishing: 2,
    recovery: 20,
  } satisfies Record<ItemId, number>,
  temperature: {
    // Cenário didático da Baía de Todos-os-Santos: águas internas podem chegar
    // a 30 °C e estudos regionais (Leão et al., 2008) observaram branqueamento a 29–30 °C.
    // HotSpot positivo ocorre quando SST > 28,0 °C (MMM didática); na resolução da tela (0,1 °C),
    // o primeiro valor exibido é 28,1 °C. A partir de 29,0 °C (MMM + 1 °C), o DHW acumula estresse.
    maximumMonthlyMean: 28,
    bleachingThreshold: 29,
    severeDhw: 8,
    extremeDhw: 20,
    fishStart: 30,
    fishMax: 31,
  },
  oxygen: {
    // Saturação físico-química de Weiss (1970) em água marinha tropical da BTS (26,8 °C, 35 PSU: 6,55 mg/L)
    saturationMgL: 6.55,
    // Coeficiente de reaeração superficial ar-mar (vento e ondas) em dia^-1
    reaerationRate: 0.35,
    // Coeficiente de oxidação bacteriana da DBO em dia^-1 a 20 °C
    deoxygenationRate: 0.12,
    // Demanda de oxigênio do sedimento (SOD) em g O₂/m²/dia
    sodRate: 0.5,
    // Coeficientes de correção térmica Arrhenius (teta)
    thetaDeoxygenation: 1.047,
    thetaReaeration: 1.024,
  },
  ph: {
    coralStart: 8,
    coralMax: 7.7,
    fishStart: 7.8,
    fishMax: 7.7,
    /**
     * Queda costeira adicional simplificada causada pela respiração da matéria
     * orgânica associada ao esgoto. Óleo e microplásticos não alteram o pH
     * diretamente neste modelo.
     */
    sewageMaxDrop: 0.08,
  },
  transport: {
    horizonDays: LOAD_HORIZON_DAYS,
    winterDischargeDays: WINTER_DISCHARGE_DAYS,
    summerDischargeDays: SUMMER_DISCHARGE_DAYS,
    winterRetention: WINTER_RETENTION,
    summerRetention: SUMMER_RETENTION,
    centralRetention: CENTRAL_RETENTION,
  },
  receivedLoads: {
    // Escalas didáticas da massa retida na baía após 30 dias para contaminantes expressos em massa (óleo e esgoto).
    // Microplásticos utilizam concentração em partículas/m³ (PARAMETERS.microplastics), sem conversão arbitrária de massa.
    oil: { maximumKg: 100000 * CENTRAL_RETENTION },
    sewage: { maximumKg: 100000 * CENTRAL_RETENTION },
  },
  microplastics: {
    // Escala em concentração (partículas/m³) respaldada por Trindade et al. (2023) nos estuários da BTS
    maximumParticlesPerM3: 35000,
    studyMeanParticlesPerM3: 5180,
    studyMaxParticlesPerM3: 32784,
  },
  sewageLoads: {
    // Escala máxima de taxa contínua de lançamento (kg DBO₅/dia)
    continuousMaximumKgPerDay: 100000,
    // Escala de massa total em pulso pontual retida na caixa de mistura (kg DBO₅)
    pulseMaximumKg: 100000 * CENTRAL_RETENTION,
    // Concentração didática de saturação de CBODu na água para efeitos de pressão trófica/nutrientes (mg O₂/L)
    saturationBodConcentrationMgL: 5.0,
  },
  // Peso de cada poluente no estresse de corais (0 a 1 na escala máxima do cenário).
  // Para peixes, as respostas a poluentes e forçantes são individualizadas por espécie em FISH_SPECIES.
  pollutantWeights: {
    coral: { microplastics: 0.14, oil: 0.75, sewage: 0.55, turbidity: 0.6, fishing: 0.3 },
  } satisfies Record<'coral', Partial<Record<PressureId, number>>>,
  synergy: 0.5,
  collapseDays: { coral: 75 },
  recoveryFactor: 5,
  recoveryThreshold: 0.1,
  // Recuperação ambiental: reduz o dano, acelera a volta e permite recuperar
  // mesmo sob estresse moderado.
  recovery: {
    damageReduction: 0.6,
    speedBoost: 3,
    thresholdBoost: 0.35,
  },
  history: {
    sampleDays: 1,
    maxPoints: 240,
  },
} as const;

export const FISH_SPECIES: readonly FishSpeciesDefinition[] = [
  {
    id: 'blue-tang',
    label: 'Peixe-cirurgião (Acanthurus)',
    role: 'herbívoro de macroalgas rasas',
    note: 'Acanthurus chirurgus / A. coeruleus: herbívoro residente dos recifes da BTS. Sensível a anomalias térmicas e hipóxia; é o primeiro a mostrar sinais de estresse sob calor.',
    collapseDays: 62,
    sensitivity: {
      thermal: 1.2,
      acidification: 1.1,
      oil: 1,
      microplastics: 1,
      sewage: 0.85,
      turbidity: 1.3,
      fishing: 0.7,
    },
  },
  {
    id: 'sergeant-major',
    label: 'Sargentinho (Abudefduf saxatilis)',
    role: 'onívoro generalista recifal',
    note: 'Abudefduf saxatilis: extremamente abundante nos recifes da BTS. Tolera variações térmicas moderadas, mas confunde microplásticos com plâncton e sofre com a turbidez de efluentes.',
    collapseDays: 78,
    sensitivity: {
      thermal: 0.85,
      acidification: 1,
      oil: 1.1,
      microplastics: 1.25,
      sewage: 1.25,
      turbidity: 0.8,
      fishing: 0.9,
    },
  },
  {
    id: 'parrotfish',
    label: 'Peixe-papagaio (Scarus / Sparisoma)',
    role: 'herbívoro raspador e bio-erosor',
    note: 'Scarus trispinosus / Sparisoma amplum: espécies brasileiras essenciais para conter algas e gerar areia. Altamente vulneráveis à sobrepesca e ao declínio de corais.',
    collapseDays: 48,
    sensitivity: {
      thermal: 1.05,
      acidification: 1.2,
      oil: 0.95,
      microplastics: 0.9,
      sewage: 1.05,
      turbidity: 1,
      fishing: 1.6,
    },
  },
];

/**
 * Ordem completa dos oito controles ambientais agrupados nas três categorias da bancada:
 * Água (temperatura, pH, turbidez), Poluição (esgoto, óleo, microplásticos) e Ecossistema (pesca, recuperação).
 */
export const FACTOR_ORDER: readonly ItemId[] = [
  'temperature',
  'ph',
  'turbidity',
  'sewage',
  'oil',
  'microplastics',
  'fishing',
  'recovery',
];

export interface ControlGroupDefinition {
  id: ControlCategoryId;
  label: string;
  subtitle: string;
  items: readonly ItemId[];
}

export const CONTROL_GROUPS: readonly ControlGroupDefinition[] = [
  {
    id: 'water',
    label: 'Água',
    subtitle: 'Temperatura, pH e turbidez',
    items: ['temperature', 'ph', 'turbidity'],
  },
  {
    id: 'pollution',
    label: 'Poluição',
    subtitle: 'Carga orgânica, óleo e microplásticos',
    items: ['sewage', 'oil', 'microplastics'],
  },
] as const;

export interface ItemDefinition {
  label: string;
  shortLabel: string;
  category: ControlCategoryId;
  min: number;
  max: number;
  step: number;
  unit: string;
  reference?: string;
  warning?: number;
  critical?: number;
  riskDirection?: 'above' | 'below';
  tooltip: string;
  help: string;
  icon: string;
  scaleType: ScaleType;
  scaleBadge?: string;
  scaleOptions?: readonly number[];
  massLoad?: boolean;
  massQualifier?: string;
  massOptionsKg?: readonly number[];
  evidenceLevel: EvidenceLevel;
  /** Cadeia causal concisa fiel aos mecanismos efetivamente calculados pelo modelo. */
  causalChain: string;
  /** Indicadores prioritários (2–3) exibidos em destaque ao manipular esta variável. */
  primaryIndicators: readonly ('oxygen' | 'temperature' | 'thermalStress' | 'ph' | 'aragonite' | 'coral' | 'fish' | 'algae' | 'trophic')[];
}

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
  temperature: {
    label: 'Temperatura da água',
    shortLabel: 'Temperatura',
    category: 'water',
    min: 24,
    max: 31,
    step: 0.1,
    unit: '°C',
    reference: 'Limiar didático: 29,0 °C',
    warning: 29,
    critical: 30,
    riskDirection: 'above',
    tooltip: 'Temperatura superficial da água.',
    help: 'Publicado / Parâmetro Didático: Estudos na Bahia (Leão et al., 2008) observaram branqueamento a 29–30 °C. No modelo local, usa-se MMM didática fixa de 28,0 °C e limiar de acúmulo térmico em 29,0 °C (distinto do DHW satelital oficial da NOAA, que usa a climatologia MMM de cada pixel).',
    icon: 'temperature',
    scaleType: 'linear',
    evidenceLevel: 'Publicado',
    causalChain: 'Temperatura ≥ 29 °C → acúmulo térmico (janela 84 d) + solubilidade de O₂ menor → perda de simbiose e estresse nos corais.',
    primaryIndicators: ['temperature', 'thermalStress', 'coral'],
  },
  ph: {
    label: 'pH da água',
    shortLabel: 'pH',
    category: 'water',
    min: 7.7,
    max: 8.2,
    step: 0.01,
    unit: 'escala total',
    reference: 'Referência oceânica ≈ 8,10',
    warning: 8,
    critical: 7.8,
    riskDirection: 'below',
    tooltip: 'Acidez da água.',
    help: 'Publicado / Cenário Didático: Escala logarítmica de atividade de H⁺ (uma queda de 0,1 unidade representa ~26% mais acidez). Reduz a disponibilidade de CO₃²⁻ e o estado de saturação da aragonita (Ωarag) calculado via Lueker et al. (2000) e Mucci (1983).',
    icon: 'flask',
    scaleType: 'logarithmic',
    scaleBadge: 'Escala log ([H⁺])',
    evidenceLevel: 'Publicado',
    causalChain: 'pH menor (escala log de H⁺) → menor íon carbonato (CO₃²⁻) → saturação de aragonita (Ωarag) menor → estresse de calcificação nos corais.',
    primaryIndicators: ['ph', 'aragonite', 'coral'],
  },
  turbidity: {
    label: 'Turbidez (índice do cenário)',
    shortLabel: 'Turbidez (índice do cenário)',
    category: 'water',
    min: 0,
    max: 100,
    step: 1,
    unit: '% índice',
    reference: 'Índice relativo do modelo (0–100%)',
    warning: 35,
    critical: 70,
    riskDirection: 'above',
    tooltip: 'Partículas em suspensão e transparência da água.',
    help: 'Parâmetro Didático: Índice relativo de atenuação luminosa e sedimentos em suspensão (0–100%). No modelo, reduz a fotossíntese líquida no balanço de oxigênio, favorece macroalgas tolerantes e pressiona corais e herbívoros visuais.',
    icon: 'sediment',
    scaleType: 'linear',
    evidenceLevel: 'Parâmetro Didático',
    causalChain: 'Turbidez maior → atenuação de luz → fotossíntese líquida menor no balanço de O₂ + estresse de soterramento nos corais.',
    primaryIndicators: ['coral', 'oxygen', 'algae'],
  },
  sewage: {
    label: 'Carga orgânica / Esgoto (DBO₅)',
    shortLabel: 'Esgoto (DBO₅)',
    category: 'pollution',
    min: 0,
    max: 100000,
    step: 1,
    unit: 'kg DBO₅/dia',
    reference: 'Escala logarítmica (kg a 100 t)',
    warning: 2000,
    critical: 20000,
    riskDirection: 'above',
    tooltip: 'Matéria orgânica que consome oxigênio.',
    help: 'Cenário Didático / Modelo de Caixa: Carga de matéria orgânica biodegradável (DBO₅ a 20 °C) em aporte diário contínuo ou pulso pontual. Convertida para CBODu, consome oxigênio dissolvido via oxidação bacteriana, libera CO₂ respiratório (reduzindo o pH efetivo) e estimula algas.',
    icon: 'sewage',
    scaleType: 'logarithmic',
    scaleBadge: 'Escala log (kg → t)',
    scaleOptions: MASS_LOAD_OPTIONS_KG,
    massLoad: true,
    massQualifier: 'DBO₅/d',
    massOptionsKg: MASS_LOAD_OPTIONS_KG,
    evidenceLevel: 'Hipótese do Modelo',
    causalChain: 'Carga orgânica (DBO₅) maior → oxidação bacteriana consome O₂ e libera CO₂ → oxigênio dissolvido menor + algas maiores → hipóxia na fauna e pressão nos corais.',
    primaryIndicators: ['oxygen', 'fish', 'algae'],
  },
  oil: {
    label: 'Óleo / Petróleo',
    shortLabel: 'Óleo',
    category: 'pollution',
    min: 0,
    max: 100000,
    step: 1,
    unit: 'kg',
    reference: 'Limiar subletal: 10–27 µg/L tPAH50',
    warning: 1000,
    critical: 20000,
    riskDirection: 'above',
    tooltip: 'Contaminação por petróleo e derivados.',
    help: 'Publicado / Modelo de Caixa: Massa derramada particionada entre filme superficial, coluna d’água, sedimento e fração dissolvida tPAH50. A película reduz a luz e a fotossíntese; HPAs dissolvidos induzem toxicidade subletal em corais (EC50 = 10 µg/L tPAH50; May et al., 2020).',
    icon: 'drop',
    scaleType: 'logarithmic',
    scaleBadge: 'Escala log (kg → t)',
    scaleOptions: MASS_LOAD_OPTIONS_KG,
    massLoad: true,
    massOptionsKg: MASS_LOAD_OPTIONS_KG,
    evidenceLevel: 'Publicado',
    causalChain: 'Massa de óleo → filme superficial bloqueia luz + fração dissolvida (tPAH50) sobe → inibição subletal de tecidos coralinos e estresse na fauna.',
    primaryIndicators: ['coral', 'fish', 'oxygen'],
  },
  microplastics: {
    label: 'Microplásticos',
    shortLabel: 'Microplásticos',
    category: 'pollution',
    min: 0,
    max: 35000,
    step: 1,
    unit: 'part./m³',
    reference: 'Média 5.180 · máx. 32.784 part./m³',
    warning: 5180,
    critical: 24000,
    riskDirection: 'above',
    tooltip: 'Partículas plásticas menores que 5 mm.',
    help: 'Medido na BTS (faixa in-situ) / Hipótese do Modelo (efeito): Concentração superficial em partículas/m³, alinhada aos levantamentos empíricos de Trindade et al. (2023) em estuários da BTS (média ~5.180 part./m³; máximo 32.784 part./m³ no Paraguaçu). Sem conversão artificial para massa em kg. Na visualização 3D, as partículas utilizam escala visual ampliada para permitir percepção didática dos estudantes.',
    icon: 'bottle',
    scaleType: 'nonlinear',
    scaleBadge: 'Escala não linear',
    scaleOptions: MICROPLASTICS_OPTIONS_PARTICLES_M3,
    evidenceLevel: 'Medido',
    causalChain: 'Concentração de microplásticos (part./m³) maior → ingestão acidental por planctívoros/onívoros e contato com pólipos → estresse crônico maior na fauna e corais.',
    primaryIndicators: ['fish', 'coral', 'trophic'],
  },
  fishing: {
    label: 'Pressão pesqueira',
    shortLabel: 'Pesca',
    category: 'ecosystem',
    min: 0,
    max: 100,
    step: 1,
    unit: '% índice',
    reference: 'Índice de esforço relativo (0–100%)',
    warning: 35,
    critical: 70,
    riskDirection: 'above',
    tooltip: 'Pressão pesqueira no modelo.',
    help: 'Parâmetro Didático / Hipótese do Modelo: Índice relativo de esforço pesqueiro (0–100%). Afeta desproporcionalmente herbívoros raspadores como o peixe-papagaio (sensibilidade 1,6×), reduzindo o controle de macroalgas e o equilíbrio trófico.',
    icon: 'hook',
    scaleType: 'linear',
    evidenceLevel: 'Parâmetro Didático',
    causalChain: 'Pressão pesqueira maior → declínio mais rápido de herbívoros (peixe-papagaio) → menor raspagem → expansão de algas sobre o recife.',
    primaryIndicators: ['fish', 'trophic', 'algae'],
  },
  recovery: {
    label: 'Recuperação ecológica',
    shortLabel: 'Recuperação',
    category: 'ecosystem',
    min: 0,
    max: 100,
    step: 1,
    unit: '% índice',
    reference: 'Proteção e manejo (0–100%)',
    tooltip: 'Ações de mitigação e recuperação ecológica.',
    help: 'Parâmetro Didático: Representa áreas marinhas protegidas, zonas de exclusão de pesca e manejo costeiro. No modelo, atenua a taxa diária de dano (até 60%) e acelera a regeneração quando as pressões caem abaixo do limiar de recuperação.',
    icon: 'shield',
    scaleType: 'linear',
    evidenceLevel: 'Parâmetro Didático',
    causalChain: 'Manejo e proteção maiores → amortecimento da taxa diária de dano + regeneração acelerada quando os estressores recuam.',
    primaryIndicators: ['coral', 'fish', 'trophic'],
  },
};

export const ITEM_IDS = Object.keys(ITEM_DEFINITIONS) as ItemId[];

export const PRESSURE_LABELS: Record<PressureId, string> = {
  thermal: 'calor',
  acidification: 'acidez',
  oil: 'óleo',
  microplastics: 'microplásticos',
  sewage: 'esgoto',
  turbidity: 'turbidez',
  fishing: 'pesca',
};

/**
 * Registro explícito do nível de evidência científica dos parâmetros centrais do modelo.
 * Permite que professores, estudantes e avaliadores distingam o que é medido/publicado
 * do que constitui hipótese de modelagem ou convenção didática.
 */
export const PARAMETER_EVIDENCE_REGISTRY: readonly ParameterEvidenceRecord[] = [
  {
    id: 'weiss-o2-saturation',
    parameter: 'Saturação de O₂ na referência (26,8 °C; 35,0 PSU)',
    valueDisplay: '6,55',
    unit: 'mg O₂/L',
    evidenceLevel: 'Publicado',
    sourceOrBasis: 'Equação termodinâmica de Weiss (1970)',
    scopeNote: 'Solubilidade físico-química exata ao nível do mar; varia por setor conforme temperatura e salinidade (7,18 mg/L a 22 PSU no Paraguaçu).',
  },
  {
    id: 'frades-residence-time',
    parameter: 'Tempo de descarga da Baía Central (Ilha dos Frades)',
    valueDisplay: '38–62',
    unit: 'dias',
    evidenceLevel: 'Publicado',
    sourceOrBasis: 'Cirano & Lessa (2007)',
    scopeNote: 'Estimativa hidrodinâmica publicada para renovação sazonal da Baía de Todos-os-Santos; aplicada aqui a um modelo de caixa homogêneo.',
  },
  {
    id: 'paraguacu-barra-boxes',
    parameter: 'Tempos de residência e volumes de mistura (Paraguaçu e Barra)',
    valueDisplay: '75 d / 9 d',
    unit: 'dias',
    evidenceLevel: 'Hipótese do Modelo',
    sourceOrBasis: 'Parametrização comparativa de modelo de caixas',
    scopeNote: 'Contraste hidrodinâmico coerente entre fundo estuarino e canal oceânico, ainda sem calibração local por traçadores in situ.',
  },
  {
    id: 'bts-microplastics-range',
    parameter: 'Faixa de microplásticos em estuários da Baía de Todos-os-Santos',
    valueDisplay: '5.180 (média) · 32.784 (máx.)',
    unit: 'part./m³',
    evidenceLevel: 'Medido',
    sourceOrBasis: 'Trindade et al. (2023) — 10 estuários da Baía de Todos-os-Santos',
    scopeNote: 'Amostragem empírica superficial com redes de 64 e 300 µm. O peso de estresse biológico associado no simulador é Hipótese do Modelo.',
  },
  {
    id: 'pah-sublethal-ecotox',
    parameter: 'Limiar subletal de hidrocarbonetos dissolvidos (tPAH50)',
    valueDisplay: 'EC50 = 10 e 27',
    unit: 'µg/L',
    evidenceLevel: 'Publicado',
    sourceOrBasis: 'May et al. (2020) — bioensaio controlado (96 h)',
    scopeNote: 'Referência laboratorial para inibição de regeneração tecidual e retração de pólipos; a partição em 4 reservatórios na Baía de Todos-os-Santos é Hipótese do Modelo.',
  },
  {
    id: 'carbonate-constants',
    parameter: 'Constantes do sistema carbonato (K₁, K₂, K′sp)',
    valueDisplay: 'Ωarag base ≈ 3,66',
    unit: 'adimensional',
    evidenceLevel: 'Publicado',
    sourceOrBasis: 'Lueker et al. (2000), Dickson (1990) e Mucci (1983)',
    scopeNote: 'Equações termodinâmicas padrão; alcalinidade total escalada pela salinidade (2350 µmol/kg a 35 PSU) é Hipótese do Modelo.',
  },
  {
    id: 'oxygen-kinetics-rates',
    parameter: 'Taxas cinéticas de DBO e sedimento (kd₂₀, SOD, θ)',
    valueDisplay: 'kd = 0,12 d⁻¹ · SOD = 0,5 g/m²/d',
    unit: 'dia⁻¹ / g O₂·m⁻²·d⁻¹',
    evidenceLevel: 'Publicado',
    sourceOrBasis: 'Literatura clássica de qualidade da água (Bowie et al., 1985); limites CONAMA 357',
    scopeNote: 'Coeficientes típicos de águas costeiras/estuarinas; não calibrados contra séries contínuas de sondas em cada recife da Baía de Todos-os-Santos.',
  },
  {
    id: 'didactic-mmm-thermal',
    parameter: 'Referência térmica do modelo local (MMM didática)',
    valueDisplay: '28,0 (limiar 29,0)',
    unit: '°C',
    evidenceLevel: 'Parâmetro Didático',
    sourceOrBasis: 'Ancorado qualitativamente em Leão et al. (2008) (branqueamento a 29–30 °C na Bahia)',
    scopeNote: 'Convenção fixa do cenário local para acumular estresse em 84 dias; distinta do DHW satelital oficial da NOAA CRW (que usa MMM específica por pixel, ~27,92 °C na estação externa).',
  },
  {
    id: 'kinetic-relaxation-tau',
    parameter: 'Tempos característicos de resposta ambiental (τ)',
    valueDisplay: '2 a 20',
    unit: 'dias',
    evidenceLevel: 'Parâmetro Didático',
    sourceOrBasis: 'Ordenação relativa da inércia física/ecológica',
    scopeNote: 'Representa diferenças de velocidade entre variáveis (ex.: pesca rápida vs. tamponamento de pH e recuperação lentos), não taxas medidas em campo.',
  },
  {
    id: 'ecological-weights-and-collapse',
    parameter: 'Pesos de pressão, sensibilidades por espécie e limiar crítico (≤ 33%)',
    valueDisplay: 'collapseDays: 48–78 d',
    unit: 'índice 0–100',
    evidenceLevel: 'Parâmetro Didático',
    sourceOrBasis: 'Síntese qualitativa de vulnerabilidade trófica recifal',
    scopeNote: 'Convenção interna para investigação comparativa de cenários; não constitui previsão quantitativa de mortalidade ou extinção populacional na Baía de Todos-os-Santos.',
  },
  {
    id: 'interventions-mitigation-rates',
    parameter: 'Eficiências nominais de mitigação (tratamento, retenção na fonte, contenção)',
    valueDisplay: '60% a 75%',
    unit: 'fração de aporte / recolhimento',
    evidenceLevel: 'Hipótese do Modelo',
    sourceOrBasis: 'Modelos de engenharia sanitária e resposta costeira (Bowie et al., 1985; NOAA WebGNOME; UNEP/IWMI)',
    scopeNote: 'Representam reduções de fluxo de entrada no cenário didático; não constituem constantes universais de limpeza da água na Baía de Todos-os-Santos.',
  },
] as const;
