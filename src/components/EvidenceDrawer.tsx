import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { OxygenTrendChart } from './OxygenTrendChart';
import { Sparkline } from './Sparkline';
import type { OceanDataState } from '../hooks/useOceanData';
import {
  BTS_SECTORS,
  FISH_SPECIES,
  PARAMETER_EVIDENCE_REGISTRY,
  PRESSURE_LABELS,
} from '../simulation/config';
import { calculateRespirationPhImpact } from '../simulation/carbonate';
import { BTS_MICROPLASTICS_SURVEY, calculateOilFateBudget, evaluateOilEcotoxicity } from '../simulation/contaminants';
import {
  INTERVENTIONS,
  type InterventionId,
} from '../simulation/interventions';
import {
  calculateAlgae,
  calculateFishPressures,
  calculateTrophicBalance,
  effectivePh,
  getDissolvedOxygenBreakdown,
  type ImpactMilestone,
} from '../simulation/model';
import { formatSimulatedDuration, formatSimulatedTime } from '../simulation/time';
import type {
  EvidenceLevel,
  FishSpeciesId,
  HistoryPoint,
  PressureId,
  SimulationState,
} from '../simulation/types';

export type EvidenceTab = 'evolution' | 'sources';
type ChartSeriesMode = 'oxygen' | 'ecosystem' | 'thermal';

const EVIDENCE_TABS: ReadonlyArray<{ id: EvidenceTab; label: string }> = [
  { id: 'evolution', label: 'Evolução' },
  { id: 'sources', label: 'Dados' },
];

const NOAA_ALERT_LABELS: Record<number, string> = {
  0: '0 · Sem estresse térmico',
  1: '1 · Vigilância (Watch)',
  2: '2 · Aviso (Warning)',
  3: '3 · Alerta Nível 1',
  4: '4 · Alerta Nível 2',
  5: '5 · Alerta Nível 3',
  6: '6 · Alerta Nível 4',
  7: '7 · Alerta Nível 5',
};

function formatShortUtc(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${iso.replace('T', ' ').slice(0, 16)} UTC`;
}

function getTopSpeciesPressures(state: SimulationState, speciesId: FishSpeciesId): string[] {
  const pressures = calculateFishPressures(
    state.env,
    state.degreeHeatingWeeks,
    state.dissolvedOxygen,
    state.biochemicalOxygenDemand,
    state.sector,
    state.respiratoryDicUmolKg,
    state.sewageDischargeMode,
    state.elapsedDays,
  );
  const sensitivity = FISH_SPECIES.find((s) => s.id === speciesId)?.sensitivity;
  if (!sensitivity) return [];

  return (Object.keys(pressures) as PressureId[])
    .map((pid) => ({ pid, score: pressures[pid] * sensitivity[pid] }))
    .filter((entry) => entry.score >= 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((entry) => PRESSURE_LABELS[entry.pid]);
}

function MultiMetricChart({
  history,
  currentDay,
  mode,
}: {
  history: HistoryPoint[];
  currentDay: number;
  mode: 'ecosystem' | 'thermal';
}) {
  const width = 360;
  const height = 156;
  const padL = 34;
  const padR = 14;
  const padT = 16;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxDay = Math.max(15, Math.ceil(currentDay));
  const getX = (day: number) => padL + (Math.max(0, day) / maxDay) * plotW;

  const sampleStep = Math.max(1, Math.floor(history.length / 60));
  const points = history.filter((_, idx) => idx % sampleStep === 0 || idx === history.length - 1);

  if (mode === 'ecosystem') {
    const getY = (pct: number) => padT + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;
    const buildPath = (pick: (p: HistoryPoint) => number) =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.day).toFixed(1)} ${getY(pick(p)).toFixed(1)}`).join(' ');

    const coralPath = buildPath((p) => p.coral);
    const fishPath = buildPath((p) => p.fish);
    const algaePath = buildPath((p) => p.algae);
    const yCritical = getY(33);

    return (
      <div className="evidence-chart-box" aria-label="Evolução dos índices do ecossistema">
        <div className="evidence-chart-legend">
          <span className="legend-dot coral"><i /> Corais (%)</span>
          <span className="legend-dot fish"><i /> Peixes (%)</span>
          <span className="legend-dot algae"><i /> Algas (%)</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="evidence-chart-svg" role="img">
          <line x1={padL} y1={padT + plotH} x2={width - padR} y2={padT + plotH} stroke="rgba(242,244,238,0.18)" />
          <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(242,244,238,0.18)" />
          <line
            x1={padL}
            y1={yCritical}
            x2={width - padR}
            y2={yCritical}
            stroke="rgba(215, 134, 125, 0.55)"
            strokeDasharray="3 3"
          />
          <text x={width - padR} y={yCritical - 3} textAnchor="end" fill="#D7867D" fontSize="9">
            33% (limiar crítico do modelo)
          </text>
          <text x={padL - 5} y={getY(100) + 4} textAnchor="end" fill="rgba(242,244,238,0.62)" fontSize="9">100%</text>
          <text x={padL - 5} y={getY(50) + 4} textAnchor="end" fill="rgba(242,244,238,0.62)" fontSize="9">50%</text>
          <text x={padL - 5} y={getY(0) + 2} textAnchor="end" fill="rgba(242,244,238,0.62)" fontSize="9">0%</text>
          <text x={getX(0)} y={height - 7} textAnchor="start" fill="rgba(242,244,238,0.62)" fontSize="9">Dia 0</text>
          <text x={getX(maxDay)} y={height - 7} textAnchor="end" fill="rgba(242,244,238,0.62)" fontSize="9">Dia {maxDay}</text>

          {algaePath && <path d={algaePath} fill="none" stroke="#D7BD80" strokeWidth="1.6" strokeDasharray="3 2" />}
          {fishPath && <path d={fishPath} fill="none" stroke="#6b7bfb" strokeWidth="2" />}
          {coralPath && <path d={coralPath} fill="none" stroke="#1424f7" strokeWidth="2.2" />}
        </svg>
      </div>
    );
  }

  const maxDhw = Math.max(12, ...points.map((p) => p.dhw + 1));
  const getYDhw = (dhw: number) => padT + plotH - (Math.max(0, Math.min(maxDhw, dhw)) / maxDhw) * plotH;
  const getYTemp = (t: number) => padT + plotH - (Math.max(0, Math.min(1, (t - 24) / 8))) * plotH;

  const dhwPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.day).toFixed(1)} ${getYDhw(p.dhw).toFixed(1)}`).join(' ');
  const tempPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.day).toFixed(1)} ${getYTemp(p.temperature).toFixed(1)}`).join(' ');
  const yAlert1 = getYDhw(4);
  const yAlert2 = getYDhw(8);

  return (
    <div className="evidence-chart-box" aria-label="Evolução da temperatura e estresse térmico simulado">
      <div className="evidence-chart-legend">
        <span className="legend-dot heat"><i /> Estresse térmico (°C-sem.)</span>
        <span className="legend-dot temp"><i /> Temperatura (24–32 °C)</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="evidence-chart-svg" role="img">
        <line x1={padL} y1={padT + plotH} x2={width - padR} y2={padT + plotH} stroke="rgba(242,244,238,0.18)" />
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(242,244,238,0.18)" />
        <line x1={padL} y1={yAlert1} x2={width - padR} y2={yAlert1} stroke="rgba(215, 189, 128, 0.55)" strokeDasharray="3 3" />
        <text x={width - padR} y={yAlert1 - 3} textAnchor="end" fill="#D7BD80" fontSize="9">
          4 °C-sem. (atenção)
        </text>
        <line x1={padL} y1={yAlert2} x2={width - padR} y2={yAlert2} stroke="rgba(215, 134, 125, 0.6)" strokeDasharray="3 3" />
        <text x={width - padR} y={yAlert2 - 3} textAnchor="end" fill="#D7867D" fontSize="9">
          8 °C-sem. (estresse severo)
        </text>
        <text x={padL - 5} y={getYDhw(maxDhw) + 4} textAnchor="end" fill="rgba(242,244,238,0.62)" fontSize="9">{Math.round(maxDhw)}</text>
        <text x={padL - 5} y={getYDhw(4) + 4} textAnchor="end" fill="rgba(242,244,238,0.62)" fontSize="9">4</text>
        <text x={padL - 5} y={getYDhw(0) + 2} textAnchor="end" fill="rgba(242,244,238,0.62)" fontSize="9">0</text>
        <text x={getX(0)} y={height - 7} textAnchor="start" fill="rgba(242,244,238,0.62)" fontSize="9">Dia 0</text>
        <text x={getX(maxDay)} y={height - 7} textAnchor="end" fill="rgba(242,244,238,0.62)" fontSize="9">Dia {maxDay}</text>

        {tempPath && <path d={tempPath} fill="none" stroke="#6b7bfb" strokeWidth="1.6" strokeDasharray="4 2" />}
        {dhwPath && <path d={dhwPath} fill="none" stroke="#D7867D" strokeWidth="2.2" />}
      </svg>
    </div>
  );
}

interface EvidenceDrawerProps {
  open: boolean;
  tab: EvidenceTab;
  onTabChange: (tab: EvidenceTab) => void;
  onClose: () => void;
  simulation: SimulationState;
  oceanData: OceanDataState;
  criticalDays?: number | null;
  onApplySatelliteTemperature: (sst: number) => void;
  focusedInterventionId?: InterventionId | null;
  timelineMilestones?: ImpactMilestone[];
}

export function EvidenceDrawer({
  open,
  tab,
  onTabChange,
  onClose,
  simulation,
  oceanData,
  criticalDays = null,
  onApplySatelliteTemperature,
  focusedInterventionId = null,
  timelineMilestones = [],
}: EvidenceDrawerProps) {
  const [chartMode, setChartMode] = useState<ChartSeriesMode>('oxygen');
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceLevel | 'all'>('all');

  useEffect(() => {
    if (tab === 'sources' && focusedInterventionId) {
      const timer = window.setTimeout(() => {
        const el = document.getElementById(`evidence-intervention-${focusedInterventionId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => window.clearTimeout(timer);
    }
  }, [tab, focusedInterventionId]);

  if (!open) return null;

  const sector = BTS_SECTORS.find((s) => s.id === simulation.sector) ?? BTS_SECTORS[0];
  const algae = calculateAlgae(simulation.env, simulation.health, simulation.sewageDischargeMode, simulation.biochemicalOxygenDemand);
  const trophic = calculateTrophicBalance(simulation.species, algae);
  const currentPh = effectivePh(
    simulation.env,
    simulation.biochemicalOxygenDemand,
    simulation.sector,
    simulation.respiratoryDicUmolKg,
  );
  const scaledTa = 2350 * (sector.baselineSalinity / 35.0);
  const carbonate = calculateRespirationPhImpact(
    simulation.env.ph,
    simulation.respiratoryDicUmolKg ?? 0,
    scaledTa,
    simulation.env.temperature,
    sector.baselineSalinity,
  ).carbonateSystem;
  const doBreakdown = getDissolvedOxygenBreakdown(simulation.env, algae, simulation.sector);

  const oilMassKg = Math.max(simulation.controls.oil, simulation.env.oil);
  const oilBudget = oilMassKg > 0 ? calculateOilFateBudget(oilMassKg, simulation.sector, Math.max(0.5, simulation.elapsedDays)) : null;
  const oilEcotox = oilBudget ? evaluateOilEcotoxicity(oilBudget.dissolvedPahConcentrationUgL) : null;

  const filteredRegistry = evidenceFilter === 'all'
    ? PARAMETER_EVIDENCE_REGISTRY
    : PARAMETER_EVIDENCE_REGISTRY.filter((rec) => rec.evidenceLevel === evidenceFilter);

  const noaaStateBadge = (() => {
    if (oceanData.noaaLoading) return { tone: 'neutral', text: 'Consultando fonte...' };
    if (oceanData.noaaStatus.state === 'no_coverage' || sector.id === 'paraguacu') {
      return { tone: 'watch', text: 'Sem cobertura (grade 5 km mascara canal interno)' };
    }
    if (oceanData.noaaStatus.state === 'error') {
      return { tone: 'critical', text: 'Erro na consulta' };
    }
    if (oceanData.latestCrw?.provenance.isCachedFallback || oceanData.noaaStatus.state === 'fallback') {
      return { tone: 'watch', text: 'Histórico / Contingência (mar–abr 2024)' };
    }
    if (oceanData.latestCrw) {
      return {
        tone: 'healthy',
        text: `Atualizado (${formatShortUtc(oceanData.latestCrw.provenance.retrievedAtUtc)})`,
      };
    }
    return { tone: 'neutral', text: 'Aguardando consulta' };
  })();

  const meteoStateBadge = (() => {
    if (oceanData.meteoLoading) return { tone: 'neutral', text: 'Consultando modelo...' };
    if (oceanData.meteoStatus.state === 'error') {
      return { tone: 'critical', text: 'Erro na consulta remota' };
    }
    if (oceanData.latestMeteo?.provenance.isCachedFallback || oceanData.meteoStatus.state === 'fallback') {
      return { tone: 'watch', text: 'Histórico / Contingência (mar 2024)' };
    }
    if (oceanData.latestMeteo) {
      return {
        tone: 'healthy',
        text: `Modelo externo · Previsão (${formatShortUtc(oceanData.latestMeteo.timestampUtc)})`,
      };
    }
    return { tone: 'neutral', text: 'Sem dados carregados' };
  })();

  return (
    <aside className="evidence-drawer" role="dialog" aria-label="Gráficos e dados científicos">
      <header className="evidence-header">
        <div>
          <h2 className="evidence-title">Gráficos e dados</h2>
          <p className="evidence-subtitle">Baía de Todos-os-Santos · {sector.label}</p>
        </div>
        <button
          type="button"
          className="btn btn--quiet btn--icon"
          onClick={onClose}
          aria-label="Fechar painel de gráficos e dados"
          title="Fechar"
        >
          <Icon name="close" />
        </button>
      </header>

      <nav className="evidence-tabs" role="tablist" aria-label="Seções do painel de dados">
        {EVIDENCE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="evidence-body">
        {tab === 'evolution' && (
          <div className="evidence-section">
            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag local">Simulação local</span>
                  <h3>Evolução temporal ({formatSimulatedTime(simulation.elapsedDays)})</h3>
                </div>
                {criticalDays !== null && (
                  <span
                    className="sector-mini-tag"
                    title="Tempo estimado até o índice global cruzar ≤ 33% no modelo"
                  >
                    Limiar crítico (≤ 33%): ~{formatSimulatedTime(criticalDays)}
                  </span>
                )}
              </div>

              <div className="chart-mode-pills" role="group" aria-label="Variável exibida no gráfico">
                <button
                  type="button"
                  className={chartMode === 'oxygen' ? 'active' : ''}
                  onClick={() => setChartMode('oxygen')}
                >
                  Oxigênio e Peixes
                </button>
                <button
                  type="button"
                  className={chartMode === 'ecosystem' ? 'active' : ''}
                  onClick={() => setChartMode('ecosystem')}
                >
                  Corais, Peixes e Algas
                </button>
                <button
                  type="button"
                  className={chartMode === 'thermal' ? 'active' : ''}
                  onClick={() => setChartMode('thermal')}
                >
                  Calor Acumulado
                </button>
              </div>

              {chartMode === 'oxygen' ? (
                <OxygenTrendChart
                  history={simulation.history}
                  currentOxygen={simulation.dissolvedOxygen}
                  currentDay={simulation.elapsedDays}
                />
              ) : (
                <MultiMetricChart
                  history={simulation.history}
                  currentDay={simulation.elapsedDays}
                  mode={chartMode}
                />
              )}
            </article>

            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag local">Balanço físico-químico</span>
                  <h3>Oxigênio dissolvido e química do carbonato</h3>
                </div>
                <span className="sector-mini-tag">{sector.baselineSalinity} PSU</span>
              </div>

              <div className="metric-grid-4">
                <div className="metric-cell">
                  <small>Saturação Weiss (Cs)</small>
                  <strong>{doBreakdown.saturation.toFixed(2).replace('.', ',')} mg/L</strong>
                </div>
                <div className="metric-cell">
                  <small>OD Calculado</small>
                  <strong className={simulation.dissolvedOxygen < 2 ? 'tone-critical' : simulation.dissolvedOxygen < 5 ? 'tone-watch' : 'tone-healthy'}>
                    {simulation.dissolvedOxygen.toFixed(2).replace('.', ',')} mg/L
                  </strong>
                </div>
                <div className="metric-cell">
                  <small>pH Efetivo</small>
                  <strong>{currentPh.toFixed(2).replace('.', ',')}</strong>
                </div>
                <div className="metric-cell">
                  <small>Aragonita (Ωarag)</small>
                  <strong className={carbonate.omegaAragonite < 2 ? 'tone-critical' : carbonate.omegaAragonite < 3 ? 'tone-watch' : 'tone-healthy'}>
                    {carbonate.omegaAragonite.toFixed(2).replace('.', ',')}
                  </strong>
                </div>
              </div>

              <details className="method-details">
                <summary>Equações acopladas e componentes calculados</summary>
                <div className="method-details-body">
                  <p>
                    <strong>Equação de OD:</strong> <code>d[OD]/dt = ka·(Cs − [OD]) − kd·[CBODu] − SOD/H + (P − R)</code>
                  </p>
                  <p>
                    <strong>DBO remanescente na água:</strong> {simulation.biochemicalOxygenDemand.toFixed(2).replace('.', ',')} mg O₂/L ·{' '}
                    <strong>pCO₂:</strong> {carbonate.pCO2Uatm.toFixed(0)} µatm ·{' '}
                    <strong>DIC:</strong> {carbonate.dissolvedInorganicCarbonUmolKg.toFixed(0)} µmol/kg
                  </p>
                  <p className="method-caveat">
                    Solubilidade por Weiss (1970); constantes carbonáticas por Lueker et al. (2000) e Mucci (1983). Os resultados representam o compartimento homogêneo do modelo de caixa, não medições pontuais in situ.
                  </p>
                </div>
              </details>
            </article>

            {oilBudget && (
              <article className="evidence-card">
                <div className="evidence-card-head">
                  <div>
                    <span className="origin-tag local">Partição em 4 reservatórios</span>
                    <h3>Destino do óleo e fração dissolvida (tPAH50)</h3>
                  </div>
                </div>
                <div className="metric-grid-4">
                  <div className="metric-cell">
                    <small>Filme superficial</small>
                    <strong>{oilBudget.surfaceFilmKg.toLocaleString('pt-BR')} kg</strong>
                  </div>
                  <div className="metric-cell">
                    <small>Coluna dispersa</small>
                    <strong>{oilBudget.waterColumnDispersedKg.toLocaleString('pt-BR')} kg</strong>
                  </div>
                  <div className="metric-cell">
                    <small>tPAH50 dissolvido</small>
                    <strong className={oilBudget.dissolvedPahConcentrationUgL >= 10 ? 'tone-critical' : oilBudget.dissolvedPahConcentrationUgL >= 3 ? 'tone-watch' : 'tone-healthy'}>
                      {oilBudget.dissolvedPahConcentrationUgL.toFixed(2).replace('.', ',')} µg/L
                    </strong>
                  </div>
                  <div className="metric-cell">
                    <small>Inibição tecidual</small>
                    <strong>{oilEcotox ? `${oilEcotox.tissueRegenerationInhibitionPercent}%` : '—'}</strong>
                  </div>
                </div>
                {simulation.recoveredOilKg !== undefined && simulation.recoveredOilKg > 0 && (
                  <div className="oil-skimming-status-pill">
                    <Icon name="check" className="skimming-icon" />
                    <span>Óleo superficial recolhido (skimming ativo): <strong>{simulation.recoveredOilKg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg</strong></span>
                  </div>
                )}
                <p className="method-caveat">
                  Curva subletal baseada em bioensaio controlado de May et al. (2020; EC50 = 10 µg/L tPAH50). A partição física da massa na baía é uma hipótese de modelo de caixa.
                </p>
              </article>
            )}

            {timelineMilestones.length > 0 && (
              <article className="evidence-card">
                <div className="evidence-card-head">
                  <div>
                    <span className="origin-tag local">Projeção do modelo (1× física real)</span>
                    <h3>Marcos de resposta e tempo ecológico</h3>
                  </div>
                </div>
                <p className="method-caveat">
                  Estimativa determinística calculada pelo modelo para identificar o tempo até o primeiro efeito e cruzamento de limiares conhecidos, independente da taxa de aceleração gráfica da interface.
                </p>
                <div className="milestone-table-wrapper">
                  <table className="milestone-table">
                    <thead>
                      <tr>
                        <th>Marco / Indicador</th>
                        <th>Limiar</th>
                        <th>Tempo projetado</th>
                        <th>Evidência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timelineMilestones.map((ms) => {
                        const timeLabel = ms.firstCrossingDay === null
                          ? 'Não atinge em 1 ano'
                          : ms.firstCrossingDay === 0
                            ? 'Já ativo na condição inicial'
                            : `~${formatSimulatedDuration(ms.firstCrossingDay)}`;
                        return (
                          <tr key={ms.id}>
                            <td>
                              <strong>{ms.label}</strong>
                              <small>{ms.assumptions}</small>
                            </td>
                            <td>{ms.threshold} {ms.unit}</td>
                            <td>
                              <span className={ms.firstCrossingDay !== null ? 'milestone-time active' : 'milestone-time'}>
                                {timeLabel}
                              </span>
                            </td>
                            <td>
                              <span className={`evidence-lvl-badge lvl-${ms.evidenceLevel}`}>
                                {ms.evidenceLevel === 'published'
                                  ? 'Publicado'
                                  : ms.evidenceLevel === 'local-calibrated'
                                    ? 'Calibrado local'
                                    : 'Hipótese didática'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            )}

            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag local">Resposta ecológica do modelo</span>
                  <h3>Grupos funcionais de peixes e teia trófica</h3>
                </div>
                <span className="sector-mini-tag">Equilíbrio trófico: {Math.round(trophic)}%</span>
              </div>
              <div className="species-mini-list">
                {FISH_SPECIES.map((sp) => {
                  const val = Math.round(simulation.species[sp.id]);
                  const series = simulation.history.map((h) => h.species?.[sp.id] ?? h.fish);
                  const topP = getTopSpeciesPressures(simulation, sp.id);
                  return (
                    <div key={sp.id} className="species-mini-row">
                      <div className="species-mini-info">
                        <strong>{sp.label}</strong>
                        <small>
                          {sp.role}
                          {topP.length > 0 ? ` · Pressão: ${topP.join(', ')}` : ' · Sem estresse relevante'}
                        </small>
                      </div>
                      <Sparkline
                        data={series}
                        min={0}
                        max={100}
                        width={84}
                        height={24}
                        stroke={val >= 67 ? '#1424f7' : val >= 34 ? '#D7BD80' : '#D7867D'}
                      />
                      <span className={`species-score ${val >= 67 ? 'tone-healthy' : val >= 34 ? 'tone-watch' : 'tone-critical'}`}>
                        {val}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
        )}

        {tab === 'sources' && (
          <div className="evidence-section">
            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag local">Região selecionada</span>
                  <h3>{sector.label}</h3>
                </div>
                <span className="sector-mini-tag">{sector.sublabel}</span>
              </div>
              <p className="method-caveat">{sector.description}</p>
            </article>

            <div className="epistemic-legend-strip">
              <div>
                <strong>1. Observação satelital:</strong> medição remota indireta (NOAA CRW 5 km).
              </div>
              <div>
                <strong>2. Modelo externo:</strong> estimativa oceânica prevista (Open-Meteo Marine).
              </div>
              <div>
                <strong>3. Simulação local:</strong> resultado calculado pelo modelo do Kirimurê.
              </div>
            </div>

            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag satellite">1. Observação satelital</span>
                  <h3>NOAA Coral Reef Watch (grade de ~5 km)</h3>
                </div>
                <span className={`source-state-pill tone-${noaaStateBadge.tone}`}>
                  {noaaStateBadge.text}
                </span>
              </div>

              <div className="dhw-separation-grid">
                <div className="dhw-sep-box external">
                  <small>DHW Oficial da NOAA (Externo)</small>
                  <strong>
                    {oceanData.latestCrw && oceanData.latestCrw.degreeHeatingWeeks !== null
                      ? `${oceanData.latestCrw.degreeHeatingWeeks.toFixed(1).replace('.', ',')} °C-sem.`
                      : 'Sem leitura ativa'}
                  </strong>
                  <span>
                    Calculado pela NOAA usando a climatologia MMM própria do pixel satelital
                    {oceanData.latestCrw?.climatologyMmmDegC
                      ? ` (MMM = ${oceanData.latestCrw.climatologyMmmDegC.toFixed(2).replace('.', ',')} °C)`
                      : ' (~5 km)'}.
                  </span>
                </div>
                <div className="dhw-sep-box simulated">
                  <small>Estresse Térmico Simulado (Kirimurê)</small>
                  <strong>{simulation.degreeHeatingWeeks.toFixed(1).replace('.', ',')} °C-sem.</strong>
                  <span>
                    Calculado localmente a partir do controle de temperatura com referência didática fixa (MMM = 28,0 °C; limiar = 29,0 °C).
                  </span>
                </div>
              </div>

              {oceanData.latestCrw ? (
                <>
                  <div className="metric-grid-4">
                    <div className="metric-cell">
                      <small>SST Satelital</small>
                      <strong>{oceanData.latestCrw.seaSurfaceTemperatureDegC.toFixed(1).replace('.', ',')} °C</strong>
                    </div>
                    <div className="metric-cell">
                      <small>Anomalia Térmica</small>
                      <strong>
                        {oceanData.latestCrw.sstAnomalyDegC !== null
                          ? `${oceanData.latestCrw.sstAnomalyDegC >= 0 ? '+' : ''}${oceanData.latestCrw.sstAnomalyDegC.toFixed(1).replace('.', ',')} °C`
                          : '—'}
                      </strong>
                    </div>
                    <div className="metric-cell">
                      <small>HotSpot</small>
                      <strong>
                        {oceanData.latestCrw.hotSpotDegC !== null
                          ? `${oceanData.latestCrw.hotSpotDegC.toFixed(1).replace('.', ',')} °C`
                          : '—'}
                      </strong>
                    </div>
                    <div className="metric-cell">
                      <small>Nível de Alerta (0–7)</small>
                      <strong>
                        {oceanData.latestCrw.bleachingAlertLevel !== null
                          ? (NOAA_ALERT_LABELS[oceanData.latestCrw.bleachingAlertLevel] ?? `${oceanData.latestCrw.bleachingAlertLevel}`)
                          : '—'}
                      </strong>
                    </div>
                  </div>

                  <div className="satellite-apply-row">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onApplySatelliteTemperature(oceanData.latestCrw!.seaSurfaceTemperatureDegC)}
                    >
                      Usar SST satelital ({oceanData.latestCrw.seaSurfaceTemperatureDegC.toFixed(1).replace('.', ',')} °C) no experimento
                    </button>
                    <small>
                      Importa apenas a temperatura inicial; a saúde de corais e peixes continua sendo calculada pela simulação local.
                    </small>
                  </div>

                  <details className="method-details">
                    <summary>Proveniência, ordem de consulta e semântica de BAA</summary>
                    <div className="method-details-body">
                      <p>
                        <strong>Fonte efetiva:</strong> {oceanData.latestCrw.provenance.distributor ?? oceanData.latestCrw.provenance.sourceName} ·{' '}
                        <strong>Dataset:</strong> <code>{oceanData.latestCrw.provenance.datasetId}</code>
                      </p>
                      <p>
                        <strong>Data do produto:</strong> {formatShortUtc(oceanData.latestCrw.timestampUtc)} ·{' '}
                        <strong>Célula efetiva:</strong>{' '}
                        {oceanData.latestCrw.gridCell
                          ? `${oceanData.latestCrw.gridCell.latitude.toFixed(3)}°, ${oceanData.latestCrw.gridCell.longitude.toFixed(3)}°`
                          : '—'}{' '}
                        ({oceanData.latestCrw.spatialResolution ?? '5 km'})
                      </p>
                      <p>
                        <strong>Variável de alerta mapeada:</strong>{' '}
                        <code>{oceanData.latestCrw.bleachingAlertSourceVariable ?? 'CRW_BAA'}</code> (categoria ordinal 0–7 por pixel; não representa área em km²).
                        {oceanData.latestCrw.isVirtualStation && (
                          <> Fonte complementar de terceiros da estação virtual regional <code>todos_os_santos</code>, próxima à entrada da baía.</>
                        )}
                      </p>
                      <p className="method-caveat">
                        <strong>Ordem operacional de failover:</strong> 1º PacIOOS ERDDAP (<code>dhw_5km</code>) → 2º NOAA CoastWatch ERDDAP PFEG (<code>NOAA_DHW</code>) → 3º Estação Virtual Regional (<code>todos_os_santos</code>) → Contingência histórica manual (mar–abr/2024).
                      </p>
                    </div>
                  </details>
                </>
              ) : (
                <div className="source-empty-box">
                  <p>
                    {oceanData.noaaStatus.state === 'no_coverage' || sector.id === 'paraguacu'
                      ? 'Este canal estuarino interno é mascarado como continente na grade satelital de 5 km da NOAA. O sistema não atribui pixels oceânicos externos ao manguezal interno.'
                      : oceanData.noaaStatus.state === 'error'
                        ? `Consulta malsucedida (${oceanData.noaaStatus.error ?? 'sem resposta'}). Nenhum valor antigo é exibido como medição atual.`
                        : 'Consultando dados satelitais...'}
                  </p>
                  <div className="source-fallback-actions">
                    {sector.id !== 'paraguacu' && (
                      <button type="button" className="btn" onClick={() => oceanData.refreshNoaa()}>
                        Tentar consultar novamente
                      </button>
                    )}
                    {sector.id !== 'paraguacu' && (
                      <button type="button" className="btn" onClick={() => oceanData.loadHistoricalCrwSnapshot()}>
                        Carregar registro histórico (mar–abr 2024)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>

            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag model-ext">2. Modelo externo</span>
                  <h3>Open-Meteo Marine (ondas, correntes e nível)</h3>
                </div>
                <span className={`source-state-pill tone-${meteoStateBadge.tone}`}>
                  {meteoStateBadge.text}
                </span>
              </div>

              {oceanData.latestMeteo ? (
                <>
                  <div className="metric-grid-4">
                    <div className="metric-cell">
                      <small>Altura de ondas (Hs)</small>
                      <strong>{oceanData.latestMeteo.waveHeightM !== null ? `${oceanData.latestMeteo.waveHeightM.toFixed(1).replace('.', ',')} m` : '—'}</strong>
                    </div>
                    <div className="metric-cell">
                      <small>Corrente superficial</small>
                      <strong>{oceanData.latestMeteo.currentVelocityMs !== null ? `${oceanData.latestMeteo.currentVelocityMs.toFixed(2).replace('.', ',')} m/s` : '—'}</strong>
                    </div>
                    <div className="metric-cell">
                      <small>Direção</small>
                      <strong>{oceanData.latestMeteo.currentDirectionDeg !== null && oceanData.latestMeteo.currentDirectionDeg !== undefined ? `${Math.round(oceanData.latestMeteo.currentDirectionDeg)}°` : '—'}</strong>
                    </div>
                    <div className="metric-cell">
                      <small>Nível do mar (MSL)</small>
                      <strong>{oceanData.latestMeteo.seaLevelHeightM !== null ? `${oceanData.latestMeteo.seaLevelHeightM.toFixed(2).replace('.', ',')} m` : '—'}</strong>
                    </div>
                  </div>
                  <p className="method-caveat">
                    Estimativas numéricas de modelo oceânico externo (~5 a 8 km), não medições de boia local. Estimativas de nível do mar e correntes têm precisão limitada em canais costeiros rasos e estuários estreitos.
                  </p>
                </>
              ) : (
                <div className="source-empty-box">
                  <p>{oceanData.meteoStatus.error ?? 'Previsão externa indisponível no momento.'}</p>
                  <div className="source-fallback-actions">
                    <button type="button" className="btn" onClick={() => oceanData.refreshMeteo()}>
                      Tentar reconectar modelo externo
                    </button>
                    <button type="button" className="btn" onClick={() => oceanData.loadHistoricalMeteoSnapshot()}>
                      Carregar registro histórico (mar 2024)
                    </button>
                  </div>
                </div>
              )}
            </article>

            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag local">3. Método e parâmetros</span>
                  <h3>Classificação do nível de evidência</h3>
                </div>
              </div>

              <div className="evidence-filter-pills" role="group" aria-label="Filtrar parâmetros por nível de evidência">
                {(['all', 'Medido', 'Publicado', 'Hipótese do Modelo', 'Parâmetro Didático'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    className={evidenceFilter === lvl ? 'active' : ''}
                    onClick={() => setEvidenceFilter(lvl)}
                  >
                    {lvl === 'all' ? 'Todos' : lvl}
                  </button>
                ))}
              </div>

              <div className="parameter-evidence-list">
                {filteredRegistry.map((rec) => (
                  <div key={rec.id} className="param-evidence-item">
                    <div className="param-evidence-top">
                      <strong>{rec.parameter}</strong>
                      <span
                        className={`evidence-lvl-badge lvl-${rec.evidenceLevel
                          .normalize('NFD')
                          .replace(/[\u0300-\u036f]/g, '')
                          .toLowerCase()
                          .replace(/\s+/g, '-')}`}
                      >
                        {rec.evidenceLevel}
                      </span>
                    </div>
                    <div className="param-evidence-meta">
                      <span>Valor: <strong>{rec.valueDisplay} {rec.unit}</strong></span>
                      <span>Base: {rec.sourceOrBasis}</span>
                    </div>
                    <p>{rec.scopeNote}</p>
                  </div>
                ))}
              </div>

              <details className="method-details">
                <summary>Dados empíricos de microplásticos nos estuários da Baía de Todos-os-Santos (Trindade et al., 2023)</summary>
                <div className="method-details-body">
                  <ul className="survey-list">
                    {BTS_MICROPLASTICS_SURVEY.map((pt) => (
                      <li key={pt.estuaryName}>
                        <strong>{pt.riverName}:</strong> média {pt.meanCountPerM3.toLocaleString('pt-BR')} part./m³ (faixa {pt.minCountPerM3.toLocaleString('pt-BR')}–{pt.maxCountPerM3.toLocaleString('pt-BR')} part./m³; {pt.particleSizeFractionUnder300Um}% &lt; 300 µm).
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </article>

            <article className="evidence-card" id="interventions-evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag local">Catálogo científico</span>
                  <h3>Ações de recuperação: mecanismos, limites e evidências</h3>
                </div>
              </div>
              <p className="method-caveat">
                Ações de mitigação com limites biofísicos explícitos: intervenções reduzem taxas de aporte e recolhem frações acessíveis, mas a depuração biológica e hidrodinâmica segue sua escala temporal real.
              </p>
              <div className="parameter-evidence-list">
                {INTERVENTIONS.map((item) => {
                  const isFocused = focusedInterventionId === item.id;
                  return (
                    <div
                      key={item.id}
                      id={`evidence-intervention-${item.id}`}
                      className={`param-evidence-item ${isFocused ? 'is-focused-target' : ''}`}
                    >
                      <div className="param-evidence-top">
                        <div className="evidence-title-with-icon">
                          <Icon name={item.icon as any} className="param-icon-svg" />
                          <strong>{item.title}</strong>
                        </div>
                        <div className="evidence-badges-row">
                          <span className={`evidence-lvl-badge ${item.modeled ? 'lvl-publicado' : 'lvl-hipotese-do-modelo'}`}>
                            {item.modeled ? 'Modelado numericamente' : 'Exploração conceitual'}
                          </span>
                          <span className="evidence-lvl-badge lvl-medido">
                            {item.evidenceLabel}
                          </span>
                        </div>
                      </div>
                      <p className="intervention-evidence-desc">{item.description}</p>
                      <div className="param-evidence-meta">
                        <span><strong>Mecanismo:</strong> {item.effectLabel}</span>
                        <span><strong>Início do efeito:</strong> {item.onsetLabel}</span>
                      </div>
                      <div className="intervention-evidence-limits">
                        <p><strong>Limites e ressalvas:</strong> {item.limitation}</p>
                        <p><strong>Escala temporal:</strong> {item.timeframeNote}</p>
                        <p className="method-caveat"><strong>Base científica:</strong> {item.scientificBasis}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
        )}
      </div>
    </aside>
  );
}
