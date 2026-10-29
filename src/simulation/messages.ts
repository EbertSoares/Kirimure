import { calculateAlgae, calculateTrophicBalance } from './model';
import type { EducationalMessage, SimulationState } from './types';

export const INTRO_MESSAGE: EducationalMessage = {
  id: 'intro',
  title: 'Comece com uma hipótese',
  badge: 'Cenário Didático',
  what: 'O recife está saudável. Use este estado como referência antes de alterar o ambiente.',
  cause: 'As condições começam nas referências ambientais adotadas pelo modelo.',
  effect: 'A simulação começa assim que você aplica uma nova condição.',
  ask: 'Qual fator causará a primeira mudança visível? Por quê?',
  tone: 'neutral',
  matches: () => false,
};

export const EDUCATIONAL_MESSAGES: EducationalMessage[] = [
  {
    id: 'thermal_stress',
    title: 'Estresse térmico acumulado nos corais',
    badge: 'Cenário Didático',
    what: 'O estresse térmico simulado começou a subir: intensidade e duração do calor estão se acumulando.',
    cause: 'No cenário local (MMM didática = 28,0 °C), temperaturas a partir de 29,0 °C acumulam dose térmica na janela móvel de 84 dias.',
    effect: 'O coral gasta mais energia metabólica, cresce menos e perde estabilidade na simbiose com zooxantelas.',
    ask: 'O que acontece com o estresse acumulado logo após a temperatura voltar para menos de 29 °C?',
    tone: 'alert',
    matches: (state) => state.degreeHeatingWeeks >= 1,
  },
  {
    id: 'acidification',
    title: 'Acidificação da água',
    badge: 'Cenário Didático',
    what: 'O pH caiu e a água ficou menos alcalina.',
    cause: 'O gás carbônico dissolvido forma ácido carbônico e libera íons de hidrogênio.',
    effect: 'Quedas no pH reduzem a saturação de aragonita, dificultando a calcificação do esqueleto de corais.',
    ask: 'Por que o coral sente antes de o pH ficar ácido de verdade?',
    tone: 'alert',
    matches: (state) => state.exposure.acidification >= 3,
  },
  {
    id: 'sewage_bloom',
    title: 'Proliferação de algas',
    badge: 'Regra do Modelo',
    what: 'As algas estão crescendo rápido e ocupando o espaço do coral.',
    cause: 'Esgoto sem tratamento leva nutrientes, principalmente nitrogênio e fósforo.',
    effect: 'Algas cobrem o substrato, competem por luz e a decomposição da DBO consome o oxigênio da água.',
    ask: 'Sem o esgoto, o que ainda poderia favorecer as algas?',
    tone: 'alert',
    matches: (state) => state.exposure.sewage >= 3,
  },
  {
    id: 'hypoxia_warning',
    title: 'Queda de oxigênio (Hipóxia)',
    badge: 'Padrão Operacional',
    what: 'A concentração de oxigênio dissolvido caiu para níveis críticos de estresse respiratório.',
    cause: 'A degradação bacteriana da carga orgânica de DBO consome o oxigênio da coluna d’água.',
    effect: 'Peixes sensíveis apresentam fuga, redução de atividade e, sob hipóxia severa prolongada (< 2 mg/L), risco de asfixia.',
    ask: 'O que acelera a volta do oxigênio quando a carga de esgoto é interrompida?',
    tone: 'alert',
    matches: (state) => state.dissolvedOxygen < 3.5,
  },
  {
    id: 'severe_hypoxia',
    title: 'Hipóxia severa (< 2,0 mg/L)',
    badge: 'Padrão Operacional',
    what: 'A concentração de oxigênio dissolvido caiu para nível crítico de asfixia aquática.',
    cause: 'Alta demanda de oxigênio pela degradação da matéria orgânica (DBO) superou a oxigenação pela superfície.',
    effect: 'Risco iminente de mortalidade de peixes por asfixia e retração profunda das colônias de coral.',
    ask: 'Quais medidas de saneamento e tratamento de efluentes evitam a hipóxia na baía?',
    tone: 'alert',
    matches: (state) => state.dissolvedOxygen < 2.0,
  },
  {
    id: 'oil_film',
    title: 'Película de óleo na superfície',
    badge: 'Dado Local BTS',
    what: 'Uma mancha escura se espalha pela superfície e bloqueia a luz.',
    cause: 'O óleo é menos denso que a água e espalha-se na superfície, atenuando a radiação solar.',
    effect: 'Além do bloqueio óptico, frações de tPAH50 geram inibição celular subletal em pólipos de corais (May et al., 2020).',
    ask: 'Como o óleo chega até o fundo, onde ficam os corais?',
    tone: 'alert',
    matches: (state) => state.exposure.oil >= 3,
  },
  {
    id: 'microplastics_chain',
    title: 'Microplásticos na cadeia alimentar',
    badge: 'Dado Local BTS',
    what: 'Fragmentos pequenos estão por toda a água, no tamanho do alimento dos peixes.',
    cause: 'Estuários da BTS registram média de 5.176 a 32.784 partículas/m³ (Trindade et al., 2023). Partículas menores que 5 mm acumulam-se no ecossistema.',
    effect: 'Animais ingerem as partículas por engano e a exposição se acumula ao longo da cadeia alimentar.',
    ask: 'Que ações reduzem a chegada de plástico ao mar?',
    tone: 'alert',
    matches: (state) => state.exposure.microplastics >= 5,
  },
  {
    id: 'trophic_imbalance',
    title: 'Teia alimentar desequilibrada',
    badge: 'Regra do Modelo',
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
    badge: 'Padrão Operacional',
    what: 'O coral perdeu cor e ficou claro.',
    cause: 'A partir de 4 °C-semana (Alerta Nível 1), o NOAA considera provável o risco de branqueamento significativo; a 8 °C-semana, atinge espécies sensíveis.',
    effect: 'Sem as algas simbiontes, o coral perde sua fonte primária de energia e fica sujeito à mortalidade crônica.',
    ask: 'Se a causa parar agora, quanto tempo o coral leva para se recuperar?',
    tone: 'alert',
    matches: (state) => state.degreeHeatingWeeks >= 4 || state.health.coral < 72,
  },
  {
    id: 'severe_bleaching_alert',
    title: 'Alerta de Branqueamento Nível 2 (DHW ≥ 8)',
    badge: 'Padrão Operacional',
    what: 'O estresse térmico acumulado alcançou 8 °C-semana, o patamar máximo de risco biológico.',
    cause: 'Persistência prolongada de anomalia térmica superior a 1 °C acima da climatologia de verão.',
    effect: 'Branqueamento generalizado em escala de recife e mortalidade de colônias sensíveis (Mussismilia / Siderastrea).',
    ask: 'Por que o branqueamento continua mesmo alguns dias após a temperatura da água começar a cair?',
    tone: 'alert',
    matches: (state) => state.degreeHeatingWeeks >= 8,
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
    what: 'Coral e peixes voltaram a um patamar saudável após superarem período de estresse.',
    cause: 'Fatores ambientais estabilizados na faixa de tolerância por tempo suficiente.',
    effect: 'O sistema voltou a sustentar a biodiversidade e a cobertura de corais vivos.',
    ask: 'O que você faria para manter esse resultado ao longo dos anos?',
    tone: 'positive',
    matches: (state) => state.everDegraded && state.overall >= 85 && state.elapsedDays > 30,
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
