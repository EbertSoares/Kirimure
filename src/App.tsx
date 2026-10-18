import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { BrazilMapScreen } from './components/BrazilMapScreen';
import { Icon } from './components/Icons';
import { MarineScene } from './scene/MarineScene';
import { BASELINE, ITEM_DEFINITIONS, PARAMETERS } from './simulation/config';
import { buildTargets, createInitialState, tickSimulation } from './simulation/model';
import { evaluateMessages, getMessage } from './simulation/messages';
import { formatSimulatedTime, SIMULATION_SPEEDS } from './simulation/time';
import type { Environment, ItemId, SimulationSpeed } from './simulation/types';

type AppScreen = 'map' | 'simulation';

const itemIds = Object.keys(ITEM_DEFINITIONS) as ItemId[];

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

// Um fator está ligado quando a barra sai da posição inicial (baseline).
function isFactorActive(id: ItemId, value: number) {
  return Math.abs(value - BASELINE[id]) > 1e-9;
}

function countActiveFactors(environment: Environment) {
  return itemIds.filter((id) => isFactorActive(id, environment[id])).length;
}

function ObservationCard({ title, text }: { title: string; text: string }) {
  return (
    <section className="observation-card" aria-live="polite">
      <span className="observation-icon"><Icon name="info" /></span>
      <div>
        <span className="observation-kicker">O que está acontecendo?</span>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </section>
  );
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
    <article className={`direct-factor slider-${id} ${active ? 'active' : ''}`}>
      <div className="factor-head">
        <span className="factor-icon"><Icon name={item.icon} /></span>
        <span className="factor-name">{item.shortLabel}</span>
        <strong className="factor-value">{formatValue(id, value)}</strong>
      </div>
      <input
        type="range"
        min={item.min}
        max={item.max}
        step={item.step}
        value={value}
        aria-label={`${item.label}: ${formatValue(id, value)}. Na posição inicial o fator fica desligado.`}
        style={{ '--progress': `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="range-labels">
        <span>{item.lowLabel}</span>
        <span>{item.highLabel}</span>
      </div>
    </article>
  );
}

function DepthRuler({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`depth-ruler ${side}`} aria-hidden="true">
      {[0, 5, 10, 15, 20].map((depth) => (
        <span key={depth} style={{ top: `${depth * 5}%` }}><i />{depth} m</span>
      ))}
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<AppScreen>('map');
  const [controls, setControls] = useState<Environment>({ ...BASELINE });
  const [simulation, setSimulation] = useState(createInitialState);
  const [consoleOpen, setConsoleOpen] = useState(true);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    const fixedStep = 1 / PARAMETERS.tickRate;

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
  const activeFactors = countActiveFactors(controls);

  const applyChanges = () => {
    setSimulation((current) => ({ ...current, targets: buildTargets(controls), paused: false }));
  };

  const setSpeed = (speed: SimulationSpeed) => setSimulation((current) => ({ ...current, speed }));
  const togglePause = () => setSimulation((current) => ({ ...current, paused: !current.paused }));

  const reset = () => {
    setControls({ ...BASELINE });
    setSimulation(createInitialState());
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
            <strong className="brand-name">Kinimurê</strong>
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

          <div className="environment-readout" aria-label="Condições atuais">
            <span>
              <small>Temperatura</small>
              <strong>{simulation.env.temperature.toFixed(1)}°C</strong>
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
        </section>

        <section className={`teaching-console ${consoleOpen ? 'expanded' : 'collapsed'}`} aria-label="Bancada de controle do experimento">
          <header className="console-header">
            <div className="console-title">
              <span className="console-icon"><Icon name="flask" /></span>
              <div>
                <small>Bancada didática</small>
                <strong>Configure o ambiente</strong>
              </div>
            </div>

            <div className="health-strip" aria-label="Saúde do ecossistema">
              <span><small>Geral</small><strong className={healthLevel(simulation.overall)}>{Math.round(simulation.overall)}%</strong></span>
              <span><small>Corais</small><strong className={healthLevel(simulation.health.coral)}>{Math.round(simulation.health.coral)}%</strong></span>
              <span><small>Fauna</small><strong className={healthLevel(simulation.health.fish)}>{Math.round(simulation.health.fish)}%</strong></span>
            </div>

            <div className="console-transport">
              <button type="button" className="pause-button" aria-pressed={simulation.paused} onClick={togglePause}>
                <Icon name={simulation.paused ? 'play' : 'pause'} />{simulation.paused ? 'Continuar' : 'Pausar'}
              </button>
              <div className="speed-control" aria-label="Velocidade da simulação">
                {SIMULATION_SPEEDS.map((speed) => (
                  <button
                    type="button"
                    key={speed}
                    className={simulation.speed === speed ? 'active' : ''}
                    aria-pressed={simulation.speed === speed}
                    onClick={() => setSpeed(speed)}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </div>

            <button type="button" className="console-toggle" onClick={() => setConsoleOpen((open) => !open)} aria-expanded={consoleOpen}>
              {consoleOpen ? 'Recolher ↓' : 'Abrir controles ↑'}
            </button>
          </header>

          {consoleOpen && (
            <div className="console-body">
              <section className="factor-panel" aria-label="Fatores ambientais">
                <div className="factor-panel-heading">
                  <h2>Fatores ambientais</h2>
                  <p>Arraste uma barra para ativar o fator. Na posição inicial, o fator fica desligado.</p>
                </div>
                <div className="factor-control-grid">
                  {itemIds.map((id) => (
                    <FactorControl
                      key={id}
                      id={id}
                      active={isFactorActive(id, controls[id])}
                      value={controls[id]}
                      onChange={(value) => setControls((current) => ({ ...current, [id]: value }))}
                    />
                  ))}
                </div>
              </section>

              <aside className="experiment-feedback">
                <button type="button" className="apply-button" disabled={activeFactors === 0} onClick={applyChanges}>
                  <Icon name="play" /> Aplicar e observar
                </button>
                <p className="feedback-status">
                  {activeFactors === 0
                    ? 'Nenhum fator ativo'
                    : `${activeFactors} ${activeFactors === 1 ? 'fator ativo' : 'fatores ativos'}`}
                </p>
                <ObservationCard title={currentMessage.title} text={currentMessage.text} />
              </aside>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
