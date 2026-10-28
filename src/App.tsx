import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BrandLogo } from './components/BrandLogo';
import { BrazilMapScreen } from './components/BrazilMapScreen';
import { Icon } from './components/Icons';
import type { IndicatorDetailId } from './components/IndicatorModal';
import { SciencePanel, type PanelTab } from './components/SciencePanel';
import { TimelineBar } from './components/TimelineBar';
import { useOceanData } from './hooks/useOceanData';
import { BASELINE, BTS_SECTORS, FACTOR_ORDER, isMassLoadId, ITEM_DEFINITIONS } from './simulation/config';
import { CHALLENGES, evaluateChallenge } from './simulation/challenges';
import { MISSION_01_OXYGEN } from './simulation/missions';
import { convertBOD5ToPulseDeltaMgL } from './simulation/oxygen';
import {
  buildTargets,
  createInitialState,
  deriveIndicators,
  effectivePh,
  estimateCriticalDays,
  isFactorActive,
  receivedLoadRange,
  tickSimulation,
} from './simulation/model';
import { evaluateMessages, getMessage } from './simulation/messages';
import { formatSimulatedTime } from './simulation/time';
import type { BtsSectorId, Environment, ItemId, MissionState, MissionStepId, SimulationSpeed } from './simulation/types';

type AppScreen = 'map' | 'simulation';

const MarineScene = lazy(() => import('./scene/MarineScene').then((module) => ({
  default: module.MarineScene,
})));

const DEPTH_SCALE = 30;

function formatValue(id: ItemId, value: number) {
  if (id === 'temperature') return value.toFixed(1).replace('.0', '').replace('.', ',');
  if (id === 'ph') return value.toFixed(2).replace(/0$/, '').replace('.', ',');
  const step = ITEM_DEFINITIONS[id].step;
  const digits = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(value);
}

function formatMassParts(kg: number, qualifier?: string) {
  const tonnes = kg >= 1000;
  const amount = tonnes ? kg / 1000 : kg;
  const value = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: tonnes ? 2 : amount < 10 ? 1 : 0,
  }).format(amount);
  return { value, unit: `${tonnes ? 't' : 'kg'}${qualifier ? ` ${qualifier}` : ''}` };
}

function formatReceivedRange(inputKg: number, sectorId: BtsSectorId = 'frades', qualifier?: string) {
  if (inputKg === 0) return `0 kg${qualifier ? ` ${qualifier}` : ''}`;
  const range = receivedLoadRange(inputKg, sectorId);
  const minimum = formatMassParts(range.minimumKg, qualifier);
  const maximum = formatMassParts(range.maximumKg, qualifier);
  return minimum.unit === maximum.unit
    ? `${minimum.value}–${maximum.value} ${maximum.unit}`
    : `${minimum.value} ${minimum.unit}–${maximum.value} ${maximum.unit}`;
}

function factorRisk(id: ItemId, value: number) {
  const item = ITEM_DEFINITIONS[id];
  if (item.warning === undefined || !item.riskDirection) {
    return { tone: 'natural', label: 'Sem limiar definido' } as const;
  }

  const critical = item.critical !== undefined && (
    item.riskDirection === 'above' ? value >= item.critical : value <= item.critical
  );
  const warning = item.critical === undefined
    ? (item.riskDirection === 'above' ? value > item.warning : value < item.warning)
    : (item.riskDirection === 'above' ? value >= item.warning : value <= item.warning);
  if (critical) return { tone: 'critical', label: 'Crítico' } as const;
  if (warning) {
    return {
      tone: 'watch',
      label: item.critical === undefined ? 'Acima da referência' : 'Atenção',
    } as const;
  }
  return {
    tone: 'natural',
    label: item.critical === undefined ? 'Referência medida' : 'Faixa de referência',
  } as const;
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
  sewageDischargeMode?: 'continuous' | 'pulse';
  sectorId?: BtsSectorId;
}

function FactorControl({
  id,
  active,
  value,
  onChange,
  sewageDischargeMode = 'continuous',
  sectorId = 'frades',
}: FactorControlProps) {
  const item = ITEM_DEFINITIONS[id];
  const sectorDef = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];
  const massLoad = isMassLoadId(id);
  const massOptions = item.massOptionsKg;
  const qualifier = id === 'sewage'
    ? (sewageDischargeMode === 'pulse' ? 'pulso' : 'DBO₅/d')
    : item.massQualifier;
  const shortLabel = id === 'sewage'
    ? (sewageDischargeMode === 'pulse' ? 'Pulso DBO₅' : 'Esgoto DBO₅/dia')
    : item.shortLabel;

  const displayed = massLoad
    ? formatMassParts(value, qualifier)
    : { value: formatValue(id, value), unit: item.unit };
  const sliderValue = massOptions ? Math.max(0, massOptions.indexOf(value)) : value;
  const sliderMin = massOptions ? 0 : item.min;
  const sliderMax = massOptions ? massOptions.length - 1 : item.max;
  const sliderStep = massOptions ? 1 : item.step;
  const progress = ((sliderValue - sliderMin) / (sliderMax - sliderMin)) * 100;
  const threshold = item.warning === undefined
    ? 0
    : ((item.warning - item.min) / (item.max - item.min)) * 100;
  const risk = factorRisk(id, value);

  return (
    <article
      className={`direct-factor slider-${id} ${active ? 'active' : ''} risk-${risk.tone}`}
      title={`${item.label} — ${item.help}${massLoad ? ' Estimativa em 30 dias: modelo de caixa baseado nos tempos sazonais de descarga da BTS, não uma medição em um ponto do recife.' : ''}`}
    >
      <header className="factor-head">
        <span className="factor-icon"><Icon name={item.icon as 'bottle'} /></span>
        <label className="factor-name" htmlFor={`factor-${id}`}>{shortLabel}</label>
        <output className="factor-value" htmlFor={`factor-${id}`}>
          <strong>{displayed.value}</strong>
          {displayed.unit && <small>{displayed.unit}</small>}
        </output>
      </header>
      <div
        className="factor-slider"
        style={{ '--progress': `${progress}%`, '--threshold': `${threshold}%` } as CSSProperties}
      >
        <input
          id={`factor-${id}`}
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          value={sliderValue}
          aria-label={massLoad
            ? `${item.label}, carga lançada: ${displayed.value} ${displayed.unit}. ${item.reference ?? ''}`
            : `${item.label}: ${displayed.value} ${displayed.unit}. ${item.reference ?? ''}`}
          onChange={(event) => {
            const next = Number(event.target.value);
            onChange(massOptions?.[next] ?? next);
          }}
        />
        {item.warning !== undefined && <i className="factor-threshold" aria-hidden="true" />}
      </div>
      <footer className={`factor-meta ${massLoad ? 'mass-meta' : ''}`}>
        {id === 'sewage' ? (
          <small title={sewageDischargeMode === 'pulse' ? 'Pulso instantâneo aplicado ao volume de mistura da bacia' : 'Aporte contínuo diário na baía'}>
            {sewageDischargeMode === 'pulse'
              ? `Pulso pontual: ${formatMassParts(value).value} ${formatMassParts(value).unit} (Vol: ${(sectorDef.mixingVolumeM3 / 1e6).toFixed(0)}M m³)`
              : `Taxa diária: ${formatMassParts(value).value} ${formatMassParts(value).unit}/dia · Entrada contínua`}
          </small>
        ) : massLoad ? (
          <small title="Faixa sazonal estimada que permanece após 30 dias neste compartimento">
            Recebido · 30 d: {formatReceivedRange(value, sectorId, qualifier)}
          </small>
        ) : (
          <>
            <span className="factor-status">{risk.label}</span>
            {item.reference && <small>{item.reference}</small>}
          </>
        )}
      </footer>
    </article>
  );
}

interface TeachingConsoleProps {
  resetToken: number;
  initialControls: Environment;
  onControlsChange: (controls: Environment) => void;
  onApply: (controls: Environment) => void;
  missionFocusFactor?: ItemId | null;
  sewageDischargeMode?: 'continuous' | 'pulse';
  onSewageDischargeModeChange?: (mode: 'continuous' | 'pulse') => void;
  sectorId?: BtsSectorId;
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
  resetToken,
  initialControls,
  onControlsChange,
  onApply,
  missionFocusFactor,
  sewageDischargeMode = 'continuous',
  onSewageDischargeModeChange,
  sectorId = 'frades',
}: TeachingConsoleProps) {
  const [controls, setControls] = useState<Environment>(() => ({ ...initialControls }));
  // O que já está valendo na simulação: serve para saber se há mudança pendente.
  const [applied, setApplied] = useState<Environment>(() => ({ ...initialControls }));
  const [showAllFactors, setShowAllFactors] = useState(false);

  // "Reiniciar" devolve as barras para a posição inicial.
  useEffect(() => {
    setControls({ ...BASELINE });
    setApplied({ ...BASELINE });
    setShowAllFactors(false);
  }, [resetToken, missionFocusFactor]);

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

  const displayedFactors = missionFocusFactor && !showAllFactors
    ? FACTOR_ORDER.filter((id) => id === missionFocusFactor)
    : FACTOR_ORDER;

  return (
    <section className="teaching-console" aria-label="Condições ambientais do experimento">
      <header className="console-header">
        <div className="console-title-group">
          <h2 className="console-title">
            {missionFocusFactor && !showAllFactors
              ? 'Missão 01 · Foco: Carga Orgânica (DBO)'
              : 'Condições e cargas'}
          </h2>
          <span className="console-subtitle">
            {missionFocusFactor && !showAllFactors
              ? 'Ajuste a carga orgânica (DBO) e clique em Iniciar Experimento'
              : 'Ajuste os fatores e clique em Aplicar Alterações'}
          </span>
        </div>
        {missionFocusFactor && !showAllFactors && (
          <button
            type="button"
            className="console-toggle-btn"
            onClick={() => setShowAllFactors(true)}
          >
            Ver todos os fatores
          </button>
        )}
        {missionFocusFactor && showAllFactors && (
          <button
            type="button"
            className="console-toggle-btn"
            onClick={() => setShowAllFactors(false)}
          >
            Focar apenas na Missão
          </button>
        )}
      </header>

      <div className="console-regime-bar">
        <div className="console-regime-row">
          <div className="console-regime-controls">
            <span className="console-regime-label">Regime de Lançamento de Esgoto:</span>
            <button
              type="button"
              className={`console-regime-btn ${sewageDischargeMode === 'continuous' ? 'active' : ''}`}
              onClick={() => onSewageDischargeModeChange?.('continuous')}
              title="Aporte diário ininterrupto de DBO5 na enseada (gera patamar rebaixado contínuo)"
            >
              Carga Contínua (kg/dia)
            </button>
            <button
              type="button"
              className={`console-regime-btn ${sewageDischargeMode === 'pulse' ? 'active' : ''}`}
              onClick={() => onSewageDischargeModeChange?.('pulse')}
              title="Despejo pontual único em massa total (queda aguda com recuperação gradual posterior)"
            >
              Pulso Único (kg)
            </button>
          </div>

          <button
            type="button"
            className={`apply-button ${pendingChange ? 'has-pending' : 'is-applied'}`}
            disabled={!pendingChange}
            onClick={apply}
            title={pendingChange ? "Aplicar as alterações ao recife para iniciar o teste" : "Altere um slider para habilitar o teste"}
          >
            <Icon name={pendingChange ? "play" : "check"} />
            <span>{pendingChange ? (missionFocusFactor ? 'Iniciar Experimento' : 'Aplicar Alterações') : 'Alterações Aplicadas'}</span>
          </button>
        </div>
        <p className="console-regime-desc">
          {sewageDischargeMode === 'continuous'
            ? 'Carga Contínua: Lançamento ininterrupto diário (emissário/rede). O oxigênio estabiliza em nível deprimido até haver redução na fonte.'
            : 'Pulso Único: Evento agudo pontual (extravasamento/acidente). O oxigênio sofre queda nos primeiros dias e recupera gradualmente pela reaeração e marés.'}
        </p>
      </div>

      <div className="console-body">
        {displayedFactors.map((id) => (
          <FactorControl
            key={id}
            id={id}
            active={isFactorActive(id, controls[id])}
            value={controls[id]}
            sewageDischargeMode={sewageDischargeMode}
            sectorId={sectorId}
            onChange={(value) => setControls((current) => ({ ...current, [id]: value }))}
          />
        ))}
      </div>
    </section>
  );
}

function DepthRuler({ side }: { side: 'left' | 'right' }) {
  const marks = Array.from({ length: DEPTH_SCALE / 5 + 1 }, (_, index) => index * 5);

  return (
    <div className={`depth-ruler ${side}`} aria-hidden="true">
      {marks.map((depth) => (
        <span key={depth} style={{ top: `${(depth / DEPTH_SCALE) * 100}%` }}>{depth} m<i /></span>
      ))}
    </div>
  );
}

type MobileViewTab = 'scene' | 'console' | 'science';

export function App() {
  const [screen, setScreen] = useState<AppScreen>('map');
  const [mapZooming, setMapZooming] = useState(false);
  const [mapReturning, setMapReturning] = useState(false);
  const [transitionDark, setTransitionDark] = useState(false);
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
  const controlsRef = useRef<Environment>({ ...BASELINE });
  const [resetToken, setResetToken] = useState(0);
  const [simulation, setSimulation] = useState(createInitialState);
  const [panelTab, setPanelTab] = useState<PanelTab>('summary');
  const [mobileView, setMobileView] = useState<MobileViewTab>('scene');
  const lastInjectedSewageMassRef = useRef<number>(0);
  const oceanData = useOceanData(simulation.sector, screen === 'simulation');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [criticalDays, setCriticalDays] = useState<number | null | undefined>(undefined);
  const [missionState, setMissionState] = useState<MissionState | null>(null);
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorDetailId | null>(null);

  const handleSelectIndicator = (id: IndicatorDetailId | null) => {
    setSelectedIndicator(id);
    if (id) {
      setPanelTab('results');
      setMobileView('science');
    }
  };

  const getIndicatorCurrentValue = (id: IndicatorDetailId) => {
    switch (id) {
      case 'temperature':
        return `${simulation.env.temperature.toFixed(1).replace('.', ',')} °C`;
      case 'ph':
        return `${effectivePh(simulation.env, simulation.biochemicalOxygenDemand, simulation.sector, simulation.respiratoryDicUmolKg).toFixed(2).replace('.', ',')}`;
      case 'dhw':
        return `${simulation.degreeHeatingWeeks.toFixed(1).replace('.', ',')} °C-sem.`;
      case 'dissolvedOxygen':
        return `${simulation.dissolvedOxygen.toFixed(1).replace('.', ',')} mg/L (${simulation.dissolvedOxygen >= 5 ? 'Adequado' : simulation.dissolvedOxygen >= 3.5 ? 'Alerta' : 'Hipóxia Severa'})`;
      case 'time':
        return `${formatSimulatedTime(simulation.elapsedDays)} (Dia ${Math.floor(simulation.elapsedDays)})`;
      case 'overall':
        return `${Math.round(simulation.overall)}/100`;
      case 'coral':
        return `${Math.round(simulation.health.coral)}/100`;
      case 'fish':
        return `${Math.round(simulation.health.fish)}/100`;
      default:
        return '';
    }
  };

  const startMission = (missionId: string) => {
    setMissionState({
      missionId,
      step: 'intro',
      selectedHypothesisId: null,
    });
    setChallengeId(null);
    setPanelTab('activities');
    setMobileView('science');
  };

  const handleMissionStepChange = (step: MissionStepId) => {
    setMissionState((curr) => (curr ? { ...curr, step } : null));
  };

  const handleSelectHypothesis = (id: string, text?: string) => {
    setMissionState((curr) => (curr ? { ...curr, selectedHypothesisId: id, customHypothesisText: text } : null));
  };

  const handleApplyMissionSolution = () => {
    const updated = {
      ...controlsRef.current,
      ...MISSION_01_OXYGEN.solutionControls,
    };
    controlsRef.current = updated;
    applyChanges(updated);
    setMissionState((curr) => (curr ? { ...curr, solutionApplied: true } : null));
  };

  const handleExitMission = () => {
    setMissionState(null);
  };

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
  }, []);

  const currentMessage = useMemo(() => getMessage(simulation.latestMessageId), [simulation.latestMessageId]);
  const indicators = useMemo(() => deriveIndicators(simulation), [simulation]);
  const challenge = CHALLENGES.find((item) => item.id === challengeId) ?? null;
  const challengeProgress = challenge ? evaluateChallenge(challenge, simulation) : null;

  const applyChanges = (controls: Environment) => {
    const targets = buildTargets(controls, simulation.sector, simulation.sewageDischargeMode);
    let nextBod = simulation.biochemicalOxygenDemand ?? 0;

    if (simulation.sewageDischargeMode === 'pulse') {
      // Injeção de pulso idempotente: adiciona massa somente quando o usuário altera a carga do pulso
      if (controls.sewage > 0 && controls.sewage !== lastInjectedSewageMassRef.current) {
        const sectorDef = BTS_SECTORS.find((s) => s.id === simulation.sector) ?? BTS_SECTORS[0];
        const deltaBod = convertBOD5ToPulseDeltaMgL(controls.sewage, sectorDef.mixingVolumeM3);
        nextBod += deltaBod;
        lastInjectedSewageMassRef.current = controls.sewage;
      }
      targets.sewage = 0;
    } else {
      lastInjectedSewageMassRef.current = 0;
    }

    setSimulation((current) => ({
      ...current,
      controls: { ...controls },
      targets,
      biochemicalOxygenDemand: nextBod,
      paused: false,
      // Primeiro marco aparece logo depois de aplicar.
      messageCooldown: 0,
    }));
    setCriticalDays(
      estimateCriticalDays(targets, simulation.sector, 3650, {
        sewageDischargeMode: simulation.sewageDischargeMode,
        initialBod: nextBod,
        initialDo: simulation.dissolvedOxygen,
        initialControls: controls,
        initialEnv: simulation.env,
      }),
    );
    if (!missionState) {
      setPanelTab('summary');
    }
    // Em dispositivos móveis, volta o foco para o recife 3D para observar o resultado
    setMobileView('scene');
  };

  const handleApplySatelliteConditions = (sst: number) => {
    const updated = {
      ...controlsRef.current,
      temperature: parseFloat(sst.toFixed(1)),
    };
    controlsRef.current = updated;
    applyChanges(updated);
    setSimulation((current) => ({
      ...current,
      initialConditionSource: oceanData.noaaStatus.state === 'success'
        ? 'NOAA_CRW_LIVE'
        : 'NOAA_CRW_HISTORICAL_SNAPSHOT',
    }));
  };

  const handleSewageDischargeModeChange = (mode: 'continuous' | 'pulse') => {
    lastInjectedSewageMassRef.current = 0;
    setSimulation((curr) => ({
      ...curr,
      sewageDischargeMode: mode,
    }));
  };

  const setSpeed = (speed: SimulationSpeed) => setSimulation((current) => ({ ...current, speed }));
  const togglePause = () => setSimulation((current) => ({ ...current, paused: !current.paused }));

  const reset = () => {
    controlsRef.current = { ...BASELINE };
    lastInjectedSewageMassRef.current = 0;
    setResetToken((token) => token + 1);
    setSimulation(createInitialState());
    setChallengeId(null);
    setCriticalDays(undefined);
    setPanelTab('summary');
    setMissionState(null);
    setSelectedIndicator(null);
    setMobileView('scene');
  };

  const handleSelectBahia = () => {
    if (mapZooming) return;
    setMapZooming(true);
    setTransitionLabel(null);

    // 1. O zoom calmo e suave no centro da Bahia e o escurecimento iniciam-se juntos no t=0.
    // O escurecimento agora é mais ágil e direto (1100ms), enquanto o zoom é calmo e gradual.
    window.setTimeout(() => {
      setTransitionDark(true);
    }, 30);

    // 2. Aos 1250ms, a tela já está 100% escura: troca imperceptivelmente para a simulação 3D
    window.setTimeout(() => {
      setScreen('simulation');
      setMapZooming(false);

      // 3. Aos 1450ms, com a cena 3D inicializada no escuro: dissipa o véu em fade-out
      window.setTimeout(() => {
        setTransitionDark(false);
      }, 200);
    }, 1250);
  };

  const handleBackToMap = () => {
    setTransitionDark(true);
    setTransitionLabel(null);

    window.setTimeout(() => {
      setScreen('map');
      setMapReturning(true);

      window.setTimeout(() => {
        setTransitionDark(false);
        window.setTimeout(() => setMapReturning(false), 800);
      }, 120);
    }, 350);
  };

  if (screen === 'map') {
    return (
      <>
        <BrazilMapScreen
          onSelectBahia={handleSelectBahia}
          isZooming={mapZooming}
          isReturning={mapReturning}
        />
        <div
          className={`screen-transition-veil ${transitionDark ? 'active' : ''} ${mapZooming ? 'cinematic-dive' : ''}`}
          aria-hidden="true"
        >
          {transitionLabel && (
            <div className="transition-badge">
              <span className="transition-compass-spinner" />
              <span>{transitionLabel}</span>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="app-shell simulation-app">
      <header className="topbar">
        <div className="topbar-left">
          <button type="button" className="map-back-button" onClick={handleBackToMap}>
            ← <span>Mapa</span>
          </button>
        </div>

        <div className="topbar-center brand compact">
          <BrandLogo />
        </div>

        <div className="topbar-right">
          <button type="button" className="reset-button" onClick={reset}>
            <Icon name="reset" /> <span>Reiniciar</span>
          </button>
        </div>
      </header>

      <main className="simulation-workspace" data-mobile-view={mobileView}>
        <section className="scene-card" aria-label="Visualização do recife">
          <Suspense fallback={(
            <div className="scene-loading" role="status">
              <span className="scene-loading-dot" aria-hidden="true" />
              Carregando…
            </div>
          )}>
            <MarineScene state={simulation} resetToken={resetToken} />
          </Suspense>
          <DepthRuler side="left" />

          <div className="scene-top-overlay">
            <TimelineBar
              state={simulation}
              onTogglePause={togglePause}
              onSpeed={setSpeed}
              criticalDays={criticalDays}
            />

            <div className="environment-readout" aria-label="Condições atuais da água">
              <button
                type="button"
                className="readout-item-btn"
                onClick={() => handleSelectIndicator('temperature')}
                title="Temperatura da água da superfície"
              >
                <small>TEMPERATURA</small>
                <strong>{simulation.env.temperature.toFixed(1).replace('.0', '').replace('.', ',')}°C</strong>
              </button>

              <button
                type="button"
                className="readout-item-btn"
                onClick={() => handleSelectIndicator('ph')}
                title="pH da água"
              >
                <small>pH</small>
                <strong>{effectivePh(simulation.env, simulation.biochemicalOxygenDemand, simulation.sector, simulation.respiratoryDicUmolKg).toFixed(2).replace('.', ',')}</strong>
              </button>

              {!missionState && (
                <button
                  type="button"
                  className="readout-item-btn"
                  onClick={() => handleSelectIndicator('dhw')}
                  title="Calor acumulado nas últimas 12 semanas (DHW)"
                >
                  <small>DHW</small>
                  <strong>{simulation.degreeHeatingWeeks.toFixed(1).replace('.', ',')} °C-sem.</strong>
                </button>
              )}

              <button
                type="button"
                className={`readout-item-btn ${simulation.dissolvedOxygen < 2.0 ? 'critical-alert' : simulation.dissolvedOxygen < 3.5 ? 'watch-alert' : ''}`}
                onClick={() => handleSelectIndicator('dissolvedOxygen')}
                title="Oxigênio dissolvido na água (OD)"
              >
                <small>OXIGÊNIO</small>
                <strong>{simulation.dissolvedOxygen.toFixed(1).replace('.', ',')} <span className="readout-unit">mg/L</span></strong>
              </button>

              <button
                type="button"
                className="readout-item-btn"
                onClick={() => handleSelectIndicator('time')}
                title="Tempo decorrido no cenário"
              >
                <small>TEMPO</small>
                <strong>{formatSimulatedTime(simulation.elapsedDays)}</strong>
              </button>
            </div>
          </div>

          <div className="health-overlay" aria-label="Saúde do ecossistema">
            <span className="health-overlay-title" title="Índice sintético didático do modelo, relativo ao estado saudável">
              Índice do Modelo: Resiliência Relativa
            </span>
            <div className="health-overlay-items">
              <button
                type="button"
                className="health-item-btn"
                onClick={() => handleSelectIndicator('overall')}
                title="Índice didático de resiliência geral"
              >
                <small>Geral</small>
                <strong>{Math.round(simulation.overall)}/100</strong>
                <div className="health-bar" aria-hidden="true">
                  <i
                    className={healthLevel(simulation.overall)}
                    style={{ width: `${Math.round(simulation.overall)}%` }}
                  />
                </div>
              </button>

              <button
                type="button"
                className="health-item-btn"
                onClick={() => handleSelectIndicator('coral')}
                title="Índice didático de resiliência dos corais"
              >
                <small>Corais</small>
                <strong>{Math.round(simulation.health.coral)}/100</strong>
                <div className="health-bar" aria-hidden="true">
                  <i
                    className={healthLevel(simulation.health.coral)}
                    style={{ width: `${Math.round(simulation.health.coral)}%` }}
                  />
                </div>
              </button>

              <button
                type="button"
                className="health-item-btn"
                onClick={() => handleSelectIndicator('fish')}
                title="Índice didático de resiliência da ictiofauna"
              >
                <small>Fauna</small>
                <strong>{Math.round(simulation.health.fish)}/100</strong>
                <div className="health-bar" aria-hidden="true">
                  <i
                    className={healthLevel(simulation.health.fish)}
                    style={{ width: `${Math.round(simulation.health.fish)}%` }}
                  />
                </div>
              </button>
            </div>
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
          oceanData={oceanData}
          onApplySatelliteConditions={handleApplySatelliteConditions}
          missionState={missionState}
          onStartMission={startMission}
          onMissionStepChange={handleMissionStepChange}
          onSelectHypothesis={handleSelectHypothesis}
          onApplyMissionSolution={handleApplyMissionSolution}
          onExitMission={handleExitMission}
          selectedIndicator={selectedIndicator}
          onSelectIndicator={handleSelectIndicator}
          getIndicatorValue={getIndicatorCurrentValue}
        />

        <TeachingConsole
          resetToken={resetToken}
          initialControls={controlsRef.current}
          onControlsChange={(next) => { controlsRef.current = next; }}
          onApply={applyChanges}
          missionFocusFactor={missionState ? MISSION_01_OXYGEN.focusFactor : null}
          sewageDischargeMode={simulation.sewageDischargeMode}
          onSewageDischargeModeChange={handleSewageDischargeModeChange}
          sectorId={simulation.sector}
        />
      </main>

      {/* Barra de Navegação Inferior para Celulares e Telas Pequenas */}
      <nav className="mobile-bottom-nav" aria-label="Navegação móvel">
        <button
          type="button"
          className={`mobile-nav-btn ${mobileView === 'scene' ? 'active' : ''}`}
          onClick={() => setMobileView('scene')}
          aria-current={mobileView === 'scene' ? 'page' : undefined}
        >
          <span className="mobile-nav-icon">
            <Icon name="waves" />
          </span>
          <span>Recife 3D</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${mobileView === 'console' ? 'active' : ''}`}
          onClick={() => setMobileView('console')}
          aria-current={mobileView === 'console' ? 'page' : undefined}
        >
          <span className="mobile-nav-icon">
            <Icon name="sliders" />
          </span>
          <span>Bancada</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${mobileView === 'science' ? 'active' : ''}`}
          onClick={() => setMobileView('science')}
          aria-current={mobileView === 'science' ? 'page' : undefined}
        >
          <span className="mobile-nav-icon">
            <Icon name="chart" />
          </span>
          <span>Ciência</span>
        </button>
      </nav>

      <div
        className={`screen-transition-veil ${transitionDark ? 'active' : ''}`}
        aria-hidden="true"
      >
        {transitionLabel && (
          <div className="transition-badge">
            <span className="transition-compass-spinner" />
            <span>{transitionLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
