import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from './components/BrandLogo';
import { BrazilMapScreen } from './components/BrazilMapScreen';
import { EnvironmentDrawer } from './components/EnvironmentDrawer';
import { EvidenceDrawer, type EvidenceTab } from './components/EvidenceDrawer';
import { FpsCounter } from './components/FpsCounter';
import { Icon } from './components/Icons';
import { IndicatorProgress } from './components/IndicatorProgress';
import { RegionSelector } from './components/RegionSelector';
import { useOceanData } from './hooks/useOceanData';
import { getSavedSst, saveSst } from './services/oceanStorage';
import { calculateRespirationPhImpact } from './simulation/carbonate';
import {
  BASELINE,
  BTS_SECTORS,
  FACTOR_ORDER,
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

export const ALL_INDICATOR_OPTIONS: { id: ContextualIndicatorId; label: string; desc: string }[] = [
  { id: 'coral', label: 'Corais', desc: 'Saúde integrada da estrutura recifal' },
  { id: 'fish', label: 'Peixes', desc: 'Biomassa e diversidade da ictiofauna' },
  { id: 'oxygen', label: 'Oxigênio', desc: 'Concentração de oxigênio dissolvido' },
  { id: 'temperature', label: 'Temperatura', desc: 'Temperatura superficial da água marinha' },
  { id: 'ph', label: 'pH da água', desc: 'Acidez da coluna d’água' },
  { id: 'aragonite', label: 'Carbono / Aragonita', desc: 'Saturação do sistema de carbonatos' },
  { id: 'thermalStress', label: 'Estresse térmico', desc: 'Graus-semanas de aquecimento (DHW)' },
  { id: 'turbidity', label: 'Turbidez', desc: 'Partículas em suspensão e penetração luminosa' },
  { id: 'algae', label: 'Algas', desc: 'Cobertura macroalgal competitiva' },
  { id: 'trophic', label: 'Equilíbrio trófico', desc: 'Balanço ecológico e cadeias alimentares' },
];

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
  const savedSst = getSavedSst(sectorId);
  const effectiveTemp = savedSst ?? sector.baselineTemperature;
  const sectorEnv: Environment = {
    ...BASELINE,
    temperature: effectiveTemp,
  };
  const initialDo = calculateWeissOxygenSaturation(effectiveTemp, sector.baselineSalinity);
  return {
    ...base,
    sector: sectorId,
    controls: { ...sectorEnv },
    env: { ...sectorEnv },
    targets: { ...sectorEnv },
    dissolvedOxygen: initialDo,
    paused: true,
    elapsedDays: 0,
    history: base.history.map((pt) => ({
      ...pt,
      temperature: effectiveTemp,
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
  const [screen, setScreen] = useState<AppScreen>('map');
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

  const [selectedIndicatorIds, setSelectedIndicatorIds] = useState<ContextualIndicatorId[]>([
    'coral',
    'fish',
    'oxygen',
    'temperature',
    'ph',
  ]);
  const [metricsSelectorOpen, setMetricsSelectorOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const oceanData = useOceanData(simulation.sector, screen === 'simulation');

  const sectorDef = useMemo(
    () => BTS_SECTORS.find((s) => s.id === simulation.sector) ?? BTS_SECTORS[0],
    [simulation.sector],
  );

  const apiTemperatureRef = useMemo(() => {
    const sst = oceanData.latestCrw?.seaSurfaceTemperatureDegC;
    if (typeof sst === 'number' && Number.isFinite(sst)) {
      return parseFloat(sst.toFixed(1));
    }
    const saved = getSavedSst(simulation.sector);
    if (typeof saved === 'number' && Number.isFinite(saved)) {
      return saved;
    }
    return sectorDef.baselineTemperature;
  }, [oceanData.latestCrw, simulation.sector, sectorDef.baselineTemperature]);

  const activeFactorIds = useMemo(
    () => FACTOR_ORDER.filter((id) => {
      const refVal = id === 'temperature' ? apiTemperatureRef : BASELINE[id];
      return Math.abs(simulation.controls[id] - refVal) > 1e-6;
    }),
    [simulation.controls, apiTemperatureRef],
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

  const pendingAdjustRef = useRef<{ id: ItemId; value: number } | null>(null);
  const adjustRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (adjustRafRef.current !== null) {
        cancelAnimationFrame(adjustRafRef.current);
      }
    };
  }, []);

  const handleAdjustFactor = useCallback((id: ItemId, value: number) => {
    setFocusedFactor((prev) => (prev === id ? prev : id));
    pendingAdjustRef.current = { id, value };

    if (adjustRafRef.current === null) {
      adjustRafRef.current = requestAnimationFrame(() => {
        adjustRafRef.current = null;
        const pending = pendingAdjustRef.current;
        if (!pending) return;

        setSimulation((current) => {
          if (!pendingUndoBaseRef.current) {
            pendingUndoBaseRef.current = {
              controls: { ...current.controls },
              sewageDischargeMode: current.sewageDischargeMode,
            };
          }
          const nextControls: Environment = { ...current.controls, [pending.id]: pending.value };
          const nextTargets = buildTargets(nextControls, current.sector, current.sewageDischargeMode);
          const shouldStart = current.paused && current.elapsedDays === 0;
          return {
            ...current,
            controls: nextControls,
            targets: nextTargets,
            paused: shouldStart ? false : current.paused,
          };
        });
      });
    }
  }, []);

  const handleCommitFactor = useCallback((_id: ItemId) => {
    if (adjustRafRef.current !== null) {
      cancelAnimationFrame(adjustRafRef.current);
      adjustRafRef.current = null;
    }
    const pending = pendingAdjustRef.current;
    if (pending) {
      pendingAdjustRef.current = null;
      setSimulation((current) => {
        const nextControls: Environment = { ...current.controls, [pending.id]: pending.value };
        const nextTargets = buildTargets(nextControls, current.sector, current.sewageDischargeMode);
        const shouldStart = current.paused && current.elapsedDays === 0;
        return {
          ...current,
          controls: nextControls,
          targets: nextTargets,
          paused: shouldStart ? false : current.paused,
        };
      });
    }

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
    const defaultVal = id === 'temperature' ? apiTemperatureRef : BASELINE[id];

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
  }, [apiTemperatureRef]);

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

  useEffect(() => {
    const sst = oceanData.latestCrw?.seaSurfaceTemperatureDegC;
    if (typeof sst !== 'number' || !Number.isFinite(sst)) return;
    const rounded = parseFloat(sst.toFixed(1));
    saveSst(simulation.sector, rounded);

    setSimulation((curr) => {
      if (Math.abs(curr.controls.temperature - rounded) < 0.05 && Math.abs(curr.env.temperature - rounded) < 0.05) {
        return curr;
      }
      return {
        ...curr,
        controls: { ...curr.controls, temperature: rounded },
        env: { ...curr.env, temperature: rounded },
        targets: { ...curr.targets, temperature: rounded },
        initialConditionSource: 'NOAA_CRW_LIVE',
      };
    });
  }, [oceanData.latestCrw, simulation.sector]);

  const handleToggleIntervention = useCallback((id: InterventionId) => {
    setSimulation((current) => {
      const activeList = current.activeInterventions ?? [];
      const exists = activeList.some((act) => act.id === id);
      const nextList: ActiveIntervention[] = exists
        ? activeList.filter((act) => act.id !== id)
        : [...activeList, { id, startedAtDay: current.elapsedDays, intensity: 1, status: 'active' }];
      const shouldStart = current.paused && current.elapsedDays === 0;
      return {
        ...current,
        activeInterventions: nextList,
        paused: shouldStart ? false : current.paused,
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

    // 1. Oxigênio (OD em mg/L): >= 6.0 ideal (azul); 3.5 a 6.0 alerta (amarelo); < 3.5 hipóxia (vermelho)
    const doVal = simulation.dissolvedOxygen;
    let oxHealth: number;
    if (doVal >= 6.0) {
      oxHealth = Math.min(100, 67 + ((doVal - 6.0) / 2.0) * 33);
    } else if (doVal >= 3.5) {
      oxHealth = 34 + ((doVal - 3.5) / (6.0 - 3.5)) * 32;
    } else {
      oxHealth = Math.max(0, (doVal / 3.5) * 33);
    }
    const oxPercent = Math.max(0, Math.min(100, Math.round(oxHealth)));
    const doTone: 'good' | 'watch' | 'critical' = oxPercent >= 67 ? 'good' : oxPercent >= 34 ? 'watch' : 'critical';

    // 2. Temperatura (°C): 25.0°C a 27.5°C conforto (100% azul); 27.5°C a 29.5°C aquecimento (amarelo); >= 29.5°C estresse agudo (vermelho)
    const tempVal = simulation.env.temperature;
    let tempHealth: number;
    if (tempVal <= 27.5) {
      tempHealth = 100;
    } else if (tempVal <= 29.5) {
      tempHealth = 66 - ((tempVal - 27.5) / (29.5 - 27.5)) * 32;
    } else {
      tempHealth = Math.max(0, 33 - ((tempVal - 29.5) / (32.5 - 29.5)) * 33);
    }
    const tempPercent = Math.max(0, Math.min(100, Math.round(tempHealth)));
    const tempTone: 'good' | 'watch' | 'critical' = tempPercent >= 67 ? 'good' : tempPercent >= 34 ? 'watch' : 'critical';

    // 3. Estresse térmico (DHW): 0.0 a 0.2 °C-sem ideal (100% azul); 0.2 a 4.0 alerta (amarelo); >= 4.0 crítico (vermelho)
    const dhwVal = simulation.degreeHeatingWeeks;
    let dhwHealth: number;
    if (dhwVal <= 0.2) {
      dhwHealth = 100;
    } else if (dhwVal <= 4.0) {
      dhwHealth = 66 - ((dhwVal - 0.2) / 3.8) * 32;
    } else {
      dhwHealth = Math.max(0, 33 - ((dhwVal - 4.0) / 8.0) * 33);
    }
    const dhwPercent = Math.max(0, Math.min(100, Math.round(dhwHealth)));
    const dhwTone: 'good' | 'watch' | 'critical' = dhwPercent >= 67 ? 'good' : dhwPercent >= 34 ? 'watch' : 'critical';

    // 4. pH da água: >= 8.10 ideal (100% azul); 7.90 a 8.10 alerta (amarelo); < 7.90 acidificação aguda (vermelho)
    let phHealth: number;
    if (ph >= 8.10) {
      phHealth = 100;
    } else if (ph >= 7.90) {
      phHealth = 34 + ((ph - 7.90) / (8.10 - 7.90)) * 32;
    } else {
      phHealth = Math.max(0, ((ph - 7.50) / (7.90 - 7.50)) * 33);
    }
    const phPercent = Math.max(0, Math.min(100, Math.round(phHealth)));
    const phTone: 'good' | 'watch' | 'critical' = phPercent >= 67 ? 'good' : phPercent >= 34 ? 'watch' : 'critical';

    // 5. Aragonita (Ωarag): >= 3.5 ideal (100% azul); 2.5 a 3.5 moderado (amarelo); < 2.5 crítico (vermelho)
    const aragVal = carbonate.omegaAragonite;
    let aragHealth: number;
    if (aragVal >= 3.5) {
      aragHealth = 100;
    } else if (aragVal >= 2.5) {
      aragHealth = 34 + ((aragVal - 2.5) / 1.0) * 32;
    } else {
      aragHealth = Math.max(0, ((aragVal - 1.0) / 1.5) * 33);
    }
    const aragPercent = Math.max(0, Math.min(100, Math.round(aragHealth)));
    const aragTone: 'good' | 'watch' | 'critical' = aragPercent >= 67 ? 'good' : aragPercent >= 34 ? 'watch' : 'critical';

    // 6. Corais (0 a 100%)
    const coralVal = Math.max(0, Math.min(100, Math.round(simulation.health.coral)));
    const coralTone: 'good' | 'watch' | 'critical' = coralVal >= 67 ? 'good' : coralVal >= 34 ? 'watch' : 'critical';

    // 7. Peixes (0 a 100%)
    const fishVal = Math.max(0, Math.min(100, Math.round(simulation.health.fish)));
    const fishTone: 'good' | 'watch' | 'critical' = fishVal >= 67 ? 'good' : fishVal >= 34 ? 'watch' : 'critical';

    // 8. Algas: cobertura baixa (< 25%) é saudável (azul); 25% a 55% proliferação (amarelo); > 55% sufocamento (vermelho)
    const algaeVal = Math.max(0, Math.min(100, Math.round(algae)));
    const algaeHealth = Math.max(0, 100 - algaeVal);
    const algaePercent = Math.max(0, Math.min(100, Math.round(algaeHealth)));
    const algaeTone: 'good' | 'watch' | 'critical' = algaePercent >= 67 ? 'good' : algaePercent >= 34 ? 'watch' : 'critical';

    // 9. Equilíbrio trófico (0 a 100%)
    const trophicVal = Math.max(0, Math.min(100, Math.round(trophic)));
    const trophicTone: 'good' | 'watch' | 'critical' = trophicVal >= 67 ? 'good' : trophicVal >= 34 ? 'watch' : 'critical';

    // 10. Turbidez: 0 a 15% índice é água cristalina (azul); 15 a 50% moderada (amarelo); > 50% turva (vermelho)
    const turbVal = Math.max(0, Math.min(100, Math.round(simulation.env.turbidity)));
    const turbHealth = Math.max(0, 100 - turbVal);
    const turbPercent = Math.max(0, Math.min(100, Math.round(turbHealth)));
    const turbTone: 'good' | 'watch' | 'critical' = turbPercent >= 67 ? 'good' : turbPercent >= 34 ? 'watch' : 'critical';

    return {
      oxygen: {
        id: 'oxygen',
        label: 'Oxigênio',
        valueText: doVal.toFixed(1).replace('.', ','),
        unitText: 'mg/L',
        progressPercent: oxPercent,
        tone: doTone,
        tooltip: 'Oxigênio dissolvido na água (meta saudável: ≥ 6,0 mg/L).',
      },
      temperature: {
        id: 'temperature',
        label: 'Temperatura',
        valueText: tempVal.toFixed(1).replace('.', ','),
        unitText: '°C',
        progressPercent: tempPercent,
        tone: tempTone,
        tooltip: 'Temperatura da água (faixa ideal: 25–27,5 °C).',
      },
      thermalStress: {
        id: 'thermalStress',
        label: 'Estresse térmico',
        valueText: dhwVal.toFixed(1).replace('.', ','),
        unitText: '°C-sem',
        progressPercent: dhwPercent,
        tone: dhwTone,
        tooltip: 'Acúmulo de calor térmico no recife (DHW).',
      },
      ph: {
        id: 'ph',
        label: 'pH da água',
        valueText: ph.toFixed(2).replace('.', ','),
        progressPercent: phPercent,
        tone: phTone,
        tooltip: 'Acidez da água marinha (ótimo: ≥ 8,10).',
      },
      aragonite: {
        id: 'aragonite',
        label: 'Carbono / Aragonita',
        valueText: aragVal.toFixed(2).replace('.', ','),
        unitText: 'Ωarag',
        progressPercent: aragPercent,
        tone: aragTone,
        tooltip: 'Saturação de carbonatos para esqueletos de corais (ótimo: ≥ 3,5).',
      },
      coral: {
        id: 'coral',
        label: 'Corais',
        valueText: `${coralVal}%`,
        progressPercent: coralVal,
        tone: coralTone,
        tooltip: 'Saúde integrada da estrutura recifal.',
      },
      fish: {
        id: 'fish',
        label: 'Peixes',
        valueText: `${fishVal}%`,
        progressPercent: fishVal,
        tone: fishTone,
        tooltip: 'Biomassa e integridade da ictiofauna.',
      },
      algae: {
        id: 'algae',
        label: 'Algas',
        valueText: `${algaeVal}%`,
        progressPercent: algaePercent,
        tone: algaeTone,
        tooltip: 'Cobertura macroalgal competitiva.',
      },
      trophic: {
        id: 'trophic',
        label: 'Equilíbrio trófico',
        valueText: `${trophicVal}%`,
        progressPercent: trophicVal,
        tone: trophicTone,
        tooltip: 'Equilíbrio das teias tróficas.',
      },
      turbidity: {
        id: 'turbidity',
        label: 'Turbidez',
        valueText: `${turbVal}`,
        unitText: '% índice',
        progressPercent: turbPercent,
        tone: turbTone,
        tooltip: 'Partículas em suspensão e penetração de luz.',
      },
    };
  }, [simulation]);

  const maxMetricsCount = useMemo(() => {
    if (windowWidth <= 390) return 2;
    if (windowWidth <= 680) return 3;
    return Infinity;
  }, [windowWidth]);

  const displayedIndicatorIds = useMemo<readonly ContextualIndicatorId[]>(() => {
    if (Number.isFinite(maxMetricsCount)) {
      return selectedIndicatorIds.slice(0, maxMetricsCount);
    }
    return selectedIndicatorIds;
  }, [maxMetricsCount, selectedIndicatorIds]);

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
      <header className={`lab-topbar ${regionOpen ? 'has-region-open' : ''}`}>
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

        <div className="lab-topbar-right">
          <a
            href="https://www.vakinha.com.br/vaquinha/da-bahia-para-a-franca-leve-a-equipe-kirimure-a-grande-final-mundial?utm_campaign=whatsapp&utm_content=6425557&utm_medium=website&utm_source=social-shares"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-support-project"
            title="Apoie a equipe Kirimurê na final mundial na França (Vakinha)"
            aria-label="Apoiar o projeto na Vakinha: Da Bahia para a França"
          >
            <Icon name="heart" />
            <span className="btn-support-text desktop">Apoiar o Projeto</span>
            <span className="btn-support-text mobile">Apoiar</span>
          </a>

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
            title="Manipular condições ambientais"
            onClick={toggleEnvDrawer}
          >
            <Icon name="sliders" />
            <span>Manipular</span>
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

            <div className="fps-counter-overlay" aria-label="Desempenho da cena 3D">
              <FpsCounter />
            </div>

            <div className="contextual-telemetry-bar" aria-label="Indicadores do ecossistema">
              <div className="telemetry-pills">
                {displayedIndicatorIds.map((indId) => {
                  const view = indicatorViews[indId];
                  if (!view) return null;
                  return (
                    <IndicatorProgress
                      key={view.id}
                      label={view.label}
                      value={view.progressPercent ?? 0}
                      displayValue={view.valueText}
                      unit={view.unitText}
                      tone={view.tone}
                      tooltip={view.tooltip}
                      onClick={openIndicatorDetails}
                    />
                  );
                })}

                <button
                  type="button"
                  className="btn-customize-metrics"
                  onClick={() => {
                    if (Number.isFinite(maxMetricsCount)) {
                      setSelectedIndicatorIds((prev) =>
                        prev.length > maxMetricsCount ? prev.slice(0, maxMetricsCount) : prev
                      );
                    }
                    setMetricsSelectorOpen(true);
                  }}
                  title="Editar métricas exibidas no visualizador"
                  aria-label="Editar métricas exibidas"
                >
                  <Icon name="sliders" />
                  <span>Editar</span>
                </button>
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
            title="Manipular condições ambientais"
            onClick={toggleEnvDrawer}
          >
            <Icon name="sliders" />
            <span>Manipular</span>
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
          referenceTemperature={apiTemperatureRef}
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
          focusedInterventionId={focusedInterventionId}
          timelineMilestones={timelineMilestones}
        />

        {metricsSelectorOpen && (
          <div
            className="limits-modal-overlay"
            role="presentation"
            onClick={() => setMetricsSelectorOpen(false)}
          >
            <div
              className="floating-metrics-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="metrics-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="limits-modal-header">
                <div className="limits-modal-title-row">
                  <Icon name="sliders" className="limits-modal-icon" />
                  <div>
                    <h3 id="metrics-modal-title" className="limits-modal-title">Métricas no Visualizador</h3>
                    <span className="limits-modal-target">
                      {windowWidth <= 390
                        ? 'Em telas compactas (≤ 390px), máximo de 2 métricas (ao adicionar outra, a mais antiga é desmarcada)'
                        : windowWidth <= 680
                          ? 'No celular, máximo de 3 métricas (ao adicionar uma 4ª, a mais antiga é desmarcada)'
                          : 'Selecione quais indicadores exibir no laboratório'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--quiet btn--icon"
                  onClick={() => setMetricsSelectorOpen(false)}
                  aria-label="Fechar personalização de métricas"
                  title="Fechar"
                >
                  <Icon name="close" />
                </button>
              </header>

              <div className="metrics-modal-list">
                {ALL_INDICATOR_OPTIONS.map((opt) => {
                  const checked = selectedIndicatorIds.includes(opt.id);
                  return (
                    <label key={opt.id} className={`metric-option-row ${checked ? 'is-checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setSelectedIndicatorIds((prev) => {
                            if (isChecked) {
                              if (Number.isFinite(maxMetricsCount) && prev.length >= maxMetricsCount) {
                                // FIFO: desmarca automaticamente a métrica mais antiga selecionada
                                const kept = prev.slice(prev.length - (maxMetricsCount - 1));
                                return [...kept, opt.id];
                              }
                              return [...prev, opt.id];
                            }
                            if (prev.length <= 1) return prev; // Garante ao menos 1
                            return prev.filter((id) => id !== opt.id);
                          });
                        }}
                      />
                      <div className="metric-option-info">
                        <strong>{opt.label}</strong>
                        <small>{opt.desc}</small>
                      </div>
                    </label>
                  );
                })}
              </div>

              <footer className="limits-modal-footer">
                {!Number.isFinite(maxMetricsCount) ? (
                  <>
                    <button
                      type="button"
                      className="btn btn--quiet btn--compact"
                      onClick={() => {
                        setSelectedIndicatorIds(ALL_INDICATOR_OPTIONS.map((o) => o.id));
                      }}
                    >
                      Marcar todas
                    </button>
                    <button
                      type="button"
                      className="btn btn--quiet btn--compact"
                      onClick={() => {
                        setSelectedIndicatorIds(['coral', 'fish', 'oxygen', 'temperature', 'ph']);
                      }}
                    >
                      Padrão (5)
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn--quiet btn--compact"
                    onClick={() => {
                      setSelectedIndicatorIds(
                        maxMetricsCount === 2
                          ? ['coral', 'fish']
                          : ['coral', 'fish', 'oxygen']
                      );
                    }}
                  >
                    Restaurar padrão ({maxMetricsCount})
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--primary btn--compact"
                  onClick={() => setMetricsSelectorOpen(false)}
                >
                  Concluir
                </button>
              </footer>
            </div>
          </div>
        )}
      </main>

      <div
        className={`screen-transition-veil ${transitionDark ? 'active' : ''}`}
        aria-hidden="true"
      />
    </div>
  );
}
