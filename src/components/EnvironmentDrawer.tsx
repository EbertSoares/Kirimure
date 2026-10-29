import { useState, type CSSProperties } from 'react';
import { Icon, type IconName } from './Icons';
import {
  BASELINE,
  BTS_SECTORS,
  CONTROL_GROUPS,
  isMassLoadId,
  ITEM_DEFINITIONS,
} from '../simulation/config';
import { calculateEquilibriumOxygen } from '../simulation/oxygen';
import { calculateAlgae, isFactorActive, receivedLoadRange } from '../simulation/model';
import type {
  BtsSectorId,
  ControlCategoryId,
  Environment,
  ItemId,
  SimulationState,
} from '../simulation/types';

export function formatParameterValue(id: ItemId, value: number, sewageMode: 'continuous' | 'pulse' = 'continuous'): {
  value: string;
  unit: string;
} {
  const item = ITEM_DEFINITIONS[id];

  if (isMassLoadId(id)) {
    const qualifier = id === 'sewage'
      ? (sewageMode === 'pulse' ? 'DBO₅ (pulso)' : 'DBO₅/dia')
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

function getFactorRiskStatus(id: ItemId, value: number): {
  tone: 'natural' | 'watch' | 'critical';
  label: string;
} {
  const item = ITEM_DEFINITIONS[id];
  if (item.warning === undefined || !item.riskDirection) {
    return {
      tone: 'natural',
      label: value > 0 ? 'Manejo ativo' : 'Inativo (0%)',
    };
  }

  const isCritical = item.critical !== undefined && (
    item.riskDirection === 'above' ? value >= item.critical : value <= item.critical
  );
  if (isCritical) {
    return { tone: 'critical', label: 'Faixa crítica' };
  }

  const isWarning = item.riskDirection === 'above' ? value >= item.warning : value <= item.warning;
  if (isWarning) {
    return { tone: 'watch', label: 'Atenção' };
  }

  return { tone: 'natural', label: 'Referência' };
}

function getScaleTicks(id: ItemId): readonly string[] | null {
  if (id === 'sewage' || id === 'oil') {
    return ['0', '10 kg', '200 kg', '5 t', '100 t'];
  }
  if (id === 'microplastics') {
    return ['0', '500', '5,2 mil (média BTS)', '35 mil'];
  }
  if (id === 'ph') {
    return ['7,70 (+150% H⁺)', '8,00', '8,10 (ref.)', '8,20'];
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
  onAdjustFactor: (id: ItemId, value: number) => void;
  onCommitFactor: (id: ItemId) => void;
  onResetSingleFactor: (id: ItemId) => void;
  onSewageModeChange: (mode: 'continuous' | 'pulse') => void;
  onTriggerSewagePulse: (massKg: number) => void;
}

export function EnvironmentDrawer({
  open,
  onClose,
  simulation,
  focusedFactor,
  onAdjustFactor,
  onCommitFactor,
  onResetSingleFactor,
  onSewageModeChange,
  onTriggerSewagePulse,
}: EnvironmentDrawerProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<ControlCategoryId, boolean>>({
    water: true,
    pollution: true,
    ecosystem: false,
  });

  const toggleGroup = (groupId: ControlCategoryId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const sectorDef = BTS_SECTORS.find((s) => s.id === simulation.sector) ?? BTS_SECTORS[0];
  const controls = simulation.controls;
  const sewageMode = simulation.sewageDischargeMode;

  if (!open) return null;

  return (
    <aside
      className="env-drawer"
      aria-label="Ajustar condições ambientais"
    >
      <header className="env-drawer-header">
        <div>
          <h2 className="env-drawer-title">Ajustar ambiente</h2>
          <p className="env-drawer-subtitle">
            Manipulação direta · A resposta evolui no tempo do modelo
          </p>
        </div>
        <button
          type="button"
          className="icon-close-btn"
          onClick={onClose}
          aria-label="Recolher painel de ajustes"
          title="Recolher painel para ampliar o recife"
        >
          <Icon name="close" />
        </button>
      </header>

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
                    <span className="group-active-pill" title={`${activeCount} variável(is) alterada(s) neste grupo`}>
                      {activeCount} {activeCount === 1 ? 'ativo' : 'ativos'}
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
                    const displayedCurrent = formatParameterValue(
                      id,
                      id === 'oil' && envVal > 0 ? envVal : envVal,
                      sewageMode,
                    );
                    const risk = getFactorRiskStatus(id, controlVal);
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

                    // Prévia física coerente: diferencia o valor-alvo ajustado do estado em transição gradual no recife
                    const isTransitioning = active && Math.abs(simulation.targets[id] - envVal) > (item.step || 1) * 0.35;
                    const eqOxygenPreview = id === 'sewage' && sewageMode === 'continuous' && controlVal > 0
                      ? calculateEquilibriumOxygen(
                        { ...simulation.env, sewage: controlVal },
                        simulation.sector,
                        calculateAlgae(simulation.env, simulation.health),
                        'continuous_daily',
                      )
                      : null;

                    const oilRetainedRange = id === 'oil' && controlVal > 0
                      ? receivedLoadRange(controlVal, simulation.sector as BtsSectorId)
                      : null;

                    return (
                      <div
                        key={id}
                        className={`param-row risk-${risk.tone} ${active ? 'is-active' : ''} ${focused ? 'is-focused' : ''}`}
                      >
                        <div className="param-row-top">
                          <label className="param-label" htmlFor={`param-${id}`}>
                            <span className="param-icon" aria-hidden="true">
                              <Icon name={item.icon as IconName} />
                            </span>
                            <span className="param-name">
                              {id === 'sewage'
                                ? (sewageMode === 'pulse' ? 'Esgoto · Pulso DBO₅' : 'Esgoto · DBO₅ contínua')
                                : item.shortLabel}
                            </span>
                          </label>

                          <div className="param-readout-group">
                            <output className="param-output" htmlFor={`param-${id}`}>
                              <strong>{displayedTarget.value}</strong>
                              <small>{displayedTarget.unit}</small>
                            </output>
                            {active && (
                              <button
                                type="button"
                                className="param-reset-single"
                                onClick={() => onResetSingleFactor(id)}
                                title={`Restaurar ${item.shortLabel} para o valor de referência`}
                                aria-label={`Restaurar ${item.shortLabel} para referência`}
                              >
                                <Icon name="reset" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Seletor de regime contínuo vs. pulso isolado específico para Esgoto */}
                        {id === 'sewage' && (
                          <div className="sewage-mode-switch" role="group" aria-label="Regime de lançamento de esgoto">
                            <button
                              type="button"
                              className={sewageMode === 'continuous' ? 'active' : ''}
                              aria-pressed={sewageMode === 'continuous'}
                              onClick={() => onSewageModeChange('continuous')}
                            >
                              Contínuo (kg/dia)
                            </button>
                            <button
                              type="button"
                              className={sewageMode === 'pulse' ? 'active' : ''}
                              aria-pressed={sewageMode === 'pulse'}
                              onClick={() => onSewageModeChange('pulse')}
                            >
                              Pulso isolado (kg)
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
                            aria-label={`${item.label}: ${displayedTarget.value} ${displayedTarget.unit} (${risk.label})`}
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
                              title={`Limiar de atenção: ${item.warning}`}
                            />
                          )}
                        </div>

                        {/* Indicação explícita de escala logarítmica / não linear */}
                        {ticks && (
                          <div className="param-scale-ticks" aria-hidden="true">
                            {ticks.map((tick) => (
                              <span key={tick}>{tick}</span>
                            ))}
                          </div>
                        )}

                        <div className="param-meta-line">
                          <span className={`param-status-tag tone-${risk.tone}`}>
                            {risk.label}
                          </span>
                          {item.scaleBadge && (
                            <span className="param-scale-badge" title="Movimentos iguais no controle percorrem ordens de grandeza diferentes">
                              {item.scaleBadge}
                            </span>
                          )}
                          {!item.scaleBadge && item.reference && (
                            <span className="param-ref-text">{item.reference}</span>
                          )}
                        </div>

                        {/* Prévia imediata coerente com a dinâmica temporal gradual */}
                        {id === 'sewage' && sewageMode === 'pulse' && controlVal > 0 && (
                          <div className="pulse-action-box">
                            <button
                              type="button"
                              className="pulse-trigger-btn"
                              onClick={() => onTriggerSewagePulse(controlVal)}
                            >
                              <Icon name="drop" />
                              <span>
                                Despejar pulso de {displayedTarget.value} {displayedTarget.unit} agora
                              </span>
                            </button>
                            <small>
                              Injeta carga orgânica pontual na caixa de {(sectorDef.mixingVolumeM3 / 1e6).toFixed(0)}M m³; o OD cai nos primeiros dias e recupera por reaeração e maré.
                            </small>
                          </div>
                        )}

                        {eqOxygenPreview !== null && (
                          <p className="param-preview-note">
                            Prévia de equilíbrio do modelo: OD tende a{' '}
                            <strong>{eqOxygenPreview.toFixed(1).replace('.', ',')} mg/L</strong> com aporte contínuo.
                          </p>
                        )}

                        {oilRetainedRange !== null && (
                          <p className="param-preview-note">
                            Retido em 30 d neste setor ({sectorDef.retentionDescriptor}):{' '}
                            <strong>
                              {formatParameterValue('oil', oilRetainedRange.minimumKg).value}{' '}
                              {formatParameterValue('oil', oilRetainedRange.minimumKg).unit}–
                              {formatParameterValue('oil', oilRetainedRange.maximumKg).value}{' '}
                              {formatParameterValue('oil', oilRetainedRange.maximumKg).unit}
                            </strong>
                          </p>
                        )}

                        {isTransitioning && id !== 'oil' && !(id === 'sewage' && sewageMode === 'pulse') && (
                          <p className="param-preview-note">
                            No recife agora: <strong>{displayedCurrent.value} {displayedCurrent.unit}</strong> → evoluindo gradualmente até o alvo.
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
      </div>
    </aside>
  );
}
