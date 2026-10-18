import { useEffect, useMemo, useState } from 'react';
import { Icon } from './components/Icons';
import { MarineScene } from './scene/MarineScene';
import { BASELINE, ITEM_DEFINITIONS, PARAMETERS } from './simulation/config';
import { buildTargets, createInitialState, tickSimulation } from './simulation/model';
import { evaluateMessages, getMessage } from './simulation/messages';
import type { Environment, ItemId } from './simulation/types';

type Category = 'elements' | 'phenomena';

const itemIds = Object.keys(ITEM_DEFINITIONS) as ItemId[];

function formatValue(id: ItemId, value: number) {
  if (id === 'temperature') return `${value.toFixed(1).replace('.0', '')}°C`;
  if (id === 'ph') return value.toFixed(2).replace(/0$/, '').replace('.', ',');
  return Math.round(value).toString();
}

function healthColor(value: number) {
  if (value >= 67) return 'green';
  if (value >= 34) return 'yellow';
  return 'red';
}

export function App() {
  const [activeCategory, setActiveCategory] = useState<Category>('elements');
  const [selected, setSelected] = useState<Set<ItemId>>(new Set());
  const [controls, setControls] = useState<Environment>({ ...BASELINE });
  const [simulation, setSimulation] = useState(createInitialState);
  const [helpItem, setHelpItem] = useState<ItemId | null>(null);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    const fixedStep = 1 / PARAMETERS.tickRate;

    const animate = (now: number) => {
      const elapsed = Math.min((now - previous) / 1000, 0.5);
      previous = now;
      accumulator += elapsed;

      if (accumulator >= fixedStep) {
        const steps = Math.min(Math.floor(accumulator / fixedStep), 5);
        accumulator -= steps * fixedStep;
        setSimulation((current) => {
          let next = current;
          for (let index = 0; index < steps; index += 1) {
            next = evaluateMessages(tickSimulation(next, fixedStep));
          }
          return next;
        });
      }

      frame = requestAnimationFrame(animate);
    };

    const handleVisibility = () => {
      previous = performance.now();
      accumulator = 0;
    };

    document.addEventListener('visibilitychange', handleVisibility);
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const currentMessage = useMemo(
    () => getMessage(simulation.latestMessageId),
    [simulation.latestMessageId],
  );

  const visibleItems = itemIds.filter(
    (id) => ITEM_DEFINITIONS[id].category === activeCategory,
  );
  const selectedItems = itemIds.filter((id) => selected.has(id));

  const toggleItem = (id: ItemId) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyChanges = () => {
    setSimulation((current) => ({
      ...current,
      targets: buildTargets(selected, controls),
    }));
  };

  const reset = () => {
    setSelected(new Set());
    setControls({ ...BASELINE });
    setSimulation(createInitialState());
    setHelpItem(null);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Icon name="waves" /></span>
          <div>
            <h1>Laboratório Digital Marinho</h1>
            <p>Simulação interativa de ecossistemas costeiros</p>
          </div>
        </div>
        <div className="header-help">
          <Icon name="info" />
          <span>Explore como diferentes fatores afetam a vida marinha na costa da Bahia.</span>
        </div>
        <button type="button" className="reset-button" onClick={reset}>
          <Icon name="reset" />
          Reiniciar simulação
        </button>
      </header>

      <main className="workspace">
        <section className="scene-card" aria-label="Visualização do recife">
          <MarineScene state={simulation} />
          <div className="location-badge">
            <Icon name="location" />
            <span><strong>Costa da Bahia</strong><small>Recife costeiro</small></span>
          </div>
          <div className="environment-readout" aria-label="Condições atuais">
            <span>{simulation.env.temperature.toFixed(1)}°C</span>
            <span>pH {simulation.env.ph.toFixed(2)}</span>
          </div>
          <div className="message-box" aria-live="polite">
            <span className="message-icon"><Icon name="info" /></span>
            <div>
              <strong>{currentMessage.title}</strong>
              <p>{currentMessage.text}</p>
            </div>
          </div>
        </section>

        <aside className="control-panel" aria-label="Controles da simulação">
          <div className="category-tabs" role="tablist" aria-label="Categorias">
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === 'elements'}
              className={activeCategory === 'elements' ? 'active elements' : ''}
              onClick={() => setActiveCategory('elements')}
            >
              <Icon name="leaf" /> Elementos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === 'phenomena'}
              className={activeCategory === 'phenomena' ? 'active phenomena' : ''}
              onClick={() => setActiveCategory('phenomena')}
            >
              <Icon name="waves" /> Fenômenos
            </button>
          </div>

          <div className="item-grid">
            {visibleItems.map((id) => {
              const item = ITEM_DEFINITIONS[id];
              const isSelected = selected.has(id);
              return (
                <button
                  type="button"
                  key={id}
                  className={`item-card ${isSelected ? `selected ${item.category}` : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => toggleItem(id)}
                >
                  <Icon name={item.icon} />
                  <span>{item.shortLabel}</span>
                  {isSelected && <span className="selection-check"><Icon name="check" /></span>}
                </button>
              );
            })}
          </div>

          <div className="sliders" aria-label="Intensidades selecionadas">
            {selectedItems.length === 0 && (
              <div className="empty-selection">
                <span><Icon name="leaf" /></span>
                <p>Escolha um fator acima para configurar a simulação.</p>
              </div>
            )}
            {selectedItems.map((id) => {
              const item = ITEM_DEFINITIONS[id];
              const progress = ((controls[id] - item.min) / (item.max - item.min)) * 100;
              return (
                <div className={`slider-card slider-${id}`} key={id}>
                  <div className="slider-heading">
                    <span className="slider-title"><Icon name={item.icon} /> {item.label}</span>
                    <span className="slider-actions">
                      <strong>{formatValue(id, controls[id])}</strong>
                      <button
                        type="button"
                        className="help-button"
                        aria-label={`Ajuda sobre ${item.label}`}
                        aria-expanded={helpItem === id}
                        onClick={() => setHelpItem(helpItem === id ? null : id)}
                      >?</button>
                    </span>
                  </div>
                  {helpItem === id && <p className="help-text">{item.help}</p>}
                  <input
                    type="range"
                    min={item.min}
                    max={item.max}
                    step={item.step}
                    value={controls[id]}
                    aria-label={`Intensidade de ${item.label}`}
                    style={{ '--progress': `${progress}%` } as React.CSSProperties}
                    onChange={(event) =>
                      setControls((current) => ({ ...current, [id]: Number(event.target.value) }))
                    }
                  />
                  <div className="range-labels"><span>{item.lowLabel}</span><span>{item.highLabel}</span></div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="apply-button"
            disabled={selected.size === 0}
            onClick={applyChanges}
          >
            <Icon name="play" /> Aplicar alterações
          </button>

          <section className="health-card" aria-labelledby="health-title">
            <div className="health-heading">
              <span><Icon name="leaf" /><strong id="health-title">Saúde do ecossistema</strong></span>
              <span className="help-button" aria-hidden="true">?</span>
            </div>
            {([
              ['Geral', simulation.overall, 'leaf'],
              ['Corais', simulation.health.coral, 'coral'],
              ['Peixes', simulation.health.fish, 'fish'],
            ] as const).map(([label, value, icon]) => (
              <div className="health-row" key={label}>
                <span className="health-label"><Icon name={icon} /> {label}</span>
                <span className="health-track">
                  <span className={`health-fill ${healthColor(value)}`} style={{ width: `${value}%` }} />
                </span>
                <strong className={healthColor(value)}>{Math.round(value)}%</strong>
              </div>
            ))}
          </section>

          <details className="science-sources">
            <summary>Base científica do modelo</summary>
            <p>Os efeitos foram simplificados para uso educativo. Tempo e intensidade não equivalem a medições de campo.</p>
            <ul>
              <li><a href="https://www.biotaneotropica.org.br/BN/article/view/418" target="_blank" rel="noreferrer">Branqueamento de corais na Bahia</a></li>
              <li><a href="https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2020.00179/full" target="_blank" rel="noreferrer">Ondas de calor em recifes brasileiros</a></li>
              <li><a href="https://coralreefwatch.noaa.gov/product/5km_v3.1_op/index_5km_dhw.php" target="_blank" rel="noreferrer">Calor acumulado e risco de branqueamento</a></li>
              <li><a href="https://www.noaa.gov/ocean-acidification" target="_blank" rel="noreferrer">Acidificação do oceano</a></li>
              <li><a href="https://marinedebris.noaa.gov/what-marine-debris/microplastics" target="_blank" rel="noreferrer">Microplásticos no ambiente marinho</a></li>
              <li><a href="https://www.noaa.gov/explainers/oil-spills-major-marine-ecosystem-threat" target="_blank" rel="noreferrer">Efeitos de derramamentos de óleo</a></li>
            </ul>
          </details>
        </aside>
      </main>
      <footer className="science-note">Modelo educativo simplificado · Exposição de semanas comprimida em segundos</footer>
    </div>
  );
}
