import React, { useEffect } from 'react';
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

interface IndicatorDetail {
  title: string;
  symbol: string;
  unit: string;
  badge: EpistemologicalBadge;
  whatItMeasures: string;
  referenceRange: string;
  ecologicalRole: string;
  modelNote: string;
}

const INDICATOR_DETAILS: Record<IndicatorDetailId, IndicatorDetail> = {
  temperature: {
    title: 'Temperatura da Superfície',
    symbol: 'T',
    unit: '°C',
    badge: 'Cenário Didático',
    whatItMeasures: 'Mede o calor médio na camada superficial da água, onde incide a luz solar e vive a maioria dos peixes e corais.',
    referenceRange: 'Baía de Todos-os-Santos: média de 25 °C a 28 °C. Acima de 29 °C inicia-se estresse térmico para recifes tropicais.',
    ecologicalRole: 'Águas quentes retêm menos oxigênio dissolvido. O calor extremo força corais a expelirem suas microalgas (zooxantelas), causando branqueamento.',
    modelNote: 'Cenário didático simplificado com base no clima tropical costeiro baiano. O HotSpot NOAA CRW considera anomalias acima da MMM (28,0 °C).',
  },
  ph: {
    title: 'Potencial Hidrogeniônico (pH)',
    symbol: 'pH',
    unit: 'escala logarítmica',
    badge: 'Cenário Didático',
    whatItMeasures: 'Mede a concentração de íons de hidrogênio, determinando se a água é neutra, ácida ou alcalina.',
    referenceRange: 'Oceano saudável: 8,10 a 8,20 (levemente alcalino). Valores abaixo de 7,8 indicam acidificação crítica.',
    ecologicalRole: 'A absorção de dióxido de carbono (CO₂) reduz o pH, dissolvendo ou dificultando a produção de esqueletos de carbonato de cálcio (CaCO₃) por corais e conchas.',
    modelNote: 'Estimativa baseada no equilíbrio químico dos carbonatos oceânicos e no balanço de acidez costeira.',
  },
  dhw: {
    title: 'Grau-Semanas de Aquecimento (DHW)',
    symbol: 'DHW',
    unit: '°C-semanas',
    badge: 'Padrão Operacional',
    whatItMeasures: 'Mede a dose cumulativa de calor acima da temperatura máxima normal de verão nas últimas 12 semanas consecutivas.',
    referenceRange: '0–4 °C-sem: sem estresse severo · 4–8 °C-sem: branqueamento provável · > 8 °C-sem: mortalidade generalizada de corais.',
    ecologicalRole: 'Corais toleram picos rápidos de calor de 1 ou 2 dias, mas sucumbem quando a água permanece anormalmente quente por semanas a fio.',
    modelNote: 'Padrão operacional global da NOAA (Coral Reef Watch v3.1) para monitoramento de ondas de calor marinhas.',
  },
  dissolvedOxygen: {
    title: 'Oxigênio Dissolvido (OD)',
    symbol: 'OD',
    unit: 'mg/L',
    badge: 'Padrão Operacional',
    whatItMeasures: 'Concentração de gás oxigênio livre misturado na água, absolutamente essencial para a respiração de peixes, mariscos e corais.',
    referenceRange: '≥ 5,0 mg/L: Normóxia / Adequado (CONAMA 357) · 3,0 a 4,9 mg/L: Estresse respiratório · 2,0 a 2,9 mg/L: Hipóxia · < 2,0 mg/L: Hipóxia severa / Asfixia · ~0,0 mg/L: Anóxia.',
    ecologicalRole: 'Peixes extraem o oxigênio pelas brânquias. Quando a concentração cai abaixo de 2 mg/L, ocorre hipóxia severa: cardumes fogem ou sobem à superfície; organismos bentônicos sofrem asfixia aguda.',
    modelNote: 'Balanço acoplado com solubilidade de Weiss (1970), reaeração superficial ar-mar (ka), consumo bacteriano de DBO (kd) e demanda bentônica do sedimento.',
  },
  time: {
    title: 'Tempo Simulado',
    symbol: 't',
    unit: 'dias',
    badge: 'Cenário Didático',
    whatItMeasures: 'Indica quantos dias se passaram no experimento virtual desde o início do cenário didático.',
    referenceRange: 'Varia de minutos de simulação a dias e meses acumulados.',
    ecologicalRole: 'Permite acompanhar como processos biológicos lentos (tempo de renovação das marés, decomposição bacteriana e resiliência) ocorrem no ritmo da natureza.',
    modelNote: 'Integração temporal discreta no ritmo selecionado pelo usuário (1× a 10×).',
  },
  overall: {
    title: 'Índice de Resiliência do Cenário',
    symbol: 'Índice',
    unit: 'índice (0–100)',
    badge: 'Regra do Modelo',
    whatItMeasures: 'Média ponderada da integridade física dos corais e da sobrevivência da fauna em relação à enseada saudável de referência (100).',
    referenceRange: '≥ 67: Saudável · 34 a 66: Atenção / Degradação inicial · < 34: Crítico / Risco de colapso.',
    ecologicalRole: 'Oferece uma visão sistêmica rápida do estado de equilíbrio da teia trófica e da estrutura recifal sob as pressões ativas.',
    modelNote: 'Índice pedagógico interno do modelo computacional (0 a 100). Não equivale a porcentagem direta de biomassa coletada no mar.',
  },
  coral: {
    title: 'Índice de Saúde dos Corais',
    symbol: 'Corais',
    unit: 'índice (0–100)',
    badge: 'Regra do Modelo',
    whatItMeasures: 'Capacidade de sustentação e integridade do tecido vivo dos corais pétreos frente às pressões simuladas.',
    referenceRange: '≥ 67: Colônias sadias · 34 a 66: Branqueamento ou sufocamento parcial · < 34: Necrose tecidual / Morte.',
    ecologicalRole: 'Os corais constroem a estrutura física tridimensional que abriga milhares de espécies marinhas na Baía de Todos-os-Santos.',
    modelNote: 'Índice didático derivado de estresse térmico (DHW), acidificação, deposição de óleo e atenuação de luz por turbidez.',
  },
  fish: {
    title: 'Índice de Saúde da Fauna',
    symbol: 'Fauna',
    unit: 'índice (0–100)',
    badge: 'Regra do Modelo',
    whatItMeasures: 'Vitalidade e presença dos cardumes de peixes (budiongos herbívoros, sargentinhos, peixes-cirurgião e predadores).',
    referenceRange: '≥ 67: Cardumes ativos · 34 a 66: Estresse respiratório ou fuga · < 34: Asfixia severa / Evasão.',
    ecologicalRole: 'Os peixes regulam o crescimento das algas através da herbivoria e mantêm o equilíbrio trófico da enseada.',
    modelNote: 'Responde acopladamente à desoxigenação por hipóxia (< 3,0 mg/L), toxicidade de óleo, microplásticos e pressão de pesca.',
  },
};

interface IndicatorModalProps {
  indicatorId: IndicatorDetailId | null;
  onClose: () => void;
  currentValue?: string;
}

export function IndicatorModal({ indicatorId, onClose, currentValue }: IndicatorModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!indicatorId) return null;
  const detail = INDICATOR_DETAILS[indicatorId];
  if (!detail) return null;

  return (
    <div className="indicator-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-indicator-title">
      <div className="indicator-modal-content" onClick={(e) => e.stopPropagation()}>
        <header className="indicator-modal-header">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className="indicator-modal-badge">{detail.symbol} · {detail.unit}</div>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontWeight: 500,
            }}>
              {detail.badge}
            </span>
          </div>
          <h3 id="modal-indicator-title" className="indicator-modal-title">{detail.title}</h3>
          {currentValue && (
            <div className="indicator-modal-current">
              <span>Valor atual:</span> <strong>{currentValue}</strong>
            </div>
          )}
          <button type="button" className="indicator-modal-close" onClick={onClose} aria-label="Fechar janela">
            ✕
          </button>
        </header>

        <div className="indicator-modal-body">
          <section className="indicator-modal-section">
            <h4>O que este indicador mede?</h4>
            <p>{detail.whatItMeasures}</p>
          </section>

          <section className="indicator-modal-section">
            <h4>Valores de Referência Ecológica</h4>
            <p className="indicator-modal-ref">{detail.referenceRange}</p>
          </section>

          <section className="indicator-modal-section">
            <h4>Importância para a Vida Marinha</h4>
            <p>{detail.ecologicalRole}</p>
          </section>

          <section className="indicator-modal-section note">
            <h4>Nota Metodológica & Rigor Científico</h4>
            <p>{detail.modelNote}</p>
          </section>
        </div>

        <footer className="indicator-modal-footer">
          <button type="button" className="indicator-modal-ok-btn" onClick={onClose}>
            Entendi
          </button>
        </footer>
      </div>
    </div>
  );
}
