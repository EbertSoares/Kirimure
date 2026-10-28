import type {
  BtsSectorDefinition,
  BtsSectorId,
  Environment,
  FishSpeciesDefinition,
  ItemId,
  PressureId,
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

export const MASS_LOAD_IDS = ['microplastics', 'oil', 'sewage'] as const;
export type MassLoadId = (typeof MASS_LOAD_IDS)[number];

export const BTS_SECTORS: readonly BtsSectorDefinition[] = [
  {
    id: 'frades',
    label: 'Ilha dos Frades & Itaparica',
    sublabel: 'Baía Central · Recifes de Franja',
    description: 'Águas claras e circulação moderada com recifes de Siderastrea e Mussismilia. Tempo de descarga medido entre 38 e 62 dias.',
    badge: 'Dado Local BTS',
    dischargeDays: 38,
    dischargeRange: [38, 62],
    baselineSalinity: 35.0,
    baselineTemperature: 26.8,
    retentionDescriptor: 'moderada',
    depthMeters: 8.0,
    meanWindSpeed: 4.0,
    mixingVolumeM3: 3.2e7,
  },
  {
    id: 'paraguacu',
    label: 'Estuário do Paraguaçu',
    sublabel: 'Fundo da Baía · Manguezais & Maragogipe',
    description: 'Águas estuarinas com gradiente salobro. Parâmetro provisório de modelagem: circulação lenta, alta retenção de efluentes e sensibilidade a hipóxia.',
    badge: 'Cenário Didático',
    dischargeDays: 75,
    dischargeRange: [60, 90],
    baselineSalinity: 22.0,
    baselineTemperature: 27.2,
    retentionDescriptor: 'alta',
    depthMeters: 5.0,
    meanWindSpeed: 3.0,
    mixingVolumeM3: 1.5e7,
  },
  {
    id: 'barra',
    label: 'Boca da Baía / Barra',
    sublabel: 'Canal de Salvador · Acesso Atlântico',
    description: 'Águas oceânicas de alta energia com forte troca de maré e ondas. Parâmetro provisório: rápida dispersão e baixa retenção de efluentes.',
    badge: 'Cenário Didático',
    dischargeDays: 9,
    dischargeRange: [6, 14],
    baselineSalinity: 36.5,
    baselineTemperature: 26.4,
    retentionDescriptor: 'baixa',
    depthMeters: 25.0,
    meanWindSpeed: 5.5,
    mixingVolumeM3: 1.0e8,
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
   * 0,25 = um dia a cada 4 segundos: o relógio anda devagar de propósito, para
   * a turma ver quanto tempo a consequência leva para aparecer. As velocidades
   * 3× a 10× servem para adiantar a aula.
   */
  daysPerRealSecond: 0.25,
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
    // Escalas didáticas da massa que permanece na BTS após 30 dias. Não são
    // limites legais ou toxicológicos e não equivalem a concentração na água.
    microplastics: { maximumKg: 100000 * CENTRAL_RETENTION },
    oil: { maximumKg: 100000 * CENTRAL_RETENTION },
    sewage: { maximumKg: 100000 * CENTRAL_RETENTION },
  },
  // Peso de cada poluente no estresse (0 a 1 na escala máxima do cenário).
  pollutantWeights: {
    coral: { microplastics: 0.14, oil: 0.75, sewage: 0.55, turbidity: 0.6, fishing: 0.3 },
    fish: { microplastics: 0.35, oil: 0.55, sewage: 0.4, turbidity: 0.35, fishing: 0.85 },
  } satisfies Record<'coral' | 'fish', Partial<Record<PressureId, number>>>,
  synergy: 0.5,
  collapseDays: { coral: 75, fish: 60 },
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
 * Ordem dos controles na bancada.
 *
 * Só entram os fatores que o aluno ajusta na mão: temperatura, pH e os três
 * poluentes. Pesca, turbidez e recuperação saíram da bancada.
 */
export const FACTOR_ORDER: readonly ItemId[] = [
  'temperature',
  'ph',
  'microplastics',
  'oil',
  'sewage',
];

interface ItemDefinition {
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  reference?: string;
  warning?: number;
  critical?: number;
  riskDirection?: 'above' | 'below';
  help: string;
  icon: string;
  massLoad?: boolean;
  massQualifier?: string;
  massOptionsKg?: readonly number[];
}

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
  temperature: {
    label: 'Temperatura da água',
    shortLabel: 'Temperatura',
    min: 24,
    max: 31,
    step: 0.1,
    unit: '°C',
    reference: 'BTS: branq. em 29–30 °C',
    warning: 29,
    critical: 30,
    riskDirection: 'above',
    help: 'Dado Local BTS / Padrão Operacional: Estudos regionais (Leão et al., 2008) registraram branqueamento a 29–30 °C. O HotSpot positivo ocorre quando SST > 28,0 °C (MMM didática); a partir de 29,0 °C (MMM + 1 °C), o DHW acumula estresse térmico em °C-semana.',
    icon: 'temperature',
  },
  ph: {
    label: 'pH da água',
    shortLabel: 'pH',
    min: 7.7,
    max: 8.2,
    step: 0.01,
    unit: '',
    reference: 'Oceano atual ≈ 8,1',
    warning: 8,
    critical: 7.8,
    riskDirection: 'below',
    help: 'Cenário Didático: O pH oceânico médio de superfície é cerca de 8,1. A escala é logarítmica: pequenas quedas representam aumentos relevantes de H⁺, reduzindo o estado de saturação de aragonita para o esqueleto dos corais.',
    icon: 'flask',
  },
  microplastics: {
    label: 'Microplásticos',
    shortLabel: 'Microplásticos',
    min: 0,
    max: 100000,
    step: 1,
    unit: 'kg',
    reference: 'Carga lançada (kg/t)',
    help: 'Cenário Didático: carga simulada de polímeros. Contexto de campo (Dado Local BTS): estuários da BTS registram média de 5.176 a 32.784 partículas/m³ (Trindade et al., 2023), métrica que não equivale a massa sem granulometria e densidade.',
    icon: 'bottle',
    massLoad: true,
    massOptionsKg: MASS_LOAD_OPTIONS_KG,
  },
  oil: {
    label: 'Óleo',
    shortLabel: 'Óleo',
    min: 0,
    max: 100000,
    step: 1,
    unit: 'kg',
    reference: 'Carga lançada (kg/t)',
    help: 'Cenário Didático / Dado de Laboratório: Carga simulada de petróleo. A película atenua a luz PAR na superfície; hidrocarbonetos induzem inibição celular subletal em pólipos em concentrações de 10 a 27 µg/L tPAH50 (May et al., 2020), não morte imediata.',
    icon: 'drop',
    massLoad: true,
    massOptionsKg: MASS_LOAD_OPTIONS_KG,
  },
  sewage: {
    label: 'Aporte Contínuo de DBO₅ (Esgoto)',
    shortLabel: 'Aporte DBO₅/dia',
    min: 0,
    max: 100000,
    step: 1,
    unit: 'kg DBO₅/dia',
    reference: 'Taxa diária de DBO₅ lançada (kg/dia ou t/dia)',
    help: 'Cenário Didático: Taxa diária contínua de matéria orgânica biodegradável (DBO₅ a 20 °C) diluída no volume de mistura. O modelo converte estequiometricamente para Demanda Última (CBODu) e integra o consumo bacteriano no tempo.',
    icon: 'sewage',
    massLoad: true,
    massQualifier: 'DBO₅/d',
    massOptionsKg: MASS_LOAD_OPTIONS_KG,
  },
  turbidity: {
    label: 'Turbidez e sedimentos',
    shortLabel: 'Turbidez',
    min: 0,
    max: 100,
    step: 1,
    unit: '',
    help: 'Sedimento em suspensão bloqueia a luz que alimenta as algas simbiontes do coral e pode sufocar os pólipos ao assentar.',
    icon: 'sediment',
  },
  fishing: {
    label: 'Pressão de pesca',
    shortLabel: 'Pesca',
    min: 0,
    max: 100,
    step: 1,
    unit: '',
    help: 'Herbívoros como o peixe-papagaio são os primeiros a desaparecer. Sem eles, as algas competem com o coral por espaço.',
    icon: 'hook',
  },
  recovery: {
    label: 'Recuperação ambiental',
    shortLabel: 'Recuperação',
    min: 0,
    max: 100,
    step: 1,
    unit: '',
    help: 'Unidade de conservação, berçários e restauração de corais reduzem o dano e aceleram a recuperação do recife.',
    icon: 'shield',
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
