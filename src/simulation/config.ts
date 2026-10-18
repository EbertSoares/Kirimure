import type { Environment, ItemId } from './types';

export const BASELINE: Environment = {
  microplastics: 0,
  oil: 0,
  temperature: 26,
  ph: 8.1,
};

export const PARAMETERS = {
  tickRate: 10,
  daysPerRealSecond: 1,
  tauDays: {
    microplastics: 5,
    oil: 3,
    temperature: 7,
    ph: 12,
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
  pollutantWeights: {
    coral: { microplastics: 0.14, oil: 0.75 },
    fish: { microplastics: 0.35, oil: 0.55 },
  },
  synergy: 0.5,
  collapseDays: { coral: 75, fish: 60 },
  recoveryFactor: 5,
  recoveryThreshold: 0.1,
} as const;

export const ITEM_DEFINITIONS = {
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
    category: 'elements',
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
    category: 'elements',
    icon: 'drop',
  },
  temperature: {
    label: 'Temperatura da água',
    shortLabel: 'Temperatura',
    min: 26,
    max: 32,
    step: 0.1,
    unit: '°C',
    lowLabel: '26°C',
    highLabel: '32°C',
    help: 'O risco depende da intensidade e da duração do calor. Aqui, semanas de exposição são comprimidas em segundos.',
    category: 'phenomena',
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
    category: 'phenomena',
    icon: 'flask',
  },
} as const;
