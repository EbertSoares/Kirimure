export type InterventionId =
  | 'wastewaterTreatment'
  | 'microplasticInterception'
  | 'oilContainmentSkimming'
  | 'erosionControl'
  | 'marineProtectedArea'
  | 'coralRestoration'
  | 'co2Mitigation';

export interface ActiveIntervention {
  id: InterventionId;
  startedAtDay: number;
  intensity: number; // 0..1; escala de implementação do cenário
  status: 'active' | 'completed' | 'paused';
}

export type InterventionMechanism =
  | 'reduceInput'
  | 'removeSurfaceStock'
  | 'reduceMortality'
  | 'increaseRecruitment'
  | 'longTermForcing';

export type InterventionEvidenceLabel =
  | 'Estabelecido'
  | 'Dependente do contexto'
  | 'Em desenvolvimento';

export interface InterventionDefinition {
  id: InterventionId;
  title: string;
  description: string; // 1 frase curta
  targets: readonly string[];
  mechanism: InterventionMechanism;
  effectLabel: string;
  activeStatusLabel: string;
  onsetLabel: string;
  evidenceLabel: InterventionEvidenceLabel;
  modeled: boolean;
  limitation: string;
  timeframeNote: string;
  scientificBasis: string;
  icon: 'sewage' | 'bottle' | 'drop' | 'sediment' | 'shield' | 'coral' | 'leaf';
}

export const INTERVENTIONS: readonly InterventionDefinition[] = [
  {
    id: 'wastewaterTreatment',
    title: 'Tratar esgoto',
    description: 'Reduz a carga orgânica lançada na água.',
    targets: ['sewage'],
    mechanism: 'reduceInput',
    effectLabel: 'Reduz o aporte futuro de DBO₅',
    activeStatusLabel: 'Reduzindo novas entradas de matéria orgânica',
    onsetLabel: 'Após entrar em operação',
    evidenceLabel: 'Estabelecido',
    modeled: true,
    limitation: 'O efeito depende da eficiência do tratamento e da renovação da água; a matéria orgânica já lançada continua consumindo oxigênio até ser oxidada ou dispersa.',
    timeframeNote: 'A carga descarregada cai com a operação; o oxigênio responde em dias a semanas conforme mistura, enquanto comunidades bentônicas podem levar anos.',
    scientificBasis: 'Balanço de DBO/reaeração (Bowie et al., 1985); diretrizes de redução de nutrientes e efluentes costeiros (NOAA Ocean Service; WISER).',
    icon: 'sewage',
  },
  {
    id: 'microplasticInterception',
    title: 'Interceptar microplásticos',
    description: 'Retém partículas antes que cheguem à baía.',
    targets: ['microplastics'],
    mechanism: 'reduceInput',
    effectLabel: 'Reduz o aporte futuro',
    activeStatusLabel: 'Reduzindo novas entradas na fonte',
    onsetLabel: 'Reduz o aporte futuro',
    evidenceLabel: 'Dependente do contexto',
    modeled: true,
    limitation: 'Não remove instantaneamente as partículas já dispersas; o material capturado em barreiras ou lodo de tratamento precisa de destinação adequada.',
    timeframeNote: 'A retenção na fonte atua após implantação; a concentração já espalhada na baía cai gradualmente conforme renovação hidrodinâmica.',
    scientificBasis: 'Soluções da fonte ao mar para plásticos (UNEP/IWMI) e revisão de retenção em estações de tratamento (Science of the Total Environment, 2024).',
    icon: 'bottle',
  },
  {
    id: 'oilContainmentSkimming',
    title: 'Conter e recolher óleo',
    description: 'Limita o espalhamento e recolhe óleo superficial.',
    targets: ['oil'],
    mechanism: 'removeSurfaceStock',
    effectLabel: 'Remove parte do óleo superficial',
    activeStatusLabel: 'Recolhendo filme superficial acessível',
    onsetLabel: 'Resposta emergencial',
    evidenceLabel: 'Estabelecido',
    modeled: true,
    limitation: 'A eficiência depende do estado do mar, espessura, tipo de óleo e acesso; não recolhe frações já evaporadas, dissolvidas (tPAH50) ou sedimentadas.',
    timeframeNote: 'A contenção começa após mobilização; a recuperação ecológica costeira pode exigir anos ou décadas conforme habitat e óleo remanescente.',
    scientificBasis: 'Modelagem operacional de contenção e skimming superficial (NOAA Ocean Service; NOAA WebGNOME).',
    icon: 'drop',
  },
  {
    id: 'erosionControl',
    title: 'Controlar erosão',
    description: 'Reduz a entrada de sedimentos de margens e drenagem.',
    targets: ['turbidity'],
    mechanism: 'reduceInput',
    effectLabel: 'Reduz novas entradas de sedimento',
    activeStatusLabel: 'Reduzindo aporte de partículas em suspensão',
    onsetLabel: 'Reduz novas entradas',
    evidenceLabel: 'Estabelecido',
    modeled: true,
    limitation: 'A água só clareia à medida que partículas saem da suspensão por deposição e troca de maré; barreiras de obra não controlam toda a bacia.',
    timeframeNote: 'Após eventos isolados, a transparência melhora gradualmente com deposição e correntes; aporte crônico de bacia exige manejo contínuo.',
    scientificBasis: 'Dinâmica de sedimentos suspensos e transparência estuarina (USGS; manual de monitoramento estuarino EPA/NOAA).',
    icon: 'sediment',
  },
  {
    id: 'marineProtectedArea',
    title: 'Proteger área marinha',
    description: 'Reduz mortalidade pesqueira na área protegida.',
    targets: ['fishing'],
    mechanism: 'reduceMortality',
    effectLabel: 'Reduz mortalidade pesqueira no cenário',
    activeStatusLabel: 'Regra de proteção reduzindo esforço pesqueiro',
    onsetLabel: 'Regra ativa desde o início',
    evidenceLabel: 'Dependente do contexto',
    modeled: true,
    limitation: 'A recuperação populacional é gradual, depende das espécies e da fiscalização, e não protege contra água quente, hipóxia ou óleo.',
    timeframeNote: 'A redução de captura vale com a proteção ativa; a recomposição de herbívoros recifais costuma requerer anos.',
    scientificBasis: 'Reconstrução de estoques pesqueiros e resiliência de herbívoros recifais (NOAA Fisheries; NOAA Reef Resilience).',
    icon: 'shield',
  },
  {
    id: 'coralRestoration',
    title: 'Restaurar corais',
    description: 'Apoia a recuperação depois de reduzir os estressores.',
    targets: ['coral'],
    mechanism: 'increaseRecruitment',
    effectLabel: 'Apoio pós-controle de estressores',
    activeStatusLabel: 'Exploração conceitual (sem bônus numérico)',
    onsetLabel: 'Meses a anos; depende do local',
    evidenceLabel: 'Dependente do contexto',
    modeled: false,
    limitation: 'Não aplica bônus automático de saúde: viveiros e transplantes falham se calor, óleo, hipóxia ou sedimentação continuarem elevados.',
    timeframeNote: 'Crescimento e estabelecimento coralino levam anos e exigem qualidade da água previamente estabilizada.',
    scientificBasis: 'Restauração ativa de habitats coralinos condicionada à redução prévia de estressores locais (NOAA Fisheries; NOAA Ocean Service).',
    icon: 'coral',
  },
  {
    id: 'co2Mitigation',
    title: 'Reduzir emissões de CO₂',
    description: 'Ajuda a limitar a pressão climática futura.',
    targets: ['temperature', 'ph'],
    mechanism: 'longTermForcing',
    effectLabel: 'Mitigação climática de longo prazo',
    activeStatusLabel: 'Exploração conceitual (escala climática global)',
    onsetLabel: 'Longo prazo',
    evidenceLabel: 'Estabelecido',
    modeled: false,
    limitation: 'Não reduz imediatamente a temperatura nem corrige o pH atual da baía; requer cenários climáticos globais acoplados.',
    timeframeNote: 'Atua em décadas sobre a trajetória futura de aquecimento e acidificação oceânica, não como limpeza local imediata.',
    scientificBasis: 'Mitigação de emissões de carbono para aquecimento e acidificação oceânica (NOAA Ocean Acidification Program).',
    icon: 'leaf',
  },
] as const;

export function getInterventionDefinition(id: InterventionId): InterventionDefinition {
  const found = INTERVENTIONS.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Unknown intervention id: ${id}`);
  }
  return found;
}
