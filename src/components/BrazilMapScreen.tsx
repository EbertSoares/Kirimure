import { useEffect, useState, type KeyboardEvent } from 'react';
import { BRAZIL_STATES, BRAZIL_VIEWBOX } from './brazilStates.data';

interface BrazilMapScreenProps {
  onSelectBahia: () => void;
}

const AVAILABLE_CODE = 'BA';
const WARNING_DURATION = 3600;

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

export function BrazilMapScreen({ onSelectBahia }: BrazilMapScreenProps) {
  const [unavailable, setUnavailable] = useState<{ name: string; at: number } | null>(null);

  useEffect(() => {
    if (!unavailable) return;
    const timer = window.setTimeout(() => setUnavailable(null), WARNING_DURATION);
    return () => window.clearTimeout(timer);
  }, [unavailable]);

  const activate = (code: string, name: string) => {
    if (code === AVAILABLE_CODE) {
      onSelectBahia();
      return;
    }
    setUnavailable({ name, at: Date.now() });
  };

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>, code: string, name: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(code, name);
    }
  };

  return (
    <main className="map-screen">
      <header className="kirimure-wordmark">
        <strong>Kinimurê</strong>
        <span>Laboratório Digital Marinho</span>
      </header>

      <section className="map-selection" aria-label="Mapa do Brasil com o cenário da Bahia disponível">
        <h1>Escolha um estado do Brasil</h1>

        <div className="brazil-map">
          <svg
            viewBox={`0 0 ${BRAZIL_VIEWBOX.width} ${BRAZIL_VIEWBOX.height}`}
            className="brazil-map-svg"
            aria-label="Mapa do Brasil com a sigla de cada estado e a faixa costeira da Amazônia Azul destacada"
          >
            <title>Mapa interativo do Brasil. A Bahia possui um cenário disponível.</title>
            <g className="state-layer">
              {BRAZIL_STATES.map((state) => {
                const available = state.code === AVAILABLE_CODE;
                const coastal = COASTAL_STATES.has(state.code);
                const tone = available ? 'available' : coastal ? 'coastal' : 'locked';
                return (
                  <g
                    key={state.code}
                    className={`state ${tone}`}
                    role="button"
                    tabIndex={available ? 0 : -1}
                    aria-label={
                      available
                        ? `${state.name}, cenário disponível. Abrir a simulação`
                        : `${state.name}, cenário ainda não disponível`
                    }
                    onClick={() => activate(state.code, state.name)}
                    onKeyDown={(event) => handleKeyDown(event, state.code, state.name)}
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
      </section>

      {unavailable && (
        <div className="map-warning" role="alert" key={unavailable.at}>
          <strong>{unavailable.name} ainda não está disponível</strong>
          <p>Por enquanto, explore a Bahia — o cenário completo do recife.</p>
          <button type="button" onClick={() => setUnavailable(null)}>Entendi</button>
        </div>
      )}
    </main>
  );
}
