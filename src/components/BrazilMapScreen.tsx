import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { BrandLogo } from './BrandLogo';
import { BRAZIL_STATES, BRAZIL_VIEWBOX } from './brazilStates.data';

interface BrazilMapScreenProps {
  onSelectBahia: () => void;
  isZooming?: boolean;
  isReturning?: boolean;
}

const AVAILABLE_CODE = 'BA';
const WARNING_DURATION = 2500;

// Caixa delimitadora exata do estado da Bahia no viewBox 1100×1000:
// minX = 682.0, maxX = 901.3 (largura = 219.3, centro X = 791.65)
// minY = 369.0, maxY = 612.0 (altura = 243.0, centro Y = 490.50)
const BAHIA_BBOX = {
  centerX: 791.65,
  centerY: 490.5,
  width: 219.3,
  height: 243.0,
} as const;

// Faixa costeira do Brasil: os 17 estados que formam a fronteira da Amazônia
// Azul, a área marítima sob jurisdição brasileira.
const COASTAL_STATES = new Set([
  'AP', 'PA', 'MA',
  'PI', 'CE', 'RN', 'PB', 'PE', 'AL', 'SE', 'BA',
  'ES', 'RJ', 'SP',
  'PR', 'SC', 'RS',
]);

// Ajustes finos de legibilidade sobre as âncoras calculadas em
// scripts/build-brazil-map.mjs (estados pequenos e vizinhos no Nordeste).
const LABEL_ADJUSTMENTS: Record<string, { dx?: number; dy?: number; size?: number }> = {
  DF: { dx: -2, dy: 1, size: 13 },
  AL: { dx: 8, dy: -9, size: 15 },
  SE: { dx: -8, dy: 10, size: 15 },
  PE: { dy: 3, size: 16 },
  PB: { dy: 2, size: 15 },
  RN: { dy: -2, size: 15 },
  ES: { size: 16 },
  RJ: { size: 18 },
};

export function BrazilMapScreen({ onSelectBahia, isZooming = false, isReturning = false }: BrazilMapScreenProps) {
  const [unavailable, setUnavailable] = useState<{ name: string; at: number } | null>(null);
  const toastIdRef = useRef(0);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [zoomVars, setZoomVars] = useState<CSSProperties>({
    '--bahia-origin-x': '71.97%',
    '--bahia-origin-y': '49.05%',
    '--bahia-zoom-tx': '-148px',
    '--bahia-zoom-ty': '-36px',
    '--bahia-zoom-scale': '3.65',
  } as CSSProperties);

  const updateZoomMetrics = useCallback(() => {
    const container = mapContainerRef.current;
    if (!container || typeof window === 'undefined') return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // Respeita o preserveAspectRatio="xMidYMid meet" do viewBox 1100×1000
    const unit = Math.min(rect.width / BRAZIL_VIEWBOX.width, rect.height / BRAZIL_VIEWBOX.height);
    const renderW = BRAZIL_VIEWBOX.width * unit;
    const renderH = BRAZIL_VIEWBOX.height * unit;
    const offsetX = (rect.width - renderW) / 2;
    const offsetY = (rect.height - renderH) / 2;

    // Origem exata do centro geométrico da Bahia dentro da caixa do SVG
    const originX = offsetX + BAHIA_BBOX.centerX * unit;
    const originY = offsetY + BAHIA_BBOX.centerY * unit;

    // Posição atual do centro da Bahia na tela e vetor reto até o centro exato da viewport
    const bahiaScreenX = rect.left + originX;
    const bahiaScreenY = rect.top + originY;
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    const tx = viewportCenterX - bahiaScreenX;
    const ty = viewportCenterY - bahiaScreenY;

    // Escala proporcional para enquadrar a Bahia inteira centralizada na tela
    const bahiaWidthPx = BAHIA_BBOX.width * unit;
    const bahiaHeightPx = BAHIA_BBOX.height * unit;
    const targetSpan = Math.min(window.innerWidth, window.innerHeight) * 0.62;
    const rawScale = targetSpan / Math.max(bahiaWidthPx, bahiaHeightPx, 1);
    const scale = Math.max(3.0, Math.min(4.4, rawScale));

    setZoomVars({
      '--bahia-origin-x': `${originX.toFixed(2)}px`,
      '--bahia-origin-y': `${originY.toFixed(2)}px`,
      '--bahia-zoom-tx': `${tx.toFixed(2)}px`,
      '--bahia-zoom-ty': `${ty.toFixed(2)}px`,
      '--bahia-zoom-scale': scale.toFixed(3),
    } as CSSProperties);
  }, []);

  useLayoutEffect(() => {
    updateZoomMetrics();
    window.addEventListener('resize', updateZoomMetrics);
    return () => window.removeEventListener('resize', updateZoomMetrics);
  }, [updateZoomMetrics]);

  useEffect(() => {
    if (!unavailable) return;
    const timer = window.setTimeout(() => setUnavailable(null), WARNING_DURATION);
    return () => window.clearTimeout(timer);
  }, [unavailable]);

  const activate = (code: string, name: string) => {
    if (isZooming) return;
    if (code === AVAILABLE_CODE) {
      updateZoomMetrics();
      onSelectBahia();
      return;
    }
    toastIdRef.current += 1;
    setUnavailable({ name, at: toastIdRef.current });
  };

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>, code: string, name: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(code, name);
    }
  };

  return (
    <main className={`map-screen ${isZooming ? 'is-zooming' : ''} ${isReturning ? 'is-returning' : ''}`}>
      <header className="kirimure-wordmark">
        <BrandLogo />
      </header>

      <section className="map-selection" aria-label="Mapa do Brasil com o cenário da Bahia disponível">
        <h1>Escolha um estado para explorar</h1>

        <div
          ref={mapContainerRef}
          style={zoomVars}
          className={`brazil-map ${isZooming ? 'zooming-to-bahia' : ''} ${isReturning ? 'returning-from-bahia' : ''}`}
        >
          <svg
            viewBox={`0 0 ${BRAZIL_VIEWBOX.width} ${BRAZIL_VIEWBOX.height}`}
            className="brazil-map-svg"
            role="group"
            aria-label="Mapa do Brasil com a sigla de cada estado e a faixa costeira da Amazônia Azul destacada"
          >
            <g className="state-layer">
              {BRAZIL_STATES.map((state) => {
                const available = state.code === AVAILABLE_CODE;
                const coastal = COASTAL_STATES.has(state.code);
                const tone = available ? 'available' : coastal ? 'coastal' : 'locked';
                return (
                  <g
                    key={state.code}
                    className={`state ${tone}`}
                    role={available ? 'button' : undefined}
                    tabIndex={available ? 0 : undefined}
                    aria-label={available ? `${state.name}, cenário disponível. Abrir a simulação` : undefined}
                    onClick={() => activate(state.code, state.name)}
                    onKeyDown={available ? (event) => handleKeyDown(event, state.code, state.name) : undefined}
                  >
                    <path className="state-shape" d={state.path} fillRule="evenodd" clipRule="evenodd">
                      <title>
                        {`${state.name}${available ? ' — cenário disponível' : ' — ainda não disponível'}`}
                      </title>
                    </path>
                  </g>
                );
              })}
            </g>

            <g className="label-layer" aria-hidden="true">
              {BRAZIL_STATES.map((state) => {
                const adjustment = LABEL_ADJUSTMENTS[state.code] ?? {};
                const coastal = COASTAL_STATES.has(state.code);
                return (
                  <text
                    key={state.code}
                    className={`state-label ${state.code === AVAILABLE_CODE ? 'available' : coastal ? 'coastal' : 'locked'}`}
                    x={state.labelX + (adjustment.dx ?? 0)}
                    y={state.labelY + (adjustment.dy ?? 0)}
                    fontSize={adjustment.size ?? 20}
                  >
                    {state.code}
                  </text>
                );
              })}
            </g>
          </svg>
        </div>

        <ul className="map-legend" aria-label="Legenda do mapa">
          <li>
            <span className="legend-swatch available" aria-hidden="true" />
            Bahia (disponível)
          </li>
          <li>
            <span className="legend-swatch coastal" aria-hidden="true" />
            Amazônia Azul
          </li>
          <li>
            <span className="legend-swatch other" aria-hidden="true" />
            Demais regiões (Em breve)
          </li>
        </ul>
      </section>

      {unavailable && (
        <div className="map-discreet-toast" role="status" aria-live="polite" key={unavailable.at}>
          <span><strong>{unavailable.name}:</strong> Cenário em desenvolvimento. Selecione a Bahia para explorar a Baía de Todos-os-Santos.</span>
        </div>
      )}
    </main>
  );
}
