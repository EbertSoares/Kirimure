import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from './components/BrandLogo';
import { BrazilMapScreen } from './components/BrazilMapScreen';
import { EnvironmentDrawer } from './components/EnvironmentDrawer';
import { EvidenceDrawer, type EvidenceTab } from './components/EvidenceDrawer';
import { Icon } from './components/Icons';
import { IndicatorProgress } from './components/IndicatorProgress';
import { RegionSelector } from './components/RegionSelector';
import { useOceanData } from './hooks/useOceanData';
import { calculateRespirationPhImpact } from './simulation/carbonate';
import {
  BASELINE,
  BTS_SECTORS,
  FACTOR_ORDER,
  ITEM_DEFINITIONS,
} from './simulation/config';
import { type ActiveIntervention, type InterventionId } from './simulation/interventions';
import { calculateWeissOxygenSaturation, convertBOD5ToPulseDeltaMgL } from './simulation/oxygen';
import {
  buildDefaultImpactMilestones,
  buildTargets,
  calculateAlgae,
  calculateTrophicBalance,
  createInitialState,
  effectivePh,
  estimateCriticalDays,
  estimateImpactTimeline,
  isFactorActive,
  tickSimulation,
  type ImpactMilestone,
} from './simulation/model';
import { evaluateMessages } from './simulation/messages';
import { formatSimulatedTime, SIMULATION_SPEEDS } from './simulation/time';
import type {
  BtsSectorId,
  Environment,
  ItemId,
  SimulationSpeed,
  SimulationState,
} from './simulation/types';

type AppScreen = 'map' | 'simulation';

export type ContextualIndicatorId =
  | 'oxygen'
  | 'temperature'
  | 'thermalStress'
  | 'ph'
  | 'aragonite'
  | 'coral'
  | 'fish'
  | 'algae'
  | 'trophic'
  | 'turbidity';

const MAIN_PROGRESS_INDICATORS = ['coral', 'fish'] as const;

interface ContextualIndicatorView {
  id: ContextualIndicatorId;
  label: string;
  valueText: string;
  unitText?: string;
  progressPercent?: number;
  tone: 'good' | 'watch' | 'critical';
  tooltip: string;
}

const MarineScene = lazy(() =>
  import('./scene/MarineScene').then((module) => ({
    default: module.MarineScene,
  })),
);

function createSectorBaselineState(sectorId: BtsSectorId): SimulationState {
  const sector = BTS_SECTORS.find((s) => s.id === sectorId) ?? BTS_SECTORS[0];
  const base = createInitialState(sectorId);
  const sectorEnv: Environment = {
    ...BASELINE,
    temperature: sector.baselineTemperature,
  };
  const initialDo = calculateWeissOxygenSaturation(sector.baselineTemperature, sector.baselineSalinity);
  return {
    ...base,
    sector: sectorId,
    controls: { ...sectorEnv },
    env: { ...sectorEnv },
    targets: { ...sectorEnv },
    dissolvedOxygen: initialDo,
    history: base.history.map((pt) => ({
      ...pt,
      temperature: sector.baselineTemperature,
      dissolvedOxygen: initialDo,
      saturationOxygen: initialDo,
    })),
  };
}

interface UndoEntry {
  controls: Environment;
  sewageDischargeMode: 'continuous' | 'pulse';
}

export function App() {
  const [screen, setScreen] = useState<AppScreen>('simulation');
  const [mapZooming, setMapZooming] = useState(false);
  const [mapReturning, setMapReturning] = useState(false);
  const [transitionDark, setTransitionDark] = useState(false);

  const [resetToken, setResetToken] = useState(0);
  const [simulation, setSimulation] = useState<SimulationState>(() => createSectorBaselineState('frades'));
  const simulationRef = useRef<SimulationState>(simulation);
  simulationRef.current = simulation;

  const [focusedFactor, setFocusedFactor] = useState<ItemId | null>(null);

  const [regionOpen, setRegionOpen] = useState(false);
  const [envDrawerOpen, setEnvDrawerOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>('evolution');

  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const undoStackRef = useRef<UndoEntry[]>(undoStack);
  undoStackRef.current = undoStack;
  const pendingUndoBaseRef = useRef<UndoEntry | null>(null);

  const [criticalDays, setCriticalDays] = useState<number | null>(null);

  const [timelineMilestones, setTimelineMilestones] = useState<ImpactMilestone[]>([]);
  const [focusedInterventionId, setFocusedInterventionId] = useState<InterventionId | null>(null);

  const oceanData = useOceanData(simulation.sector, screen === 'simulation');

  const sectorDef = useMemo(
    () => BTS_SECTORS.find((s) => s.id === simulation.sector) ?? BTS_SECTORS[0],
    [simulation.sector],
  );

  const activeFactorIds = useMemo(
    () => FACTOR_ORDER.filter((id) => {
      const refVal = id === 'temperature' ? sectorDef.baselineTemperature : BASELINE[id];
      return Math.abs(simulation.controls[id] - refVal) > 1e-6;
    }),
    [simulation.controls, sectorDef.baselineTemperature],
  );

  // Laço temporal determinístico a 10 Hz (velocidade aplicada uma única vez em tickSimulation)
  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    const fixedStep = 1 / 10;

    const animate = (now: number) => {
      const elapsed = Math.min((now - previous) / 1000, 1.5);
      previous = now;
      accumulator += elapsed;
      if (accumulator >= fixedStep) {
        const steps = Math.min(Math.floor(accumulator / fixedStep), 15);
        accumulator -= steps * fixedStep;
        setSimulation((current) => {
          if (current.paused) return current;
          let next = current;
          for (let index = 0; index < steps; index += 1) {
            next = tickSimulation(next, fixedStep);
          }
          return evaluateMessages(next);
        });
      }
      frame = requestAnimationFrame(animate);
    };

    const handleVisibility = () => {
      previous = performance.now();
      accumulator = 0;
    };
    document.addEventListener('visibilitychange', handleVisibility);
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Recálculo assíncrono (debounce 300 ms) da linha do tempo ecológica independente da velocidade da UI
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const defaultMilestones = buildDefaultImpactMilestones(simulation);
      const calculated = estimateImpactTimeline(simulation, defaultMilestones, 365);
      setTimelineMilestones(calculated);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    simulation.controls,
    simulation.activeInterventions,
    simulation.sewageDischargeMode,
    simulation.sector,
    simulation.biochemicalOxygenDemand > 0.05,
  ]);

  // Recálculo assíncrono (debounce 260 ms) do tempo até o limiar crítico do modelo
  useEffect(() => {
    if (activeFactorIds.length === 0 && simulation.biochemicalOxygenDemand < 0.05) {
      setCriticalDays(null);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const projected = estimateCriticalDays(simulation.targets, simulation.sector, 3650, {
        sewageDischargeMode: simulation.sewageDischargeMode,
        initialBod: simulation.biochemicalOxygenDemand,
        initialDo: simulation.dissolvedOxygen,
        initialControls: simulation.controls,
        initialEnv: simulation.env,
      });
      setCriticalDays(projected);
    }, 260);

    return () => window.clearTimeout(timer);
  }, [
    activeFactorIds.length,
    simulation.targets,
    simulation.sector,
    simulation.sewageDischargeMode,
    simulation.controls,
    simulation.biochemicalOxygenDemand > 0.1,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inFormField = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'BUTTON'
      );

      if (e.code === 'Space' && !inFormField && screen === 'simulation') {
        e.preventDefault();
        setSimulation((curr) => ({ ...curr, paused: !curr.paused }));
      } else if (e.key === 'Escape') {
        if (regionOpen) setRegionOpen(false);
        else if (evidenceOpen) setEvidenceOpen(false);
        else if (envDrawerOpen) setEnvDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, regionOpen, evidenceOpen, envDrawerOpen]);

  const handleAdjustFactor = useCallback((id: ItemId, value: number) => {
    setFocusedFactor(id);

    setSimulation((current) => {
      if (!pendingUndoBaseRef.current) {
        pendingUndoBaseRef.current = {
          controls: { ...current.controls },
          sewageDischargeMode: current.sewageDischargeMode,
        };
      }
      const nextControls: Environment = { ...current.controls, [id]: value };
      const nextTargets = buildTargets(nextControls, current.sector, current.sewageDischargeMode);
      return {
        ...current,
        controls: nextControls,
        targets: nextTargets,
      };
    });
  }, []);

  const handleCommitFactor = useCallback((_id: ItemId) => {
    const base = pendingUndoBaseRef.current;
    if (!base) return;
    pendingUndoBaseRef.current = null;

    setUndoStack((prev) => {
      const last = prev[prev.length - 1];
      const unchanged = last && FACTOR_ORDER.every((k) => Math.abs(last.controls[k] - base.controls[k]) < 1e-6);
      if (unchanged) return prev;
      return [...prev.slice(-24), base];
    });
  }, []);

  const handleResetSingleFactor = useCallback((id: ItemId) => {
    const curr = simulationRef.current;
    const sector = BTS_SECTORS.find((s) => s.id === curr.sector) ?? BTS_SECTORS[0];
    const defaultVal = id === 'temperature' ? sector.baselineTemperature : BASELINE[id];

    setUndoStack((prev) => [
      ...prev.slice(-24),
      { controls: { ...curr.controls }, sewageDischargeMode: curr.sewageDischargeMode },
    ]);
    setSimulation((current) => {
      const nextControls: Environment = { ...current.controls, [id]: defaultVal };
      const nextTargets = buildTargets(nextControls, current.sector, current.sewageDischargeMode);
      return {
        ...current,
        controls: nextControls,
        targets: nextTargets,
      };
    });
  }, []);

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const previousEntry = stack[stack.length - 1];

    setUndoStack((prev) => prev.slice(0, -1));
    setSimulation((current) => ({
      ...current,
      controls: { ...previousEntry.controls },
      sewageDischargeMode: previousEntry.sewageDischargeMode,
      targets: buildTargets(previousEntry.controls, current.sector, previousEntry.sewageDischargeMode),
    }));
  }, []);

  const handleResetToInitial = useCallback(() => {
    pendingUndoBaseRef.current = null;
    setUndoStack([]);
    setFocusedFactor(null);
    setCriticalDays(null);
    setResetToken((t) => t + 1);
    setSimulation((curr) => createSectorBaselineState(curr.sector));
  }, []);

  const handleChangeSector = useCallback((nextSector: BtsSectorId) => {
    pendingUndoBaseRef.current = null;
    setUndoStack([]);
    setFocusedFactor(null);
    setCriticalDays(null);
    setResetToken((t) => t + 1);
    setSimulation(createSectorBaselineState(nextSector));
  }, []);

  const handleSewageModeChange = useCallback((mode: 'continuous' | 'pulse') => {
    setFocusedFactor('sewage');
    setSimulation((curr) => ({
      ...curr,
      sewageDischargeMode: mode,
      targets: buildTargets(curr.controls, curr.sector, mode),
    }));
  }, []);

  const handleTriggerSewagePulse = useCallback((massKg: number) => {
    if (massKg <= 0) return;
    setFocusedFactor('sewage');
    setSimulation((curr) => {
      const sector = BTS_SECTORS.find((s) => s.id === curr.sector) ?? BTS_SECTORS[0];
      const deltaBod = convertBOD5ToPulseDeltaMgL(massKg, sector.mixingVolumeM3);
      return {
        ...curr,
        biochemicalOxygenDemand: (curr.biochemicalOxygenDemand ?? 0) + deltaBod,
        paused: false,
      };
    });
  }, []);

  const handleApplySatelliteTemperature = useCallback((sst: number) => {
    const rounded = parseFloat(sst.toFixed(1));
    handleAdjustFactor('temperature', rounded);
    setSimulation((curr) => ({
      ...curr,
      initialConditionSource: oceanData.noaaStatus.state === 'success'
        ? 'NOAA_CRW_LIVE'
        : 'NOAA_CRW_HISTORICAL_SNAPSHOT',
    }));
  }, [handleAdjustFactor, oceanData.noaaStatus.state]);

  const handleToggleIntervention = useCallback((id: InterventionId) => {
    setSimulation((current) => {
      const activeList = current.activeInterventions ?? [];
      const exists = activeList.some((act) => act.id === id);
      const nextList: ActiveIntervention[] = exists
        ? activeList.filter((act) => act.id !== id)
        : [...activeList, { id, startedAtDay: current.elapsedDays, intensity: 1, status: 'active' }];
      return {
        ...current,
        activeInterventions: nextList,
      };
    });
  }, []);

  const handleOpenInterventionLimits = useCallback((id: InterventionId) => {
    setFocusedInterventionId(id);
    setEnvDrawerOpen(false);
    setEvidenceTab('sources');
    setEvidenceOpen(true);
  }, []);

  const indicatorViews = useMemo<Record<ContextualIndicatorId, ContextualIndicatorView>>(() => {
    const algae = calculateAlgae(
      simulation.env,
      simulation.health,
      simulation.sewageDischargeMode,
      simulation.biochemicalOxygenDemand,
    );
    const trophic = calculateTrophicBalance(simulation.species, algae);
    const ph = effectivePh(
      simulation.env,
      simulation.biochemicalOxygenDemand,
      simulation.sector,
      simulation.respiratoryDicUmolKg,
    );
    const sector = BTS_SECTORS.find((s) => s.id === simulation.sector) ?? BTS_SECTORS[0];
    const carbonate = calculateRespirationPhImpact(
      simulation.env.ph,
      simulation.respiratoryDicUmolKg ?? 0,
      2350 * (sector.baselineSalinity / 35.0),
      simulation.env.temperature,
      sector.baselineSalinity,
    ).carbonateSystem;

    const doVal = simulation.dissolvedOxygen;
    const doTone = doVal >= 5 ? 'good' : doVal >= 3 ? 'watch' : 'critical';

    const tempVal = simulation.env.temperature;
    const tempTone = tempVal >= 30 ? 'critical' : tempVal >= 29 ? 'watch' : 'good';

    const dhwVal = simulation.degreeHeatingWeeks;
    const dhwTone = dhwVal >= 8 ? 'critical' : dhwVal > 0.2 ? 'watch' : 'good';

    const phTone = ph <= 7.8 ? 'critical' : ph < 8.0 ? 'watch' : 'good';

    const aragVal = carbonate.omegaAragonite;
    const aragTone = aragVal < 2.0 ? 'critical' : aragVal < 3.0 ? 'watch' : 'good';

    const coralVal = Math.max(0, Math.min(100, Math.round(simulation.health.coral)));
    const coralTone = coralVal >= 67 ? 'good' : coralVal >= 34 ? 'watch' : 'critical';

    const fishVal = Math.max(0, Math.min(100, Math.round(simulation.health.fish)));
    const fishTone = fishVal >= 67 ? 'good' : fishVal >= 34 ? 'watch' : 'critical';

    const algaeVal = Math.max(0, Math.min(100, Math.round(algae)));
    const algaeTone = algaeVal <= 33 ? 'good' : algaeVal <= 62 ? 'watch' : 'critical';

    const trophicVal = Math.max(0, Math.min(100, Math.round(trophic)));
    const trophicTone = trophicVal >= 67 ? 'good' : trophicVal >= 45 ? 'watch' : 'critical';

    const turbVal = Math.max(0, Math.min(100, Math.round(simulation.env.turbidity)));
    const turbTone = turbVal >= 60 ? 'critical' : turbVal >= 30 ? 'watch' : 'good';

    return {
      oxygen: {
        id: 'oxygen',
        label: 'Oxigênio',
        valueText: doVal.toFixed(1).replace('.', ','),
        unitText: 'mg/L',
        tone: doTone,
        tooltip: 'Oxigênio dissolvido na água.',
      },
      temperature: {
        id: 'temperature',
        label: 'Temperatura',
        valueText: tempVal.toFixed(1).replace('.', ','),
        unitText: '°C',
        tone: tempTone,
        tooltip: 'Temperatura da água.',
      },
      thermalStress: {
        id: 'thermalStress',
        label: 'Estresse térmico',
        valueText: dhwVal.toFixed(1).replace('.', ','),
        unitText: '°C-semanas',
        tone: dhwTone,
        tooltip: 'Calor acumulado no cenário.',
      },
      ph: {
        id: 'ph',
        label: 'pH',
        valueText: ph.toFixed(2).replace('.', ','),
        tone: phTone,
        tooltip: 'Acidez da água.',
      },
      aragonite: {
        id: 'aragonite',
        label: 'Aragonita',
        valueText: aragVal.toFixed(2).replace('.', ','),
        unitText: 'Ωarag',
        tone: aragTone,
        tooltip: 'Saturação de aragonita na água.',
      },
      coral: {
        id: 'coral',
        label: 'Corais',
        valueText: `${coralVal}%`,
        progressPercent: coralVal,
        tone: coralTone,
        tooltip: 'Saúde dos corais no modelo.',
      },
      fish: {
        id: 'fish',
        label: 'Peixes',
        valueText: `${fishVal}%`,
        progressPercent: fishVal,
        tone: fishTone,
        tooltip: 'Saúde dos peixes no modelo.',
      },
      algae: {
        id: 'algae',
        label: 'Algas',
        valueText: `${algaeVal}%`,
        tone: algaeTone,
        tooltip: 'Cobertura de algas no modelo.',
      },
      trophic: {
        id: 'trophic',
        label: 'Equilíbrio trófico',
        valueText: `${trophicVal}%`,
        tone: trophicTone,
        tooltip: 'Equilíbrio alimentar no modelo.',
      },
      turbidity: {
        id: 'turbidity',
        label: 'Turbidez',
        valueText: `${turbVal}`,
        unitText: '% índice',
        tone: turbTone,
        tooltip: 'Partículas em suspensão e transparência da água.',
      },
    };
  }, [simulation]);

  const visibleIndicatorIds = useMemo<readonly ContextualIndicatorId[]>(() => {
    const driverFactor = focusedFactor && isFactorActive(focusedFactor, simulation.controls[focusedFactor])
      ? focusedFactor
      : (activeFactorIds[activeFactorIds.length - 1] ?? focusedFactor);
    if (driverFactor) {
      const primary = (ITEM_DEFINITIONS[driverFactor].primaryIndicators as readonly ContextualIndicatorId[])
        .filter((id) => id !== 'coral' && id !== 'fish');
      return ['coral', 'fish', ...(primary.slice(0, 2) as ContextualIndicatorId[])];
    }
    return ['coral', 'fish', 'oxygen'];
  }, [focusedFactor, simulation.controls, activeFactorIds]);

  const toggleEnvDrawer = () => {
    setEnvDrawerOpen((open) => {
      const next = !open;
      if (next) {
        setEvidenceOpen(false);
        setRegionOpen(false);
      }
      return next;
    });
  };

  const toggleEvidenceDrawer = () => {
    setEvidenceOpen((open) => {
      const next = !open;
      if (next) {
        setEnvDrawerOpen(false);
        setRegionOpen(false);
      }
      return next;
    });
  };

  const openIndicatorDetails = () => {
    setEnvDrawerOpen(false);
    setRegionOpen(false);
    setEvidenceOpen(true);
    setEvidenceTab('evolution');
  };

  const closeAllOverlays = () => {
    setRegionOpen(false);
    setEnvDrawerOpen(false);
    setEvidenceOpen(false);
  };

  const handleSelectBahiaFromMap = () => {
    if (mapZooming) return;
    setMapZooming(true);

    // O zoom calmo e suave no centro da Bahia e o escurecimento iniciam-se juntos:
    window.setTimeout(() => {
      setTransitionDark(true);
    }, 40);

    // Aos 1200ms, a tela já está escura: troca imperceptivelmente para a simulação 3D
    window.setTimeout(() => {
      setScreen('simulation');
      setMapZooming(false);

      // Com a cena 3D pronta: dissipa o véu suavemente em fade-out
      window.setTimeout(() => {
        setTransitionDark(false);
      }, 240);
    }, 1200);
  };

  const handleOpenMap = () => {
    closeAllOverlays();
    setTransitionDark(true);
    window.setTimeout(() => {
      setScreen('map');
      setMapReturning(true);
      window.setTimeout(() => {
        setTransitionDark(false);
        window.setTimeout(() => setMapReturning(false), 800);
      }, 100);
    }, 350);
  };

  if (screen === 'map') {
    return (
      <>
        <BrazilMapScreen
          onSelectBahia={handleSelectBahiaFromMap}
          isZooming={mapZooming}
          isReturning={mapReturning}
        />
        <div
          className={`screen-transition-veil ${transitionDark ? 'active' : ''} ${mapZooming ? 'cinematic-dive' : ''}`}
          aria-hidden="true"
        />
      </>
    );
  }

  const anyOverlayOpen = regionOpen || envDrawerOpen || evidenceOpen;

  return (
    <div className="lab-shell">
      <header className="lab-topbar">
        <div className="lab-topbar-left">
          <RegionSelector
            sectors={BTS_SECTORS}
            selectedSectorId={simulation.sector}
            open={regionOpen}
            onOpenChange={(next) => {
              setRegionOpen(next);
              if (next) {
                setEnvDrawerOpen(false);
                setEvidenceOpen(false);
              }
            }}
            onSelectSector={handleChangeSector}
          />

          <button
            type="button"
            className="btn map-return-btn"
            onClick={handleOpenMap}
            aria-label="Voltar ao mapa do Brasil"
            title="Voltar ao mapa"
          >
            <Icon name="map" />
            <span className="map-return-btn__desktop">Voltar ao mapa</span>
            <span className="map-return-btn__mobile">Mapa</span>
          </button>
        </div>

        <div className="lab-topbar-center">
          <BrandLogo />
        </div>

        <div className="experiment-actions-bar">
          <button
            type="button"
            className="btn btn--quiet"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            aria-label="Desfazer alteração"
            title="Desfazer alteração"
          >
            <Icon name="undo" />
            <span className="hide-tablet">Desfazer</span>
          </button>

          <button
            type="button"
            className="btn btn--quiet"
            onClick={handleResetToInitial}
            aria-label="Restaurar estado inicial"
            title="Restaurar estado inicial"
          >
            <Icon name="reset" />
            <span className="hide-tablet">Estado inicial</span>
          </button>

          <button
            type="button"
            className={`btn ${envDrawerOpen ? 'btn--selected' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={envDrawerOpen}
            aria-pressed={envDrawerOpen}
            title="Ajustar condições ambientais"
            onClick={toggleEnvDrawer}
          >
            <Icon name="sliders" />
            <span>Ajustar</span>
            {activeFactorIds.length > 0 && (
              <em className="drawer-count-badge">{activeFactorIds.length}</em>
            )}
          </button>

          <button
            type="button"
            className={`btn ${evidenceOpen ? 'btn--selected' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={evidenceOpen}
            aria-pressed={evidenceOpen}
            title="Ver gráficos e dados"
            onClick={toggleEvidenceDrawer}
          >
            <Icon name="chart" />
            <span>Dados</span>
          </button>
        </div>
      </header>

      <main className={`lab-workspace ${envDrawerOpen || evidenceOpen ? 'has-drawer-open' : ''}`}>
        <section className="reef-stage" aria-label="Recife 3D da Baía de Todos-os-Santos">
          <div
            className="reef-canvas-frame"
            onPointerDown={(e) => {
              const tag = (e.target as HTMLElement | null)?.tagName;
              if (tag === 'CANVAS') {
                closeAllOverlays();
              }
            }}
          >
            <Suspense
              fallback={
                <div className="scene-loading" role="status">
                  <span className="scene-loading-dot" aria-hidden="true" />
                  Carregando ecossistema…
                </div>
              }
            >
              <MarineScene state={simulation} resetToken={resetToken} />
            </Suspense>

            <div className="contextual-telemetry-bar" aria-label="Indicadores do ecossistema">
              <div className="telemetry-pills">
                {visibleIndicatorIds.map((indId) => {
                  const view = indicatorViews[indId];
                  if (!view) return null;
                  const isMainProgress = (MAIN_PROGRESS_INDICATORS as readonly string[]).includes(view.id) && view.progressPercent !== undefined;
                  if (isMainProgress) {
                    return (
                      <IndicatorProgress
                        key={view.id}
                        label={view.label}
                        value={view.progressPercent!}
                        tone={view.tone}
                        tooltip={view.tooltip}
                        onClick={openIndicatorDetails}
                      />
                    );
                  }
                  return (
                    <button
                      key={view.id}
                      type="button"
                      className={`indicator-metric tone-${view.tone}`}
                      title={view.tooltip}
                      aria-label={`${view.label}: ${view.valueText}${view.unitText ? ` ${view.unitText}` : ''}. Abrir detalhes`}
                      onClick={openIndicatorDetails}
                    >
                      <span className="indicator-metric__label">{view.label}</span>
                      <span className="indicator-metric__reading">
                        <strong className="indicator-metric__value">{view.valueText}</strong>
                        {view.unitText && (
                          <span className="indicator-metric__unit">{view.unitText}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <div className="time-execution-bar" role="group" aria-label="Tempo e execução da simulação">
          <button
            type="button"
            className={`btn play-pause-btn ${simulation.paused ? 'btn--primary' : ''}`}
            aria-pressed={!simulation.paused}
            aria-label={simulation.paused ? 'Iniciar simulação' : 'Pausar simulação'}
            onClick={() => setSimulation((curr) => ({ ...curr, paused: !curr.paused }))}
            title={simulation.paused ? 'Iniciar simulação' : 'Pausar simulação'}
          >
            <Icon name={simulation.paused ? 'play' : 'pause'} />
            <span>{simulation.paused ? 'Iniciar' : 'Pausar'}</span>
          </button>

          <div className="sim-clock-readout" title="Tempo simulado">
            <strong>{formatSimulatedTime(simulation.elapsedDays)}</strong>
          </div>

          <div
            className="speed-pills"
            role="group"
            aria-label="Velocidade da simulação"
            title="Velocidade da simulação"
          >
            {SIMULATION_SPEEDS.map((spd: SimulationSpeed) => (
              <button
                key={spd}
                type="button"
                className={simulation.speed === spd ? 'active' : ''}
                aria-pressed={simulation.speed === spd}
                onClick={() => setSimulation((curr) => ({ ...curr, speed: spd }))}
                title="Velocidade da simulação"
              >
                {spd}×
              </button>
            ))}
          </div>
        </div>

        <div className="mobile-panel-dock" role="toolbar" aria-label="Painéis do laboratório">
          <button
            type="button"
            className={`btn ${envDrawerOpen ? 'btn--selected' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={envDrawerOpen}
            aria-pressed={envDrawerOpen}
            title="Ajustar condições ambientais"
            onClick={toggleEnvDrawer}
          >
            <Icon name="sliders" />
            <span>Ajustar</span>
            {activeFactorIds.length > 0 && (
              <em className="drawer-count-badge">{activeFactorIds.length}</em>
            )}
          </button>

          <button
            type="button"
            className={`btn ${evidenceOpen ? 'btn--selected' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={evidenceOpen}
            aria-pressed={evidenceOpen}
            title="Ver gráficos e dados"
            onClick={toggleEvidenceDrawer}
          >
            <Icon name="chart" />
            <span>Dados</span>
          </button>
        </div>

        {anyOverlayOpen && (
          <button
            type="button"
            className="drawer-scrim"
            aria-label="Fechar painel aberto"
            onClick={closeAllOverlays}
          />
        )}

        <EnvironmentDrawer
          open={envDrawerOpen}
          onClose={() => setEnvDrawerOpen(false)}
          simulation={simulation}
          focusedFactor={focusedFactor}
          canUndo={undoStack.length > 0}
          onUndo={handleUndo}
          onResetToInitial={handleResetToInitial}
          onAdjustFactor={handleAdjustFactor}
          onCommitFactor={handleCommitFactor}
          onResetSingleFactor={handleResetSingleFactor}
          onSewageModeChange={handleSewageModeChange}
          onTriggerSewagePulse={handleTriggerSewagePulse}
          onToggleIntervention={handleToggleIntervention}
          onOpenInterventionLimits={handleOpenInterventionLimits}
          timelineMilestones={timelineMilestones}
        />

        <EvidenceDrawer
          open={evidenceOpen}
          tab={evidenceTab}
          onTabChange={setEvidenceTab}
          onClose={() => {
            setEvidenceOpen(false);
            setFocusedInterventionId(null);
          }}
          simulation={simulation}
          oceanData={oceanData}
          criticalDays={criticalDays}
          onApplySatelliteTemperature={handleApplySatelliteTemperature}
          focusedInterventionId={focusedInterventionId}
          timelineMilestones={timelineMilestones}
        />
      </main>

      <div
        className={`screen-transition-veil ${transitionDark ? 'active' : ''}`}
        aria-hidden="true"
      />
    </div>
  );
}
