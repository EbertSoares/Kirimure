import React, { useEffect, useRef } from 'react';
import type { EpistemologicalBadge } from '../simulation/types';

export type IndicatorDetailId =
  | 'temperature'
  | 'ph'
  | 'dhw'
  | 'dissolvedOxygen'
  | 'time'
  | 'overall'
  | 'coral'
  | 'fish';

export interface IndicatorDetail {
  title: string;
  symbol: string;
  unit: string;
  badge: EpistemologicalBadge;
  interpretation: string;
  howToInterpret?: string;
  methodAndLimitations: string;
}

export const INDICATOR_DETAILS: Record<IndicatorDetailId, IndicatorDetail> = {
  temperature: {
    title: 'Temperatura da água',
    symbol: 'T',
    unit: '°C',
    badge: 'Cenário Didático',
    interpretation:
      'A temperatura influencia a solubilidade do oxigênio e o estresse térmico dos corais. O efeito depende da intensidade e da duração do aquecimento. Para avaliar o estresse térmico, consulte o HotSpot e o DHW associados à climatologia do produto NOAA.',
    howToInterpret:
      'Na Baía de Todos-os-Santos, a média histórica oscila entre 25,0 °C e 28,0 °C. O aquecimento persistente acima da Máxima Mensal Média (MMM de 28,0 °C) deflagra estresse térmico cumulativo.',
    methodAndLimitations:
      'O valor exibido pode ser a temperatura imposta pelo usuário no cenário didático, uma condição inicial derivada de satélite NOAA CRW ou uma estimativa de modelo. Não representa uma medição pontual in situ com termômetro físico de campo.',
  },
  dhw: {
    title: 'DHW — calor acumulado',
    symbol: 'DHW',
    unit: '°C-semanas',
    badge: 'Produto de Modelo',
    interpretation:
      'O DHW acumula o estresse térmico ao longo de 12 semanas (84 dias). Valores de 4 °C-semanas ou mais indicam aumento do risco de branqueamento; a partir de 8 °C-semanas, aumenta a preocupação com impactos severos, incluindo mortalidade de corais sensíveis. A resposta depende da espécie e das condições locais.',
    howToInterpret:
      '0 a 4 °C-sem: sem estresse severo · 4 a 8 °C-sem: risco de branqueamento moderado a severo · > 8 °C-sem: estresse severo com risco de mortalidade para espécies sensíveis.',
    methodAndLimitations:
      'No Kirimurê, o DHW do cenário é uma estimativa didática calculada pela janela móvel de 84 dias sobre a MMM fixa de 28,0 °C. No painel de dados externos, o valor oficial do NOAA CRW 5km v3.1 baseia-se na climatologia do pixel de satélite.',
  },
  ph: {
    title: 'pH da água',
    symbol: 'pH',
    unit: 'escala total',
    badge: 'Produto de Modelo',
    interpretation:
      'O pH caracteriza a acidez da água marinha. Sua interpretação depende das condições ambientais e do sistema carbonato. Neste cenário, o valor reflete a condição imposta pelo usuário acoplada ao dióxido de carbono (CO₂) liberado pela respiração bacteriana da matéria orgânica.',
    howToInterpret:
      'Oceano aberto saudável: tipicamente 8,05 a 8,20. Em enseadas e estuários com alto aporte orgânico, a respiração heterotrófica deprime o pH para faixas entre 7,70 e 7,95.',
    methodAndLimitations:
      'Equilíbrio termodinâmico do sistema carbonato (Lueker et al., 2000; Dickson, 1990) com constantes de dissociação de CO₂ e alcalinidade total escalada pela salinidade local. A respiração microbiana adiciona carbono inorgânico dissolvido (DIC) com razão estequiométrica RQ = 1,0 mol CO₂ por mol O₂ consumido, atenuado pela renovação hidrodinâmica do compartimento.',
  },
  dissolvedOxygen: {
    title: 'Oxigênio dissolvido',
    symbol: 'OD',
    unit: 'mg O₂/L',
    badge: 'Padrão Operacional',
    interpretation:
      'O OD indica quanto oxigênio está disponível na água para a respiração aquática. A queda pode ocorrer quando a demanda biológica supera a reposição por reaeração e mistura. O valor mostrado é uma estimativa do modelo para este cenário.',
    howToInterpret:
      'Referência normativa CONAMA 357 (Águas salinas Classe Especial/1: ≥ 5,0 mg/L). Interpretação biológica: 3,0 a 4,9 mg/L indica estresse respiratório inicial; abaixo de 2,0 mg/L ocorre hipóxia severa com risco agudo de asfixia em peixes e invertebrados bentônicos.',
    methodAndLimitations:
      'Balanço acoplado com solubilidade de Weiss (1970), taxa de reaeração ar-mar dependente da profundidade e do vento (O\'Connor-Dobbins), consumo bacteriano de DBO (Streeter-Phelps), demanda bentônica do sedimento (Bowie et al., 1985) e fotossíntese líquida algal.',
  },
  overall: {
    title: 'Índice relativo do recife',
    symbol: 'Recife',
    unit: 'escala 0–100',
    badge: 'Regra do Modelo',
    interpretation:
      'Resume as regras internas do modelo computacional do cenário didático (escala 0 a 100), combinando a integridade dos corais e a vitalidade da ictiofauna.',
    howToInterpret:
      '≥ 67/100: Condição de referência equilibrada · 34 a 66/100: Atenção e degradação progressiva · < 34/100: Faixa crítica com alto comprometimento estrutural.',
    methodAndLimitations:
      'Este valor é um índice didático interno do modelo (0 a 100). Ele NÃO equivale a medição de cobertura coralina, biomassa pesqueira, mortalidade observada ou censo populacional de campo.',
  },
  coral: {
    title: 'Índice relativo dos corais',
    symbol: 'Corais',
    unit: 'escala 0–100',
    badge: 'Regra do Modelo',
    interpretation:
      'Representa a capacidade relativa de sustentação do tecido vivo dos corais construtores frente às pressões combinadas de calor, acidificação e poluição.',
    howToInterpret:
      '≥ 67/100: Colônias estáveis · 34 a 66/100: Estresse térmico, palidez ou branqueamento parcial · < 34/100: Necrose tecidual simulada e comprometimento do esqueleto calcário.',
    methodAndLimitations:
      'Índice didático parametrizado com sinergia não-linear entre calor acumulado (DHW), grau de saturação de aragonita e contaminantes. Não constitui censo empírico de cobertura de recife.',
  },
  fish: {
    title: 'Índice relativo da fauna',
    symbol: 'Fauna',
    unit: 'escala 0–100',
    badge: 'Regra do Modelo',
    interpretation:
      'Representa a vitalidade e presença das populações de peixes recifais (herbívoros raspadores, onívoros e predadores) na enseada simulada.',
    howToInterpret:
      '≥ 67/100: Cardumes ativos em forrageamento · 34 a 66/100: Estresse subletal ou dispersão · < 34/100: Evasão acentuada e risco de asfixia sob hipóxia severa.',
    methodAndLimitations:
      'Acoplamento com a curva de tolerância à hipóxia (< 3,0 mg/L), bioacumulação de microplásticos, toxicidade de HPAs e pressão pesqueira. Resume regras didáticas internas do cenário.',
  },
  time: {
    title: 'Tempo simulado',
    symbol: 't',
    unit: 'dias / meses',
    badge: 'Cenário Didático',
    interpretation:
      'Indica a escala temporal do experimento virtual transcorrido na baía, permitindo observar a velocidade de relaxamento de distúrbios e a dinâmica de renovação hidrodinâmica.',
    howToInterpret:
      'Permite acompanhar como processos ecológicos (renovação pelas marés de 6 a 75 dias, decomposição bacteriana e resiliência) se desenvolvem ao longo do tempo.',
    methodAndLimitations:
      'Integração numérica com sub-stepping de Euler (passo máximo de 0,05 dias), garantindo invariância matemática dos resultados independentemente da velocidade de exibição (1× a 10×).',
  },
};

export interface IndicatorContextCardProps {
  indicatorId: IndicatorDetailId;
  currentValue?: string;
  onClose?: () => void;
  isInline?: boolean;
}

export function IndicatorContextCard({
  indicatorId,
  currentValue,
  onClose,
  isInline = false,
}: IndicatorContextCardProps) {
  const detail = INDICATOR_DETAILS[indicatorId];
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!detail) return null;

  return (
    <article
      className={`indicator-context-card ${isInline ? 'is-inline' : 'is-standalone'}`}
      aria-labelledby="indicator-context-title"
    >
      <header className="indicator-context-header">
        <div className="indicator-context-meta">
          <span className="indicator-symbol-badge">
            {detail.symbol} · {detail.unit}
          </span>
          <span className="epistemological-badge contextual-badge">
            {detail.badge}
          </span>
        </div>

        {onClose && (
          <button
            type="button"
            ref={closeButtonRef}
            className="indicator-context-close"
            onClick={onClose}
            title="Fechar detalhes contextuais"
            aria-label="Fechar detalhes contextuais"
          >
            ✕
          </button>
        )}
      </header>

      <div className="indicator-context-main">
        <h3 id="indicator-context-title" className="indicator-context-title">
          {detail.title}
        </h3>

        {currentValue && (
          <div className="indicator-context-value-box">
            <span className="value-label">Valor no cenário:</span>
            <strong className="value-number">{currentValue}</strong>
          </div>
        )}

        <section className="indicator-context-block">
          <h4 className="context-subheading">Interpretação</h4>
          <p className="context-text">{detail.interpretation}</p>
        </section>

        {detail.howToInterpret && (
          <section className="indicator-context-block">
            <h4 className="context-subheading">Como interpretar</h4>
            <p className="context-text reference">{detail.howToInterpret}</p>
          </section>
        )}

        <details className="indicator-context-details-fold">
          <summary className="fold-summary">
            Método, Equação e Limitações
          </summary>
          <div className="fold-content">
            <p>{detail.methodAndLimitations}</p>
          </div>
        </details>
      </div>
    </article>
  );
}

/**
 * Componente de retrocompatibilidade para cenários onde uma gaveta contextual é aberta.
 * Não bloqueia a tela com overlay escuro nem interrompe a visão do modelo marinho.
 */
export function IndicatorModal({
  indicatorId,
  onClose,
  currentValue,
}: {
  indicatorId: IndicatorDetailId | null;
  onClose: () => void;
  currentValue?: string;
}) {
  if (!indicatorId) return null;

  return (
    <aside className="indicator-floating-drawer" role="complementary" aria-label="Detalhes contextuais do indicador">
      <IndicatorContextCard
        indicatorId={indicatorId}
        currentValue={currentValue}
        onClose={onClose}
      />
    </aside>
  );
}
