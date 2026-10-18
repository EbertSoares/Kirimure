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

function healthColor(value: number) {
  if (value >= 67) return 'green';
  if (value >= 34) return 'yellow';
  return 'red';
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
  onToggle: () => void;
  onChange: (value: number) => void;
}

function FactorControl({ id, active, value, onToggle, onChange }: FactorControlProps) {
  const item = ITEM_DEFINITIONS[id];
  const progress = ((value - item.min) / (item.max - item.min)) * 100;
  return (
    <article className={`direct-factor slider-${id} ${active ? 'active' : ''}`}>
      <div className="direct-factor-heading">
        <span className="direct-factor-icon"><Icon name={item.icon} /></span>
        <span className="direct-factor-name"><strong>{item.shortLabel}</strong><small>{item.category === 'elements' ? 'Elemento' : 'Fenômeno'}</small></span>
        <button type="button" className={`factor-toggle ${active ? 'on' : ''}`} aria-pressed={active} onClick={onToggle}><i /><span>{active ? 'Ligado' : 'Desligado'}</span></button>
      </div>
      <div className="direct-factor-value"><span>Intensidade</span><strong>{formatValue(id, value)}</strong></div>
      <input
        type="range"
        min={item.min}
        max={item.max}
        step={item.step}
        value={value}
        disabled={!active}
        aria-label={`Intensidade de ${item.label}`}
        style={{ '--progress': `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="range-labels"><span>{item.lowLabel}</span><span>{item.highLabel}</span></div>
    </article>
  );
}

function DepthRuler({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`depth-ruler ${side}`} aria-hidden="true">
      {[0, 5, 10, 15, 20].map((depth) => <span key={depth} style={{ top: `${depth * 5}%` }}><i />{depth} m</span>)}
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<AppScreen>('map');
  const [selected, setSelected] = useState<Set<ItemId>>(new Set());
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

  const toggleItem = (id: ItemId) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applyChanges = () => {
    setSimulation((current) => ({ ...current, targets: buildTargets(selected, controls), paused: false }));
  };

  const setSpeed = (speed: SimulationSpeed) => setSimulation((current) => ({ ...current, speed }));
  const togglePause = () => setSimulation((current) => ({ ...current, paused: !current.paused }));
  const reset = () => {
    setSelected(new Set());
    setControls({ ...BASELINE });
    setSimulation(createInitialState());
  };

  if (screen === 'map') return <BrazilMapScreen onSelectBahia={() => setScreen('simulation')} />;

  return (
    <div className="app-shell simulation-app">
      <header className="topbar">
        <button type="button" className="map-back-button" onClick={() => setScreen('map')}>← <span>Mapa do Brasil</span></button>
        <div className="brand compact"><span className="brand-mark"><Icon name="waves" /></span><div><span className="brand-kicker">Kinimurê</span><h1>Laboratório Digital Marinho</h1></div></div>
        <button type="button" className="reset-button" onClick={reset}><Icon name="reset" /> Reiniciar</button>
      </header>

      <main className={`simulation-workspace ${consoleOpen ? 'console-expanded' : 'console-collapsed'}`}>
        <section className="scene-card" aria-label="Visualização do recife">
          <MarineScene state={simulation} />
          <DepthRuler side="left" /><DepthRuler side="right" />
          <div className="location-badge"><Icon name="location" /><span><small>Área monitorada</small><strong>Recife costeiro</strong><em>Costa da Bahia</em></span></div>
          <div className="environment-readout" aria-label="Condições atuais">
            <span><small>Temperatura</small><strong>{simulation.env.temperature.toFixed(1)}°C</strong></span>
            <span><small>Acidez</small><strong>{simulation.env.ph.toFixed(2)} pH</strong></span>
            <span className="time-readout"><small>Tempo transcorrido</small><strong>{formatSimulatedTime(simulation.elapsedDays)}</strong></span>
          </div>
        </section>

        <section className={`teaching-console ${consoleOpen ? 'expanded' : 'collapsed'}`} aria-label="Bancada de controle do experimento">
          <header className="console-header">
            <div className="console-title"><span className="console-icon"><Icon name="flask" /></span><div><small>Bancada didática</small><strong>Configure o ambiente</strong></div></div>
            <div className="health-strip" aria-label="Saúde do ecossistema">
              <span><small>Geral</small><strong className={healthColor(simulation.overall)}>{Math.round(simulation.overall)}%</strong></span>
              <span><small>Corais</small><strong className={healthColor(simulation.health.coral)}>{Math.round(simulation.health.coral)}%</strong></span>
              <span><small>Fauna</small><strong className={healthColor(simulation.health.fish)}>{Math.round(simulation.health.fish)}%</strong></span>
            </div>
            <div className="console-transport">
              <button type="button" className="pause-button" aria-pressed={simulation.paused} onClick={togglePause}><Icon name={simulation.paused ? 'play' : 'pause'} />{simulation.paused ? 'Continuar' : 'Pausar'}</button>
              <div className="speed-control" aria-label="Velocidade da simulação">{SIMULATION_SPEEDS.map((speed) => <button type="button" key={speed} className={simulation.speed === speed ? 'active' : ''} aria-pressed={simulation.speed === speed} onClick={() => setSpeed(speed)}>{speed}×</button>)}</div>
            </div>
            <button type="button" className="console-toggle" onClick={() => setConsoleOpen((open) => !open)} aria-expanded={consoleOpen}>{consoleOpen ? 'Recolher ↓' : 'Abrir controles ↑'}</button>
          </header>

          {consoleOpen && (
            <div className="console-body">
              <div className="factor-control-grid">
                {itemIds.map((id) => <FactorControl key={id} id={id} active={selected.has(id)} value={controls[id]} onToggle={() => toggleItem(id)} onChange={(value) => setControls((current) => ({ ...current, [id]: value }))} />)}
              </div>
              <aside className="experiment-feedback">
                <button type="button" className="apply-button" disabled={selected.size === 0} onClick={applyChanges}><Icon name="play" /> Aplicar e observar</button>
                <ObservationCard title={currentMessage.title} text={currentMessage.text} />
              </aside>
            </div>
          )}
        </section>
      </main>
      <footer className="science-note">Simulação educativa · processamento local · funcionamento 100% offline</footer>
    </div>
  );
}
