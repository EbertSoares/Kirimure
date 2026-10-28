import { Icon } from './Icons';
import { OxygenTrendChart } from './OxygenTrendChart';
import { Sparkline } from './Sparkline';
import { EcosystemRadar } from './EcosystemRadar';
import { NormativeGaugeBar } from './NormativeGaugeBar';
import { TrophicPyramid } from './TrophicPyramid';
import { NicheToleranceCurve } from './NicheToleranceCurve';
import { IndicatorContextCard, type IndicatorDetailId } from './IndicatorModal';
import { BTS_SECTORS, FISH_SPECIES, PRESSURE_LABELS } from '../simulation/config';
import { calculateAlgae, calculateFishPressures, calculateTrophicBalance, effectivePh } from '../simulation/model';
import { calculateRespirationPhImpact } from '../simulation/carbonate';
import { calculateOilFateBudget, evaluateOilEcotoxicity, BTS_MICROPLASTICS_SURVEY } from '../simulation/contaminants';
import { evaluateChallenge, type ChallengeProgress } from '../simulation/challenges';
import { getMessageById } from '../simulation/messages';
import { MISSION_01_OXYGEN } from '../simulation/missions';
import type { OceanDataState } from '../hooks/useOceanData';
import type {
  Challenge,
  EducationalMessage,
  FishSpeciesId,
  Indicator,
  MissionState,
  MissionStepId,
  PressureId,
  SimulationState,
} from '../simulation/types';

export type PanelTab = 'summary' | 'results' | 'history' | 'activities' | 'data';

const TABS: ReadonlyArray<{ id: PanelTab; label: string }> = [
  { id: 'summary', label: 'Resumo' },
  { id: 'results', label: 'Resultados' },
  { id: 'history', label: 'Evolução' },
  { id: 'activities', label: 'Atividades' },
  { id: 'data', label: 'Dados e Método' },
];

const BINOMIAL_MAP: Record<FishSpeciesId, { binomial: string; family: string }> = {
  'blue-tang': { binomial: 'Acanthurus chirurgus / A. coeruleus', family: 'Acanthuridae · Herbívoro' },
  'sergeant-major': { binomial: 'Abudefduf saxatilis', family: 'Pomacentridae · Onívoro' },
  'parrotfish': { binomial: 'Scarus trispinosus / Sparisoma amplum', family: 'Scaridae · Raspador / Bio-erosor' },
};

function pastPoint(state: SimulationState, daysBack: number) {
  const target = state.elapsedDays - daysBack;
  let found = state.history[0];
  for (const point of state.history) {
    if (point.day <= target) found = point;
    else break;
  }
  return found;
}

function levelTone(value: number, higherIsBetter = true) {
  const score = higherIsBetter ? value : 100 - value;
  if (score >= 67) return 'healthy' as const;
  if (score >= 34) return 'watch' as const;
  return 'critical' as const;
}

function topPressures(state: SimulationState, id: FishSpeciesId | 'coral') {
  const pressures = id === 'coral'
    ? state.pressures
    : calculateFishPressures(state.env, state.degreeHeatingWeeks);
  const sensitivity: Partial<Record<PressureId, number>> = id === 'coral'
    ? { thermal: 1, acidification: 1, oil: 0.75, microplastics: 0.14, sewage: 0.55 }
    : (FISH_SPECIES.find((item) => item.id === id)?.sensitivity ?? {});

  return (Object.keys(pressures) as PressureId[])
    .map((pressure) => ({
      pressure,
      weight: pressures[pressure] * (sensitivity[pressure] ?? 1),
    }))
    .filter((entry) => entry.weight >= 0.08)
    .sort((first, second) => second.weight - first.weight)
    .slice(0, 3);
}

function mapToIndicatorDetailId(id: string): IndicatorDetailId | null {
  if (id === 'oxygen' || id === 'dissolvedOxygen') return 'dissolvedOxygen';
  if (id === 'coral') return 'coral';
  if (id === 'fish') return 'fish';
  if (id === 'temperature') return 'temperature';
  if (id === 'ph') return 'ph';
  if (id === 'dhw') return 'dhw';
  if (id === 'overall') return 'overall';
  if (id === 'time') return 'time';
  return null;
}

interface SciencePanelProps {
  state: SimulationState;
  message: EducationalMessage;
  indicators: Indicator[];
  challenges: readonly Challenge[];
  challengeId: string | null;
  challengeProgress: ChallengeProgress | null;
  onSelectChallenge: (id: string) => void;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  oceanData?: OceanDataState;
  onApplySatelliteConditions?: (temperature: number) => void;
  missionState?: MissionState | null;
  onStartMission?: (id: string) => void;
  onMissionStepChange?: (step: MissionStepId) => void;
  onSelectHypothesis?: (id: string, text?: string) => void;
  onApplyMissionSolution?: () => void;
  onExitMission?: () => void;
  selectedIndicator?: IndicatorDetailId | null;
  onSelectIndicator?: (id: IndicatorDetailId | null) => void;
  getIndicatorValue?: (id: IndicatorDetailId) => string;
}

export function SciencePanel({
  state,
  message,
  indicators,
  challenges,
  challengeId,
  challengeProgress,
  onSelectChallenge,
  tab,
  onTabChange,
  oceanData,
  onApplySatelliteConditions,
  missionState,
  onStartMission,
  onMissionStepChange,
  onSelectHypothesis,
  onApplyMissionSolution,
  onExitMission,
  selectedIndicator,
  onSelectIndicator,
  getIndicatorValue,
}: SciencePanelProps) {
  const algae = calculateAlgae(state.env, state.health);
  const trophic = calculateTrophicBalance(state.species, algae);
  const herbivores = (state.species['blue-tang'] + state.species.parrotfish) / 2;
  const before = pastPoint(state, 30);
  const coralChip = topPressures(state, 'coral');
  const eventLog = [...state.events].reverse().slice(0, 8);

  const sector = BTS_SECTORS.find((s) => s.id === state.sector) ?? BTS_SECTORS[0];
  const sectorSalinity = sector.baselineSalinity;
  const scaledAlkalinity = 2350 * (sectorSalinity / 35.0);
  const respirationImpact = calculateRespirationPhImpact(
    state.env.ph,
    state.respiratoryDicUmolKg ?? 0,
    scaledAlkalinity,
    state.env.temperature,
    sectorSalinity,
  );
  const carbonate = respirationImpact.carbonateSystem;
  const spilledOilMassKg = state.controls.oil > 0 ? state.controls.oil : state.env.oil;
  const oilBudget = spilledOilMassKg > 0 ? calculateOilFateBudget(spilledOilMassKg, state.sector, state.elapsedDays) : null;
  const oilEcotox = oilBudget ? evaluateOilEcotoxicity(oilBudget.dissolvedPahConcentrationUgL) : null;
  const isIntro = message.id === 'intro';
  const messageStatus = message.tone === 'alert'
    ? 'Atenção'
    : message.tone === 'positive'
      ? 'Recuperação'
      : 'Ponto de partida';

  const currentPh = effectivePh(state.env, state.biochemicalOxygenDemand, state.sector, state.respiratoryDicUmolKg);

  return (
    <aside className="science-panel" aria-label="Painel científico">
      <nav className="panel-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            type="button"
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => onTabChange(item.id)}
          >
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="panel-body">
        {/* 1. ABA RESUMO */}
        {tab === 'summary' && (
          <section className="panel-section" aria-label="Resumo do cenário e leitura atual">
            <article className={`message-card tone-${message.tone}`}>
              <header className="message-heading">
                <span className="message-icon"><Icon name={message.tone === 'positive' ? 'check' : 'info'} /></span>
                <div>
                  <span className="message-kicker">
                    Leitura atual <i>{messageStatus}</i>
                    {message.badge && <span className="epistemological-badge">{message.badge}</span>}
                  </span>
                  <h2>{message.title}</h2>
                </div>
              </header>
              <p className="message-what">{message.what}</p>
              {isIntro ? (
                <ol className="lesson-starter" aria-label="Roteiro rápido para iniciar a atividade">
                  <li title="Formule uma previsão"><span>1</span><strong>Preveja</strong></li>
                  <li title="Altere somente um fator"><span>2</span><strong>Teste</strong></li>
                  <li title="Compare o valor e o tempo"><span>3</span><strong>Compare</strong></li>
                </ol>
              ) : (
                <dl className="cause-effect">
                  <div>
                    <dt>Por que acontece</dt>
                    <dd>{message.cause}</dd>
                  </div>
                  <div>
                    <dt>Efeito no recife</dt>
                    <dd>{message.effect}</dd>
                  </div>
                </dl>
              )}
              <aside className="message-ask">
                <span className="ask-label"><Icon name="target" /> Pergunta de Investigação</span>
                <p>{message.ask}</p>
              </aside>
            </article>

            <article className="summary-variables-card">
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '13px', color: '#e2e8f0' }}>Variáveis-Chave do Cenário</h3>
                <span className="epistemological-badge" style={{ fontSize: '10px' }}>Leitura Rápida</span>
              </header>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: '0 0 10px' }}>
                Selecione uma variável para abrir interpretação, equações e limites normativos na aba Resultados:
              </p>
              <div className="summary-grid">
                <button
                  type="button"
                  className="summary-metric-btn"
                  onClick={() => {
                    onSelectIndicator?.('dissolvedOxygen');
                    onTabChange('results');
                  }}
                  title="Ver método e limites CONAMA de Oxigênio Dissolvido"
                >
                  <span className="metric-label">Oxigênio (OD)</span>
                  <strong className={`metric-val ${state.dissolvedOxygen < 2 ? 'critical' : state.dissolvedOxygen < 5 ? 'watch' : 'healthy'}`}>
                    {state.dissolvedOxygen.toFixed(1).replace('.', ',')} mg/L
                  </strong>
                </button>

                <button
                  type="button"
                  className="summary-metric-btn"
                  onClick={() => {
                    onSelectIndicator?.('temperature');
                    onTabChange('results');
                  }}
                  title="Ver método e limiares térmicos"
                >
                  <span className="metric-label">Temperatura</span>
                  <strong className={`metric-val ${state.env.temperature >= 29 ? 'critical' : state.env.temperature >= 28 ? 'watch' : 'healthy'}`}>
                    {state.env.temperature.toFixed(1).replace('.', ',')} °C
                  </strong>
                </button>

                <button
                  type="button"
                  className="summary-metric-btn"
                  onClick={() => {
                    onSelectIndicator?.('ph');
                    onTabChange('results');
                  }}
                  title="Ver método e sistema carbonato de pH"
                >
                  <span className="metric-label">pH da Água</span>
                  <strong className={`metric-val ${currentPh < 7.9 ? 'critical' : currentPh < 8.1 ? 'watch' : 'healthy'}`}>
                    {currentPh.toFixed(2).replace('.', ',')}
                  </strong>
                </button>

                <button
                  type="button"
                  className="summary-metric-btn"
                  onClick={() => {
                    onSelectIndicator?.('overall');
                    onTabChange('results');
                  }}
                  title="Ver índice sintético de resiliência geral"
                >
                  <span className="metric-label">Resiliência Geral</span>
                  <strong className={`metric-val ${levelTone(state.overall)}`}>
                    {Math.round(state.overall)}/100
                  </strong>
                </button>

                <button
                  type="button"
                  className="summary-metric-btn"
                  onClick={() => {
                    onSelectIndicator?.('dhw');
                    onTabChange('results');
                  }}
                  title="Ver estresse térmico acumulado Degree Heating Weeks"
                >
                  <span className="metric-label">DHW (12 sem)</span>
                  <strong className={`metric-val ${state.degreeHeatingWeeks >= 4 ? 'critical' : state.degreeHeatingWeeks > 0 ? 'watch' : 'healthy'}`}>
                    {state.degreeHeatingWeeks.toFixed(1).replace('.', ',')} °C-sem
                  </strong>
                </button>

                <button
                  type="button"
                  className="summary-metric-btn"
                  onClick={() => {
                    onSelectIndicator?.('coral');
                    onTabChange('results');
                  }}
                  title="Ver resiliência relativa dos corais construtores"
                >
                  <span className="metric-label">Corais / Fauna</span>
                  <strong className="metric-val">
                    {Math.round(state.health.coral)}/100 · {Math.round(state.health.fish)}/100
                  </strong>
                </button>
              </div>
            </article>

            <article className="events-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0 }}>Marcos Recentes</h3>
                <button
                  type="button"
                  onClick={() => onTabChange('history')}
                  style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                >
                  Ver histórico completo →
                </button>
              </div>
              {eventLog.length === 0 ? (
                <p className="events-empty">Nenhum marco ainda. Avance os dias na barra temporal para observar os efeitos.</p>
              ) : (
                <ul>
                  {eventLog.slice(0, 4).map((event, index) => (
                    <li key={`${event.id}-${event.day}-${index}`}>
                      <span className="event-day">dia {event.day}</span>
                      <span className="event-title">{getMessageById(event.id).title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        )}

        {/* 2. ABA RESULTADOS */}
        {tab === 'results' && (
          <section className="panel-section" aria-label="Resultados e diagnóstico ecológico">
            {selectedIndicator && (
              <IndicatorContextCard
                indicatorId={selectedIndicator}
                onClose={() => onSelectIndicator?.(null)}
                currentValue={getIndicatorValue ? getIndicatorValue(selectedIndicator) : undefined}
              />
            )}

            <EcosystemRadar state={state} trophic={trophic} />

            <ul className="indicator-list">
              {indicators.map((item) => {
                const historyData = state.history.map((h) => {
                  if (item.id === 'coral') return h.coral;
                  if (item.id === 'fish') return h.fish;
                  if (item.id === 'algae') return h.algae;
                  if (item.id === 'oxygen') return h.dissolvedOxygen;
                  if (item.id === 'trophic') return (h.coral + h.fish) / 2;
                  return item.value;
                });
                const detailId = mapToIndicatorDetailId(item.id);

                return (
                  <li
                    key={item.id}
                    className={`indicator tone-${item.tone} ${selectedIndicator === detailId ? 'selected-indicator' : ''}`}
                    onClick={() => {
                      if (detailId) onSelectIndicator?.(detailId);
                    }}
                    style={{ cursor: detailId ? 'pointer' : 'default' }}
                    title={detailId ? 'Clique para inspecionar interpretação, metodologia e limites normativos' : undefined}
                  >
                    <div className="indicator-head">
                      <span>
                        {item.label}
                        {item.badge && <small className="indicator-badge">{item.badge}</small>}
                      </span>
                      <div className="indicator-value-group">
                        <Sparkline
                          data={historyData}
                          min={0}
                          max={item.id === 'oxygen' ? 8 : 100}
                          label={item.label}
                          stroke={item.tone === 'healthy' ? '#00e5ff' : item.tone === 'watch' ? '#ffd052' : '#ff5a5a'}
                        />
                        <strong>{item.display}</strong>
                      </div>
                    </div>

                    <NormativeGaugeBar
                      id={item.id}
                      value={item.value}
                      display={item.display}
                      unit={item.unit}
                      rawOxygen={item.id === 'oxygen' ? state.dissolvedOxygen : undefined}
                    />

                    <p>{item.note}</p>
                    {item.equation && (
                      <p style={{ fontFamily: 'monospace', fontSize: '11px', color: '#38bdf8', marginTop: '4px', background: 'rgba(56, 189, 248, 0.08)', padding: '4px 8px', borderRadius: '4px' }}>
                        {item.equation}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            <TrophicPyramid
              coralHealth={state.health.coral}
              fishHealth={state.health.fish}
              algaeCoverage={algae}
              trophicBalance={trophic}
              herbivoresHealth={herbivores}
            />

            <article className="species-card coral-science-card">
              <header>
                <div className="species-identity">
                  <span className="species-name"><Icon name="coral" /> Corais construtores</span>
                  <small className="species-binomial">Mussismilia hispida · Siderastrea stellata</small>
                  <span className="species-guild-tag">Engenheiros do Recife</span>
                </div>
                <div className="species-metric-group">
                  <Sparkline
                    data={state.history.map((h) => h.coral)}
                    min={0}
                    max={100}
                    label="Corais"
                    stroke={levelTone(state.health.coral) === 'healthy' ? '#00e5ff' : '#ffd052'}
                  />
                  <strong className={levelTone(state.health.coral)}>{Math.round(state.health.coral)}/100</strong>
                </div>
              </header>

              <NormativeGaugeBar id="coral" value={state.health.coral} display={`${Math.round(state.health.coral)}/100`} />

              <NicheToleranceCurve
                speciesLabel="Corais Construtores"
                currentStress={state.pressures.thermal * 0.45 + state.pressures.acidification * 0.35 + (state.pressures.sewage ?? 0) * 0.2}
                primaryStressor={coralChip[0]?.pressure ? PRESSURE_LABELS[coralChip[0].pressure] : 'estável'}
                sensitivityMultiplier={1.2}
              />

              <ul className="stress-tags">
                {coralChip.length === 0
                  ? <li className="calm">sem pressões relevantes</li>
                  : coralChip.map((entry) => <li key={entry.pressure}>{PRESSURE_LABELS[entry.pressure]}</li>)}
              </ul>
            </article>

            {FISH_SPECIES.map((species) => {
              const health = state.species[species.id];
              const tags = topPressures(state, species.id);
              const speciesHistory = state.history.map((h) => h.species?.[species.id] ?? h.fish);
              const taxonomy = BINOMIAL_MAP[species.id];
              const primaryStressor = tags[0]?.pressure ? PRESSURE_LABELS[tags[0].pressure] : 'estável';
              const topWeight = tags[0]?.weight ?? 0;

              return (
                <article className="species-card" key={species.id}>
                  <header>
                    <div className="species-identity">
                      <span className="species-name"><Icon name="fish" /> {species.label}</span>
                      {taxonomy && <small className="species-binomial">{taxonomy.binomial}</small>}
                      {taxonomy && <span className="species-guild-tag">{taxonomy.family}</span>}
                    </div>
                    <div className="species-metric-group">
                      <Sparkline
                        data={speciesHistory}
                        min={0}
                        max={100}
                        label={species.label}
                        stroke={levelTone(health) === 'healthy' ? '#00e5ff' : levelTone(health) === 'watch' ? '#ffd052' : '#ff5a5a'}
                      />
                      <strong className={levelTone(health)}>{Math.round(health)}/100</strong>
                    </div>
                  </header>

                  <NormativeGaugeBar id={`species-${species.id}`} value={health} display={`${Math.round(health)}/100`} />

                  <NicheToleranceCurve
                    speciesLabel={species.label}
                    currentStress={topWeight}
                    primaryStressor={primaryStressor}
                    sensitivityMultiplier={species.sensitivity.thermal}
                  />

                  <p className="species-role">{species.role}</p>
                  <ul className="stress-tags">
                    {tags.length === 0
                      ? <li className="calm">sem pressões relevantes</li>
                      : tags.map((entry) => <li key={entry.pressure}>{PRESSURE_LABELS[entry.pressure]}</li>)}
                  </ul>
                  <p className="species-note">{species.note}</p>
                </article>
              );
            })}

            <article className="food-web">
              <h3><Icon name="web" /> Teia alimentar</h3>
              <div className="web-nodes">
                <div className={`web-node tone-${levelTone(algae, false)}`}>
                  <small>Algas</small>
                  <strong>{Math.round(algae)}/100</strong>
                </div>
                <div className={`web-node tone-${levelTone(herbivores)}`}>
                  <small>Herbívoros</small>
                  <strong>{Math.round(herbivores)}/100</strong>
                </div>
                <div className={`web-node tone-${levelTone(state.health.coral)}`}>
                  <small>Corais</small>
                  <strong>{Math.round(state.health.coral)}/100</strong>
                </div>
              </div>
              <p className="web-balance">
                Equilíbrio da teia: <strong className={levelTone(trophic)}>{Math.round(trophic)}/100</strong>
              </p>
              <p className="web-note">
                Herbívoros raspam as algas e abrem espaço para o coral recrutar. Quando as algas
                avançam — por excesso de nutrientes ou pela perda de herbívoros — a teia fica mais
                curta: sobram poucos elos entre a produção e os predadores de topo.
              </p>
            </article>
          </section>
        )}

        {/* 3. ABA EVOLUÇÃO (TIMELINE & HISTÓRICO) */}
        {tab === 'history' && (
          <section className="panel-section" aria-label="Evolução temporal e histórico">
            <OxygenTrendChart
              history={state.history}
              currentOxygen={state.dissolvedOxygen}
              currentDay={state.elapsedDays}
              showFish={true}
            />

            <article className="compare-card">
              <h3>Comparação: agora e 30 dias atrás</h3>
              <ul>
                {([
                  ['Corais', before.coral, state.health.coral],
                  ['Peixes', before.fish, state.health.fish],
                  ['Algas', before.algae, algae],
                  ['Saúde geral', before.overall, state.overall],
                ] as const).map(([label, past, current]) => {
                  const delta = current - past;
                  return (
                    <li key={label}>
                      <span>{label}</span>
                      <span className="compare-values">{Math.round(past)}/100 → <strong>{Math.round(current)}/100</strong></span>
                      <em className={delta >= 0 ? 'up' : 'down'}>
                        {delta >= 0 ? '+' : ''}{Math.round(delta)}
                        {delta >= 0 ? ' ↑' : ' ↓'}
                      </em>
                    </li>
                  );
                })}
              </ul>
            </article>

            <article className="events-card">
              <h3>Marcos observados</h3>
              {eventLog.length === 0
                ? <p className="events-empty">Nenhum marco ainda. Avance o tempo para que os efeitos apareçam.</p>
                : (
                  <ul>
                    {eventLog.map((event, index) => (
                      <li key={`${event.id}-${event.day}-${index}`}>
                        <span className="event-day">dia {event.day}</span>
                        <span className="event-title">{getMessageById(event.id).title}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </article>
          </section>
        )}

        {/* 4. ABA ATIVIDADES (MISSÃO E DESAFIOS) */}
        {tab === 'activities' && (
          <section className="panel-section" aria-label="Desafios e Missões Guiadas">
            {missionState ? (
              <div className="mission-active-panel">
                <header className="mission-header-bar">
                  <span className="mission-badge">Investigação 1 · 6º ao 9º ano</span>
                  <button type="button" className="mission-exit-btn" onClick={onExitMission}>
                    Sair da Missão (Modo Livre)
                  </button>
                </header>

                <div className="mission-steps-progress" aria-label="Progresso da missão">
                  <div className={`mission-step-dot ${missionState.step === 'intro' ? 'active' : 'completed'}`} />
                  <div className={`mission-step-dot ${missionState.step === 'hypothesis' ? 'active' : missionState.step !== 'intro' ? 'completed' : ''}`} />
                  <div className={`mission-step-dot ${missionState.step === 'experiment' ? 'active' : (missionState.step === 'solution' || missionState.step === 'conclusion') ? 'completed' : ''}`} />
                  <div className={`mission-step-dot ${missionState.step === 'solution' ? 'active' : missionState.step === 'conclusion' ? 'completed' : ''}`} />
                  <div className={`mission-step-dot ${missionState.step === 'conclusion' ? 'active' : ''}`} />
                </div>

                {missionState.step === 'intro' && (
                  <article className="mission-step-card">
                    <span className="mission-step-kicker">Etapa 1 de 5 · Conheça o Ambiente</span>
                    <h3 className="mission-title">{MISSION_01_OXYGEN.title}</h3>
                    <div className="mission-question-box">
                      {MISSION_01_OXYGEN.question}
                    </div>
                    <div className="mission-live-metric">
                      <span>Oxigênio de Partida:</span>
                      <strong style={{ color: 'var(--healthy)' }}>{state.dissolvedOxygen.toFixed(1).replace('.', ',')} mg/L (Adequado)</strong>
                    </div>
                    <p className="mission-desc">
                      Nesta aula guiada, você vai investigar o que acontece na água quando o efluente orgânico é despejado,
                      formular uma hipótese científica e verificar uma intervenção de saneamento.
                    </p>
                    <div className="mission-step-nav">
                      <button
                        type="button"
                        className="mission-next-btn"
                        onClick={() => onMissionStepChange?.('hypothesis')}
                      >
                        Formular Hipótese →
                      </button>
                    </div>
                  </article>
                )}

                {missionState.step === 'hypothesis' && (
                  <article className="mission-step-card">
                    <span className="mission-step-kicker">Etapa 2 de 5 · Faça uma Previsão</span>
                    <h3 className="mission-title">O que você prevê que vai acontecer?</h3>
                    <p className="mission-desc">
                      Selecione uma das hipóteses abaixo para registrar o que você espera observar antes do experimento:
                    </p>
                    <div className="mission-hypothesis-options">
                      {MISSION_01_OXYGEN.hypotheses.map((h) => {
                        const selected = missionState.selectedHypothesisId === h.id;
                        return (
                          <button
                            key={h.id}
                            type="button"
                            className={`mission-hypothesis-choice ${selected ? 'selected' : ''}`}
                            onClick={() => onSelectHypothesis?.(h.id)}
                          >
                            {h.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mission-step-nav">
                      <button
                        type="button"
                        className="mission-next-btn"
                        disabled={!missionState.selectedHypothesisId}
                        onClick={() => onMissionStepChange?.('experiment')}
                      >
                        Confirmar e Iniciar Experimento →
                      </button>
                    </div>
                  </article>
                )}

                {missionState.step === 'experiment' && (
                  <article className="mission-step-card">
                    <span className="mission-step-kicker">Etapa 3 de 5 · Teste e Observe</span>
                    <h3 className="mission-title">Laboratório em Ação</h3>
                    <div className="mission-question-box">
                      <strong>Instruções do experimento:</strong>
                      <ol style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                        <li>Na bancada inferior, ajuste a <strong>Carga Orgânica (DBO)</strong> para 5.000 kg (ou mais) e clique no botão verde <strong>Iniciar Experimento</strong>.</li>
                        <li>Acima da cena 3D, selecione velocidade <strong>2× ou 5×</strong> para avançar os dias.</li>
                        <li>Acompanhe a curva de oxigênio abaixo e a resposta dos peixes na cena marinha.</li>
                      </ol>
                    </div>

                    <OxygenTrendChart
                      history={state.history}
                      currentOxygen={state.dissolvedOxygen}
                      currentDay={state.elapsedDays}
                      showFish={true}
                    />

                    {state.dissolvedOxygen < 3.5 || state.elapsedDays >= 6 ? (
                      <div className="mission-conclusion-card" style={{ borderColor: 'var(--watch)' }}>
                        <strong>Queda de oxigênio confirmada!</strong>
                        <p style={{ margin: 0 }}>
                          As bactérias heterotróficas estão decompondo a matéria orgânica e esgotando o oxigênio da enseada,
                          causando estresse respiratório e evasão dos peixes.
                        </p>
                      </div>
                    ) : (
                      <p className="mission-desc" style={{ fontStyle: 'italic' }}>
                        Aguardando a aplicação da carga orgânica e o avanço dos dias simulados no relógio...
                      </p>
                    )}

                    <div className="mission-step-nav">
                      <button
                        type="button"
                        className="mission-next-btn"
                        disabled={state.dissolvedOxygen >= 4.0 && state.elapsedDays < 6}
                        onClick={() => onMissionStepChange?.('solution')}
                      >
                        Investigar Solução de Saneamento →
                      </button>
                    </div>
                  </article>
                )}

                {missionState.step === 'solution' && (
                  <article className="mission-step-card">
                    <span className="mission-step-kicker">Etapa 4 de 5 · Investigue a Solução</span>
                    <h3 className="mission-title">O que podemos fazer?</h3>
                    <p className="mission-desc">
                      O oxigênio caiu para níveis perigosos. Como recuperar a enseada sem medidas mágicas?
                    </p>

                    <div className="mission-solution-box">
                      <strong>Estação de Tratamento de Esgoto (ETE) · Cenário de Intervenção</strong>
                      <p>
                        A ETE intercepta o efluente e retém 98% da carga orgânica na fonte (hipótese didática de projeto).
                      </p>
                      <button
                        type="button"
                        className="mission-solution-btn"
                        onClick={onApplyMissionSolution}
                        disabled={missionState.solutionApplied}
                      >
                        {missionState.solutionApplied ? 'Tratamento em Operação ✓' : 'Ativar Tratamento de Esgoto'}
                      </button>
                    </div>

                    <OxygenTrendChart
                      history={state.history}
                      currentOxygen={state.dissolvedOxygen}
                      currentDay={state.elapsedDays}
                      showFish={true}
                    />

                    {missionState.solutionApplied && (
                      <div className="mission-conclusion-card">
                        <strong>Recuperação Gradual por Balanço de Massa:</strong>
                        <p style={{ margin: 0 }}>
                          Observe o relógio: o oxigênio não sobe instantaneamente. A recuperação depende do tempo de renovação hidrodinâmica
                          das marés, da taxa de reaeração atmosférica e da oxidação do efluente residual remanescente na baía.
                        </p>
                      </div>
                    )}

                    <div className="mission-step-nav">
                      <button
                        type="button"
                        className="mission-next-btn"
                        disabled={!missionState.solutionApplied}
                        onClick={() => onMissionStepChange?.('conclusion')}
                      >
                        Ver Conclusão da Investigação →
                      </button>
                    </div>
                  </article>
                )}

                {missionState.step === 'conclusion' && (
                  <article className="mission-step-card">
                    <span className="mission-step-kicker">Etapa 5 de 5 · Explique e Conclua</span>
                    <h3 className="mission-title">Conclusão da Aula</h3>

                    <div className="mission-conclusion-card">
                      <strong>Sua Previsão vs. Evidência:</strong>
                      {(() => {
                        const hyp = MISSION_01_OXYGEN.hypotheses.find((h) => h.id === missionState.selectedHypothesisId);
                        if (!hyp) return null;
                        return (
                          <div>
                            <p style={{ margin: '0 0 6px', color: hyp.isCorrectMechanism ? 'var(--healthy)' : 'var(--watch)' }}>
                              <strong>Você previu:</strong> “{hyp.label}”
                            </p>
                            <p style={{ margin: 0 }}>{hyp.explanation}</p>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="mission-table-card">
                      <strong style={{ display: 'block', marginBottom: '8px' }}>
                        Caderno de Campo · Registro do Experimento:
                      </strong>
                      <div className="table-responsive">
                        <table className="mission-evidence-table">
                          <thead>
                            <tr>
                              <th>Momento</th>
                              <th>Carga DBO</th>
                              <th>Oxigênio (OD)</th>
                              <th>Comportamento dos Peixes</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td><strong>1. Inicial</strong></td>
                              <td>0 kg DBO</td>
                              <td><span className="badge-pill healthy">~7,1 mg/L</span></td>
                              <td>Natação livre e respiração normal</td>
                            </tr>
                            <tr>
                              <td><strong>2. Lançamento</strong></td>
                              <td>5.000 kg DBO</td>
                              <td><span className="badge-pill critical">&lt; 2,0 mg/L</span></td>
                              <td>Hipóxia severa, asfixia e evasão</td>
                            </tr>
                            <tr>
                              <td><strong>3. Solução (ETE)</strong></td>
                              <td>Retenção de 98%</td>
                              <td><span className="badge-pill watch">Recuperação</span></td>
                              <td>Marés renovam água e fauna retorna</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="mission-conclusion-card" style={{ borderColor: 'rgba(0, 195, 200, .4)' }}>
                      <strong>Os Dois Caminhos do Esgoto:</strong>
                      <p style={{ margin: 0 }}>
                        <strong>1. Consumo Direto (DBO):</strong> As bactérias consomem oxigênio rapidamente ao decompor a matéria orgânica.<br />
                        <strong>2. Eutrofização (Nutrientes):</strong> O nitrogênio e fósforo causam florações de algas, cuja decomposição tardia consome mais oxigênio.
                      </p>
                    </div>

                    <div className="mission-question-box">
                      <strong>Para pensar e discutir em sala:</strong>
                      <p style={{ margin: '4px 0 0', fontSize: '11.5px' }}>
                        {MISSION_01_OXYGEN.transferQuestion}
                      </p>
                    </div>

                    <div className="mission-step-nav">
                      <button
                        type="button"
                        className="mission-next-btn"
                        onClick={onExitMission}
                      >
                        Concluir Missão & Modo Livre
                      </button>
                    </div>
                  </article>
                )}
              </div>
            ) : (
              <>
                <div className="mission-intro-banner">
                  <header>
                    <span className="mission-badge">Aula Guiada · 45 min</span>
                    <span className="epistemological-badge">Cenário Didático</span>
                  </header>
                  <h3 className="mission-title">Investigação 1 · Oxigênio dissolvido</h3>
                  <p className="mission-desc">
                    Investigação científica passo a passo: descubra por que a carga de matéria orgânica afeta a respiração e a sobrevivência dos peixes na baía.
                  </p>
                  <button
                    type="button"
                    className="mission-start-btn"
                    onClick={() => onStartMission?.('missao-oxigenio')}
                  >
                    Iniciar Missão Guiada →
                  </button>
                </div>

                <div className="challenges-divider">Ou pratique os desafios livres</div>

                <p className="panel-intro">
                  Escolha um objetivo para investigar no modo livre. A barra indica quantos dias seguidos a condição foi sustentada.
                </p>

                <ul className="challenge-list">
                  {challenges.map((challenge) => {
                    const progress = challengeProgress && challengeId === challenge.id
                      ? challengeProgress
                      : evaluateChallenge(challenge, state);
                    const selected = challengeId === challenge.id;

                    return (
                      <li key={challenge.id}>
                        <button
                          type="button"
                          className={`challenge-card ${selected ? 'selected' : ''} status-${progress.status}`}
                          onClick={() => onSelectChallenge(challenge.id)}
                          aria-pressed={selected}
                        >
                          <header>
                            <span className="challenge-title">{challenge.title}</span>
                            <span className="challenge-days">
                              {Math.min(progress.daysHeld, challenge.windowDays)}/{challenge.windowDays} dias
                            </span>
                          </header>
                          <p>{challenge.brief}</p>
                          <div className="challenge-progress"><i style={{ width: `${progress.progress * 100}%` }} /></div>
                          <small>
                            {progress.status === 'done'
                              ? 'Objetivo alcançado!'
                              : progress.status === 'running'
                                ? `Em andamento — faltam ${challenge.windowDays - progress.daysHeld} dias.`
                                : 'Ainda não começou.'}
                          </small>
                          {selected && <p className="challenge-hint"><Icon name="info" /> {challenge.hint}</p>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        )}

        {/* 5. ABA DADOS E MÉTODO (NOAA, OPEN-METEO, CARBONATO, ÓLEO E MICROPLÁSTICOS) */}
        {tab === 'data' && (
          <section className="panel-section" aria-label="Dados Oceanográficos Externos e Metodologia Científica">
            <header style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="epistemological-badge">Modo de Referência Ambiental</span>
                {oceanData && (
                  <button
                    type="button"
                    onClick={() => oceanData.refresh()}
                    disabled={oceanData.loading}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      color: '#38bdf8',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {oceanData.loading ? 'Atualizando...' : 'Atualizar Dados'}
                  </button>
                )}
              </div>
              <h2 style={{ fontSize: '18px', margin: '8px 0 4px', color: '#fff' }}>
                Monitoramento Satelital & Metodologia da BTS
              </h2>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                Dados observados e produtos de modelo em grade regional da Baía de Todos-os-Santos.
                Distinção transparente entre <strong>dados externos</strong> e o <strong>cenário didático experimental</strong>.
              </p>
            </header>

            {/* Banner de Fallback / Contingência se offline */}
            {oceanData?.isFallback && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '16px',
                fontSize: '12px',
                color: '#f59e0b',
                lineHeight: 1.4,
              }}>
                <strong>Modo Offline / Snapshot de Contingência Histórico:</strong>
                <p style={{ margin: '4px 0 0' }}>
                  A rede externa está inacessível. O laboratório exibe os snapshots históricos calibrados
                  do evento El Niño de março/abril de 2024 para fins de estudo comparativo.
                </p>
              </div>
            )}

            {/* 1. PRODUTO DE SATÉLITE - NOAA Coral Reef Watch */}
            <article className="compare-card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>1. Produto de Satélite: NOAA Coral Reef Watch</h3>
                <span className="epistemological-badge" style={{ fontSize: '10px' }}>Satélite Operacional</span>
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', margin: '4px 0 8px' }}>
                Posição Solicitada: {sector.coordinates.latitude.toFixed(2)}°, {sector.coordinates.longitude.toFixed(2)}° ({sector.label})
                {oceanData?.latestCrw?.gridCell && (
                  <span> · Célula de Grade NOAA: {oceanData.latestCrw.gridCell.latitude.toFixed(2)}°, {oceanData.latestCrw.gridCell.longitude.toFixed(2)}° ({oceanData.latestCrw.spatialResolution ?? '5 km'})</span>
                )}
                <span> · Dataset <code>NOAA_DHW</code> CoastWatch ERDDAP</span>
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: oceanData?.noaaStatus.state === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: oceanData?.noaaStatus.state === 'success' ? '#4ade80' : '#fbbf24',
                }}>
                  {oceanData?.noaaStatus.state === 'success' ? '● Ao Vivo via ERDDAP' : '● Snapshot Histórico (Mar/Abr 2024)'}
                </span>
                {oceanData?.latestCrw?.provenance.responseHash && (
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', alignSelf: 'center' }}>
                    Hash: <code>{oceanData.latestCrw.provenance.responseHash}</code>
                  </span>
                )}
              </div>

              {oceanData?.latestCrw ? (
                <>
                  <ul>
                    <li>
                      <span>Temperatura de Superfície (SST Satélite)</span>
                      <strong>{oceanData.latestCrw.seaSurfaceTemperatureDegC.toFixed(1)} °C</strong>
                    </li>
                    <li>
                      <span>Anomalia de SST Oficial (CRW_SSTANOMALY)</span>
                      <strong className={oceanData.latestCrw.sstAnomalyDegC !== null && oceanData.latestCrw.sstAnomalyDegC > 1.0 ? 'critical' : oceanData.latestCrw.sstAnomalyDegC !== null && oceanData.latestCrw.sstAnomalyDegC > 0 ? 'watch' : 'healthy'}>
                        {oceanData.latestCrw.sstAnomalyDegC !== null ? `${oceanData.latestCrw.sstAnomalyDegC > 0 ? '+' : ''}${oceanData.latestCrw.sstAnomalyDegC.toFixed(2)} °C` : 'Ausente'}
                      </strong>
                    </li>
                    <li>
                      <span>HotSpot Térmico Oficial (CRW_HOTSPOT)</span>
                      <strong>{oceanData.latestCrw.hotSpotDegC !== null ? `${oceanData.latestCrw.hotSpotDegC.toFixed(1)} °C` : 'Ausente'}</strong>
                    </li>
                    <li>
                      <span>Degree Heating Weeks Oficial (CRW_DHW)</span>
                      <strong className={oceanData.latestCrw.degreeHeatingWeeks !== null && oceanData.latestCrw.degreeHeatingWeeks >= 8 ? 'critical' : oceanData.latestCrw.degreeHeatingWeeks !== null && oceanData.latestCrw.degreeHeatingWeeks >= 4 ? 'watch' : 'healthy'}>
                        {oceanData.latestCrw.degreeHeatingWeeks !== null ? `${oceanData.latestCrw.degreeHeatingWeeks.toFixed(1)} °C-semana` : 'Ausente'}
                      </strong>
                    </li>
                    <li>
                      <span>Nível Operacional de Alerta (BAA)</span>
                      <em>
                        {oceanData.latestCrw.bleachingAlertLevel === 4
                          ? 'Alerta 2 (Mortalidade severa provável)'
                          : oceanData.latestCrw.bleachingAlertLevel === 3
                            ? 'Alerta 1 (Risco significativo de branqueamento)'
                            : oceanData.latestCrw.bleachingAlertLevel === 2
                              ? 'Aviso Térmico (Warning)'
                              : oceanData.latestCrw.bleachingAlertLevel === 1
                                ? 'Vigilância (Watch)'
                                : oceanData.latestCrw.bleachingAlertLevel === 0
                                  ? 'Sem Estresse Térmico (Nível 0)'
                                  : 'Dado Ausente'}
                      </em>
                    </li>
                  </ul>

                  {onApplySatelliteConditions && (
                    <button
                      type="button"
                      onClick={() => onApplySatelliteConditions(oceanData.latestCrw!.seaSurfaceTemperatureDegC)}
                      style={{
                        marginTop: '12px',
                        width: '100%',
                        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(56, 189, 248, 0.15))',
                        border: '1px solid rgba(56, 189, 248, 0.45)',
                        color: '#e0f2fe',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Icon name="check" />
                      <span>
                        {oceanData.noaaStatus.state === 'success'
                          ? `Usar SST do satélite NOAA (${oceanData.latestCrw.seaSurfaceTemperatureDegC.toFixed(1)} °C) como condição inicial`
                          : `Usar SST do snapshot histórico NOAA (${oceanData.latestCrw.seaSurfaceTemperatureDegC.toFixed(1)} °C) como condição inicial`}
                      </span>
                    </button>
                  )}

                  <div style={{ marginTop: '12px', background: 'rgba(0,0,0,0.25)', padding: '10px', borderRadius: '6px', fontSize: '11px', lineHeight: 1.5 }}>
                    <strong style={{ color: '#38bdf8' }}>Comparação de Governança Epistemológica:</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                      <div style={{ borderLeft: '2px solid #38bdf8', paddingLeft: '8px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>Satélite NOAA CRW:</span><br />
                        SST: {oceanData.latestCrw.seaSurfaceTemperatureDegC.toFixed(1)} °C · DHW: {oceanData.latestCrw.degreeHeatingWeeks !== null ? `${oceanData.latestCrw.degreeHeatingWeeks.toFixed(1)} °C-sem` : '—'}
                      </div>
                      <div style={{ borderLeft: '2px solid #a855f7', paddingLeft: '8px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>Cenário Simulado Didático:</span><br />
                        SST: {state.env.temperature.toFixed(1)} °C · DHW: {state.degreeHeatingWeeks.toFixed(1)} °C-sem
                      </div>
                    </div>
                    <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '10.5px' }}>
                      Nota: O BAA e o HotSpot da NOAA são calculados sobre a climatologia do pixel (MMM de satélite em grade de 5 km), enquanto o estresse didático no Kirimurê utiliza a linha de base configurada para o setor.
                    </p>
                  </div>
                </>
              ) : (
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                  <p style={{ margin: 0 }}>
                    <strong>Nenhum dado térmico de satélite disponível para {sector.label}:</strong>
                  </p>
                  <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.5)' }}>
                    Setores estuarinos interiores estreitos sofrem mascaramento de terra na grade oceânica de 5 km da NOAA. O Kirimurê mantém os parâmetros físico-químicos e batimétricos calibrados da simulação local.
                  </p>
                </div>
              )}
            </article>

            {/* 2. PRODUTO DE MODELO NUMÉRICO - Open-Meteo Marine */}
            <article className="compare-card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>2. Modelo Numérico Costeiro: Open-Meteo Marine</h3>
                <span className="epistemological-badge" style={{ fontSize: '10px' }}>Modelo Global ECMWF</span>
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', margin: '4px 0 8px' }}>
                Canal de Entrada da BTS (-12.97°, -38.50°) · Grade nominal 8 km (Copernicus / ECMWF)
                {oceanData?.latestMeteo?.timestampUtc && (
                  <span> · Registro Horário: {oceanData.latestMeteo.timestampUtc.replace('T', ' ').substring(0, 16)} UTC</span>
                )}
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: oceanData?.meteoStatus.state === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: oceanData?.meteoStatus.state === 'success' ? '#4ade80' : '#fbbf24',
                }}>
                  {oceanData?.meteoStatus.state === 'success' ? '● Modelo Costeiro em Tempo Real' : '● Snapshot de Contingência'}
                </span>
              </div>

              {oceanData?.latestMeteo ? (
                <>
                  <ul>
                    <li>
                      <span>Altura Significativa de Ondas (Hs)</span>
                      <strong>{oceanData.latestMeteo.waveHeightM !== null ? `${oceanData.latestMeteo.waveHeightM.toFixed(1)} m` : 'Dado não disponível'}</strong>
                    </li>
                    <li>
                      <span>Velocidade da Corrente Marinha</span>
                      <strong>{oceanData.latestMeteo.currentVelocityMs !== null ? `${oceanData.latestMeteo.currentVelocityMs.toFixed(2)} m/s` : 'Dado não disponível'}</strong>
                    </li>
                    {oceanData.latestMeteo.currentDirectionDeg !== null && (
                      <li>
                        <span>Direção da Corrente</span>
                        <span>{oceanData.latestMeteo.currentDirectionDeg}° (azimute náutico)</span>
                      </li>
                    )}
                    <li>
                      <span>Nível do Mar Médio (MSL)</span>
                      <strong>{oceanData.latestMeteo.seaLevelHeightM !== null ? `${oceanData.latestMeteo.seaLevelHeightM.toFixed(2)} m` : 'Dado não disponível'}</strong>
                    </li>
                    <li>
                      <span>Temperatura de Superfície (Meteo)</span>
                      <strong>{oceanData.latestMeteo.seaSurfaceTemperatureDegC !== null ? `${oceanData.latestMeteo.seaSurfaceTemperatureDegC.toFixed(1)} °C` : 'Dado não disponível'}</strong>
                    </li>
                  </ul>
                  <p style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.5)', marginTop: '8px', lineHeight: 1.4 }}>
                    Ressalva Hidrodinâmica: O modelo oceânico global (~8 km) provê condições de contorno oceânicas. A circulação interna nos canais rasos da BTS é dominada pela maré semidiurna e aportes fluviais.
                  </p>
                </>
              ) : (
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                  <p style={{ margin: 0 }}>
                    <strong>Nenhum dado oceanográfico disponível para {sector.label}:</strong>
                  </p>
                  <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.5)' }}>
                    O modelo numérico oceânico global (~8 km) não resolve a hidrodinâmica em canais interiores rasos e estuários. A simulação aplica os parâmetros hidrodinâmicos calibrados do compartimento.
                  </p>
                </div>
              )}
            </article>

            {/* 3. SISTEMA CARBONATO & ARAGONITA */}
            <article className="compare-card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>3. Sistema Carbonato & Calcificação (Ωarag)</h3>
                <span className="epistemological-badge" style={{ fontSize: '10px' }}>Termodinâmica Aquática</span>
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: '4px 0 10px' }}>
                Setor: <strong>{sector.label}</strong> · Salinidade Local: <strong>{sectorSalinity} PSU</strong> · TA: <strong>{carbonate.totalAlkalinityUmolKg.toFixed(0)} µmol/kg</strong>
              </p>
              <ul>
                <li>
                  <span>Saturação de Aragonita (Ωarag)</span>
                  <strong className={carbonate.omegaAragonite >= 3.0 ? 'healthy' : carbonate.omegaAragonite >= 2.0 ? 'watch' : 'critical'}>
                    {carbonate.omegaAragonite.toFixed(2)}
                  </strong>
                </li>
                <li>
                  <span>Pressão parcial de CO₂ (pCO₂)</span>
                  <span>{carbonate.pCO2Uatm} µatm</span>
                </li>
                <li>
                  <span>Carbono Inorgânico Total (DIC)</span>
                  <span>{carbonate.dissolvedInorganicCarbonUmolKg} µmol/kg</span>
                </li>
                {state.biochemicalOxygenDemand > 0 && (
                  <li>
                    <span>Acréscimo de DIC por Respiração (DBO)</span>
                    <span style={{ color: '#ffd052' }}>+{((state.biochemicalOxygenDemand / 32) * 1000 * 0.98).toFixed(1)} µmol/kg</span>
                  </li>
                )}
                <li>
                  <span>Condição de Calcificação</span>
                  <em className={carbonate.omegaAragonite >= 3.0 ? 'up' : 'down'}>
                    {carbonate.calcificationStatus === 'optimum'
                      ? 'Ótima (calcificação plena)'
                      : carbonate.calcificationStatus === 'adequate'
                        ? 'Adequada para recifes'
                        : carbonate.calcificationStatus === 'marginal'
                          ? 'Marginal (estresse moderado)'
                          : 'Severo / Risco de dissolução'}
                  </em>
                </li>
              </ul>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '8px', lineHeight: 1.4 }}>
                Equilíbrio químico fundamentado em Lueker et al. (2000) e Mucci (1983), validado contra formulações CO2SYS / Dickson & Goyet (1994). O consumo de oxigênio pela respiração microbiana eleva o DIC estequiometricamente (1 mol O₂ liberando 0,98 mol CO₂), acidificando a enseada em conjunto com o pH da água.
              </p>
            </article>

            {/* 4. BALANÇO DE DESTINO DO ÓLEO */}
            {oilBudget && (
              <article className="compare-card" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>4. Destino de Hidrocarbonetos de Petróleo (Balanço em 4 Caixas)</h3>
                  <span className="epistemological-badge" style={{ fontSize: '10px' }}>Balanço de Massa</span>
                </div>
                <ul style={{ marginTop: '12px' }}>
                  <li>
                    <span>1. Filme Superficial (bloqueio de luz)</span>
                    <strong>{oilBudget.surfaceFilmKg.toLocaleString('pt-BR')} kg ({oilBudget.surfaceFilmThicknessUm} µm)</strong>
                  </li>
                  <li>
                    <span>2. Coluna d'Água (gotículas dispersas)</span>
                    <strong>{oilBudget.waterColumnDispersedKg.toLocaleString('pt-BR')} kg</strong>
                  </li>
                  <li>
                    <span>3. HPAs Dissolvidos (tPAH50 biodisponível)</span>
                    <strong className={oilBudget.dissolvedPahConcentrationUgL >= 10 ? 'critical' : oilBudget.dissolvedPahConcentrationUgL >= 3 ? 'watch' : 'healthy'}>
                      {oilBudget.dissolvedPahConcentrationUgL.toFixed(3)} µg/L
                    </strong>
                  </li>
                  {oilEcotox && (
                    <li>
                      <span>Inibição Subletal de Regeneração (May et al., 2020)</span>
                      <strong className={oilEcotox.tissueRegenerationInhibitionPercent >= 50 ? 'critical' : oilEcotox.tissueRegenerationInhibitionPercent >= 20 ? 'watch' : 'healthy'}>
                        {oilEcotox.tissueRegenerationInhibitionPercent}% (Risco pólipos: {oilEcotox.polypRetractionRisk})
                      </strong>
                    </li>
                  )}
                  <li>
                    <span>4. Óleo Sedimentado no Fundo</span>
                    <strong>{oilBudget.sedimentedKg.toLocaleString('pt-BR')} kg</strong>
                  </li>
                  <li>
                    <span>Evaporação Atmosférica</span>
                    <span>{oilBudget.evaporatedKg.toLocaleString('pt-BR')} kg</span>
                  </li>
                  <li>
                    <span>Exportação Hidrodinâmica Oceânica</span>
                    <span>{oilBudget.exportedKg.toLocaleString('pt-BR')} kg</span>
                  </li>
                </ul>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '8px', lineHeight: 1.4 }}>
                  Modelo de 4 reservatórios acoplados com perdas advectivas e atmosféricas (resíduo numérico de conservação de massa &lt; 0,1%). A ecotoxicidade de HPAs baseia-se na concentração de tPAH50 com EC50 de 10 µg/L para inibição de regeneração tecidual em corais recifais (May et al., 2020).
                </p>
              </article>
            )}

            {/* 5. MICROPLÁSTICOS BTS */}
            <article className="compare-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>5. Observação de Campo: Microplásticos nos Estuários da BTS</h3>
                <span className="epistemological-badge" style={{ fontSize: '10px' }}>Dado Empírico Local</span>
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', margin: '4px 0 12px' }}>
                Campanhas empíricas publicadas por Trindade et al. (2023 / UFRB / Environmental Pollution)
              </p>
              <ul>
                {BTS_MICROPLASTICS_SURVEY.map((pt) => (
                  <li key={pt.estuaryName} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <strong>{pt.riverName}</strong>
                      <span style={{ color: '#38bdf8' }}>{pt.meanCountPerM3.toLocaleString('pt-BR')} itens/m³ (méd.)</span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                      Faixa: {pt.minCountPerM3.toLocaleString('pt-BR')} a {pt.maxCountPerM3.toLocaleString('pt-BR')} itens/m³ · {pt.particleSizeFractionUnder300Um}% &lt; 300 µm
                    </span>
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '8px', lineHeight: 1.4 }}>
                Aporte fluvial anual estimado em 3,88 trilhões de partículas. Valores reportados em itens/m³ conforme medição in situ de arrasto com rede de plâncton, mantendo fidelidade aos dados empíricos observados.
              </p>
            </article>
          </section>
        )}
      </div>
    </aside>
  );
}
