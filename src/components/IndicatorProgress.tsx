interface IndicatorProgressProps {
  label: string;
  value: number;
  displayValue?: string;
  unit?: string;
  tone?: 'good' | 'watch' | 'critical';
  tooltip?: string;
  onClick?: () => void;
}

export function IndicatorProgress({
  label,
  value,
  displayValue,
  unit,
  tone = 'good',
  tooltip,
  onClick,
}: IndicatorProgressProps) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  const text = displayValue ?? `${percent}%`;

  return (
    <button
      type="button"
      className={`indicator-progress tone-${tone}`}
      onClick={onClick}
      aria-label={`${label}: ${text}${unit && !text.includes(unit) ? ` ${unit}` : ''}. Abrir detalhes`}
      title={tooltip ?? `${label}.`}
    >
      <span className="indicator-progress__label">{label}</span>
      <span className="indicator-progress__value">
        {text}
        {unit && !text.includes(unit) && <small className="indicator-progress__unit"> {unit}</small>}
      </span>
      <span
        className="indicator-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span
          className="indicator-progress__fill"
          style={{ width: `${percent}%` }}
        />
      </span>
    </button>
  );
}
