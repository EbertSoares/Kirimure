interface BrazilMapScreenProps {
  onSelectBahia: () => void;
}

const STATES = [
  ['RR', 'Roraima', 39, 8], ['AP', 'Amapá', 61, 12], ['AM', 'Amazonas', 29, 20],
  ['PA', 'Pará', 54, 23], ['AC', 'Acre', 16, 31], ['RO', 'Rondônia', 29, 35],
  ['TO', 'Tocantins', 54, 38], ['MA', 'Maranhão', 68, 31], ['PI', 'Piauí', 70, 40],
  ['CE', 'Ceará', 80, 37], ['RN', 'Rio Grande do Norte', 89, 40], ['PB', 'Paraíba', 88, 44],
  ['PE', 'Pernambuco', 85, 48], ['AL', 'Alagoas', 85, 52], ['SE', 'Sergipe', 81, 55],
  ['BA', 'Bahia', 70, 55], ['MT', 'Mato Grosso', 40, 46], ['GO', 'Goiás', 53, 53],
  ['DF', 'Distrito Federal', 57, 53], ['MS', 'Mato Grosso do Sul', 41, 60],
  ['MG', 'Minas Gerais', 62, 63], ['ES', 'Espírito Santo', 73, 65],
  ['RJ', 'Rio de Janeiro', 68, 71], ['SP', 'São Paulo', 55, 70], ['PR', 'Paraná', 50, 77],
  ['SC', 'Santa Catarina', 49, 84], ['RS', 'Rio Grande do Sul', 44, 92],
] as const;

export function BrazilMapScreen({ onSelectBahia }: BrazilMapScreenProps) {
  return (
    <main className="map-screen">
      <header className="kinimure-wordmark">
        <strong>Kinimurê</strong>
        <span>Laboratório Digital Marinho</span>
      </header>
      <section className="map-selection" aria-label="Mapa do Brasil com o cenário da Bahia disponível">
        <h1>Escolha um estado do Brasil</h1>
        <div className="brazil-map">
            <svg viewBox="0 0 520 600" aria-hidden="true" className="brazil-silhouette">
              <defs>
                <linearGradient id="brazilFill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#195a57" />
                  <stop offset=".55" stopColor="#103f43" />
                  <stop offset="1" stopColor="#0a2b31" />
                </linearGradient>
                <filter id="mapGlow"><feGaussianBlur stdDeviation="13" /></filter>
              </defs>
              <path className="map-glow" d="M168 32 258 48 302 83 382 92 443 150 466 215 431 277 421 345 371 395 350 465 294 551 235 516 218 442 174 407 148 337 91 303 63 235 86 169 120 128Z" />
              <path className="map-land" d="M168 32 258 48 302 83 382 92 443 150 466 215 431 277 421 345 371 395 350 465 294 551 235 516 218 442 174 407 148 337 91 303 63 235 86 169 120 128Z" />
              <path className="map-river" d="M132 151c82 32 103 82 168 103 51 16 85 11 126-4M222 74c-9 66 12 108 53 150" />
            </svg>
            {STATES.map(([code, name, x, y]) => {
              const available = code === 'BA';
              return (
                <button
                  type="button"
                  key={code}
                  className={`state-hotspot ${available ? 'available' : 'locked'}`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  onClick={available ? onSelectBahia : undefined}
                  disabled={!available}
                  aria-label={`${name}${available ? ', cenário disponível' : ', bloqueado'}`}
                  title={name}
                >
                  <span>{code}</span>
                  <small>{name}</small>
                </button>
              );
            })}
          </div>
      </section>
    </main>
  );
}
