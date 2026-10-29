interface IndicatorProgressProps {
  label: string;
  value: number;
  tone?: 'good' | 'watch' | 'critical';
  tooltip?: string;
  onClick?: () => void;
}

export function IndicatorProgress({
  label,
  value,
  tone = 'good',
  tooltip,
  onClick,
}: IndicatorProgressProps) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <button
      type="button"
      className={`indicator-progress tone-${tone}`}
      onClick={onClick}
      aria-label={`${label}: ${percent} por cento. Abrir detalhes`}
      title={tooltip ?? `Saúde de ${label.toLocaleLowerCase()}.`}
    >
      <span className="indicator-progress__label">{label}</span>
      <span className="indicator-progress__value">{percent}%</span>
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
