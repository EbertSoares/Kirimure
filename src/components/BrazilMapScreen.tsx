import type { KeyboardEvent } from 'react';
import { BRAZIL_STATES, BRAZIL_VIEWBOX } from './brazilStates.data';

interface BrazilMapScreenProps {
  onSelectBahia: () => void;
}

const AVAILABLE_CODE = 'BA';

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

export function BrazilMapScreen({ onSelectBahia }: BrazilMapScreenProps) {
  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectBahia();
    }
  };

  return (
    <main className="map-screen">
      <header className="kinimure-wordmark">
        <strong>Kinimurê</strong>
        <span>Laboratório Digital Marinho</span>
      </header>

      <section className="map-selection" aria-label="Mapa do Brasil com o cenário da Bahia disponível">
        <h1>Escolha um estado para explorar</h1>

        <div className="brazil-map">
          <svg
            viewBox={`0 0 ${BRAZIL_VIEWBOX.width} ${BRAZIL_VIEWBOX.height}`}
            className="brazil-map-svg"
            role="img"
            aria-label="Mapa do Brasil com a sigla de cada estado"
          >
            <g className="state-layer">
              {BRAZIL_STATES.map((state) => {
                const available = state.code === AVAILABLE_CODE;
                return (
                  <g
                    key={state.code}
                    className={`state ${available ? 'available' : 'locked'}`}
                    role={available ? 'button' : undefined}
                    tabIndex={available ? 0 : undefined}
                    aria-label={available ? `${state.name}, cenário disponível. Abrir a simulação` : undefined}
                    onClick={available ? onSelectBahia : undefined}
                    onKeyDown={available ? handleKeyDown : undefined}
                  >
                    <path className="state-shape" d={state.path} fillRule="evenodd" clipRule="evenodd">
                      <title>{`${state.name}${available ? ' — cenário disponível' : ''}`}</title>
                    </path>
                  </g>
                );
              })}
            </g>

            <g className="label-layer" aria-hidden="true">
              {BRAZIL_STATES.map((state) => {
                const adjustment = LABEL_ADJUSTMENTS[state.code] ?? {};
                return (
                  <text
                    key={state.code}
                    className={`state-label ${state.code === AVAILABLE_CODE ? 'available' : 'locked'}`}
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
      </section>
    </main>
  );
}
