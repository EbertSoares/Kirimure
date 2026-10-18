import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { BrazilMapScreen } from './components/BrazilMapScreen';
import { Icon } from './components/Icons';
import { SciencePanel, type PanelTab } from './components/SciencePanel';
import { TimelineBar } from './components/TimelineBar';
import { MarineScene } from './scene/MarineScene';
import { BASELINE, FACTOR_GROUPS, ITEM_DEFINITIONS } from './simulation/config';
import { CHALLENGES, evaluateChallenge } from './simulation/challenges';
import {
  buildTargets,
  countActiveFactors,
  createInitialState,
  deriveIndicators,
  isFactorActive,
  tickSimulation,
} from './simulation/model';
import { evaluateMessages, getMessage } from './simulation/messages';
import { formatSimulatedTime } from './simulation/time';
import type { Environment, ItemId, SimulationSpeed } from './simulation/types';

type AppScreen = 'map' | 'simulation';

const DEPTH_SCALE = 30;

const FACTOR_ORDER = FACTOR_GROUPS.flatMap((group) => group.items);
const GROUP_BY_ITEM = Object.fromEntries(
  FACTOR_GROUPS.flatMap((group) => group.items.map((id) => [id, group.id])),
) as Record<ItemId, string>;

function formatValue(id: ItemId, value: number) {
  if (id === 'temperature') return `${value.toFixed(1).replace('.0', '')}°C`;
  if (id === 'ph') return value.toFixed(2).replace(/0$/, '').replace('.', ',');
  return Math.round(value).toString();
}

function healthLevel(value: number) {
  if (value >= 67) return 'healthy';
  if (value >= 34) return 'watch';
  return 'critical';
}

interface FactorControlProps {
  id: ItemId;
  active: boolean;
  value: number;
  onChange: (value: number) => void;
}

function FactorControl({ id, active, value, onChange }: FactorControlProps) {
  const item = ITEM_DEFINITIONS[id];
  const progress = ((value - item.min) / (item.max - item.min)) * 100;

  return (
    <article
      className={`direct-factor group-${GROUP_BY_ITEM[id]} slider-${id} ${active ? 'active' : ''}`}
      title={`${item.label} — ${item.help}`}
    >
      <span className="factor-icon"><Icon name={item.icon as 'bottle'} /></span>
      <label className="factor-name" htmlFor={`factor-${id}`}>{item.shortLabel}</label>
      <input
        id={`factor-${id}`}
        type="range"
        min={item.min}
        max={item.max}
        step={item.step}
        value={value}
        aria-label={`${item.label}: ${formatValue(id, value)}. Na posição inicial o fator fica desligado.`}
        style={{ '--progress': `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong className="factor-value">{formatValue(id, value)}</strong>
    </article>
  );
}

function DepthRuler({ side }: { side: 'left' | 'right' }) {
  const marks = Array.from({ length: DEPTH_SCALE / 5 + 1 }, (_, index) => index * 5);

  return (
    <div className={`depth-ruler ${side}`} aria-hidden="true">
      {marks.map((depth) => (
        <span key={depth} style={{ top: `${(depth / DEPTH_SCALE) * 100}%` }}><i />{depth} m</span>
      ))}
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<AppScreen>('map');
  const [controls, setControls] = useState<Environment>({ ...BASELINE });
  const [simulation, setSimulation] = useState(createInitialState);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>('now');
  const [challengeId, setChallengeId] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    const fixedStep = 1 / 10;

    const animate = (now: number) => {
      const elapsed = Math.min((now - previous) / 1000, 0.5);
      previous = now;
      accumulator += elapsed;
      if (accumulator >= fixedStep) {
        const steps = Math.min(Math.floor(accumulator / fixedStep), 5);
        accumulator -= steps * fixedStep;
        setSimulation((current) => {
          let next = current;
          for (let index = 0; index < steps; index += 1) next = evaluateMessages(tickSimulation(next, fixedStep));
          return next;
        });
      }
      frame = requestAnimationFrame(animate);
    };

    const handleVisibility = () => { previous = performance.now(); accumulator = 0; };
    document.addEventListener('visibilitychange', handleVisibility);
    frame = requestAnimationFrame(animate);

    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', handleVisibility); };
  }, []);

  const currentMessage = useMemo(() => getMessage(simulation.latestMessageId), [simulation.latestMessageId]);
  const indicators = useMemo(() => deriveIndicators(simulation), [simulation]);
  const activeFactors = countActiveFactors(controls);
  const challenge = CHALLENGES.find((item) => item.id === challengeId) ?? null;
  const challengeProgress = challenge ? evaluateChallenge(challenge, simulation) : null;

  const applyChanges = () => {
    setSimulation((current) => ({ ...current, targets: buildTargets(controls), paused: false }));
    setPanelTab('now');
  };

  const setSpeed = (speed: SimulationSpeed) => setSimulation((current) => ({ ...current, speed }));
  const togglePause = () => setSimulation((current) => ({ ...current, paused: !current.paused }));

  const reset = () => {
    setControls({ ...BASELINE });
    setSimulation(createInitialState());
    setChallengeId(null);
    setPanelTab('now');
  };

  if (screen === 'map') return <BrazilMapScreen onSelectBahia={() => setScreen('simulation')} />;

  return (
    <div className="app-shell simulation-app">
      <header className="topbar">
        <button type="button" className="map-back-button" onClick={() => setScreen('map')}>
          ← <span>Mapa do Brasil</span>
        </button>

        <div className="brand compact">
          <span className="brand-mark"><Icon name="waves" /></span>
          <div className="brand-text">
            <strong className="brand-name">Kirimurê</strong>
            <span className="brand-sub">Laboratório Digital Marinho</span>
          </div>
        </div>

        <button type="button" className="reset-button" onClick={reset}><Icon name="reset" /> Reiniciar</button>
      </header>

      <main className={`simulation-workspace ${consoleOpen ? 'console-expanded' : 'console-collapsed'}`}>
        <section className="scene-card" aria-label="Visualização do recife">
          <MarineScene state={simulation} />
          <DepthRuler side="left" />
          <DepthRuler side="right" />

          <div className="environment-readout" aria-label="Condições atuais da água">
            <span>
              <small>Temperatura</small>
              <strong>{simulation.env.temperature.toFixed(1).replace('.0', '')}°C</strong>
            </span>
            <span>
              <small>Acidez</small>
              <strong>{simulation.env.ph.toFixed(2)} pH</strong>
            </span>
            <span>
              <small>Tempo</small>
              <strong>{formatSimulatedTime(simulation.elapsedDays)}</strong>
            </span>
          </div>

          <div className="health-overlay" aria-label="Saúde do ecossistema">
            <span>
              <small>Geral</small>
              <strong className={healthLevel(simulation.overall)}>{Math.round(simulation.overall)}%</strong>
            </span>
            <span>
              <small>Corais</small>
              <strong className={healthLevel(simulation.health.coral)}>{Math.round(simulation.health.coral)}%</strong>
            </span>
            <span>
              <small>Fauna</small>
              <strong className={healthLevel(simulation.health.fish)}>{Math.round(simulation.health.fish)}%</strong>
            </span>
          </div>
        </section>

        <SciencePanel
          state={simulation}
          message={currentMessage}
          indicators={indicators}
          challenges={CHALLENGES}
          challengeId={challengeId}
          challengeProgress={challengeProgress}
          onSelectChallenge={(id) => setChallengeId((current) => (current === id ? null : id))}
          tab={panelTab}
          onTabChange={setPanelTab}
        />

        <TimelineBar
          state={simulation}
          onTogglePause={togglePause}
          onSpeed={setSpeed}
          consoleOpen={consoleOpen}
          onToggleConsole={() => setConsoleOpen((open) => !open)}
        />

        <section className={`teaching-console ${consoleOpen ? 'expanded' : 'collapsed'}`} aria-label="Controles do experimento">
          <header className="console-header">
            <div className="console-heading">
              <h2>Fatores ambientais</h2>
              <p>Arraste uma barra para ligar o fator — na posição inicial ele fica desligado.</p>
            </div>
            <p className={`feedback-status ${activeFactors > 0 ? 'ready' : ''}`}>
              {activeFactors === 0
                ? 'Nenhum fator ativo'
                : `${activeFactors} ${activeFactors === 1 ? 'fator ativo' : 'fatores ativos'} — pronto para aplicar`}
            </p>
            <button type="button" className="apply-button" disabled={activeFactors === 0} onClick={applyChanges}>
              <Icon name="play" /> Aplicar e observar
            </button>
          </header>

          {consoleOpen && (
            <div className="console-body">
              {FACTOR_ORDER.map((id) => (
                <FactorControl
                  key={id}
                  id={id}
                  active={isFactorActive(id, controls[id])}
                  value={controls[id]}
                  onChange={(value) => setControls((current) => ({ ...current, [id]: value }))}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
