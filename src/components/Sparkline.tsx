import { useId } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  min?: number;
  max?: number;
  stroke?: string;
  fill?: string;
  label?: string;
}

/**
 * Gráfico Sparkline vetorial SVG nativo de alto desempenho.
 */
export function Sparkline({
  data,
  width = 110,
  height = 26,
  min: userMin,
  max: userMax,
  stroke = '#86C49A',
  label,
}: SparklineProps) {
  const gradId = useId();

  if (!data || data.length < 2) {
    return (
      <span className="sparkline-placeholder" title="Aguardando evolução temporal">
        —
      </span>
    );
  }

  const padding = 3;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const dataMin = userMin !== undefined ? userMin : Math.min(...data);
  const dataMax = userMax !== undefined ? userMax : Math.max(...data);
  const range = dataMax - dataMin || 1;

  const points = data.map((val, idx) => {
    const norm = Math.max(0, Math.min(1, (val - dataMin) / range));
    const x = padding + (idx / (data.length - 1)) * innerW;
    const y = height - padding - norm * innerH;
    return { x, y, val };
  });

  const pathD = points.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x.toFixed(1)},${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`),
    '',
  );

  const lastPt = points[points.length - 1];
  const firstPt = points[0];
  const delta = lastPt.val - firstPt.val;
  const areaD = `${pathD} L ${width - padding},${height} L ${padding},${height} Z`;

  const trend = Math.abs(delta) < 0.5 ? 'stable' : delta > 0 ? 'up' : 'down';
  const trendSymbol = trend === 'stable' ? '→' : trend === 'up' ? '↗' : '↘';

  return (
    <div className="sparkline-wrapper" title={label ? `${label}: variação ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}` : undefined}>
      <svg
        className="sparkline-svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <path d={areaD} fill={`url(#${gradId})`} />
        <path
          d={pathD}
          fill="none"
          stroke={stroke}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle
          cx={lastPt.x}
          cy={lastPt.y}
          r="2.4"
          fill="#F2F4EE"
          stroke={stroke}
          strokeWidth="1.4"
        />
      </svg>
      <span className={`sparkline-trend ${trend}`}>{trendSymbol}</span>
    </div>
  );
}
