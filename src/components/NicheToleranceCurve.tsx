interface NicheToleranceCurveProps {
  speciesLabel: string;
  currentStress: number; // 0 (sem estresse / ótimo) a 1 (estresse máximo letal)
  primaryStressor: string;
  sensitivityMultiplier: number;
}

/**
 * Curva de Tolerância Fisiológica de Nicho Ecológico (Gaussiana de Hutchinson).
 * Mostra visualmente se a espécie está operando em sua faixa ótima de conforto biológico
 * ou se atingiu o limiar de estresse fisiológico / mortalidade aguda.
 */
export function NicheToleranceCurve({
  speciesLabel,
  currentStress,
  primaryStressor,
  sensitivityMultiplier,
}: NicheToleranceCurveProps) {
  const width = 124;
  const height = 32;
  const padding = 2;

  // Curva de Gauss (nicho ecológico)
  // Pico no centro-esquerda (ótimo fisiológico) e decaimento exponencial sob estresse
  const points: { x: number; y: number }[] = [];
  const numSteps = 24;
  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    // Função Gaussiana deslocada para a esquerda
    const gaussian = Math.exp(-Math.pow((t - 0.22) * 2.8, 2));
    const x = padding + t * (width - padding * 2);
    const y = height - padding - gaussian * (height - padding * 2 - 2);
    points.push({ x, y });
  }

  const pathD = points.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x.toFixed(1)},${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`),
    '',
  );
  const areaD = `${pathD} L ${width - padding},${height} L ${padding},${height} Z`;

  // Posição da agulha atual na curva (0..1)
  const markerX = Math.max(padding + 2, Math.min(width - padding - 2, padding + currentStress * (width - padding * 2)));

  const zone = currentStress < 0.35
    ? 'conforto'
    : currentStress < 0.72
      ? 'estresse'
      : 'letal';

  const zoneText = zone === 'conforto'
    ? 'Faixa de Conforto Ótimo'
    : zone === 'estresse'
      ? `Estresse Fisiológico (${primaryStressor})`
      : `Colapso Agudo / Limiar Letal`;

  const markerColor = zone === 'conforto' ? '#86C49A' : zone === 'estresse' ? '#D7BD80' : '#D7867D';

  return (
    <div className="niche-curve-container" title={`${speciesLabel}: ${zoneText} (sensibilidade x${sensitivityMultiplier.toFixed(2)})`}>
      <div className="niche-curve-head">
        <small className="niche-title">Nicho Fisiológico:</small>
        <span className={`niche-badge ${zone}`}>{zoneText}</span>
      </div>

      <svg
        className="niche-curve-svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="niche-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#86C49A" stopOpacity="0.45" />
            <stop offset="45%" stopColor="#D7BD80" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#D7867D" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        <path d={areaD} fill="url(#niche-gradient)" />
        <path
          d={pathD}
          fill="none"
          stroke="rgba(242, 244, 238, 0.55)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Linha vertical de estresse atual */}
        <line
          x1={markerX.toFixed(1)}
          y1={padding}
          x2={markerX.toFixed(1)}
          y2={height - padding}
          stroke={markerColor}
          strokeWidth="1.8"
          strokeDasharray="2 1"
        />
        <circle
          cx={markerX.toFixed(1)}
          cy={padding + 3}
          r="2.5"
          fill={markerColor}
        />
      </svg>
    </div>
  );
}
