import { Icon } from './Icons';
import { TrendChart, type TrendSeries } from './TrendChart';
import { getMessageById } from '../simulation/messages';
import { formatSimulatedTime, SIMULATION_SPEEDS } from '../simulation/time';
import type { SimulationSpeed, SimulationState } from '../simulation/types';

const OVERALL_SERIES: TrendSeries[] = [
  { id: 'overall', label: 'Saúde geral', color: '#2ec2a4', pick: (point) => point.overall },
];

interface TimelineBarProps {
  state: SimulationState;
  onTogglePause: () => void;
  onSpeed: (speed: SimulationSpeed) => void;
  consoleOpen: boolean;
  onToggleConsole: () => void;
}

export function TimelineBar({
  state,
  onTogglePause,
  onSpeed,
  consoleOpen,
  onToggleConsole,
}: TimelineBarProps) {
  const lastEvent = state.events[state.events.length - 1];

  return (
    <section className="timeline-bar" aria-label="Linha do tempo da simulação">
      <button type="button" className="pause-button" aria-pressed={state.paused} onClick={onTogglePause}>
        <Icon name={state.paused ? 'play' : 'pause'} />
        {state.paused ? 'Continuar' : 'Pausar'}
      </button>

      <div className="speed-control" aria-label="Velocidade da simulação">
        {SIMULATION_SPEEDS.map((speed) => (
          <button
            type="button"
            key={speed}
            className={state.speed === speed ? 'active' : ''}
            aria-pressed={state.speed === speed}
            onClick={() => onSpeed(speed)}
          >
            {speed}×
          </button>
        ))}
      </div>

      <div className="timeline-clock">
        <small>Tempo simulado</small>
        <strong>{formatSimulatedTime(state.elapsedDays)}</strong>
      </div>

      <div className="timeline-spark" aria-hidden="true">
        <TrendChart history={state.history} series={OVERALL_SERIES} compact />
      </div>

      <div className="timeline-event">
        {lastEvent ? (
          <>
            <span className="event-day">dia {lastEvent.day}</span>
            <span className="event-title">{getMessageById(lastEvent.id).title}</span>
          </>
        ) : (
          <span className="event-title muted">Sem marcos registrados ainda</span>
        )}
      </div>

      <button type="button" className="console-toggle" onClick={onToggleConsole} aria-expanded={consoleOpen}>
        {consoleOpen ? 'Recolher controles ↓' : 'Abrir controles ↑'}
      </button>
    </section>
  );
}
