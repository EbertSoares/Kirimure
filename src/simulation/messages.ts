import type { EducationalMessage, SimulationState } from './types';

export const EDUCATIONAL_MESSAGES: EducationalMessage[] = [
  {
    id: 'coral_heat_stress',
    title: 'Estresse térmico nos corais',
    text: 'Calor acumulado por dias ou semanas desestabiliza a relação dos corais com as algas que vivem em seus tecidos.',
    matches: (state) => state.env.temperature >= 28,
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
    matches: (state) => state.env.ph <= 8,
  },
  {
    id: 'microplastics_chain',
    title: 'Microplásticos na cadeia alimentar',
    text: 'Fragmentos menores que 5 mm podem ser ingeridos por animais. Os efeitos sobre populações silvestres ainda são estudados.',
    matches: (state) => state.env.microplastics >= 40,
  },
  {
    id: 'oil_film',
    title: 'Película de óleo na superfície',
    text: 'A mancha se espalha sobretudo na superfície; ondas podem misturar gotículas e ampliar a exposição de peixes e corais.',
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
  text: 'Selecione fatores e observe uma representação acelerada: semanas de exposição são comprimidas em segundos.',
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
