import React from 'react';
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
  // Configuração dimensional do SVG
  const width = 340;
  const height = 150;
  const paddingLeft = 32;
  const paddingRight = 14;
  const paddingTop = 16;
  const paddingBottom = 26;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Escala Y: Oxigênio Dissolvido de 0 a 8 mg/L
  const minY = 0;
  const maxY = 8.0;

  // Escala X: Dias de 0 até max(15, currentDay)
  const maxDay = Math.max(15, Math.ceil(currentDay));

  const getX = (day: number) => paddingLeft + (Math.max(0, day) / maxDay) * chartWidth;
  const getY = (val: number) => paddingTop + chartHeight - (Math.max(0, Math.min(maxY, val)) / (maxY - minY)) * chartHeight;
  const getYFish = (pct: number) => paddingTop + chartHeight - (Math.max(0, Math.min(100, pct)) / 100) * chartHeight;

  // Limiares ecológicos
  const yAdequate = getY(5.0);
  const yHypoxia = getY(2.0);

  // Amostragem de pontos para evitar excesso de nós no SVG
  const sampleStep = Math.max(1, Math.floor(history.length / 50));
  const points = history.filter((_, idx) => idx % sampleStep === 0 || idx === history.length - 1);

  // Geração do caminho do oxigênio
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

  // Geração do caminho da fauna (peixes)
  let fishPath = '';
  if (showFish && points.length > 0) {
    fishPath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.day).toFixed(1)} ${getYFish(p.fish).toFixed(1)}`)
      .join(' ');
  }

  // Estatísticas do ensaio
  const minObservedOxygen = history.reduce((min, p) => Math.min(min, p.dissolvedOxygen), 8.0);
  const hypoxiaDays = history.filter((p) => p.dissolvedOxygen < 2.0).length;

  return (
    <div className="oxygen-chart-wrapper" aria-label="Gráfico temporal de oxigênio dissolvido e resposta da fauna">
      <div className="oxygen-chart-header">
        <span className="oxygen-chart-title">Oxigênio vs. Tempo Simulado</span>
        <div className="oxygen-chart-legend">
          <span className="legend-item legend-oxygen">
            <i /> OD (mg/L)
          </span>
          {showFish && (
            <span className="legend-item legend-fish">
              <i /> Fauna (%)
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
            <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Linha de base e eixos */}
        <line
          x1={paddingLeft}
          y1={paddingTop + chartHeight}
          x2={width - paddingRight}
          y2={paddingTop + chartHeight}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="1"
        />
        <line
          x1={paddingLeft}
          y1={paddingTop}
          x2={paddingLeft}
          y2={paddingTop + chartHeight}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="1"
        />

        {/* Limiar de Nível Adequado (5,0 mg/L) */}
        <line
          x1={paddingLeft}
          y1={yAdequate}
          x2={width - paddingRight}
          y2={yAdequate}
          stroke="rgba(46, 208, 118, 0.6)"
          strokeDasharray="3 3"
          strokeWidth="1"
        />
        <text
          x={width - paddingRight}
          y={yAdequate - 3}
          textAnchor="end"
          fill="rgba(46, 208, 118, 0.9)"
          fontSize="9"
          fontWeight="600"
        >
          5,0 mg/L (Adequado)
        </text>

        {/* Limiar de Hipóxia Crítica (2,0 mg/L) */}
        <line
          x1={paddingLeft}
          y1={yHypoxia}
          x2={width - paddingRight}
          y2={yHypoxia}
          stroke="rgba(255, 82, 82, 0.6)"
          strokeDasharray="3 3"
          strokeWidth="1"
        />
        <text
          x={width - paddingRight}
          y={yHypoxia - 3}
          textAnchor="end"
          fill="rgba(255, 82, 82, 0.9)"
          fontSize="9"
          fontWeight="600"
        >
          2,0 mg/L (Hipóxia Crítica)
        </text>

        {/* Rótulos de Y */}
        <text x={paddingLeft - 4} y={getY(8) + 4} textAnchor="end" fill="rgba(255, 255, 255, 0.6)" fontSize="8.5">8</text>
        <text x={paddingLeft - 4} y={getY(5) + 4} textAnchor="end" fill="rgba(255, 255, 255, 0.6)" fontSize="8.5">5</text>
        <text x={paddingLeft - 4} y={getY(2) + 4} textAnchor="end" fill="rgba(255, 255, 255, 0.6)" fontSize="8.5">2</text>
        <text x={paddingLeft - 4} y={getY(0) + 1} textAnchor="end" fill="rgba(255, 255, 255, 0.6)" fontSize="8.5">0</text>

        {/* Rótulos de X (dias) */}
        <text x={getX(0)} y={height - 8} textAnchor="start" fill="rgba(255, 255, 255, 0.6)" fontSize="8.5">Dia 0</text>
        <text x={getX(maxDay / 2)} y={height - 8} textAnchor="middle" fill="rgba(255, 255, 255, 0.6)" fontSize="8.5">
          Dia {Math.round(maxDay / 2)}
        </text>
        <text x={getX(maxDay)} y={height - 8} textAnchor="end" fill="rgba(255, 255, 255, 0.6)" fontSize="8.5">
          Dia {maxDay}
        </text>

        {/* Área sombreada sob a curva de oxigênio */}
        {oxygenArea && <path d={oxygenArea} fill="url(#oxygenGrad)" />}

        {/* Curva de Fauna / Peixes */}
        {fishPath && (
          <path
            d={fishPath}
            fill="none"
            stroke="#a78bfa"
            strokeWidth="1.6"
            strokeDasharray="4 2"
            opacity="0.85"
          />
        )}

        {/* Curva de Oxigênio Dissolvido */}
        {oxygenPath && (
          <path
            d={oxygenPath}
            fill="none"
            stroke="#00e5ff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        )}

        {/* Ponto atual de oxigênio */}
        {points.length > 0 && (
          <g transform={`translate(${getX(currentDay)}, ${getY(currentOxygen)})`}>
            <circle r="4.5" fill="#00e5ff" stroke="#0e2234" strokeWidth="1.5" />
            <circle r="8" fill="none" stroke="#00e5ff" strokeWidth="1" opacity="0.6">
              <animate attributeName="r" values="4;9;4" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
      </svg>

      <div className="oxygen-chart-stats">
        <div className="chart-stat">
          <small>OD Mínimo:</small>
          <strong style={{ color: minObservedOxygen < 2.0 ? 'var(--critical)' : minObservedOxygen < 3.5 ? 'var(--watch)' : 'var(--healthy)' }}>
            {minObservedOxygen.toFixed(1)} mg/L
          </strong>
        </div>
        <div className="chart-stat">
          <small>Condição Atual:</small>
          <strong style={{ color: currentOxygen < 2.0 ? 'var(--critical)' : currentOxygen < 3.5 ? 'var(--watch)' : 'var(--healthy)' }}>
            {currentOxygen < 2.0 ? 'Hipóxia Severa' : currentOxygen < 3.5 ? 'Alerta / Estresse' : 'Oxigenação Adequada'}
          </strong>
        </div>
      </div>
    </div>
  );
}
