import type { EducationalMessage, SimulationState } from './types';

export const EDUCATIONAL_MESSAGES: EducationalMessage[] = [
  {
    id: 'coral_heat_stress',
    title: 'Estresse térmico nos corais',
    text: 'A água mais quente afeta a relação dos corais com as algas que vivem em seus tecidos.',
    matches: (state) => state.env.temperature >= 29,
  },
  {
    id: 'coral_bleaching',
    title: 'Branqueamento dos corais',
    text: 'Ao perder suas algas simbiontes, o coral perde cor e parte importante de sua fonte de energia.',
    matches: (state) => state.health.coral < 50,
  },
  {
    id: 'acidification',
    title: 'Acidificação da água',
    text: 'A redução do pH dificulta a formação de estruturas de carbonato de cálcio, como o esqueleto dos corais.',
    matches: (state) => state.env.ph <= 7.95,
  },
  {
    id: 'microplastics_chain',
    title: 'Microplásticos na cadeia alimentar',
    text: 'Pequenos fragmentos podem ser ingeridos por animais e circular por diferentes níveis da cadeia alimentar.',
    matches: (state) => state.env.microplastics >= 40,
  },
  {
    id: 'oil_film',
    title: 'Película de óleo na superfície',
    text: 'O óleo reduz a passagem de luz e a troca de gases entre a água e a atmosfera.',
    matches: (state) => state.env.oil >= 30,
  },
  {
    id: 'fish_decline',
    title: 'Redução da população de peixes',
    text: 'Parte dos peixes já não resiste às condições do ambiente e a população começa a diminuir.',
    matches: (state) => state.health.fish < 50,
  },
];

export const INTRO_MESSAGE = {
  title: 'Explore o recife',
  text: 'Selecione um ou mais fatores, ajuste a intensidade e aplique as alterações para observar as consequências.',
};

export function evaluateMessages(state: SimulationState): SimulationState {
  const nextMessage = EDUCATIONAL_MESSAGES.find(
    (message) => !state.firedMessages.has(message.id) && message.matches(state),
  );

  if (!nextMessage) return state;

  const firedMessages = new Set(state.firedMessages);
  firedMessages.add(nextMessage.id);
  return { ...state, firedMessages, latestMessageId: nextMessage.id };
}

export function getMessage(id: string | null) {
  return EDUCATIONAL_MESSAGES.find((message) => message.id === id) ?? INTRO_MESSAGE;
}
