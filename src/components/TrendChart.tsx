import type { HistoryPoint } from '../simulation/types';

export interface TrendSeries {
  id: string;
  label: string;
  color: string;
  pick: (point: HistoryPoint) => number;
}

interface TrendChartProps {
  history: HistoryPoint[];
  series: TrendSeries[];
  compact?: boolean;
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

export function TrendChart({ history, series, compact = false }: TrendChartProps) {
  const width = 320;
  const height = compact ? 46 : 158;
  const padding = compact
    ? { top: 6, right: 3, bottom: 6, left: 3 }
    : { top: 12, right: 10, bottom: 24, left: 30 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const lastIndex = Math.max(1, history.length - 1);
  const toX = (index: number) => padding.left + (index / lastIndex) * plotWidth;
  const toY = (value: number) => padding.top + (1 - clamp(value) / 100) * plotHeight;
  const first = history[0];
  const last = history[history.length - 1];

  if (history.length < 2) {
    return (
      <div className={`trend-chart empty ${compact ? 'compact' : ''}`}>
        <p>A linha do tempo começa quando a simulação avança.</p>
      </div>
    );
  }

  return (
    <div className={`trend-chart ${compact ? 'compact' : ''}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolução dos indicadores ao longo do tempo simulado">
        {!compact && [0, 25, 50, 75, 100].map((value) => (
          <g key={value}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={toY(value)}
              y2={toY(value)}
              className="trend-grid"
            />
            <text x={padding.left - 6} y={toY(value) + 3.5} className="trend-axis-label" textAnchor="end">
              {value}
            </text>
          </g>
        ))}

        {series.map((item) => {
          const points = history
            .map((point, index) => `${toX(index).toFixed(2)},${toY(item.pick(point)).toFixed(2)}`)
            .join(' ');
          const area = `${padding.left},${toY(0)} ${points} ${toX(history.length - 1)},${toY(0)}`;

          return (
            <g key={item.id} style={{ color: item.color }}>
              {!compact && <polygon points={area} className="trend-area" />}
              <polyline points={points} className="trend-line" />
              <circle cx={toX(history.length - 1)} cy={toY(item.pick(last))} r={compact ? 2.4 : 3.4} className="trend-dot" />
            </g>
          );
        })}

        {!compact && (
          <>
            <text x={padding.left} y={height - 7} className="trend-axis-label">{`dia ${first.day}`}</text>
            <text x={width - padding.right} y={height - 7} className="trend-axis-label" textAnchor="end">
              {`dia ${last.day}`}
            </text>
          </>
        )}
      </svg>

      {!compact && (
        <ul className="trend-legend">
          {series.map((item) => (
            <li key={item.id} style={{ color: item.color }}>
              <i />{item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
