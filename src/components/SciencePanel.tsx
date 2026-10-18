import { Icon } from './Icons';
import { TrendChart, type TrendSeries } from './TrendChart';
import { FISH_SPECIES, PRESSURE_LABELS } from '../simulation/config';
import { calculateAlgae, calculateFishPressures, calculateTrophicBalance, countActiveFactors } from '../simulation/model';
import { evaluateChallenge, type ChallengeProgress } from '../simulation/challenges';
import { formatSimulatedTime } from '../simulation/time';
import type {
  Challenge,
  EducationalMessage,
  FishSpeciesId,
  Indicator,
  PressureId,
  SimulationState,
} from '../simulation/types';

export type PanelTab = 'now' | 'indicators' | 'species' | 'timeline' | 'challenges';

const TABS: ReadonlyArray<{ id: PanelTab; label: string; icon: 'info' | 'chart' | 'fish' | 'clock' | 'target' }> = [
  { id: 'now', label: 'Agora', icon: 'info' },
  { id: 'indicators', label: 'Indicadores', icon: 'chart' },
  { id: 'species', label: 'Espécies', icon: 'fish' },
  { id: 'timeline', label: 'Tempo', icon: 'clock' },
  { id: 'challenges', label: 'Desafios', icon: 'target' },
];

const SERIES: TrendSeries[] = [
  { id: 'coral', label: 'Corais', color: '#e2b757', pick: (point) => point.coral },
  { id: 'fish', label: 'Peixes', color: '#55c9df', pick: (point) => point.fish },
  { id: 'algae', label: 'Algas', color: '#3ed39f', pick: (point) => point.algae },
];

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
    : calculateFishPressures(state.env);
  const sensitivity: Partial<Record<PressureId, number>> = id === 'coral'
    ? { thermal: 1, acidification: 1, oil: 0.75, microplastics: 0.14, sewage: 0.55, turbidity: 0.6, fishing: 0.3 }
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
}: SciencePanelProps) {
  const algae = calculateAlgae(state.env, state.health);
  const trophic = calculateTrophicBalance(state.species, algae);
  const herbivores = (state.species['blue-tang'] + state.species.parrotfish) / 2;
  const before = pastPoint(state, 30);
  const coralChip = topPressures(state, 'coral');
  const eventLog = [...state.events].reverse().slice(0, 8);
  const activeFactors = countActiveFactors(state.targets);

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
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="panel-body">
        {tab === 'now' && (
          <section className="panel-section" aria-label="O que está acontecendo">
            <article className={`message-card tone-${message.tone}`}>
              <header>
                <span className="message-icon"><Icon name={message.tone === 'positive' ? 'check' : 'info'} /></span>
                <div>
                  <small>O que está acontecendo?</small>
                  <strong>{message.title}</strong>
                </div>
              </header>
              <p className="message-what">{message.what}</p>
              <dl className="cause-effect">
                <div>
                  <dt>Causa</dt>
                  <dd>{message.cause}</dd>
                </div>
                <div>
                  <dt>Consequência</dt>
                  <dd>{message.effect}</dd>
                </div>
              </dl>
              <p className="message-ask">
                <Icon name="target" />
                <span>{message.ask}</span>
              </p>
            </article>

            <article className="context-card">
              <h3>Situação atual</h3>
              <ul>
                <li><span>Fatores aplicados</span><strong>{activeFactors}</strong></li>
                <li><span>Tempo simulado</span><strong>{formatSimulatedTime(state.elapsedDays)}</strong></li>
                <li><span>Simulação</span><strong>{state.paused ? 'pausada' : `em ${state.speed}×`}</strong></li>
              </ul>
            </article>

            <div className="message-steps">
              <span><Icon name="play" /> Aplique uma mudança na bancada</span>
              <span><Icon name="clock" /> Avance o tempo na linha do tempo</span>
              <span><Icon name="chart" /> Compare o resultado nos indicadores</span>
            </div>
          </section>
        )}

        {tab === 'indicators' && (
          <section className="panel-section" aria-label="Indicadores do recife">
            <ul className="indicator-list">
              {indicators.map((item) => (
                <li key={item.id} className={`indicator tone-${item.tone}`}>
                  <div className="indicator-head">
                    <span>{item.label}</span>
                    <strong>{item.display}</strong>
                  </div>
                  <div className="indicator-bar"><i style={{ width: `${Math.max(2, item.value)}%` }} /></div>
                  <p>{item.note}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'species' && (
          <section className="panel-section" aria-label="Espécies e teia alimentar">
            <article className="species-card">
              <header>
                <span className="species-name"><Icon name="coral" /> Corais construtores</span>
                <strong className={levelTone(state.health.coral)}>{Math.round(state.health.coral)}%</strong>
              </header>
              <div className="indicator-bar"><i style={{ width: `${Math.max(2, state.health.coral)}%` }} /></div>
              <ul className="stress-tags">
                {coralChip.length === 0
                  ? <li className="calm">sem pressões relevantes</li>
                  : coralChip.map((entry) => <li key={entry.pressure}>{PRESSURE_LABELS[entry.pressure]}</li>)}
              </ul>
            </article>

            {FISH_SPECIES.map((species) => {
              const health = state.species[species.id];
              const tags = topPressures(state, species.id);
              return (
                <article className="species-card" key={species.id}>
                  <header>
                    <span className="species-name"><Icon name="fish" /> {species.label}</span>
                    <strong className={levelTone(health)}>{Math.round(health)}%</strong>
                  </header>
                  <div className="indicator-bar"><i style={{ width: `${Math.max(2, health)}%` }} /></div>
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
                  <strong>{Math.round(algae)}%</strong>
                </div>
                <div className={`web-node tone-${levelTone(herbivores)}`}>
                  <small>Herbívoros</small>
                  <strong>{Math.round(herbivores)}%</strong>
                </div>
                <div className={`web-node tone-${levelTone(state.health.coral)}`}>
                  <small>Corais</small>
                  <strong>{Math.round(state.health.coral)}%</strong>
                </div>
              </div>
              <p className="web-balance">
                Equilíbrio da teia: <strong className={levelTone(trophic)}>{Math.round(trophic)}%</strong>
              </p>
              <p className="web-note">
                Herbívoros raspam as algas e abrem espaço para o coral recrutar. Quando a pesca remove
                esses peixes, as algas avançam e a teia fica mais curta: sobram poucos elos entre a
                produção e os predadores de topo.
              </p>
            </article>
          </section>
        )}

        {tab === 'timeline' && (
          <section className="panel-section" aria-label="Linha do tempo">
            <TrendChart history={state.history} series={SERIES} />

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
                      <span className="compare-values">{Math.round(past)}% → <strong>{Math.round(current)}%</strong></span>
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
                        <span className="event-title">{event.id.replace(/_/g, ' ')}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </article>
          </section>
        )}

        {tab === 'challenges' && (
          <section className="panel-section" aria-label="Desafios">
            <p className="panel-intro">
              Escolha um objetivo para investigar. A barra mostra quantos dias seguidos a condição já se
              manteve.
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
                        <span className="challenge-days">{progress.daysHeld}/{challenge.windowDays} dias</span>
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
          </section>
        )}
      </div>
    </aside>
  );
}
