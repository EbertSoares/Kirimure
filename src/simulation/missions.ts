import type { MissionDefinition } from './types';
import { BASELINE } from './config';

export const MISSION_01_OXYGEN: MissionDefinition = {
  id: 'missao-oxigenio',
  title: 'Investigação 1 · Oxigênio dissolvido',
  subtitle: 'Como o aporte de matéria orgânica afeta o oxigênio e os peixes?',
  targetGrade: '6º ao 9º ano (11 a 14 anos)',
  estimatedMinutes: 45,
  question:
    'Um canal passa a despejar efluente com matéria orgânica nesta enseada da Baía de Todos-os-Santos. Como esse aporte afeta a concentração de oxigênio dissolvido e a respiração dos peixes ao longo do tempo?',
  hypotheses: [
    {
      id: 'toxina',
      label: 'O esgoto envenena os peixes por contato químico tóxico quase imediato.',
      isCorrectMechanism: false,
      explanation:
        'O esgoto doméstico comum raramente age como veneno fulminante direto. O perigo mais agudo decorre do consumo de oxigênio pelas bactérias durante a decomposição biológica.',
    },
    {
      id: 'bacterias-od',
      label: 'Bactérias consomem o oxigênio da água ao decompor a matéria orgânica, asfixiando os peixes aos poucos.',
      isCorrectMechanism: true,
      explanation:
        'Exato! A quebra biológica da matéria orgânica (demanda bioquímica de oxigênio — DBO) estimula bactérias decompositoras aeróbicas que esgotam o oxigênio dissolvido (OD), provocando hipóxia.',
    },
    {
      id: 'superficie',
      label: 'A poluição fica apenas na flor da água e não atinge quem nada no fundo.',
      isCorrectMechanism: false,
      explanation:
        'A matéria orgânica fina e os microrganismos misturam-se com as marés e correntes ao longo da coluna d\'água, drenando o oxigênio da enseada como um todo.',
    },
  ],
  focusFactor: 'sewage',
  defaultControls: {
    ...BASELINE,
    sewage: 0,
  },
  targetLoad: 5000, // 5.000 kg DBO
  solutionControls: {
    sewage: 100, // ETE reduz carga para nível residual
  },
  transferQuestion:
    'Em uma praia de Salvador ou da sua cidade após uma chuva forte, a água costuma ficar escura perto de saídas de canais ou galerias pluviais. Com base no que você descobriu no laboratório, o que você explicaria para um amigo sobre o risco para os peixes e banhistas ali nos dias seguintes?',
};

export const MISSIONS: readonly MissionDefinition[] = [MISSION_01_OXYGEN];
