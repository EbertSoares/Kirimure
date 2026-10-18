import type { Environment, ItemId } from './types';

export const BASELINE: Environment = {
  microplastics: 0,
  oil: 0,
  temperature: 26,
  ph: 8.1,
};

export const PARAMETERS = {
  tickRate: 10,
  tau: {
    microplastics: 6,
    oil: 6,
    temperature: 6,
    ph: 6,
  } satisfies Record<ItemId, number>,
  temperature: {
    coralStart: 29,
    coralMax: 33,
    fishStart: 31,
    fishMax: 35,
  },
  ph: {
    coralStart: 7.95,
    coralMax: 7.6,
    fishStart: 7.8,
    fishMax: 7.4,
  },
  pollutantWeights: {
    coral: { microplastics: 0.3, oil: 0.9 },
    fish: { microplastics: 0.7, oil: 1 },
  },
  synergy: 0.5,
  collapseSeconds: { coral: 45, fish: 35 },
  recoveryFactor: 4,
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
    help: 'Índice educativo de intensidade. Não representa uma concentração medida no ambiente.',
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
    help: 'Índice educativo de intensidade. O óleo forma uma película que reduz luz e troca de gases.',
    category: 'elements',
    icon: 'drop',
  },
  temperature: {
    label: 'Temperatura da água',
    shortLabel: 'Temperatura',
    min: 26,
    max: 35,
    step: 0.1,
    unit: '°C',
    lowLabel: '26°C',
    highLabel: '35°C',
    help: 'O aquecimento acima do limite tolerado provoca estresse térmico e pode causar branqueamento.',
    category: 'phenomena',
    icon: 'temperature',
  },
  ph: {
    label: 'pH da água',
    shortLabel: 'pH',
    min: 7.4,
    max: 8.2,
    step: 0.01,
    unit: '',
    lowLabel: '7,4',
    highLabel: '8,2',
    help: 'A queda do pH representa acidificação e dificulta a formação do esqueleto dos corais.',
    category: 'phenomena',
    icon: 'flask',
  },
} as const;
