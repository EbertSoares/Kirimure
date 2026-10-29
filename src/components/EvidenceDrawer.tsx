import { useState } from 'react';
import { Icon } from './Icons';
import { OxygenTrendChart } from './OxygenTrendChart';
import { Sparkline } from './Sparkline';
import { formatParameterValue } from './EnvironmentDrawer';
import type { OceanDataState } from '../hooks/useOceanData';
import {
  BTS_SECTORS,
  FACTOR_ORDER,
  FISH_SPECIES,
  ITEM_DEFINITIONS,
  PARAMETER_EVIDENCE_REGISTRY,
  PRESSURE_LABELS,
} from '../simulation/config';
import { calculateRespirationPhImpact } from '../simulation/carbonate';
import { BTS_MICROPLASTICS_SURVEY, calculateOilFateBudget, evaluateOilEcotoxicity } from '../simulation/contaminants';
import {
  calculateAlgae,
  calculateFishPressures,
  calculateTrophicBalance,
  effectivePh,
  getDissolvedOxygenBreakdown,
} from '../simulation/model';
import { formatSimulatedTime } from '../simulation/time';
import type {
  EvidenceLevel,
  FishSpeciesId,
  HistoryPoint,
  ItemId,
  PressureId,
  SavedScenario,
  SimulationState,
} from '../simulation/types';

export type EvidenceTab = 'evolution' | 'compare' | 'sources';
type ChartSeriesMode = 'oxygen' | 'ecosystem' | 'thermal';

const EVIDENCE_TABS: ReadonlyArray<{ id: EvidenceTab; label: string }> = [
  { id: 'evolution', label: 'Evolução e mecanismo' },
  { id: 'compare', label: 'Comparar cenários' },
  { id: 'sources', label: 'Dados, fontes e método' },
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
          <span className="legend-dot coral"><i /> Corais (/100)</span>
          <span className="legend-dot fish"><i /> Fauna (/100)</span>
          <span className="legend-dot algae"><i /> Algas (/100)</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="evidence-chart-svg" role="img">
          <line x1={padL} y1={padT + plotH} x2={width - padR} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" />
          <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" />
          <line
            x1={padL}
            y1={yCritical}
            x2={width - padR}
            y2={yCritical}
            stroke="rgba(226, 115, 94, 0.55)"
            strokeDasharray="3 3"
          />
          <text x={width - padR} y={yCritical - 3} textAnchor="end" fill="rgba(226,115,94,0.9)" fontSize="8.5">
            33/100 (limiar crítico do modelo)
          </text>
          <text x={padL - 5} y={getY(100) + 4} textAnchor="end" fill="rgba(255,255,255,0.65)" fontSize="8.5">100</text>
          <text x={padL - 5} y={getY(50) + 4} textAnchor="end" fill="rgba(255,255,255,0.65)" fontSize="8.5">50</text>
          <text x={padL - 5} y={getY(0) + 2} textAnchor="end" fill="rgba(255,255,255,0.65)" fontSize="8.5">0</text>
          <text x={getX(0)} y={height - 7} textAnchor="start" fill="rgba(255,255,255,0.65)" fontSize="8.5">Dia 0</text>
          <text x={getX(maxDay)} y={height - 7} textAnchor="end" fill="rgba(255,255,255,0.65)" fontSize="8.5">Dia {maxDay}</text>

          {algaePath && <path d={algaePath} fill="none" stroke="#84cc16" strokeWidth="1.6" strokeDasharray="3 2" />}
          {fishPath && <path d={fishPath} fill="none" stroke="#58c0e8" strokeWidth="2" />}
          {coralPath && <path d={coralPath} fill="none" stroke="#f8b020" strokeWidth="2.2" />}
        </svg>
      </div>
    );
  }

  // Modo térmico: estresse térmico simulado (0 a max(12, dhw)) + temperatura
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
        <span className="legend-dot heat"><i /> Estresse térmico simulado (°C-sem.)</span>
        <span className="legend-dot temp"><i /> Temperatura (24–32 °C)</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="evidence-chart-svg" role="img">
        <line x1={padL} y1={padT + plotH} x2={width - padR} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" />
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" />
        <line x1={padL} y1={yAlert1} x2={width - padR} y2={yAlert1} stroke="rgba(248, 176, 32, 0.55)" strokeDasharray="3 3" />
        <text x={width - padR} y={yAlert1 - 3} textAnchor="end" fill="rgba(248,176,32,0.9)" fontSize="8.5">
          4 °C-sem. (risco de branqueamento)
        </text>
        <line x1={padL} y1={yAlert2} x2={width - padR} y2={yAlert2} stroke="rgba(226, 115, 94, 0.6)" strokeDasharray="3 3" />
        <text x={width - padR} y={yAlert2 - 3} textAnchor="end" fill="rgba(226,115,94,0.9)" fontSize="8.5">
          8 °C-sem. (estresse severo)
        </text>
        <text x={padL - 5} y={getYDhw(maxDhw) + 4} textAnchor="end" fill="rgba(255,255,255,0.65)" fontSize="8.5">{Math.round(maxDhw)}</text>
        <text x={padL - 5} y={getYDhw(4) + 4} textAnchor="end" fill="rgba(255,255,255,0.65)" fontSize="8.5">4</text>
        <text x={padL - 5} y={getYDhw(0) + 2} textAnchor="end" fill="rgba(255,255,255,0.65)" fontSize="8.5">0</text>
        <text x={getX(0)} y={height - 7} textAnchor="start" fill="rgba(255,255,255,0.65)" fontSize="8.5">Dia 0</text>
        <text x={getX(maxDay)} y={height - 7} textAnchor="end" fill="rgba(255,255,255,0.65)" fontSize="8.5">Dia {maxDay}</text>

        {tempPath && <path d={tempPath} fill="none" stroke="#58c0e8" strokeWidth="1.6" strokeDasharray="4 2" />}
        {dhwPath && <path d={dhwPath} fill="none" stroke="#e2735e" strokeWidth="2.2" />}
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
  referenceScenario: SavedScenario;
  savedScenarios: SavedScenario[];
  activeComparisonId: string;
  onSelectComparisonId: (id: string) => void;
  isViewingComparisonIn3D: boolean;
  onToggleViewComparisonIn3D: () => void;
  onSaveCurrentScenario: (customLabel?: string) => void;
  onDeleteSavedScenario: (id: string) => void;
  onApplySatelliteTemperature: (sst: number) => void;
}

export function EvidenceDrawer({
  open,
  tab,
  onTabChange,
  onClose,
  simulation,
  oceanData,
  referenceScenario,
  savedScenarios,
  activeComparisonId,
  onSelectComparisonId,
  isViewingComparisonIn3D,
  onToggleViewComparisonIn3D,
  onSaveCurrentScenario,
  onDeleteSavedScenario,
  onApplySatelliteTemperature,
}: EvidenceDrawerProps) {
  const [chartMode, setChartMode] = useState<ChartSeriesMode>('oxygen');
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceLevel | 'all'>('all');
  const [scenarioNameInput, setScenarioNameInput] = useState('');

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

  const allComparisonTargets = [referenceScenario, ...savedScenarios];
  const baseScenario = allComparisonTargets.find((s) => s.id === activeComparisonId) ?? referenceScenario;

  const changedFactorsBetween = FACTOR_ORDER.filter(
    (id) => Math.abs(simulation.controls[id] - baseScenario.controls[id]) > 1e-6,
  );
  const regimeChanged = simulation.sewageDischargeMode !== baseScenario.sewageDischargeMode
    && (simulation.controls.sewage > 0 || baseScenario.controls.sewage > 0);

  const filteredRegistry = evidenceFilter === 'all'
    ? PARAMETER_EVIDENCE_REGISTRY
    : PARAMETER_EVIDENCE_REGISTRY.filter((rec) => rec.evidenceLevel === evidenceFilter);

  // Estado inequívoco dos dados satelitais NOAA CRW
  const noaaStateBadge = (() => {
    if (oceanData.noaaLoading) return { tone: 'neutral', text: 'Consultando fonte...' };
    if (oceanData.noaaStatus.state === 'no_coverage' || sector.id === 'paraguacu') {
      return { tone: 'watch', text: 'Sem cobertura (grade 5 km mascara canal interno)' };
    }
    if (oceanData.noaaStatus.state === 'error') {
      return { tone: 'critical', text: 'Erro na consulta (último valor não é exibido como atual)' };
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

  // Estado inequívoco do modelo externo Open-Meteo Marine
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
    <aside className="evidence-drawer" aria-label="Painel de evidências científicas e comparação">
      <header className="evidence-header">
        <div>
          <span className="evidence-kicker">Investigação e rastreabilidade</span>
          <h2 className="evidence-title">Evidências e origem dos dados</h2>
        </div>
        <button
          type="button"
          className="icon-close-btn"
          onClick={onClose}
          aria-label="Fechar painel de evidências"
        >
          <Icon name="close" />
        </button>
      </header>

      <nav className="evidence-tabs" role="tablist" aria-label="Seções de evidências">
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
        {/* ABA 1: EVOLUÇÃO E MECANISMO */}
        {tab === 'evolution' && (
          <div className="evidence-section">
            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag local">Resultado da Simulação Local</span>
                  <h3>Evolução temporal no experimento ({formatSimulatedTime(simulation.elapsedDays)})</h3>
                </div>
              </div>

              <div className="chart-mode-pills" role="group" aria-label="Variável exibida no gráfico">
                <button
                  type="button"
                  className={chartMode === 'oxygen' ? 'active' : ''}
                  onClick={() => setChartMode('oxygen')}
                >
                  Oxigênio e Fauna
                </button>
                <button
                  type="button"
                  className={chartMode === 'ecosystem' ? 'active' : ''}
                  onClick={() => setChartMode('ecosystem')}
                >
                  Corais, Fauna e Algas
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

            {/* Balanço de Oxigênio e Sistema Carbonato */}
            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag local">Mecanismo Físico-Químico Calculado</span>
                  <h3>Oxigênio dissolvido e química do carbonato</h3>
                </div>
                <span className="sector-mini-tag">{sector.label} · {sector.baselineSalinity} PSU</span>
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
                <summary>Equações acopladas e componentes calculados ▾</summary>
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

            {/* Balanço de Óleo quando ativo */}
            {oilBudget && (
              <article className="evidence-card">
                <div className="evidence-card-head">
                  <div>
                    <span className="origin-tag local">Modelo de Partição em 4 Reservatórios</span>
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
                <p className="method-caveat">
                  Curva subletal baseada em bioensaio controlado de May et al. (2020; EC50 = 10 µg/L tPAH50). A partição física da massa na baía é uma hipótese de modelo de caixa.
                </p>
              </article>
            )}

            {/* Espécies funcionais */}
            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag local">Resposta Ecológica Relativa (Hipótese do Modelo)</span>
                  <h3>Grupos funcionais da ictiofauna e teia trófica</h3>
                </div>
                <span className="sector-mini-tag">Equilíbrio trófico: {Math.round(trophic)}/100</span>
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
                          {topP.length > 0 ? ` · Pressão principal: ${topP.join(', ')}` : ' · Sem estresse relevante'}
                        </small>
                      </div>
                      <Sparkline
                        data={series}
                        min={0}
                        max={100}
                        width={84}
                        height={24}
                        stroke={val >= 67 ? '#3ed39f' : val >= 34 ? '#f8b020' : '#e2735e'}
                      />
                      <span className={`species-score ${val >= 67 ? 'tone-healthy' : val >= 34 ? 'tone-watch' : 'tone-critical'}`}>
                        {val}/100
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
        )}

        {/* ABA 2: COMPARAR CENÁRIOS (ANTES / DEPOIS) */}
        {tab === 'compare' && (
          <div className="evidence-section">
            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag local">Comparação Experimental</span>
                  <h3>Guardar cenário e comparar Antes / Depois</h3>
                </div>
              </div>

              <div className="save-scenario-bar">
                <input
                  type="text"
                  className="scenario-name-input"
                  placeholder={`Ex.: Esgoto ${simulation.sewageDischargeMode === 'pulse' ? 'pulso' : 'contínuo'} (${formatSimulatedTime(simulation.elapsedDays)})`}
                  value={scenarioNameInput}
                  onChange={(e) => setScenarioNameInput(e.target.value)}
                  aria-label="Nome opcional para guardar o cenário atual"
                />
                <button
                  type="button"
                  className="primary-action-btn"
                  onClick={() => {
                    onSaveCurrentScenario(scenarioNameInput.trim() || undefined);
                    setScenarioNameInput('');
                  }}
                >
                  <Icon name="bookmark" />
                  <span>Guardar cenário</span>
                </button>
              </div>

              <div className="compare-selector-row">
                <label htmlFor="compare-base-select">Comparar cenário atual com:</label>
                <select
                  id="compare-base-select"
                  className="compare-select"
                  value={baseScenario.id}
                  onChange={(e) => onSelectComparisonId(e.target.value)}
                >
                  {allComparisonTargets.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.label} ({formatSimulatedTime(sc.savedAtDay)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Aviso de controle experimental (isolamento de variáveis) */}
              <div className={`experiment-control-notice ${changedFactorsBetween.length > 1 ? 'warn' : 'ok'}`}>
                <Icon name={changedFactorsBetween.length > 1 ? 'alert' : 'check'} />
                <div>
                  {changedFactorsBetween.length === 0 && !regimeChanged ? (
                    <span>Os parâmetros de entrada são idênticos aos de <strong>{baseScenario.label}</strong> (diferença apenas pelo tempo decorrido).</span>
                  ) : changedFactorsBetween.length === 1 || (changedFactorsBetween.length === 0 && regimeChanged) ? (
                    <span>
                      <strong>Controle experimental preservado:</strong> apenas{' '}
                      <strong>
                        {regimeChanged && changedFactorsBetween.length === 0
                          ? 'o regime de lançamento de esgoto (contínuo vs. pulso)'
                          : ITEM_DEFINITIONS[changedFactorsBetween[0]].shortLabel}
                      </strong>{' '}
                      diferencia os dois cenários.
                    </span>
                  ) : (
                    <span>
                      <strong>Atenção metodológica ({changedFactorsBetween.length} variáveis alteradas):</strong>{' '}
                      {changedFactorsBetween.map((id) => ITEM_DEFINITIONS[id].shortLabel).join(', ')} mudaram ao mesmo tempo, dificultando atribuir o resultado a uma única causa.
                    </span>
                  )}
                </div>
              </div>

              <div className="compare-3d-toggle-row">
                <button
                  type="button"
                  className={`compare-3d-btn ${isViewingComparisonIn3D ? 'is-active' : ''}`}
                  onClick={onToggleViewComparisonIn3D}
                >
                  <Icon name="compare" />
                  <span>
                    {isViewingComparisonIn3D
                      ? 'Voltar a ver o Cenário Atual no Recife 3D'
                      : `Visualizar "${baseScenario.label}" no Recife 3D (mesmo enquadramento)`}
                  </span>
                </button>
              </div>

              <div className="compare-table-wrap">
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>Indicador / Variável</th>
                      <th>{baseScenario.label}</th>
                      <th>Cenário Atual</th>
                      <th>Diferença (Δ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changedFactorsBetween.map((id) => {
                      const beforeFmt = formatParameterValue(id, baseScenario.controls[id], baseScenario.sewageDischargeMode);
                      const nowFmt = formatParameterValue(id, simulation.controls[id], simulation.sewageDischargeMode);
                      return (
                        <tr key={`param-${id}`} className="row-input-var">
                          <td>
                            <span className="row-tag">Entrada</span> {ITEM_DEFINITIONS[id].shortLabel}
                          </td>
                          <td>{beforeFmt.value} {beforeFmt.unit}</td>
                          <td><strong>{nowFmt.value} {nowFmt.unit}</strong></td>
                          <td>Alterado</td>
                        </tr>
                      );
                    })}
                    {regimeChanged && (
                      <tr className="row-input-var">
                        <td><span className="row-tag">Entrada</span> Regime de esgoto</td>
                        <td>{baseScenario.sewageDischargeMode === 'pulse' ? 'Pulso único' : 'Contínuo'}</td>
                        <td><strong>{simulation.sewageDischargeMode === 'pulse' ? 'Pulso único' : 'Contínuo'}</strong></td>
                        <td>Regime distinto</td>
                      </tr>
                    )}
                    {[
                      {
                        label: 'Tempo simulado',
                        before: formatSimulatedTime(baseScenario.savedAtDay),
                        now: formatSimulatedTime(simulation.elapsedDays),
                        delta: `${simulation.elapsedDays - baseScenario.savedAtDay >= 0 ? '+' : ''}${Math.round(simulation.elapsedDays - baseScenario.savedAtDay)} d`,
                      },
                      {
                        label: 'Oxigênio dissolvido',
                        before: `${baseScenario.dissolvedOxygen.toFixed(2).replace('.', ',')} mg/L`,
                        now: `${simulation.dissolvedOxygen.toFixed(2).replace('.', ',')} mg/L`,
                        delta: `${simulation.dissolvedOxygen - baseScenario.dissolvedOxygen >= 0 ? '+' : ''}${(simulation.dissolvedOxygen - baseScenario.dissolvedOxygen).toFixed(2).replace('.', ',')} mg/L`,
                      },
                      {
                        label: 'pH efetivo',
                        before: baseScenario.effectivePh.toFixed(2).replace('.', ','),
                        now: currentPh.toFixed(2).replace('.', ','),
                        delta: `${currentPh - baseScenario.effectivePh >= 0 ? '+' : ''}${(currentPh - baseScenario.effectivePh).toFixed(2).replace('.', ',')}`,
                      },
                      {
                        label: 'Estresse térmico simulado',
                        before: `${baseScenario.degreeHeatingWeeks.toFixed(1).replace('.', ',')} °C-sem.`,
                        now: `${simulation.degreeHeatingWeeks.toFixed(1).replace('.', ',')} °C-sem.`,
                        delta: `${simulation.degreeHeatingWeeks - baseScenario.degreeHeatingWeeks >= 0 ? '+' : ''}${(simulation.degreeHeatingWeeks - baseScenario.degreeHeatingWeeks).toFixed(1).replace('.', ',')} °C-sem.`,
                      },
                      {
                        label: 'Saúde dos corais (modelo)',
                        before: `${Math.round(baseScenario.health.coral)}/100`,
                        now: `${Math.round(simulation.health.coral)}/100`,
                        delta: `${Math.round(simulation.health.coral - baseScenario.health.coral) >= 0 ? '+' : ''}${Math.round(simulation.health.coral - baseScenario.health.coral)} pts`,
                      },
                      {
                        label: 'Saúde da fauna (modelo)',
                        before: `${Math.round(baseScenario.health.fish)}/100`,
                        now: `${Math.round(simulation.health.fish)}/100`,
                        delta: `${Math.round(simulation.health.fish - baseScenario.health.fish) >= 0 ? '+' : ''}${Math.round(simulation.health.fish - baseScenario.health.fish)} pts`,
                      },
                      {
                        label: 'Pressão de algas (modelo)',
                        before: `${Math.round(baseScenario.algae)}/100`,
                        now: `${Math.round(algae)}/100`,
                        delta: `${Math.round(algae - baseScenario.algae) >= 0 ? '+' : ''}${Math.round(algae - baseScenario.algae)} pts`,
                      },
                    ].map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{row.before}</td>
                        <td><strong>{row.now}</strong></td>
                        <td className="delta-col">{row.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {savedScenarios.length > 0 && (
                <div className="saved-scenarios-list">
                  <h4>Cenários guardados nesta aula</h4>
                  <ul>
                    {savedScenarios.map((sc) => (
                      <li key={sc.id}>
                        <button
                          type="button"
                          className={`saved-sc-select ${activeComparisonId === sc.id ? 'active' : ''}`}
                          onClick={() => onSelectComparisonId(sc.id)}
                        >
                          <strong>{sc.label}</strong>
                          <small>{formatSimulatedTime(sc.savedAtDay)} · OD {sc.dissolvedOxygen.toFixed(1).replace('.', ',')} mg/L · Corais {Math.round(sc.health.coral)}/100</small>
                        </button>
                        <button
                          type="button"
                          className="saved-sc-delete"
                          onClick={() => onDeleteSavedScenario(sc.id)}
                          aria-label={`Remover cenário ${sc.label}`}
                          title="Remover cenário guardado"
                        >
                          <Icon name="close" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          </div>
        )}

        {/* ABA 3: DADOS, FONTES E MÉTODO */}
        {tab === 'sources' && (
          <div className="evidence-section">
            {/* Distinção das 3 naturezas de dados */}
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

            {/* 1. NOAA CORAL REEF WATCH */}
            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag satellite">1. Dados Derivados de Observação Satelital</span>
                  <h3>NOAA Coral Reef Watch (grade de ~5 km)</h3>
                </div>
                <span className={`source-state-pill tone-${noaaStateBadge.tone}`}>
                  {noaaStateBadge.text}
                </span>
              </div>

              {/* Comparação visual explícita: DHW Oficial NOAA vs Estresse Térmico Simulado */}
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
                    Calculado localmente a partir do slider de temperatura com referência didática fixa (MMM = 28,0 °C; limiar = 29,0 °C).
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
                      className="secondary-action-btn"
                      onClick={() => onApplySatelliteTemperature(oceanData.latestCrw!.seaSurfaceTemperatureDegC)}
                    >
                      Usar SST satelital ({oceanData.latestCrw.seaSurfaceTemperatureDegC.toFixed(1).replace('.', ',')} °C) como temperatura do experimento
                    </button>
                    <small>
                      Importa apenas a temperatura inicial; a saúde de corais e peixes continua sendo calculada pela simulação local.
                    </small>
                  </div>

                  <details className="method-details">
                    <summary>Proveniência, ordem de consulta e semântica de BAA ▾</summary>
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
                      <button type="button" className="secondary-action-btn" onClick={() => oceanData.refreshNoaa()}>
                        Tentar consultar satélite novamente
                      </button>
                    )}
                    {sector.id !== 'paraguacu' && (
                      <button type="button" className="secondary-action-btn" onClick={() => oceanData.loadHistoricalCrwSnapshot()}>
                        Carregar registro histórico identificado (mar–abr 2024)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>

            {/* 2. OPEN-METEO MARINE */}
            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag model-ext">2. Dados Produzidos por Modelo Externo</span>
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
                    Estimativas numéricas de modelo oceânico externo (~5 a 8 km), não medições de boia local. Conforme alerta da documentação do serviço, estimativas de nível do mar e correntes têm precisão limitada em canais costeiros rasos e estuários estreitos.
                  </p>
                </>
              ) : (
                <div className="source-empty-box">
                  <p>{oceanData.meteoStatus.error ?? 'Previsão externa indisponível no momento.'}</p>
                  <div className="source-fallback-actions">
                    <button type="button" className="secondary-action-btn" onClick={() => oceanData.refreshMeteo()}>
                      Tentar reconectar modelo externo
                    </button>
                    <button type="button" className="secondary-action-btn" onClick={() => oceanData.loadHistoricalMeteoSnapshot()}>
                      Carregar registro histórico identificado (mar 2024)
                    </button>
                  </div>
                </div>
              )}
            </article>

            {/* 3. CLASSIFICAÇÃO DO NÍVEL DE EVIDÊNCIA DOS PARÂMETROS */}
            <article className="evidence-card">
              <div className="evidence-card-head">
                <div>
                  <span className="origin-tag local">3. Transparência Científica do Modelo Local</span>
                  <h3>Classificação do nível de evidência dos parâmetros</h3>
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
                <summary>Dados empíricos de microplásticos nos estuários da BTS (Trindade et al., 2023) ▾</summary>
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
          </div>
        )}
      </div>
    </aside>
  );
}
