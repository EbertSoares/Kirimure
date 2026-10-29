import type { HistoryPoint } from '../simulation/types';

interface OxygenTrendChartProps {
  history: HistoryPoint[];
  currentOxygen: number;
  currentDay: number;
  showFish?: boolean;
}

export function OxygenTrendChart({
  history,
  currentOxygen,
  currentDay,
  showFish = true,
}: OxygenTrendChartProps) {
  const width = 340;
  const height = 150;
  const paddingLeft = 32;
  const paddingRight = 14;
  const paddingTop = 16;
  const paddingBottom = 26;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const minY = 0;
  const maxY = 8.0;
  const maxDay = Math.max(15, Math.ceil(currentDay));

  const getX = (day: number) => paddingLeft + (Math.max(0, day) / maxDay) * chartWidth;
  const getY = (val: number) => paddingTop + chartHeight - (Math.max(0, Math.min(maxY, val)) / (maxY - minY)) * chartHeight;
  const getYFish = (pct: number) => paddingTop + chartHeight - (Math.max(0, Math.min(100, pct)) / 100) * chartHeight;

  const yAdequate = getY(5.0);
  const yHypoxia = getY(2.0);

  const sampleStep = Math.max(1, Math.floor(history.length / 50));
  const points = history.filter((_, idx) => idx % sampleStep === 0 || idx === history.length - 1);

  let oxygenPath = '';
  let oxygenArea = '';
  if (points.length > 0) {
    oxygenPath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.day).toFixed(1)} ${getY(p.dissolvedOxygen).toFixed(1)}`)
      .join(' ');

    const firstX = getX(points[0].day).toFixed(1);
    const lastX = getX(points[points.length - 1].day).toFixed(1);
    const baseY = (paddingTop + chartHeight).toFixed(1);
    oxygenArea = `${oxygenPath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }

  let fishPath = '';
  if (showFish && points.length > 0) {
    fishPath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.day).toFixed(1)} ${getYFish(p.fish).toFixed(1)}`)
      .join(' ');
  }

  const minObservedOxygen = history.reduce((min, p) => Math.min(min, p.dissolvedOxygen), 8.0);

  return (
    <div className="oxygen-chart-wrapper" aria-label="Gráfico temporal de oxigênio dissolvido e resposta dos peixes">
      <div className="oxygen-chart-header">
        <span className="oxygen-chart-title">Oxigênio vs. tempo simulado</span>
        <div className="oxygen-chart-legend">
          <span className="legend-item legend-oxygen">
            <i /> OD (mg/L)
          </span>
          {showFish && (
            <span className="legend-item legend-fish">
              <i /> Peixes (%)
            </span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="oxygen-chart-svg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        <defs>
          <linearGradient id="oxygenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#86C49A" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#86C49A" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <line
          x1={paddingLeft}
          y1={paddingTop + chartHeight}
          x2={width - paddingRight}
          y2={paddingTop + chartHeight}
          stroke="rgba(242, 244, 238, 0.18)"
          strokeWidth="1"
        />
        <line
          x1={paddingLeft}
          y1={paddingTop}
          x2={paddingLeft}
          y2={paddingTop + chartHeight}
          stroke="rgba(242, 244, 238, 0.18)"
          strokeWidth="1"
        />

        <line
          x1={paddingLeft}
          y1={yAdequate}
          x2={width - paddingRight}
          y2={yAdequate}
          stroke="rgba(134, 196, 154, 0.55)"
          strokeDasharray="3 3"
          strokeWidth="1"
        />
        <text
          x={width - paddingRight}
          y={yAdequate - 3}
          textAnchor="end"
          fill="#86C49A"
          fontSize="9"
          fontWeight="600"
        >
          5,0 mg/L (adequado)
        </text>

        <line
          x1={paddingLeft}
          y1={yHypoxia}
          x2={width - paddingRight}
          y2={yHypoxia}
          stroke="rgba(215, 134, 125, 0.6)"
          strokeDasharray="3 3"
          strokeWidth="1"
        />
        <text
          x={width - paddingRight}
          y={yHypoxia - 3}
          textAnchor="end"
          fill="#D7867D"
          fontSize="9"
          fontWeight="600"
        >
          2,0 mg/L (hipóxia crítica)
        </text>

        <text x={paddingLeft - 4} y={getY(8) + 4} textAnchor="end" fill="rgba(242, 244, 238, 0.62)" fontSize="9">8</text>
        <text x={paddingLeft - 4} y={getY(5) + 4} textAnchor="end" fill="rgba(242, 244, 238, 0.62)" fontSize="9">5</text>
        <text x={paddingLeft - 4} y={getY(2) + 4} textAnchor="end" fill="rgba(242, 244, 238, 0.62)" fontSize="9">2</text>
        <text x={paddingLeft - 4} y={getY(0) + 1} textAnchor="end" fill="rgba(242, 244, 238, 0.62)" fontSize="9">0</text>

        <text x={getX(0)} y={height - 8} textAnchor="start" fill="rgba(242, 244, 238, 0.62)" fontSize="9">Dia 0</text>
        <text x={getX(maxDay / 2)} y={height - 8} textAnchor="middle" fill="rgba(242, 244, 238, 0.62)" fontSize="9">
          Dia {Math.round(maxDay / 2)}
        </text>
        <text x={getX(maxDay)} y={height - 8} textAnchor="end" fill="rgba(242, 244, 238, 0.62)" fontSize="9">
          Dia {maxDay}
        </text>

        {oxygenArea && <path d={oxygenArea} fill="url(#oxygenGrad)" />}

        {fishPath && (
          <path
            d={fishPath}
            fill="none"
            stroke="#BEDBC7"
            strokeWidth="1.6"
            strokeDasharray="4 2"
            opacity="0.88"
          />
        )}

        {oxygenPath && (
          <path
            d={oxygenPath}
            fill="none"
            stroke="#86C49A"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        )}

        {points.length > 0 && (
          <g transform={`translate(${getX(currentDay)}, ${getY(currentOxygen)})`}>
            <circle r="4" fill="#86C49A" stroke="#151815" strokeWidth="1.5" />
          </g>
        )}
      </svg>

      <div className="oxygen-chart-stats">
        <div className="chart-stat">
          <small>OD mínimo:</small>
          <strong style={{ color: minObservedOxygen < 2.0 ? 'var(--status-critical)' : minObservedOxygen < 3.5 ? 'var(--status-warning)' : 'var(--status-good)' }}>
            {minObservedOxygen.toFixed(1).replace('.', ',')} mg/L
          </strong>
        </div>
        <div className="chart-stat">
          <small>Estado:</small>
          <strong style={{ color: currentOxygen < 2.0 ? 'var(--status-critical)' : currentOxygen < 3.5 ? 'var(--status-warning)' : 'var(--status-good)' }}>
            {currentOxygen < 2.0 ? 'Hipóxia severa' : currentOxygen < 3.5 ? 'Atenção' : 'Adequado'}
          </strong>
        </div>
      </div>
    </div>
  );
}
