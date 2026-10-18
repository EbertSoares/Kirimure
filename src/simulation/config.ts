import type { Environment, FishSpeciesDefinition, ItemId, PressureId } from './types';

export const BASELINE: Environment = {
  temperature: 26,
  ph: 8.1,
  microplastics: 0,
  oil: 0,
  sewage: 0,
  turbidity: 0,
  fishing: 0,
  recovery: 0,
};

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
  daysPerRealSecond: 1,
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
    coralStart: 28,
    coralMax: 30.5,
    fishStart: 30,
    fishMax: 32,
  },
  ph: {
    coralStart: 8,
    coralMax: 7.6,
    fishStart: 7.8,
    fishMax: 7.6,
  },
  // Peso de cada poluente no estresse (0 a 1 na concentração máxima).
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
    label: 'Cirurgião-patela',
    role: 'herbívoro de algas rasas',
    note: 'Sensível à água turva: depende da visão para se alimentar e se abrigar.',
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
    label: 'Sargentinho',
    role: 'onívoro de recife',
    note: 'Resistente a variações de temperatura, mas acumula microplásticos que confunde com alimento.',
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
    label: 'Peixe-papagaio',
    role: 'herbívoro raspador',
    note: 'Alvo frequente da pesca. Sem ele, as algas tomam o espaço do coral.',
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

export interface FactorGroup {
  id: string;
  title: string;
  description: string;
  items: readonly ItemId[];
}

export const FACTOR_GROUPS: readonly FactorGroup[] = [
  {
    id: 'clima',
    title: 'Clima e química da água',
    description: 'Ondas de calor e acidificação agem devagar, mas de forma acumulativa.',
    items: ['temperature', 'ph'],
  },
  {
    id: 'poluicao',
    title: 'Poluição',
    description: 'Cada poluente tem uma rota própria até o recife.',
    items: ['microplastics', 'oil', 'sewage', 'turbidity'],
  },
  {
    id: 'uso',
    title: 'Uso do ambiente',
    description: 'A pesca remove peixes e altera o equilíbrio entre algas e corais.',
    items: ['fishing'],
  },
  {
    id: 'acao',
    title: 'Ação de recuperação',
    description: 'Proteção e restauração agem a favor do recife, mesmo com outros fatores ativos.',
    items: ['recovery'],
  },
];

export const ITEM_DEFINITIONS = {
  temperature: {
    label: 'Temperatura da água',
    shortLabel: 'Temperatura',
    min: 26,
    max: 32,
    step: 0.1,
    unit: '°C',
    lowLabel: '26 °C',
    highLabel: '32 °C',
    help: 'O risco depende da intensidade e da duração do calor. Aqui, semanas de exposição são comprimidas em segundos.',
    icon: 'temperature',
  },
  ph: {
    label: 'pH da água',
    shortLabel: 'pH',
    min: 7.6,
    max: 8.2,
    step: 0.01,
    unit: '',
    lowLabel: '7,6',
    highLabel: '8,2',
    help: 'Acidificação é a queda do pH, mesmo com a água ainda alcalina. Ela reduz a disponibilidade de carbonato para os corais.',
    icon: 'flask',
  },
  microplastics: {
    label: 'Microplásticos',
    shortLabel: 'Microplásticos',
    min: 0,
    max: 100,
    step: 1,
    unit: '',
    lowLabel: 'Baixo',
    highLabel: 'Alto',
    help: 'Partículas menores que 5 mm. A arte amplia os fragmentos para que fiquem visíveis; o índice não representa uma concentração medida.',
    icon: 'bottle',
  },
  oil: {
    label: 'Óleo',
    shortLabel: 'Óleo',
    min: 0,
    max: 100,
    step: 1,
    unit: '',
    lowLabel: 'Baixo',
    highLabel: 'Alto',
    help: 'O óleo tende a se espalhar na superfície; ondas podem misturar gotículas na água e sedimentos podem levá-lo ao fundo.',
    icon: 'drop',
  },
  sewage: {
    label: 'Esgoto',
    shortLabel: 'Esgoto',
    min: 0,
    max: 100,
    step: 1,
    unit: '',
    lowLabel: 'Baixo',
    highLabel: 'Alto',
    help: 'Esgoto sem tratamento leva nutrientes e matéria orgânica. Os nutrientes alimentam algas e o consumo de oxigênio aumenta.',
    icon: 'sewage',
  },
  turbidity: {
    label: 'Turbidez e sedimentos',
    shortLabel: 'Turbidez',
    min: 0,
    max: 100,
    step: 1,
    unit: '',
    lowLabel: 'Água clara',
    highLabel: 'Água turva',
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
    lowLabel: 'Sem pesca',
    highLabel: 'Muito intensa',
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
    lowLabel: 'Sem proteção',
    highLabel: 'Proteção total',
    help: 'Unidade de conservação, berçários e restauração de corais reduzem o dano e aceleram a recuperação do recife.',
    icon: 'shield',
  },
} satisfies Record<ItemId, {
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  lowLabel: string;
  highLabel: string;
  help: string;
  icon: string;
}>;

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
