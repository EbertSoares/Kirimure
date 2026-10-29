import { useMemo } from 'react';
import type { SimulationState } from '../simulation/types';

interface EcosystemRadarProps {
  state: SimulationState;
  trophic: number;
}

interface AxisDef {
  label: string;
  value: number; // 0 a 100
  display: string;
}

/**
 * Radar Pentagonal de Vitalidade Ecosistêmica (Baía de Todos-os-Santos).
 * Síntese oceanográfica em 5 eixos que revela o equilíbrio funcional do recife.
 */
export function EcosystemRadar({ state, trophic }: EcosystemRadarProps) {
  const axes: AxisDef[] = useMemo(() => {
    // 1. Oxigênio dissolvido normalizado para 7.12 mg/L
    const o2Val = Math.max(0, Math.min(100, (state.dissolvedOxygen / 7.12) * 100));
    // 2. Balanço químico (pH marinho em torno de 8.1)
    const phVal = Math.max(0, Math.min(100, ((state.env.ph - 7.2) / (8.2 - 7.2)) * 100));
    // 3. Corais construtores
    const coralVal = Math.max(0, Math.min(100, state.health.coral));
    // 4. Fauna
    const fishVal = Math.max(0, Math.min(100, state.health.fish));
    // 5. Equilíbrio trófico
    const trophicVal = Math.max(0, Math.min(100, trophic));

    return [
      { label: 'Oxigenação', value: o2Val, display: `${state.dissolvedOxygen.toFixed(1)} mg/L` },
      { label: 'Balanço pH', value: phVal, display: `${state.env.ph.toFixed(2)}` },
      { label: 'Corais', value: coralVal, display: `${Math.round(coralVal)}%` },
      { label: 'Fauna', value: fishVal, display: `${Math.round(fishVal)}%` },
      { label: 'Teia Trófica', value: trophicVal, display: `${Math.round(trophicVal)}%` },
    ];
  }, [state.dissolvedOxygen, state.env.ph, state.health.coral, state.health.fish, trophic]);

  const cx = 110;
  const cy = 82;
  const maxR = 56;

  // Calcula coordenadas polares para ângulo e raio
  const getCoords = (idx: number, r: number) => {
    const angle = -Math.PI / 2 + idx * ((2 * Math.PI) / 5);
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  // Níveis de grade (25%, 50%, 75%, 100%)
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const gridPolygons = gridLevels.map((lvl) => {
    const r = maxR * lvl;
    return axes.map((_, i) => {
      const { x, y } = getCoords(i, r);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  });

  // Polígono dinâmico atual
  const currentPolygon = axes.map((ax, i) => {
    const r = maxR * (ax.value / 100);
    const { x, y } = getCoords(i, r);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Média de resiliência integrada dos 5 eixos
  const meanVitality = axes.reduce((sum, a) => sum + a.value, 0) / axes.length;
  const statusLabel = meanVitality >= 67
    ? 'Equilibrado'
    : meanVitality >= 34
      ? 'Sob Estresse'
      : 'Colapso';
  const statusTone = meanVitality >= 67 ? 'healthy' : meanVitality >= 34 ? 'watch' : 'critical';

  // Cores dinâmicas
  const strokeColor = statusTone === 'healthy' ? '#86C49A' : statusTone === 'watch' ? '#D7BD80' : '#D7867D';
  const fillColor = statusTone === 'healthy' ? 'rgba(134, 196, 154, 0.22)' : statusTone === 'watch' ? 'rgba(215, 189, 128, 0.22)' : 'rgba(215, 134, 125, 0.25)';

  return (
    <article className="ecosystem-radar-card" aria-label="Radar de Vitalidade Ecosistêmica">
      <header className="radar-header">
        <div>
          <span className="radar-title">Radar de Vitalidade Ecosistêmica</span>
          <small className="radar-subtitle">Baía de Todos-os-Santos · Síntese de 5 eixos</small>
        </div>
        <span className={`radar-pill tone-${statusTone}`}>
          {Math.round(meanVitality)}% · {statusLabel}
        </span>
      </header>

      <div className="radar-chart-container">
        <svg
          className="ecosystem-radar-svg"
          viewBox="0 0 220 166"
          width="100%"
          height="166"
          role="img"
          aria-label={`Radar de vitalidade do recife: índice médio de ${Math.round(meanVitality)}%`}
        >
          {/* Linhas de grade circulares/pentagonais */}
          {gridPolygons.map((poly, idx) => (
            <polygon
              key={idx}
              points={poly}
              fill="none"
              stroke="rgba(242, 244, 238, 0.14)"
              strokeWidth={idx === 3 ? '1.4' : '0.9'}
              strokeDasharray={idx === 3 ? undefined : '2 2'}
            />
          ))}

          {/* Eixos radiais */}
          {axes.map((_, i) => {
            const { x, y } = getCoords(i, maxR);
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={x.toFixed(1)}
                y2={y.toFixed(1)}
                stroke="rgba(242, 244, 238, 0.18)"
                strokeWidth="1"
              />
            );
          })}

          {/* Polígono da Baseline (100% de referência) */}
          <polygon
            points={gridPolygons[3]}
            fill="none"
            stroke="rgba(242, 244, 238, 0.30)"
            strokeWidth="1.2"
            strokeDasharray="3 3"
          />

          {/* Polígono dinâmico dos dados simulados */}
          <polygon
            points={currentPolygon}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />

          {/* Vértices e Rótulos */}
          {axes.map((ax, i) => {
            const vertex = getCoords(i, maxR * (ax.value / 100));
            const labelPos = getCoords(i, maxR + 13);
            return (
              <g key={i}>
                <circle
                  cx={vertex.x.toFixed(1)}
                  cy={vertex.y.toFixed(1)}
                  r="3.2"
                  fill="#ffffff"
                  stroke={strokeColor}
                  strokeWidth="1.6"
                />
                <text
                  x={labelPos.x.toFixed(1)}
                  y={labelPos.y.toFixed(1)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="radar-axis-label"
                >
                  {ax.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <footer className="radar-legend">
        {axes.map((ax, i) => (
          <div key={i} className="radar-legend-item">
            <span className="radar-legend-dot" />
            <span className="radar-legend-name">{ax.label}:</span>
            <strong>{ax.display}</strong>
          </div>
        ))}
      </footer>
    </article>
  );
}
