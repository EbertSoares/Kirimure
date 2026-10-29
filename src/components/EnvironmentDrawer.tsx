import { useMemo, useState, type CSSProperties } from 'react';
import { Icon, type IconName } from './Icons';
import {
  BTS_SECTORS,
  CONTROL_GROUPS,
  isMassLoadId,
  ITEM_DEFINITIONS,
} from '../simulation/config';
import {
  INTERVENTIONS,
  type InterventionId,
} from '../simulation/interventions';
import {
  getRecommendedInterventions,
  isInterventionActive,
} from '../simulation/interventionModel';
import { isFactorActive, type ImpactMilestone } from '../simulation/model';
import { formatSimulatedDuration } from '../simulation/time';
import type {
  ControlCategoryId,
  ItemId,
  SimulationState,
} from '../simulation/types';

export function formatParameterValue(id: ItemId, value: number, sewageMode: 'continuous' | 'pulse' = 'continuous'): {
  value: string;
  unit: string;
} {
  if (id === 'turbidity') {
    return {
      value: `${Math.round(value)}`,
      unit: '% índice',
    };
  }

  if (isMassLoadId(id)) {
    const qualifier = id === 'sewage'
      ? (sewageMode === 'pulse' ? 'DBO₅' : 'DBO₅/dia')
      : '';
    if (value >= 1000) {
      const tonnes = value / 1000;
      const formatted = new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: tonnes >= 10 ? 0 : 1,
      }).format(tonnes);
      return { value: formatted, unit: `t${qualifier ? ` ${qualifier}` : ''}` };
    }
    const formatted = new Intl.NumberFormat('pt-BR', {
      maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
    }).format(value);
    return { value: formatted, unit: `kg${qualifier ? ` ${qualifier}` : ''}` };
  }

  if (id === 'microplastics') {
    return {
      value: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(value)),
      unit: 'part./m³',
    };
  }

  if (id === 'temperature') {
    return {
      value: value.toFixed(1).replace('.', ','),
      unit: '°C',
    };
  }

  if (id === 'ph') {
    return {
      value: value.toFixed(2).replace('.', ','),
      unit: 'pH',
    };
  }

  return {
    value: `${Math.round(value)}`,
    unit: '%',
  };
}

function getFactorRiskTone(id: ItemId, value: number): 'natural' | 'watch' | 'critical' {
  const item = ITEM_DEFINITIONS[id];
  if (item.warning === undefined || !item.riskDirection) {
    return 'natural';
  }
  const isCritical = item.critical !== undefined && (
    item.riskDirection === 'above' ? value >= item.critical : value <= item.critical
  );
  if (isCritical) return 'critical';

  const isWarning = item.riskDirection === 'above' ? value >= item.warning : value <= item.warning;
  if (isWarning) return 'watch';

  return 'natural';
}

function getScaleTicks(id: ItemId): readonly string[] | null {
  if (id === 'sewage' || id === 'oil') {
    return ['0', '10 kg', '200 kg', '5 t', '100 t'];
  }
  if (id === 'microplastics') {
    return ['0', '500', '5,2 mil (média)', '35 mil'];
  }
  if (id === 'ph') {
    return ['7,70', '8,00', '8,10 (ref.)', '8,20'];
  }
  return null;
}

function findClosestScaleIndex(options: readonly number[], value: number): number {
  let bestIdx = 0;
  let bestDiff = Math.abs(options[0] - value);
  for (let i = 1; i < options.length; i += 1) {
    const diff = Math.abs(options[i] - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

interface EnvironmentDrawerProps {
  open: boolean;
  onClose: () => void;
  simulation: SimulationState;
  focusedFactor: ItemId | null;
  canUndo: boolean;
  onUndo: () => void;
  onResetToInitial: () => void;
  onAdjustFactor: (id: ItemId, value: number) => void;
  onCommitFactor: (id: ItemId) => void;
  onResetSingleFactor: (id: ItemId) => void;
  onSewageModeChange: (mode: 'continuous' | 'pulse') => void;
  onTriggerSewagePulse: (massKg: number) => void;
  onToggleIntervention: (id: InterventionId) => void;
  onOpenInterventionLimits: (id: InterventionId) => void;
  timelineMilestones?: ImpactMilestone[];
}

export function EnvironmentDrawer({
  open,
  onClose,
  simulation,
  focusedFactor,
  canUndo,
  onUndo,
  onResetToInitial,
  onAdjustFactor,
  onCommitFactor,
  onResetSingleFactor,
  onSewageModeChange,
  onTriggerSewagePulse,
  onToggleIntervention,
  onOpenInterventionLimits,
  timelineMilestones,
}: EnvironmentDrawerProps) {
  const initialCategory: ControlCategoryId = focusedFactor
    ? ITEM_DEFINITIONS[focusedFactor].category
    : 'water';

  const [expandedGroups, setExpandedGroups] = useState<Record<ControlCategoryId, boolean>>(() => ({
    water: initialCategory === 'water',
    pollution: initialCategory === 'pollution',
    ecosystem: false,
  }));

  const [showAllInterventions, setShowAllInterventions] = useState(false);

  const toggleGroup = (groupId: ControlCategoryId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const sectorDef = BTS_SECTORS.find((s) => s.id === simulation.sector) ?? BTS_SECTORS[0];
  const controls = simulation.controls;
  const sewageMode = simulation.sewageDischargeMode;

  const { recommended } = useMemo(
    () => getRecommendedInterventions(simulation),
    [simulation]
  );

  const displayedInterventions = showAllInterventions
    ? INTERVENTIONS
    : (recommended.length > 0 ? recommended : INTERVENTIONS.slice(0, 3));

  const hasActiveInterventions = (simulation.activeInterventions?.length ?? 0) > 0;
  const firstMilestoneCrossing = timelineMilestones?.find((m) => m.firstCrossingDay !== null && m.firstCrossingDay > 0);

  if (!open) return null;

  return (
    <aside
      className="env-drawer"
      role="dialog"
      aria-label="Ajustar condições ambientais"
    >
      <header className="env-drawer-header">
        <div>
          <h2 className="env-drawer-title">Condições ambientais</h2>
          <p className="env-drawer-subtitle">{sectorDef.label}</p>
        </div>
        <button
          type="button"
          className="btn btn--quiet btn--icon"
          onClick={onClose}
          aria-label="Fechar painel de condições ambientais"
          title="Fechar"
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="env-drawer-mobile-actions">
        <button
          type="button"
          className="btn btn--quiet"
          disabled={!canUndo}
          onClick={onUndo}
          title="Desfazer alteração"
        >
          <Icon name="undo" />
          <span>Desfazer</span>
        </button>
        <button
          type="button"
          className="btn btn--quiet"
          onClick={onResetToInitial}
          title="Restaurar estado inicial"
        >
          <Icon name="reset" />
          <span>Estado inicial</span>
        </button>
      </div>

      <div className="env-drawer-body">
        {CONTROL_GROUPS.map((group) => {
          const isExpanded = expandedGroups[group.id];
          const activeCount = group.items.filter((id) => isFactorActive(id, controls[id])).length;

          return (
            <section key={group.id} className={`control-group ${isExpanded ? 'is-open' : 'is-collapsed'}`}>
              <button
                type="button"
                className="control-group-trigger"
                aria-expanded={isExpanded}
                aria-controls={`group-panel-${group.id}`}
                onClick={() => toggleGroup(group.id)}
              >
                <div className="control-group-heading">
                  <span className="control-group-title">{group.label}</span>
                  <span className="control-group-desc">{group.subtitle}</span>
                </div>
                <div className="control-group-right">
                  {activeCount > 0 && (
                    <span className="group-active-pill">
                      {activeCount}
                    </span>
                  )}
                  <span className={`group-chevron ${isExpanded ? 'rotated' : ''}`} aria-hidden="true">
                    <Icon name="chevronDown" />
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div id={`group-panel-${group.id}`} className="control-group-items">
                  {group.items.map((id) => {
                    const item = ITEM_DEFINITIONS[id];
                    const controlVal = controls[id];
                    const envVal = simulation.env[id];
                    const active = isFactorActive(id, controlVal);
                    const focused = focusedFactor === id;
                    const scaleOptions = item.scaleOptions;

                    const displayedTarget = formatParameterValue(id, controlVal, sewageMode);
                    const displayedCurrent = formatParameterValue(id, envVal, sewageMode);
                    const riskTone = getFactorRiskTone(id, controlVal);
                    const ticks = getScaleTicks(id);

                    const sliderMin = scaleOptions ? 0 : item.min;
                    const sliderMax = scaleOptions ? scaleOptions.length - 1 : item.max;
                    const sliderStep = scaleOptions ? 1 : item.step;
                    const sliderValue = scaleOptions
                      ? findClosestScaleIndex(scaleOptions, controlVal)
                      : controlVal;

                    const progress = ((sliderValue - sliderMin) / (sliderMax - sliderMin)) * 100;
                    const warningPos = item.warning !== undefined
                      ? (scaleOptions
                        ? (findClosestScaleIndex(scaleOptions, item.warning) / (scaleOptions.length - 1)) * 100
                        : ((item.warning - item.min) / (item.max - item.min)) * 100)
                      : null;

                    const isTransitioning = active
                      && id !== 'oil'
                      && !(id === 'sewage' && sewageMode === 'pulse')
                      && Math.abs(simulation.targets[id] - envVal) > (item.step || 1) * 0.35;

                    return (
                      <div
                        key={id}
                        className={`param-row risk-${riskTone} ${active ? 'is-active' : ''} ${focused ? 'is-focused' : ''}`}
                      >
                        <div className="param-row-top">
                          <label
                            className="param-label"
                            htmlFor={`param-${id}`}
                            title={item.reference ?? item.label}
                          >
                            <Icon name={item.icon as IconName} className="param-icon-svg" />
                            <span className="param-name">{item.shortLabel}</span>
                          </label>

                          <div className="param-readout-group">
                            <output className="param-output" htmlFor={`param-${id}`}>
                              <strong>{displayedTarget.value}</strong>
                              <small>{displayedTarget.unit}</small>
                            </output>
                            {active && (
                              <button
                                type="button"
                                className="btn btn--quiet btn--icon param-reset-single"
                                onClick={() => onResetSingleFactor(id)}
                                title={`Restaurar ${item.shortLabel}`}
                                aria-label={`Restaurar ${item.shortLabel}`}
                              >
                                <Icon name="reset" />
                              </button>
                            )}
                          </div>
                        </div>

                        {id === 'sewage' && (
                          <div className="sewage-mode-switch" role="group" aria-label="Regime de lançamento de esgoto">
                            <button
                              type="button"
                              className={sewageMode === 'continuous' ? 'active' : ''}
                              aria-pressed={sewageMode === 'continuous'}
                              onClick={() => onSewageModeChange('continuous')}
                            >
                              Contínuo
                            </button>
                            <button
                              type="button"
                              className={sewageMode === 'pulse' ? 'active' : ''}
                              aria-pressed={sewageMode === 'pulse'}
                              onClick={() => onSewageModeChange('pulse')}
                            >
                              Pulso único
                            </button>
                          </div>
                        )}

                        <div
                          className="param-slider-track"
                          style={{
                            '--progress': `${progress}%`,
                            '--threshold': warningPos !== null ? `${warningPos}%` : '0%',
                          } as CSSProperties}
                        >
                          <input
                            id={`param-${id}`}
                            type="range"
                            min={sliderMin}
                            max={sliderMax}
                            step={sliderStep}
                            value={sliderValue}
                            aria-label={`${item.label}: ${displayedTarget.value} ${displayedTarget.unit}`}
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              const resolved = scaleOptions ? scaleOptions[raw] : raw;
                              onAdjustFactor(id, resolved);
                            }}
                            onPointerUp={() => onCommitFactor(id)}
                            onKeyUp={() => onCommitFactor(id)}
                          />
                          {warningPos !== null && (
                            <i
                              className="param-warning-tick"
                              aria-hidden="true"
                              title={`Limiar: ${item.warning}`}
                            />
                          )}
                        </div>

                        {ticks && (
                          <div className="param-scale-ticks" aria-hidden="true">
                            {ticks.map((tick) => (
                              <span key={tick}>{tick}</span>
                            ))}
                          </div>
                        )}

                        {id === 'sewage' && sewageMode === 'pulse' && controlVal > 0 && (
                          <button
                            type="button"
                            className="btn btn--primary pulse-trigger-btn"
                            onClick={() => onTriggerSewagePulse(controlVal)}
                          >
                            <Icon name="drop" />
                            <span>Lançar pulso de {displayedTarget.value} {displayedTarget.unit}</span>
                          </button>
                        )}

                        {isTransitioning && (
                          <p className="param-preview-note">
                            Na água agora: <strong>{displayedCurrent.value} {displayedCurrent.unit}</strong>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        <section className="recovery-section" aria-label="Ações de recuperação ambiental">
          <div className="recovery-section-header">
            <div className="recovery-title-group">
              <h3 className="recovery-section-title">Recuperação</h3>
              <p className="recovery-section-desc">Ações de mitigação para conter e reduzir impactos</p>
            </div>
            <button
              type="button"
              className="btn btn--quiet btn--compact see-all-toggle-btn"
              onClick={() => setShowAllInterventions((prev) => !prev)}
            >
              {showAllInterventions ? 'Ver recomendadas' : `Ver todas (${INTERVENTIONS.length})`}
            </button>
          </div>

          <div className="interventions-grid">
            {displayedInterventions.map((item) => {
              const active = isInterventionActive(simulation.activeInterventions, item.id);
              return (
                <article
                  key={item.id}
                  className={`intervention-card ${active ? 'is-active' : ''} ${!item.modeled ? 'is-conceptual' : ''}`}
                >
                  <div className="intervention-card-top">
                    <div className="intervention-title-row">
                      <Icon name={item.icon as any} className="intervention-icon" />
                      <h4 className="intervention-title">{item.title}</h4>
                    </div>
                    <div className="intervention-badges">
                      {active && <span className="intervention-badge is-active">Ativa</span>}
                      {!item.modeled && (
                        <span
                          className="intervention-badge is-conceptual"
                          title="Ação para reflexão pedagógica; não altera numericamente o modelo no momento"
                        >
                          Exploração conceitual
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="intervention-desc">{item.description}</p>
                  <p className="intervention-effect-line">
                    <strong>Efeito:</strong> {item.effectLabel}
                  </p>

                  <div className="intervention-actions">
                    <button
                      type="button"
                      className={`btn btn--compact ${active ? 'btn--primary' : 'btn--quiet'}`}
                      onClick={() => onToggleIntervention(item.id)}
                      aria-pressed={active}
                    >
                      {active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--quiet btn--compact"
                      onClick={() => onOpenInterventionLimits(item.id)}
                      title="Ver limites científicos e evidências no painel de Dados"
                    >
                      Ver limites
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="timeline-preview-strip">
            <div className="timeline-preview-row">
              <span className="timeline-preview-label">Primeiro efeito no modelo:</span>
              <span className="timeline-preview-val">
                {hasActiveInterventions
                  ? 'Imediato sobre o fluxo de novas entradas (~0–3 dias)'
                  : 'Sem intervenção ativa'}
              </span>
            </div>
            <div className="timeline-preview-row">
              <span className="timeline-preview-label">Recuperação do indicador:</span>
              <span className="timeline-preview-val">
                {firstMilestoneCrossing
                  ? `~${formatSimulatedDuration(firstMilestoneCrossing.firstCrossingDay!)} (${firstMilestoneCrossing.label})`
                  : 'Depuração gradual conforme hidrodinâmica'}
              </span>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}
