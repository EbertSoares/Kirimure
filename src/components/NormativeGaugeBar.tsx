interface NormativeGaugeBarProps {
  id: string;
  value: number; // 0 a 100 ou mg/L
  display: string;
  unit?: string;
  rawOxygen?: number;
}

/**
 * Barra Normativa com Zonas Ecológicas Regulatórias (CONAMA 357 / NOAA).
 * Substitui barras lineares cinzas abstratas por faixas de referência científicas reais.
 */
export function NormativeGaugeBar({ id, value, display, rawOxygen }: NormativeGaugeBarProps) {
  if (id === 'oxygen' && rawOxygen !== undefined) {
    // Escala de Oxigênio: 0 a 8.0 mg/L
    const maxO2 = 8.0;
    const currentO2 = Math.max(0, Math.min(maxO2, rawOxygen));
    const needlePct = Math.max(2, Math.min(98, (currentO2 / maxO2) * 100));

    // Determina o status CONAMA
    const conamaClass = currentO2 >= 5.0
      ? 'Normóxia (Classe Especial / 1)'
      : currentO2 >= 3.0
        ? 'Estresse Subletal'
        : currentO2 >= 2.0
          ? 'Hipóxia Crítica'
          : 'Anóxia Letal';

    const conamaTone = currentO2 >= 5.0
      ? 'healthy'
      : currentO2 >= 3.0
        ? 'watch'
        : 'critical';

    return (
      <div className="normative-gauge" aria-label={`Oxigênio dissolvido: ${display} - ${conamaClass}`}>
        <div className="gauge-zones-container oxygen-zones">
          {/* 4 zonas ecológicas CONAMA */}
          <div className="gauge-zone zone-anoxia" style={{ width: '25%' }} title="0 a 2.0 mg/L: Anóxia Letal" />
          <div className="gauge-zone zone-hypoxia" style={{ width: '12.5%' }} title="2.0 a 3.0 mg/L: Hipóxia Crítica" />
          <div className="gauge-zone zone-stress" style={{ width: '25%' }} title="3.0 a 5.0 mg/L: Estresse Subletal" />
          <div className="gauge-zone zone-normoxia" style={{ width: '37.5%' }} title="> 5.0 mg/L: Normóxia Saudável" />

          {/* Agulha marcadora da leitura atual */}
          <div
            className={`gauge-needle tone-${conamaTone}`}
            style={{ left: `${needlePct}%` }}
            aria-hidden="true"
          >
            <span className="needle-head" />
          </div>
        </div>

        <div className="gauge-labels-row">
          <span className="gauge-tick-label">0</span>
          <span className="gauge-tick-label">2.0 <small>(anóxia)</small></span>
          <span className="gauge-tick-label">3.0</span>
          <span className="gauge-tick-label">5.0 <small>(normóxia)</small></span>
          <span className="gauge-tick-label">8.0 mg/L</span>
        </div>
      </div>
    );
  }

  // Medidor padrão de resiliência em 3 zonas (0 a 100%)
  const clampedVal = Math.max(0, Math.min(100, value));
  const tone = clampedVal >= 67 ? 'healthy' : clampedVal >= 34 ? 'watch' : 'critical';

  return (
    <div className="normative-gauge" aria-label={`Índice: ${display}`}>
      <div className="gauge-zones-container general-zones">
        <div className="gauge-zone zone-critical" style={{ width: '33.3%' }} title="0 a 33%: Faixa Crítica" />
        <div className="gauge-zone zone-watch" style={{ width: '33.3%' }} title="34 a 66%: Faixa de Alerta" />
        <div className="gauge-zone zone-healthy" style={{ width: '33.4%' }} title="67 a 100%: Faixa Saudável" />

        {/* Agulha marcadora da leitura atual */}
        <div
          className={`gauge-needle tone-${tone}`}
          style={{ left: `${Math.max(2, Math.min(98, clampedVal))}%` }}
          aria-hidden="true"
        >
          <span className="needle-head" />
        </div>
      </div>

      <div className="gauge-labels-row">
        <span className="gauge-tick-label">0 <small>(colapso)</small></span>
        <span className="gauge-tick-label">33</span>
        <span className="gauge-tick-label">67 <small>(segurança)</small></span>
        <span className="gauge-tick-label">100</span>
      </div>
    </div>
  );
}
