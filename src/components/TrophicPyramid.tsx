interface TrophicPyramidProps {
  coralHealth: number;
  fishHealth: number;
  algaeCoverage: number;
  trophicBalance: number;
  herbivoresHealth: number;
}

/**
 * Pirâmide Trófica de Guildas Funcionais da Baía de Todos-os-Santos.
 * Representação geométrica escalonada da transferência de energia e equilíbrio alimentar.
 */
export function TrophicPyramid({
  coralHealth,
  fishHealth,
  algaeCoverage,
  trophicBalance,
  herbivoresHealth,
}: TrophicPyramidProps) {
  // Estimativa de biomassa em cada guilda
  const apexHealth = Math.max(0, Math.min(100, fishHealth * 0.95));
  const carnivoreHealth = Math.max(0, Math.min(100, fishHealth * 1.05));
  const herbivoreVal = Math.max(0, Math.min(100, herbivoresHealth));
  const producersVal = Math.max(0, Math.min(100, (coralHealth + (100 - algaeCoverage)) / 2));

  const isEutrophied = algaeCoverage > 50;
  const isHealthy = trophicBalance >= 67;

  return (
    <article className="trophic-pyramid-card" aria-label="Pirâmide Trófica de Guildas">
      <header className="pyramid-header">
        <div>
          <span className="pyramid-title">Pirâmide Trófica Recifal</span>
          <small className="pyramid-subtitle">Guildas funcionais da Baía de Todos-os-Santos</small>
        </div>
        <span className={`pyramid-status-pill ${isHealthy ? 'healthy' : isEutrophied ? 'critical' : 'watch'}`}>
          {isHealthy ? 'Teia Equilibrada' : isEutrophied ? 'Eutrofização / Desbalanço' : 'Estresse Trófico'}
        </span>
      </header>

      <div className="pyramid-visual-container">
        {/* Nível 4: Apex Predators */}
        <div className="pyramid-tier tier-apex" style={{ width: '42%' }}>
          <div className="tier-content">
            <span className="tier-name">Topo · Tubarão-lixa <small>(Ginglymostoma)</small></span>
            <strong className="tier-val">{Math.round(apexHealth)}%</strong>
          </div>
          <div className="tier-fill" style={{ width: `${Math.max(4, apexHealth)}%` }} />
        </div>

        {/* Nível 3: Carnívoros e Onívoros */}
        <div className="pyramid-tier tier-carnivores" style={{ width: '60%' }}>
          <div className="tier-content">
            <span className="tier-name">Carnívoros & Onívoros <small>(Frade, Biquara)</small></span>
            <strong className="tier-val">{Math.round(carnivoreHealth)}%</strong>
          </div>
          <div className="tier-fill" style={{ width: `${Math.max(4, carnivoreHealth)}%` }} />
        </div>

        {/* Nível 2: Herbívoros Raspadores */}
        <div className="pyramid-tier tier-herbivores" style={{ width: '78%' }}>
          <div className="tier-content">
            <span className="tier-name">Herbívoros Raspadores <small>(Cirurgião, Papagaio)</small></span>
            <strong className="tier-val">{Math.round(herbivoreVal)}%</strong>
          </div>
          <div className="tier-fill" style={{ width: `${Math.max(4, herbivoreVal)}%` }} />
        </div>

        {/* Nível 1: Base de Produtores e Construtores */}
        <div className="pyramid-tier tier-producers" style={{ width: '96%' }}>
          <div className="tier-content">
            <span className="tier-name">Produtores & Construtores <small>(Zooxantelas / Corais)</small></span>
            <strong className="tier-val">{Math.round(producersVal)}%</strong>
          </div>
          <div className="tier-fill" style={{ width: `${Math.max(4, producersVal)}%` }} />
        </div>
      </div>

      <footer className="pyramid-footer-info">
        <div className="pyramid-metric">
          <small>Herbívoros raspando:</small>
          <strong>{Math.round(herbivoreVal)}%</strong>
        </div>
        <div className="pyramid-metric">
          <small>Algas competindo:</small>
          <strong className={algaeCoverage > 50 ? 'text-critical' : 'text-healthy'}>{Math.round(algaeCoverage)}%</strong>
        </div>
        <div className="pyramid-metric">
          <small>Equilíbrio trófico:</small>
          <strong className={trophicBalance >= 67 ? 'text-healthy' : 'text-watch'}>{Math.round(trophicBalance)}%</strong>
        </div>
      </footer>
    </article>
  );
}
