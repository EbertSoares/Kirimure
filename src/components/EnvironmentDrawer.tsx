import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon, type IconName } from './Icons';
import {
  BTS_SECTORS,
  CONTROL_GROUPS,
  isMassLoadId,
  ITEM_DEFINITIONS,
} from '../simulation/config';
import {
  INTERVENTIONS,
  type InterventionDefinition,
  type InterventionId,
} from '../simulation/interventions';
import { isInterventionActive } from '../simulation/interventionModel';
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

interface FactorRowProps {
  id: ItemId;
  controlVal: number;
  envVal: number;
  targetVal: number;
  sewageMode: 'continuous' | 'pulse';
  focused: boolean;
  onAdjustFactor: (id: ItemId, value: number) => void;
  onCommitFactor: (id: ItemId) => void;
  onResetSingleFactor: (id: ItemId) => void;
  onSewageModeChange: (mode: 'continuous' | 'pulse') => void;
  onTriggerSewagePulse: (massKg: number) => void;
}

const FactorRow = memo(function FactorRow({
  id,
  controlVal,
  envVal,
  targetVal,
  sewageMode,
  focused,
  onAdjustFactor,
  onCommitFactor,
  onResetSingleFactor,
  onSewageModeChange,
  onTriggerSewagePulse,
}: FactorRowProps) {
  const item = ITEM_DEFINITIONS[id];
  const active = isFactorActive(id, controlVal);
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
    && Math.abs(targetVal - envVal) > (item.step || 1) * 0.35;

  return (
    <div
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
          <button
            type="button"
            className={`btn btn--quiet btn--icon param-reset-single ${active ? 'is-visible' : 'is-hidden'}`}
            onClick={() => onResetSingleFactor(id)}
            title={`Restaurar ${item.shortLabel}`}
            aria-label={`Restaurar ${item.shortLabel}`}
            tabIndex={active ? 0 : -1}
            aria-hidden={!active}
          >
            <Icon name="reset" />
          </button>
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
            const newProgress = ((raw - sliderMin) / (sliderMax - sliderMin)) * 100;
            e.currentTarget.parentElement?.style.setProperty('--progress', `${newProgress}%`);
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

      <div className={`param-preview-note ${isTransitioning ? 'is-visible' : 'is-empty'}`} aria-live="polite">
        <span className="param-preview-text">
          Na água agora: <strong>{displayedCurrent.value} {displayedCurrent.unit}</strong>
        </span>
      </div>
    </div>
  );
});

export const EnvironmentDrawer = memo(function EnvironmentDrawer({
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
  const [expandedGroups, setExpandedGroups] = useState<Record<ControlCategoryId, boolean>>({
    water: false,
    pollution: false,
    ecosystem: false,
  });

  const [recoveryExpanded, setRecoveryExpanded] = useState<boolean>(false);
  const [selectedLimitIntervention, setSelectedLimitIntervention] = useState<InterventionDefinition | null>(null);

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (focusedFactor) {
        const targetCategory = ITEM_DEFINITIONS[focusedFactor]?.category ?? 'water';
        setExpandedGroups({
          water: targetCategory === 'water',
          pollution: targetCategory === 'pollution',
          ecosystem: targetCategory === 'ecosystem',
        });
        setRecoveryExpanded(false);
      } else {
        setExpandedGroups({
          water: false,
          pollution: false,
          ecosystem: false,
        });
        setRecoveryExpanded(false);
      }
    }
    prevOpenRef.current = open;
  }, [open, focusedFactor]);

  const toggleGroup = (groupId: ControlCategoryId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const sectorDef = BTS_SECTORS.find((s) => s.id === simulation.sector) ?? BTS_SECTORS[0];
  const controls = simulation.controls;
  const sewageMode = simulation.sewageDischargeMode;

  const hasActiveInterventions = (simulation.activeInterventions?.length ?? 0) > 0;
  const activeInterventionsCount = simulation.activeInterventions?.length ?? 0;
  const firstMilestoneCrossing = timelineMilestones?.find((m) => m.firstCrossingDay !== null && m.firstCrossingDay > 0);

  if (!open) return null;

  return (
    <aside
      className="env-drawer"
      role="dialog"
      aria-label="Manipular condições ambientais"
    >
      <header className="env-drawer-header">
        <div>
          <h2 className="env-drawer-title">Manipular condições</h2>
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
                  {group.items.map((id) => (
                    <FactorRow
                      key={id}
                      id={id}
                      controlVal={controls[id]}
                      envVal={simulation.env[id]}
                      targetVal={simulation.targets[id]}
                      sewageMode={sewageMode}
                      focused={focusedFactor === id}
                      onAdjustFactor={onAdjustFactor}
                      onCommitFactor={onCommitFactor}
                      onResetSingleFactor={onResetSingleFactor}
                      onSewageModeChange={onSewageModeChange}
                      onTriggerSewagePulse={onTriggerSewagePulse}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <section
          className={`control-group recovery-group recovery-section ${recoveryExpanded ? 'is-open' : 'is-collapsed'}`}
          aria-label="Ações de recuperação ambiental"
        >
          <button
            type="button"
            className="control-group-trigger"
            aria-expanded={recoveryExpanded}
            aria-controls="group-panel-recovery"
            onClick={() => setRecoveryExpanded((prev) => !prev)}
          >
            <div className="control-group-heading">
              <span className="control-group-title">Recuperação</span>
              <span className="control-group-desc">Ações de mitigação para conter e reduzir impactos</span>
            </div>
            <div className="control-group-right">
              {activeInterventionsCount > 0 && (
                <span className="group-active-pill">
                  {activeInterventionsCount}
                </span>
              )}
              <span className={`group-chevron ${recoveryExpanded ? 'rotated' : ''}`} aria-hidden="true">
                <Icon name="chevronDown" />
              </span>
            </div>
          </button>

          {recoveryExpanded && (
            <div id="group-panel-recovery" className="control-group-items">
              {INTERVENTIONS.map((item) => {
                const active = isInterventionActive(simulation.activeInterventions, item.id);
                return (
                  <div
                    key={item.id}
                    className={`param-row recovery-param-row ${active ? 'is-active' : ''} ${!item.modeled ? 'is-conceptual' : ''}`}
                  >
                    <div className="param-row-top">
                      <div className="param-label">
                        <Icon name={item.icon as any} className="param-icon-svg" />
                        <span className="param-name">{item.title}</span>
                        {!item.modeled && (
                          <span
                            className="param-badge-conceptual"
                            title="Ação para reflexão pedagógica; não altera numericamente o modelo no momento"
                          >
                            Conceitual
                          </span>
                        )}
                      </div>

                      <div className="param-readout-group recovery-actions">
                        <button
                          type="button"
                          className="btn btn--quiet btn--compact recovery-limits-btn"
                          onClick={() => setSelectedLimitIntervention(item)}
                          title="Ver limite biofísico e operacional desta recuperação"
                          aria-label={`Ver limites de ${item.title}`}
                        >
                          Limites
                        </button>
                        <button
                          type="button"
                          className={`btn btn--compact recovery-toggle-btn ${active ? 'btn--primary' : 'btn--quiet'}`}
                          onClick={() => onToggleIntervention(item.id)}
                          aria-pressed={active}
                        >
                          {active ? 'Ativa' : 'Ativar'}
                        </button>
                      </div>
                    </div>

                    <div className="recovery-desc">
                      <span className="recovery-effect-label">{item.effectLabel}</span>
                      {active && (
                        <span className="recovery-status-active">
                          {' '}· {item.activeStatusLabel}
                        </span>
                      )}
                      {item.id === 'oilContainmentSkimming' && (simulation.recoveredOilKg ?? 0) > 0 && (
                        <span className="recovery-oil-skimmed">
                          {' '}· ({Math.round(simulation.recoveredOilKg!).toLocaleString('pt-BR')} kg recolhidos)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

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
            </div>
          )}
        </section>
      </div>

      {selectedLimitIntervention && (
        <div
          className="limits-modal-overlay"
          role="presentation"
          onClick={() => setSelectedLimitIntervention(null)}
        >
          <div
            className="floating-limits-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="limits-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="limits-modal-header">
              <div className="limits-modal-title-row">
                <Icon name={selectedLimitIntervention.icon as any} className="limits-modal-icon" />
                <div>
                  <h3 id="limits-modal-title" className="limits-modal-title">{selectedLimitIntervention.title}</h3>
                  <span className="limits-modal-target">Fator associado: {selectedLimitIntervention.targets.join(', ')} · Evidência: {selectedLimitIntervention.evidenceLabel}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn--quiet btn--icon"
                onClick={() => setSelectedLimitIntervention(null)}
                aria-label="Fechar limites"
                title="Fechar"
              >
                <Icon name="close" />
              </button>
            </header>

            <div className="limits-modal-body">
              <div className="limits-info-block">
                <h4>Efeito e mecanismo de mitigação</h4>
                <p><strong>{selectedLimitIntervention.effectLabel}:</strong> {selectedLimitIntervention.activeStatusLabel}</p>
              </div>

              <div className="limits-info-block highlight">
                <h4>Limite biológico e operacional</h4>
                <p>{selectedLimitIntervention.limitation}</p>
              </div>

              <div className="limits-info-grid">
                <div className="limits-mini-card">
                  <small>Dinâmica temporal</small>
                  <strong>{selectedLimitIntervention.timeframeNote}</strong>
                </div>
                <div className="limits-mini-card">
                  <small>Status nesta simulação</small>
                  <strong className={isInterventionActive(simulation.activeInterventions, selectedLimitIntervention.id) ? 'is-active-text' : ''}>
                    {isInterventionActive(simulation.activeInterventions, selectedLimitIntervention.id)
                      ? '✓ Ativa no recife'
                      : 'Inativa'}
                  </strong>
                </div>
              </div>

              <div className="limits-info-block ref">
                <h4>Evidência científica e literatura</h4>
                <p className="limits-ref-text">{selectedLimitIntervention.scientificBasis}</p>
              </div>
            </div>

            <footer className="limits-modal-footer">
              <button
                type="button"
                className={`btn ${isInterventionActive(simulation.activeInterventions, selectedLimitIntervention.id) ? 'btn--quiet' : 'btn--primary'}`}
                onClick={() => {
                  onToggleIntervention(selectedLimitIntervention.id);
                }}
              >
                {isInterventionActive(simulation.activeInterventions, selectedLimitIntervention.id)
                  ? 'Desativar recuperação'
                  : 'Ativar recuperação'}
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => setSelectedLimitIntervention(null)}
              >
                Fechar
              </button>
            </footer>
          </div>
        </div>
      )}
    </aside>
  );
});
