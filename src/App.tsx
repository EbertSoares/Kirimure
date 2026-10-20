import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BrazilMapScreen } from './components/BrazilMapScreen';
import { Icon } from './components/Icons';
import { SciencePanel, type PanelTab } from './components/SciencePanel';
import { TimelineBar } from './components/TimelineBar';
import { MarineScene } from './scene/MarineScene';
import { BASELINE, FACTOR_ORDER, ITEM_DEFINITIONS, SCENARIO } from './simulation/config';
import { CHALLENGES, evaluateChallenge } from './simulation/challenges';
import {
  buildTargets,
  createInitialState,
  deriveIndicators,
  effectivePh,
  isFactorActive,
  microplasticsMgPerM3,
  oilGramsPerM2,
  sewageNitrogenMgPerLDay,
  tickSimulation,
} from './simulation/model';
import { evaluateMessages, getMessage } from './simulation/messages';
import { formatSimulatedTime } from './simulation/time';
import type { Environment, ItemId, SimulationSpeed } from './simulation/types';

type AppScreen = 'map' | 'simulation';

const DEPTH_SCALE = 30;

function formatValue(id: ItemId, value: number) {
  if (id === 'temperature') return `${value.toFixed(1).replace('.0', '')}°C`;
  if (id === 'ph') return value.toFixed(2).replace(/0$/, '').replace('.', ',');
  if (id === 'sewage') {
    return value >= 1_000
      ? `${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t N/dia`
      : `${Math.round(value).toLocaleString('pt-BR')} kg N/dia`;
  }
  if (id === 'microplastics' || id === 'oil') {
    return value >= 1_000
      ? `${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t`
      : `${Math.round(value).toLocaleString('pt-BR')} kg`;
  }
  return Math.round(value).toLocaleString('pt-BR');
}

function formatLoadContext(id: ItemId, value: number) {
  if (id === 'microplastics') {
    return `≈ ${microplasticsMgPerM3(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mg/m³ na célula`;
  }
  if (id === 'oil') {
    return `≈ ${oilGramsPerM2(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} g/m² na superfície`;
  }
  if (id === 'sewage') {
    return `≈ ${sewageNitrogenMgPerLDay(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mg N/L/dia`;
  }
  if (id === 'temperature') return 'calor acumulado em °C-semana';
  if (id === 'ph') return 'queda de pH = mais acidez';
  return '';
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
      className={`direct-factor slider-${id} ${active ? 'active' : ''}`}
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
      <small className="factor-context">{formatLoadContext(id, value)}</small>
    </article>
  );
}

interface TeachingConsoleProps {
  open: boolean;
  resetToken: number;
  initialControls: Environment;
  onControlsChange: (controls: Environment) => void;
  onApply: (controls: Environment) => void;
  locked: boolean;
}

/**
 * A bancada guarda as barras no próprio estado.
 *
 * Assim, arrastar um controle redesenha apenas estas oito linhas — antes cada
 * evento de arraste re-renderizava a árvore inteira (painel, gráficos e cena),
 * o que travava a página quando os fatores eram ajustados rápido. O valor atual
 * fica também em um ref no App, para as barras voltarem iguais ao reabrir.
 */
function TeachingConsole({
  open,
  resetToken,
  initialControls,
  onControlsChange,
  onApply,
  locked,
}: TeachingConsoleProps) {
  const [controls, setControls] = useState<Environment>(() => ({ ...initialControls }));
  // O que já está valendo na simulação: serve para saber se há mudança pendente.
  const [applied, setApplied] = useState<Environment>(() => ({ ...initialControls }));

  // "Reiniciar" devolve as barras para a posição inicial.
  useEffect(() => {
    setControls({ ...BASELINE });
    setApplied({ ...BASELINE });
  }, [resetToken]);

  useEffect(() => {
    onControlsChange(controls);
  }, [controls, onControlsChange]);

  // Devolver uma barra ao natural também é uma mudança a aplicar.
  const pendingChange = (Object.keys(controls) as ItemId[])
    .some((id) => controls[id] !== applied[id]);

  const apply = () => {
    setApplied({ ...controls });
    onApply(controls);
  };

  return (
    <section className={`teaching-console ${open ? 'expanded' : 'collapsed'}`} aria-label="Controles do experimento">
      <header className="console-header">
        <h2 className="console-title">Fatores ambientais</h2>
        <button
          type="button"
          className="apply-button"
          disabled={!pendingChange || locked}
          onClick={apply}
        >
          <Icon name="play" /> {locked ? 'Experimento encerrado' : 'Aplicar e observar'}
        </button>
      </header>

      {open && (
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
  const controlsRef = useRef<Environment>({ ...BASELINE });
  const [resetToken, setResetToken] = useState(0);
  const [simulation, setSimulation] = useState(createInitialState);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>('now');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState(true);

  useEffect(() => {
    if (screen !== 'simulation') return undefined;
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
          for (let index = 0; index < steps; index += 1) next = tickSimulation(next, fixedStep);
          // Só um marco por quadro: em 10× vários limiares passam no mesmo
          // quadro e o painel trocava de texto várias vezes de uma vez só.
          return evaluateMessages(next);
        });
      }
      frame = requestAnimationFrame(animate);
    };

    const handleVisibility = () => { previous = performance.now(); accumulator = 0; };
    document.addEventListener('visibilitychange', handleVisibility);
    frame = requestAnimationFrame(animate);

    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [screen]);

  const currentMessage = useMemo(() => getMessage(simulation.latestMessageId), [simulation.latestMessageId]);
  const indicators = useMemo(() => deriveIndicators(simulation), [simulation]);
  const challenge = CHALLENGES.find((item) => item.id === challengeId) ?? null;
  const challengeProgress = challenge ? evaluateChallenge(challenge, simulation) : null;

  const applyChanges = (controls: Environment) => {
    setSimulation((current) => ({
      ...current,
      targets: buildTargets(controls),
      paused: current.checkpoint?.locked ? true : false,
      // Primeiro marco aparece logo depois de aplicar.
      messageCooldown: 0,
    }));
    setPanelTab('now');
    // Depois de montar o experimento, libera espaço para a turma observar a
    // cena. A bancada continua a um clique de distância na linha do tempo.
    setConsoleOpen(false);
  };

  const setSpeed = (speed: SimulationSpeed) => setSimulation((current) => ({ ...current, speed }));
  const togglePause = () => setSimulation((current) => {
    if (current.checkpoint?.locked) return current;
    if (current.checkpoint?.kind === 'critical') {
      return {
        ...current,
        paused: false,
        checkpoint: null,
        criticalCheckpointAcknowledged: true,
      };
    }
    return { ...current, paused: !current.paused };
  });

  const reset = () => {
    controlsRef.current = { ...BASELINE };
    setResetToken((token) => token + 1);
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
            <strong className="brand-name">Kinimurê</strong>
            <span className="brand-sub">Laboratório Digital Marinho · {SCENARIO.shortName}</span>
          </div>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className={`view-mode-button ${presentationMode ? 'active' : ''}`}
            aria-pressed={presentationMode}
            onClick={() => {
              setPresentationMode((current) => !current);
              setPanelTab('now');
            }}
          >
            {presentationMode ? 'Modo apresentação' : 'Modo análise'}
          </button>
          <button type="button" className="reset-button" onClick={reset}><Icon name="reset" /> Reiniciar</button>
        </div>
      </header>

      <main className={`simulation-workspace ${consoleOpen ? 'console-expanded' : 'console-collapsed'} ${presentationMode ? 'presentation-mode' : 'analysis-mode'}`}>
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
              <small>pH da água</small>
              <strong>{effectivePh(simulation.env).toFixed(2)} pH</strong>
            </span>
            <span>
              <small>Calor acumulado</small>
              <strong>{simulation.degreeHeatingWeeks.toFixed(1).replace('.', ',')} °C-sem</strong>
            </span>
            <span>
              <small>Tempo</small>
              <strong>{formatSimulatedTime(simulation.elapsedDays)}</strong>
            </span>
          </div>

          <div className="health-overlay" aria-label="Saúde do ecossistema">
            <span>
              <small>Estado</small>
              <strong className={healthLevel(simulation.overall)}>{Math.round(simulation.overall)}%</strong>
            </span>
            <span>
              <small>Corais</small>
              <strong className={healthLevel(simulation.living.coral)}>{Math.round(simulation.living.coral)}%</strong>
            </span>
            <span>
              <small>Fauna</small>
              <strong className={healthLevel(simulation.living.fish)}>{Math.round(simulation.living.fish)}%</strong>
            </span>
          </div>

          {simulation.checkpoint && (
            <div className={`checkpoint-overlay checkpoint-${simulation.checkpoint.kind}`} role="status">
              <small>Relógio pausado no dia {simulation.checkpoint.day}</small>
              <strong>{simulation.checkpoint.title}</strong>
              <span>{simulation.checkpoint.recoveryLabel}</span>
              {!simulation.checkpoint.locked && (
                <button type="button" onClick={togglePause}>Continuar até o próximo limite</button>
              )}
            </div>
          )}
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
          presentationMode={presentationMode}
          onContinueCheckpoint={togglePause}
        />

        <TimelineBar
          state={simulation}
          onTogglePause={togglePause}
          onSpeed={setSpeed}
          consoleOpen={consoleOpen}
          onToggleConsole={() => setConsoleOpen((open) => !open)}
        />

        <TeachingConsole
          open={consoleOpen}
          resetToken={resetToken}
          initialControls={controlsRef.current}
          onControlsChange={(next) => { controlsRef.current = next; }}
          onApply={applyChanges}
          locked={simulation.checkpoint?.locked ?? false}
        />
      </main>
    </div>
  );
}
