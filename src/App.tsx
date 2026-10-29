import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from './components/BrandLogo';
import { BrazilMapScreen } from './components/BrazilMapScreen';
import { EnvironmentDrawer, formatParameterValue } from './components/EnvironmentDrawer';
import { EvidenceDrawer, type EvidenceTab } from './components/EvidenceDrawer';
import { Icon } from './components/Icons';
import { useOceanData } from './hooks/useOceanData';
import { calculateRespirationPhImpact } from './simulation/carbonate';
import {
  BASELINE,
  BTS_SECTORS,
  FACTOR_ORDER,
  ITEM_DEFINITIONS,
} from './simulation/config';
import { calculateOilFateBudget } from './simulation/contaminants';
import { calculateWeissOxygenSaturation, convertBOD5ToPulseDeltaMgL } from './simulation/oxygen';
import {
  buildTargets,
  calculateAlgae,
  calculateTrophicBalance,
  createInitialState,
  effectivePh,
  estimateCriticalDays,
  isFactorActive,
  tickSimulation,
} from './simulation/model';
import { evaluateMessages } from './simulation/messages';
import { formatSimulatedTime, SIMULATION_SPEEDS } from './simulation/time';
import type {
  BtsSectorId,
  Environment,
  ItemId,
  SavedScenario,
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
  | 'trophic';

interface ContextualIndicatorView {
  id: ContextualIndicatorId;
  label: string;
  valueText: string;
  unitText: string;
  statusText: string;
  tone: 'healthy' | 'watch' | 'critical';
  originLabel: string;
  tooltip: string;
}

const ALL_CONTEXTUAL_INDICATOR_IDS: readonly ContextualIndicatorId[] = [
  'oxygen',
  'coral',
  'fish',
  'temperature',
  'thermalStress',
  'ph',
  'aragonite',
  'algae',
  'trophic',
];

const INDICATOR_SHORT_NAMES: Record<ContextualIndicatorId, string> = {
  oxygen: 'Oxigênio dissolvido',
  coral: 'Saúde dos corais',
  fish: 'Saúde da fauna',
  temperature: 'Temperatura da água',
  thermalStress: 'Estresse térmico simulado',
  ph: 'pH efetivo',
  aragonite: 'Saturação de aragonita',
  algae: 'Pressão de algas',
  trophic: 'Equilíbrio trófico',
};

const MarineScene = lazy(() =>
  import('./scene/MarineScene').then((module) => ({
    default: module.MarineScene,
  })),
);

function cloneSimulationState(state: SimulationState): SimulationState {
  return {
    ...state,
    controls: { ...state.controls },
    env: { ...state.env },
    targets: { ...state.targets },
    health: { ...state.health },
    species: { ...state.species },
    pressures: { ...state.pressures },
    exposure: { ...state.exposure },
    thermalDose: state.thermalDose.map((d) => ({ ...d })),
    history: state.history.map((h) => ({ ...h, species: h.species ? { ...h.species } : undefined })),
    firedMessages: new Set(state.firedMessages),
    events: state.events.map((e) => ({ ...e })),
  };
}

function buildScenarioSnapshot(state: SimulationState, id: string, label: string): SavedScenario {
  const algae = calculateAlgae(state.env, state.health, state.sewageDischargeMode, state.biochemicalOxygenDemand);
  const trophic = calculateTrophicBalance(state.species, algae);
  const ph = effectivePh(state.env, state.biochemicalOxygenDemand, state.sector, state.respiratoryDicUmolKg);

  return {
    id,
    label,
    savedAtDay: state.elapsedDays,
    sector: state.sector,
    sewageDischargeMode: state.sewageDischargeMode,
    controls: { ...state.controls },
    env: { ...state.env },
    dissolvedOxygen: state.dissolvedOxygen,
    biochemicalOxygenDemand: state.biochemicalOxygenDemand,
    effectivePh: ph,
    degreeHeatingWeeks: state.degreeHeatingWeeks,
    algae,
    trophicBalance: trophic,
    health: { ...state.health },
    overall: state.overall,
    species: { ...state.species },
    snapshotState: cloneSimulationState(state),
  };
}

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
  // Abre diretamente no recife 3D da Baía de Todos-os-Santos (seleção de mapa permanece como opção secundária)
  const [screen, setScreen] = useState<AppScreen>('simulation');
  const [mapZooming, setMapZooming] = useState(false);
  const [mapReturning, setMapReturning] = useState(false);
  const [transitionDark, setTransitionDark] = useState(false);

  const [resetToken, setResetToken] = useState(0);
  const [simulation, setSimulation] = useState<SimulationState>(() => createSectorBaselineState('frades'));
  const simulationRef = useRef<SimulationState>(simulation);
  simulationRef.current = simulation;

  const [focusedFactor, setFocusedFactor] = useState<ItemId | null>(null);

  // Menus suspensos (sobrepostos à cena, sem empurrar nem redimensionar o recife 3D)
  const [envDrawerOpen, setEnvDrawerOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>('evolution');

  // Indicadores contextuais customizados opcionalmente pelo usuário
  const [pinnedIndicators, setPinnedIndicators] = useState<ContextualIndicatorId[] | null>(null);
  const [indicatorPickerOpen, setIndicatorPickerOpen] = useState(false);

  // Pilha de Desfazer, Cenários Guardados e Alternância Antes/Depois no mesmo enquadramento 3D
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const undoStackRef = useRef<UndoEntry[]>(undoStack);
  undoStackRef.current = undoStack;
  const pendingUndoBaseRef = useRef<UndoEntry | null>(null);

  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const savedScenariosRef = useRef<SavedScenario[]>(savedScenarios);
  savedScenariosRef.current = savedScenarios;
  const scenarioSeqRef = useRef(0);

  // Saneamento automático de chaves duplicadas pré-existentes (ex.: estado preservado por HMR em StrictMode)
  useEffect(() => {
    const seen = new Set<string>();
    let hasDuplicate = false;
    for (const item of savedScenarios) {
      if (seen.has(item.id)) {
        hasDuplicate = true;
        break;
      }
      seen.add(item.id);
    }
    if (hasDuplicate) {
      const deduplicated: SavedScenario[] = [];
      const kept = new Set<string>();
      for (const item of savedScenarios) {
        if (!kept.has(item.id)) {
          kept.add(item.id);
          deduplicated.push(item);
        }
      }
      setSavedScenarios(deduplicated);
    }
  }, [savedScenarios]);
  const [activeComparisonId, setActiveComparisonId] = useState<string>('reference');
  const [isViewingComparisonIn3D, setIsViewingComparisonIn3D] = useState(false);

  const [criticalDays, setCriticalDays] = useState<number | null>(null);

  const oceanData = useOceanData(simulation.sector, screen === 'simulation');

  const referenceScenario = useMemo(
    () => buildScenarioSnapshot(createSectorBaselineState(simulation.sector), 'reference', 'Estado inicial (referência)'),
    [simulation.sector],
  );

  const activeComparisonScenario = useMemo(() => {
    if (activeComparisonId === 'reference') return referenceScenario;
    return savedScenarios.find((s) => s.id === activeComparisonId) ?? referenceScenario;
  }, [activeComparisonId, referenceScenario, savedScenarios]);

  // Estado efetivamente enviado à cena 3D (permite alternar Antes/Depois preservando o mesmo enquadramento!)
  const displayedSceneState = isViewingComparisonIn3D
    ? activeComparisonScenario.snapshotState
    : simulation;

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

  // Laço temporal determinístico a 10 Hz
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

  // Recálculo assíncrono (debounce 260 ms) do tempo até o limiar crítico do modelo para manter arraste fluido
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

  // Atalhos de teclado acessíveis (Espaço pausa/retoma fora de inputs; Esc fecha gavetas ou sai da comparação 3D)
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
        if (indicatorPickerOpen) setIndicatorPickerOpen(false);
        else if (isViewingComparisonIn3D) setIsViewingComparisonIn3D(false);
        else if (evidenceOpen) setEvidenceOpen(false);
        else if (envDrawerOpen) setEnvDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, indicatorPickerOpen, isViewingComparisonIn3D, evidenceOpen, envDrawerOpen]);

  // Manipulação direta de parâmetros: atualiza alvos imediatamente sem botão "Aplicar Alterações"
  const handleAdjustFactor = useCallback((id: ItemId, value: number) => {
    setFocusedFactor(id);
    setIsViewingComparisonIn3D(false);

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

    setIsViewingComparisonIn3D(false);
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
    setIsViewingComparisonIn3D(false);
  }, []);

  const handleResetToInitial = useCallback(() => {
    pendingUndoBaseRef.current = null;
    setUndoStack([]);
    setFocusedFactor(null);
    setIsViewingComparisonIn3D(false);
    setCriticalDays(null);
    setResetToken((t) => t + 1);
    setSimulation((curr) => createSectorBaselineState(curr.sector));
  }, []);

  const handleChangeSector = useCallback((nextSector: BtsSectorId) => {
    pendingUndoBaseRef.current = null;
    setUndoStack([]);
    setFocusedFactor(null);
    setIsViewingComparisonIn3D(false);
    setActiveComparisonId('reference');
    setCriticalDays(null);
    setResetToken((t) => t + 1);
    setSimulation(createSectorBaselineState(nextSector));
  }, []);

  const handleSewageModeChange = useCallback((mode: 'continuous' | 'pulse') => {
    setFocusedFactor('sewage');
    setIsViewingComparisonIn3D(false);
    setSimulation((curr) => ({
      ...curr,
      sewageDischargeMode: mode,
      targets: buildTargets(curr.controls, curr.sector, mode),
    }));
  }, []);

  const handleTriggerSewagePulse = useCallback((massKg: number) => {
    if (massKg <= 0) return;
    setFocusedFactor('sewage');
    setIsViewingComparisonIn3D(false);
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

  const handleSaveCurrentScenario = useCallback((customLabel?: string) => {
    const curr = simulationRef.current;
    const nextOrdinal = savedScenariosRef.current.length + 1;
    const activeSummary = FACTOR_ORDER
      .filter((id) => isFactorActive(id, curr.controls[id]))
      .slice(0, 2)
      .map((id) => {
        const fmt = formatParameterValue(id, curr.controls[id], curr.sewageDischargeMode);
        return `${ITEM_DEFINITIONS[id].shortLabel} ${fmt.value} ${fmt.unit}`;
      })
      .join(' + ');

    const autoLabel = customLabel
      || (activeSummary
        ? `Cenário ${nextOrdinal}: ${activeSummary}`
        : `Cenário ${nextOrdinal} (${formatSimulatedTime(curr.elapsedDays)})`);
    scenarioSeqRef.current += 1;
    const id = `saved-${Date.now()}-${scenarioSeqRef.current}`;
    const snapshot = buildScenarioSnapshot(curr, id, autoLabel);

    setSavedScenarios((prev) => (prev.some((s) => s.id === id) ? prev : [...prev, snapshot]));
    setActiveComparisonId(id);
  }, []);

  const handleDeleteSavedScenario = useCallback((id: string) => {
    setSavedScenarios((prev) => prev.filter((s) => s.id !== id));
    setActiveComparisonId((currId) => (currId === id ? 'reference' : currId));
    setIsViewingComparisonIn3D(false);
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

  // Cálculo de todos os indicadores contextuais disponíveis (fonte única, sem duplicação na tela)
  const indicatorViews = useMemo<Record<ContextualIndicatorId, ContextualIndicatorView>>(() => {
    const state = displayedSceneState;
    const algae = calculateAlgae(state.env, state.health, state.sewageDischargeMode, state.biochemicalOxygenDemand);
    const trophic = calculateTrophicBalance(state.species, algae);
    const ph = effectivePh(state.env, state.biochemicalOxygenDemand, state.sector, state.respiratoryDicUmolKg);
    const sector = BTS_SECTORS.find((s) => s.id === state.sector) ?? BTS_SECTORS[0];
    const carbonate = calculateRespirationPhImpact(
      state.env.ph,
      state.respiratoryDicUmolKg ?? 0,
      2350 * (sector.baselineSalinity / 35.0),
      state.env.temperature,
      sector.baselineSalinity,
    ).carbonateSystem;

    const doVal = state.dissolvedOxygen;
    const doTone = doVal >= 5 ? 'healthy' : doVal >= 3 ? 'watch' : 'critical';
    const doStatus = doVal >= 5 ? 'Adequado (≥ 5)' : doVal >= 2 ? 'Estresse / Hipóxia' : 'Hipóxia severa';

    const tempVal = state.env.temperature;
    const tempTone = tempVal >= 30 ? 'critical' : tempVal >= 29 ? 'watch' : 'healthy';
    const tempStatus = tempVal >= 30 ? 'Acima de 30 °C' : tempVal >= 29 ? 'Acima do limiar (29 °C)' : 'Faixa de referência';

    const dhwVal = state.degreeHeatingWeeks;
    const dhwTone = dhwVal >= 8 ? 'critical' : dhwVal >= 4 ? 'watch' : dhwVal > 0.2 ? 'watch' : 'healthy';
    const dhwStatus = dhwVal >= 8 ? 'Risco severo (≥ 8)' : dhwVal >= 4 ? 'Risco branq. (≥ 4)' : dhwVal > 0.1 ? 'Acumulando' : 'Sem acúmulo';

    const phTone = ph <= 7.8 ? 'critical' : ph < 8.0 ? 'watch' : 'healthy';
    const phStatus = ph <= 7.8 ? 'Acidificação crítica' : ph < 8.0 ? 'Atenção (< 8,00)' : 'Referência';

    const aragVal = carbonate.omegaAragonite;
    const aragTone = aragVal < 2.0 ? 'critical' : aragVal < 3.0 ? 'watch' : 'healthy';
    const aragStatus = aragVal >= 3.0 ? 'Favorável (≥ 3,0)' : aragVal >= 2.0 ? 'Marginal' : 'Sub-saturação';

    const coralVal = Math.round(state.health.coral);
    const coralTone = coralVal >= 67 ? 'healthy' : coralVal >= 34 ? 'watch' : 'critical';
    const coralStatus = coralVal >= 67 ? 'Estável' : coralVal >= 34 ? 'Em declínio' : 'Crítico (≤ 33)';

    const fishVal = Math.round(state.health.fish);
    const fishTone = fishVal >= 67 ? 'healthy' : fishVal >= 34 ? 'watch' : 'critical';
    const fishStatus = fishVal >= 67 ? 'Comunidade ativa' : fishVal >= 34 ? 'Sob pressão' : 'Crítico (≤ 33)';

    const algaeVal = Math.round(algae);
    const algaeTone = algaeVal <= 33 ? 'healthy' : algaeVal <= 62 ? 'watch' : 'critical';
    const algaeStatus = algaeVal <= 33 ? 'Controlada' : algaeVal <= 62 ? 'Em expansão' : 'Dominante';

    const trophicVal = Math.round(trophic);
    const trophicTone = trophicVal >= 67 ? 'healthy' : trophicVal >= 45 ? 'watch' : 'critical';
    const trophicStatus = trophicVal >= 67 ? 'Equilibrado' : trophicVal >= 45 ? 'Alterado' : 'Desequilibrado';

    return {
      oxygen: {
        id: 'oxygen',
        label: 'Oxigênio dissolvido',
        valueText: doVal.toFixed(1).replace('.', ','),
        unitText: 'mg/L',
        statusText: doStatus,
        tone: doTone,
        originLabel: 'Simulação',
        tooltip: 'Concentração de O₂ calculada pelo balanço acoplado Weiss (1970) + DBO + reaeração (CONAMA 357).',
      },
      temperature: {
        id: 'temperature',
        label: 'Temperatura',
        valueText: tempVal.toFixed(1).replace('.', ','),
        unitText: '°C',
        statusText: tempStatus,
        tone: tempTone,
        originLabel: simulation.initialConditionSource === 'NOAA_CRW_LIVE' ? 'Entrada NOAA → Modelo' : 'Simulação',
        tooltip: 'Temperatura atual da camada de mistura no compartimento simulado.',
      },
      thermalStress: {
        id: 'thermalStress',
        label: 'Estresse térmico (modelo)',
        valueText: dhwVal.toFixed(1).replace('.', ','),
        unitText: '°C-sem.',
        statusText: dhwStatus,
        tone: dhwTone,
        originLabel: 'Simulação',
        tooltip: 'Calor acumulado em 84 dias usando a MMM didática fixa de 28,0 °C (distinto do DHW satelital oficial da NOAA).',
      },
      ph: {
        id: 'ph',
        label: 'pH efetivo',
        valueText: ph.toFixed(2).replace('.', ','),
        unitText: 'pH',
        statusText: phStatus,
        tone: phTone,
        originLabel: 'Simulação',
        tooltip: 'pH resultante na escala total, incluindo o CO₂ liberado pela respiração bacteriana da DBO.',
      },
      aragonite: {
        id: 'aragonite',
        label: 'Saturação aragonita',
        valueText: aragVal.toFixed(2).replace('.', ','),
        unitText: 'Ωarag',
        statusText: aragStatus,
        tone: aragTone,
        originLabel: 'Simulação',
        tooltip: 'Estado termodinâmico de saturação de carbonato de cálcio (Lueker et al., 2000; Mucci, 1983).',
      },
      coral: {
        id: 'coral',
        label: 'Corais (índice)',
        valueText: `${coralVal}`,
        unitText: '/100',
        statusText: coralStatus,
        tone: coralTone,
        originLabel: 'Simulação',
        tooltip: 'Índice relativo do modelo para a vitalidade dos corais construtores (não é medição de cobertura em campo).',
      },
      fish: {
        id: 'fish',
        label: 'Fauna (índice)',
        valueText: `${fishVal}`,
        unitText: '/100',
        statusText: fishStatus,
        tone: fishTone,
        originLabel: 'Simulação',
        tooltip: 'Média relativa dos três grupos funcionais de peixes recifais no modelo.',
      },
      algae: {
        id: 'algae',
        label: 'Pressão de algas',
        valueText: `${algaeVal}`,
        unitText: '/100',
        statusText: algaeStatus,
        tone: algaeTone,
        originLabel: 'Simulação',
        tooltip: 'Índice relativo de crescimento de macroalgas em função de nutrientes, espaço e perda de herbívoros.',
      },
      trophic: {
        id: 'trophic',
        label: 'Equilíbrio trófico',
        valueText: `${trophicVal}`,
        unitText: '/100',
        statusText: trophicStatus,
        tone: trophicTone,
        originLabel: 'Simulação',
        tooltip: 'Relação calculada entre herbivoria ativa (peixe-papagaio e cirurgião) e cobertura de algas.',
      },
    };
  }, [displayedSceneState, simulation.initialConditionSource]);

  // Seleção automática dos 3 indicadores pertinentes à variável investigada (ou os escolhidos manualmente)
  const visibleIndicatorIds = useMemo<readonly ContextualIndicatorId[]>(() => {
    if (pinnedIndicators && pinnedIndicators.length > 0) {
      return pinnedIndicators;
    }
    const driverFactor = focusedFactor && isFactorActive(focusedFactor, simulation.controls[focusedFactor])
      ? focusedFactor
      : (activeFactorIds[activeFactorIds.length - 1] ?? focusedFactor);
    if (driverFactor) {
      return ITEM_DEFINITIONS[driverFactor].primaryIndicators;
    }
    return ['oxygen', 'coral', 'fish'];
  }, [pinnedIndicators, focusedFactor, simulation.controls, activeFactorIds]);

  const activeCausalFactor = useMemo<ItemId | null>(() => {
    if (focusedFactor && activeFactorIds.includes(focusedFactor)) return focusedFactor;
    return activeFactorIds[activeFactorIds.length - 1] ?? null;
  }, [focusedFactor, activeFactorIds]);

  const oilContextConcentration = useMemo(() => {
    const mass = Math.max(displayedSceneState.controls.oil, displayedSceneState.env.oil);
    if (mass <= 0) return null;
    const budget = calculateOilFateBudget(mass, displayedSceneState.sector, Math.max(0.5, displayedSceneState.elapsedDays));
    return budget.dissolvedPahConcentrationUgL;
  }, [displayedSceneState.controls.oil, displayedSceneState.env.oil, displayedSceneState.sector, displayedSceneState.elapsedDays]);

  const togglePinnedIndicator = (id: ContextualIndicatorId) => {
    setPinnedIndicators((prev) => {
      const current = prev ?? [...visibleIndicatorIds];
      if (current.includes(id)) {
        if (current.length <= 1) return current;
        return current.filter((item) => item !== id);
      }
      if (current.length >= 4) {
        return [...current.slice(1), id];
      }
      return [...current, id];
    });
  };

  // Transições secundárias para o Mapa do Brasil (opcional)
  const handleSelectBahiaFromMap = () => {
    if (mapZooming) return;
    setMapZooming(true);
    window.setTimeout(() => setTransitionDark(true), 30);
    window.setTimeout(() => {
      setScreen('simulation');
      setMapZooming(false);
      window.setTimeout(() => setTransitionDark(false), 200);
    }, 900);
  };

  const handleOpenMap = () => {
    setTransitionDark(true);
    window.setTimeout(() => {
      setScreen('map');
      setMapReturning(true);
      window.setTimeout(() => {
        setTransitionDark(false);
        window.setTimeout(() => setMapReturning(false), 700);
      }, 100);
    }, 260);
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

  return (
    <div className="lab-shell">
      {/* BARRA SUPERIOR UNIFICADA: Localização + Tempo/Execução + Ações de Experimento */}
      <header className="lab-topbar">
        <div className="lab-topbar-brand">
          <div className="brand-compact-wrap">
            <BrandLogo />
          </div>

          <div className="location-cluster">
            <label htmlFor="bts-sector-select" className="sr-only">
              Compartimento da Baía de Todos-os-Santos
            </label>
            <select
              id="bts-sector-select"
              className="sector-select"
              value={simulation.sector}
              onChange={(e) => handleChangeSector(e.target.value as BtsSectorId)}
              title={sectorDef.description}
            >
              {BTS_SECTORS.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  BTS · {sec.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="topbar-ghost-btn"
              onClick={handleOpenMap}
              title="Ver localização geográfica no mapa do Brasil"
            >
              <Icon name="location" />
              <span className="hide-narrow">Mapa</span>
            </button>
          </div>
        </div>

        {/* CONTROLES UNIFICADOS DE TEMPO E EXECUÇÃO */}
        <div className="time-execution-bar" role="group" aria-label="Tempo e execução da simulação">
          <button
            type="button"
            className={`play-pause-btn ${simulation.paused ? 'is-paused' : 'is-running'}`}
            aria-pressed={simulation.paused}
            onClick={() => setSimulation((curr) => ({ ...curr, paused: !curr.paused }))}
            title="Iniciar ou pausar a evolução temporal (atalho: barra de espaço)"
          >
            <Icon name={simulation.paused ? 'play' : 'pause'} />
            <span>{simulation.paused ? 'Iniciar' : 'Pausar'}</span>
          </button>

          <div className="sim-clock-readout" title="Tempo decorrido no cenário simulado (1x = 1 dia a cada 4 segundos)">
            <small>Tempo</small>
            <strong>{formatSimulatedTime(displayedSceneState.elapsedDays)}</strong>
          </div>

          <div className="speed-pills" role="group" aria-label="Velocidade do tempo simulado">
            {SIMULATION_SPEEDS.map((spd: SimulationSpeed) => (
              <button
                key={spd}
                type="button"
                className={simulation.speed === spd ? 'active' : ''}
                aria-pressed={simulation.speed === spd}
                onClick={() => setSimulation((curr) => ({ ...curr, speed: spd }))}
                title={`Velocidade ${spd}x`}
              >
                {spd}×
              </button>
            ))}
          </div>
        </div>

        {/* COMANDOS DE EXPERIMENTO EM SALA E GAVETAS */}
        <div className="experiment-actions-bar">
          <button
            type="button"
            className="topbar-action-btn"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            title="Desfazer última alteração de parâmetro"
          >
            <Icon name="undo" />
            <span className="hide-tablet">Desfazer</span>
          </button>

          <button
            type="button"
            className="topbar-action-btn"
            onClick={handleResetToInitial}
            title="Retornar todo o ecossistema ao estado inicial de referência"
          >
            <Icon name="reset" />
            <span className="hide-tablet">Estado inicial</span>
          </button>

          <button
            type="button"
            className="topbar-action-btn"
            onClick={() => {
              handleSaveCurrentScenario();
              setEnvDrawerOpen(false);
              setIndicatorPickerOpen(false);
              setEvidenceOpen(true);
              setEvidenceTab('compare');
            }}
            title="Guardar combinação atual para comparar dois experimentos"
          >
            <Icon name="bookmark" />
            <span className="hide-laptop">Guardar</span>
          </button>

          <button
            type="button"
            className={`topbar-action-btn ${isViewingComparisonIn3D ? 'is-comparing' : ''}`}
            disabled={activeFactorIds.length === 0 && simulation.elapsedDays < 0.5 && savedScenarios.length === 0}
            onClick={() => setIsViewingComparisonIn3D((v) => !v)}
            title={`Alternar entre "${activeComparisonScenario.label}" e o cenário atual no mesmo enquadramento 3D`}
          >
            <Icon name="compare" />
            <span className="hide-tablet">{isViewingComparisonIn3D ? 'Vendo referência' : 'Comparar'}</span>
          </button>

          <button
            type="button"
            className={`topbar-drawer-btn ${envDrawerOpen ? 'active' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={envDrawerOpen}
            onClick={() => {
              setEnvDrawerOpen((open) => {
                const next = !open;
                if (next) {
                  setEvidenceOpen(false);
                  setIndicatorPickerOpen(false);
                }
                return next;
              });
            }}
          >
            <Icon name="sliders" />
            <span>Ajustar</span>
            {activeFactorIds.length > 0 && (
              <em className="drawer-count-badge">{activeFactorIds.length}</em>
            )}
            <Icon name="chevronDown" className="menu-caret" />
          </button>

          <button
            type="button"
            className={`topbar-drawer-btn ${evidenceOpen ? 'active' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={evidenceOpen}
            onClick={() => {
              setEvidenceOpen((open) => {
                const next = !open;
                if (next) {
                  setEnvDrawerOpen(false);
                  setIndicatorPickerOpen(false);
                }
                return next;
              });
            }}
          >
            <Icon name="chart" />
            <span>Evidências</span>
            {savedScenarios.length > 0 && (
              <em className="drawer-count-badge">{savedScenarios.length}</em>
            )}
            <Icon name="chevronDown" className="menu-caret" />
          </button>
        </div>
      </header>

      {/* ÁREA DE TRABALHO PRINCIPAL: RECIFE 3D EM TELA CHEIA (100%) + MENUS SUSPENSOS */}
      <main className="lab-workspace">
        <section className="reef-stage" aria-label="Recife 3D da Baía de Todos-os-Santos">
          <div
            className="reef-canvas-frame"
            onPointerDown={(e) => {
              const tag = (e.target as HTMLElement | null)?.tagName;
              if (tag === 'CANVAS') {
                if (indicatorPickerOpen) setIndicatorPickerOpen(false);
                if (envDrawerOpen) setEnvDrawerOpen(false);
                if (evidenceOpen) setEvidenceOpen(false);
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
              <MarineScene state={displayedSceneState} resetToken={resetToken} />
            </Suspense>

            {/* Banner explícito quando estiver comparando o estado de referência/cenário salvo no 3D */}
            {isViewingComparisonIn3D && (
              <div className="comparison-3d-banner" role="status">
                <div>
                  <strong>Comparação Antes / Depois ativa:</strong> exibindo{' '}
                  <em>{activeComparisonScenario.label}</em> ({formatSimulatedTime(activeComparisonScenario.savedAtDay)}) no mesmo enquadramento.
                </div>
                <button
                  type="button"
                  onClick={() => setIsViewingComparisonIn3D(false)}
                >
                  Voltar ao cenário atual
                </button>
              </div>
            )}

            {/* FAIXA SUPERIOR DISCRETA: APENAS 2–3 INDICADORES PERTINENTES AO CENÁRIO + MENU SUSPENSO INDICADORES */}
            <div className="contextual-telemetry-bar" aria-label="Indicadores pertinentes à investigação">
              <div className="telemetry-pills">
                {visibleIndicatorIds.map((indId) => {
                  const view = indicatorViews[indId];
                  return (
                    <button
                      key={view.id}
                      type="button"
                      className={`telemetry-pill tone-${view.tone}`}
                      title={`${view.tooltip} (Clique para abrir gráficos e método em Evidências)`}
                      onClick={() => {
                        setEnvDrawerOpen(false);
                        setIndicatorPickerOpen(false);
                        setEvidenceOpen(true);
                        setEvidenceTab('evolution');
                      }}
                    >
                      <div className="telemetry-pill-head">
                        <span className="telemetry-label">{view.label}</span>
                        <span className="telemetry-origin">{view.originLabel}</span>
                      </div>
                      <div className="telemetry-pill-main">
                        <strong>{view.valueText}</strong>
                        <span className="telemetry-unit">{view.unitText}</span>
                        <span className={`telemetry-status-text tone-${view.tone}`}>{view.statusText}</span>
                      </div>
                    </button>
                  );
                })}

                {oilContextConcentration !== null && focusedFactor === 'oil' && (
                  <button
                    type="button"
                    className={`telemetry-pill tone-${oilContextConcentration >= 10 ? 'critical' : oilContextConcentration >= 3 ? 'watch' : 'healthy'}`}
                    onClick={() => {
                      setEnvDrawerOpen(false);
                      setIndicatorPickerOpen(false);
                      setEvidenceOpen(true);
                      setEvidenceTab('evolution');
                    }}
                    title="Fração dissolvida biodisponível de hidrocarbonetos policíclicos aromáticos (modelo de 4 caixas)"
                  >
                    <div className="telemetry-pill-head">
                      <span className="telemetry-label">HPA dissolvido (tPAH50)</span>
                      <span className="telemetry-origin">Simulação</span>
                    </div>
                    <div className="telemetry-pill-main">
                      <strong>{oilContextConcentration.toFixed(2).replace('.', ',')}</strong>
                      <span className="telemetry-unit">µg/L</span>
                      <span className="telemetry-status-text">
                        {oilContextConcentration >= 10 ? 'Acima de EC50' : 'Subletal'}
                      </span>
                    </div>
                  </button>
                )}

                {criticalDays !== null && !isViewingComparisonIn3D && (
                  <div
                    className="critical-threshold-pill"
                    title="Convenção didática interna (índice global ≤ 33/100). Não representa previsão de extinção de populações naturais."
                  >
                    <small>Tempo estimado até o limiar crítico do modelo</small>
                    <strong>~{formatSimulatedTime(criticalDays)}</strong>
                  </div>
                )}

                <div className="telemetry-customize-wrap">
                  <button
                    type="button"
                    className={`telemetry-picker-btn ${indicatorPickerOpen ? 'active' : ''}`}
                    aria-haspopup="dialog"
                    aria-expanded={indicatorPickerOpen}
                    onClick={() => {
                      setIndicatorPickerOpen((v) => {
                        const next = !v;
                        if (next) {
                          setEnvDrawerOpen(false);
                          setEvidenceOpen(false);
                        }
                        return next;
                      });
                    }}
                    title="Escolher quais indicadores acompanhar na cena"
                  >
                    <span>Indicadores</span>
                    <Icon name="chevronDown" className="menu-caret" />
                  </button>

                  {indicatorPickerOpen && (
                    <div className="telemetry-picker-popover" role="dialog" aria-label="Escolher indicadores visíveis">
                      <div className="picker-popover-head">
                        <strong>Acompanhar na tela (até 4)</strong>
                        {pinnedIndicators && (
                          <button
                            type="button"
                            className="picker-auto-btn"
                            onClick={() => setPinnedIndicators(null)}
                          >
                            Automático por variável
                          </button>
                        )}
                      </div>
                      <div className="picker-options">
                        {ALL_CONTEXTUAL_INDICATOR_IDS.map((id) => {
                          const checked = visibleIndicatorIds.includes(id);
                          return (
                            <label key={id} className="picker-option-row">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePinnedIndicator(id)}
                              />
                              <span>{INDICATOR_SHORT_NAMES[id]}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RODAPÉ CONTEXTUAL DISCRETO: RELAÇÃO CAUSAL DO MODELO */}
            {activeCausalFactor && !isViewingComparisonIn3D && (
              <div className="causal-chain-strip" aria-live="polite">
                <span className="causal-kicker">Mecanismo no modelo:</span>
                <span className="causal-text">{ITEM_DEFINITIONS[activeCausalFactor].causalChain}</span>
                {activeFactorIds.length > 1 && (
                  <span
                    className="multi-var-tag"
                    title="Para isolar a causa de uma mudança, altere uma variável por vez ou compare cenários"
                  >
                    {activeFactorIds.length} variáveis alteradas
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* MENU SUSPENSO: AJUSTAR AMBIENTE (SOBREPOSTO, SEM EMPURRAR A CENA 3D) */}
        <EnvironmentDrawer
          open={envDrawerOpen}
          onClose={() => setEnvDrawerOpen(false)}
          simulation={simulation}
          focusedFactor={focusedFactor}
          onAdjustFactor={handleAdjustFactor}
          onCommitFactor={handleCommitFactor}
          onResetSingleFactor={handleResetSingleFactor}
          onSewageModeChange={handleSewageModeChange}
          onTriggerSewagePulse={handleTriggerSewagePulse}
        />

        {/* MENU SUSPENSO: EVIDÊNCIAS, GRÁFICOS, COMPARAÇÃO E ORIGEM DOS DADOS */}
        <EvidenceDrawer
          open={evidenceOpen}
          tab={evidenceTab}
          onTabChange={setEvidenceTab}
          onClose={() => setEvidenceOpen(false)}
          simulation={simulation}
          oceanData={oceanData}
          referenceScenario={referenceScenario}
          savedScenarios={savedScenarios}
          activeComparisonId={activeComparisonId}
          onSelectComparisonId={setActiveComparisonId}
          isViewingComparisonIn3D={isViewingComparisonIn3D}
          onToggleViewComparisonIn3D={() => setIsViewingComparisonIn3D((v) => !v)}
          onSaveCurrentScenario={handleSaveCurrentScenario}
          onDeleteSavedScenario={handleDeleteSavedScenario}
          onApplySatelliteTemperature={handleApplySatelliteTemperature}
        />
      </main>

      <div
        className={`screen-transition-veil ${transitionDark ? 'active' : ''}`}
        aria-hidden="true"
      />
    </div>
  );
}
