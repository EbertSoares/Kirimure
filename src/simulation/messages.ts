import { calculateAlgae, calculateTrophicBalance } from './model';
import type { EducationalMessage, SimulationState } from './types';

export const INTRO_MESSAGE: EducationalMessage = {
  id: 'intro',
  title: 'Explore o recife',
  what: 'O recife começa saudável, com corais coloridos e três espécies de peixe em bom estado.',
  cause: 'Nenhum fator está ativo: todas as barras estão na posição inicial.',
  effect: 'A simulação fica pausada até você aplicar uma mudança e dar o play.',
  ask: 'Qual fator você acha que causa mais dano em pouco tempo? Teste um de cada vez.',
  tone: 'neutral',
  matches: () => false,
};

export const EDUCATIONAL_MESSAGES: EducationalMessage[] = [
  {
    id: 'thermal_stress',
    title: 'Estresse térmico nos corais',
    what: 'Dias seguidos de água quente começam a desestabilizar os corais.',
    cause: 'Calor acumulado por dias ou semanas quebra a relação dos corais com as algas que vivem em seus tecidos.',
    effect: 'O coral gasta mais energia, cresce menos e fica mais vulnerável a doenças.',
    ask: 'A mesma temperatura em poucos dias causaria o mesmo efeito?',
    tone: 'alert',
    matches: (state) => state.exposure.thermal >= 2,
  },
  {
    id: 'acidification',
    title: 'Acidificação da água',
    what: 'O pH caiu e a água ficou menos alcalina.',
    cause: 'O gás carbônico dissolvido forma ácido carbônico e libera íons de hidrogênio.',
    effect: 'Fica mais difícil formar carbonato de cálcio, o material do esqueleto dos corais.',
    ask: 'Por que o coral sente antes de o pH ficar ácido de verdade?',
    tone: 'alert',
    matches: (state) => state.exposure.acidification >= 3,
  },
  {
    id: 'sewage_bloom',
    title: 'Proliferação de algas',
    what: 'As algas estão crescendo rápido e ocupando o espaço do coral.',
    cause: 'Esgoto sem tratamento leva nutrientes, principalmente nitrogênio e fósforo.',
    effect: 'As algas cobrem o substrato, competem por luz e o excesso de matéria orgânica consome oxigênio.',
    ask: 'Sem o esgoto, o que ainda poderia favorecer as algas?',
    tone: 'alert',
    matches: (state) => state.exposure.sewage >= 3,
  },
  {
    id: 'oil_film',
    title: 'Película de óleo na superfície',
    what: 'Uma mancha escura se espalha pela superfície e bloqueia a luz.',
    cause: 'Derrames e vazamentos: o óleo é menos denso que a água e se espalha na superfície.',
    effect: 'Ondas misturam gotículas na água e a película dificulta a troca de gases com a atmosfera.',
    ask: 'Como o óleo chega até o fundo, onde ficam os corais?',
    tone: 'alert',
    matches: (state) => state.exposure.oil >= 3,
  },
  {
    id: 'microplastics_chain',
    title: 'Microplásticos na cadeia alimentar',
    what: 'Fragmentos pequenos estão por toda a água, no tamanho do alimento dos peixes.',
    cause: 'Plástico descartado se quebra em partículas menores que 5 mm, que não somem sozinhas.',
    effect: 'Animais ingerem as partículas por engano e a exposição se acumula ao longo da cadeia alimentar.',
    ask: 'Que ações reduzem a chegada de plástico ao mar?',
    tone: 'alert',
    matches: (state) => state.exposure.microplastics >= 5,
  },
  {
    id: 'trophic_imbalance',
    title: 'Teia alimentar desequilibrada',
    what: 'Os elos que ligavam algas, herbívoros e predadores saíram de sincronia.',
    cause: 'Nutrientes em excesso fizeram as algas crescerem e o estresse ambiental reduziu corais e herbívoros.',
    effect: 'Sem herbívoros suficientes para raspar as algas, o recife perde espaço e a cadeia fica mais curta e frágil.',
    ask: 'O que acontece com a cadeia quando as algas ficam sem quem as raspe?',
    tone: 'alert',
    matches: (state) =>
      calculateTrophicBalance(state.species, calculateAlgae(state.env, state.health)) < 45,
  },
  {
    id: 'coral_bleaching',
    title: 'Branqueamento dos corais',
    what: 'O coral perdeu cor e ficou claro.',
    cause: 'Sob estresse prolongado, o coral expulsa as algas simbiontes que vivem em seus tecidos.',
    effect: 'Sem elas, perde parte importante da fonte de energia e fica mais sujeito à morte.',
    ask: 'Se a causa parar agora, quanto tempo o coral leva para se recuperar?',
    tone: 'alert',
    matches: (state) => state.health.coral < 72,
  },
  {
    id: 'algae_overgrowth',
    title: 'Algas dominam o recife',
    what: 'A cobertura de algas passou a maior parte do substrato disponível.',
    cause: 'Nutrientes em excesso, espaço aberto pela morte dos corais e menos herbívoros para raspar as algas.',
    effect: 'O recife deixa de ser um sistema dominado por corais e passa a ser dominado por algas.',
    ask: 'Por que reduzir os nutrientes costuma ser o primeiro passo?',
    tone: 'alert',
    matches: (state) => calculateAlgae(state.env, state.health) >= 62,
  },
  {
    id: 'parrotfish_decline',
    title: 'Peixe-papagaio em declínio',
    what: 'A espécie mais sensível às mudanças da água já está em queda acelerada.',
    cause: 'É uma espécie que cresce devagar e vive muitos anos, então sente cada período de estresse por mais tempo.',
    effect: 'A raspagem de algas diminui, o recife perde areia produzida por ele e as algas avançam.',
    ask: 'Que diferenças entre as espécies explicam quem resiste mais tempo?',
    tone: 'alert',
    matches: (state) => state.species.parrotfish < 50,
  },
  {
    id: 'fish_decline',
    title: 'Peixes desaparecem do recife',
    what: 'Parte dos peixes já não resiste às condições do ambiente e a comunidade encolhe.',
    cause: 'Somatório de calor e poluição sobre espécies com tolerâncias diferentes.',
    effect: 'Menos peixes significam menos controle de algas e menos dispersão de nutrientes.',
    ask: 'Qual das três espécies resistiu mais tempo? Por quê?',
    tone: 'alert',
    matches: (state) => state.health.fish < 50,
  },
  {
    id: 'coral_collapse',
    title: 'Morte dos corais construtores',
    what: 'Grande parte do coral já morreu e o esqueleto fica exposto.',
    cause: 'Estresse prolongado sem trégua, acima do limite de tolerância dos corais.',
    effect: 'Sem corais vivos o recife perde estrutura, abrigo e capacidade de crescer.',
    ask: 'Ainda é possível recuperar? O que precisa mudar primeiro?',
    tone: 'alert',
    matches: (state) => state.health.coral < 25,
  },
  {
    id: 'recovery_signs',
    title: 'Sinais de recuperação',
    what: 'Depois de um período de estresse, a saúde do recife voltou a subir.',
    cause: 'Os fatores que causavam dano foram reduzidos e o ambiente voltou para dentro do que os organismos toleram.',
    effect: 'A volta é mais lenta do que a degradação: cada dia sem estresse conta para corais e peixes.',
    ask: 'Quanto tempo leva para recuperar o que foi perdido?',
    tone: 'positive',
    matches: (state) => {
      // Só é recuperação se a saúde estiver subindo de verdade (últimos 7 dias).
      const weekAgo = state.history[Math.max(0, state.history.length - 8)];
      return state.overall > 55 && state.overall > weekAgo.overall + 1;
    },
  },
  {
    id: 'reef_restored',
    title: 'Recife recuperado',
    what: 'Coral e peixes voltaram a um patamar saudável.',
    cause: 'Fatores ambientais sob controle por tempo suficiente.',
    effect: 'O sistema volta a sustentar as três espécies e a cobertura de coral vivo.',
    ask: 'O que você faria para manter esse resultado ao longo dos anos?',
    tone: 'positive',
    matches: (state) => state.overall >= 85 && state.elapsedDays > 30,
  },
];

/**
 * Pausa mínima, em segundos reais, entre dois marcos no painel.
 *
 * Em 10× a simulação cruza vários limiares por segundo e o painel trocava de
 * texto várias vezes seguidas (parecia que a página se recarregava). Com a
 * pausa, cada marco fica legível — os que passarem ficam registrados no
 * histórico da linha do tempo.
 */
const MESSAGE_COOLDOWN_SECONDS = 2.2;

export function evaluateMessages(state: SimulationState): SimulationState {
  if (state.messageCooldown > 0) return state;

  const nextMessage = EDUCATIONAL_MESSAGES.find(
    (message) => !state.firedMessages.has(message.id) && message.matches(state),
  );

  if (!nextMessage) return state;

  const firedMessages = new Set(state.firedMessages);
  firedMessages.add(nextMessage.id);
  return {
    ...state,
    firedMessages,
    events: [...state.events, { id: nextMessage.id, day: Math.round(state.elapsedDays) }],
    latestMessageId: nextMessage.id,
    messageCooldown: MESSAGE_COOLDOWN_SECONDS,
  };
}

export function getMessage(id: string | null) {
  return EDUCATIONAL_MESSAGES.find((message) => message.id === id) ?? INTRO_MESSAGE;
}

export function getMessageById(id: string) {
  return [...EDUCATIONAL_MESSAGES, INTRO_MESSAGE].find((message) => message.id === id) ?? INTRO_MESSAGE;
}
