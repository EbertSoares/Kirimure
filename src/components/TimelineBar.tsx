import { Icon } from './Icons';
import { getMessageById } from '../simulation/messages';
import { formatSimulatedTime, SIMULATION_SPEEDS } from '../simulation/time';
import type { SimulationSpeed, SimulationState } from '../simulation/types';

interface TimelineBarProps {
  state: SimulationState;
  onTogglePause: () => void;
  onSpeed: (speed: SimulationSpeed) => void;
  criticalDays?: number | null;
}

export function TimelineBar({
  state,
  onTogglePause,
  onSpeed,
  criticalDays,
}: TimelineBarProps) {
  const lastEvent = state.events[state.events.length - 1];

  return (
    <aside className="scene-controls" aria-label="Controles da simulação">
      <div className="simulation-actions">
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
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {criticalDays !== undefined ? (
        <div className="timeline-event">
          <span className="event-day">tolerância</span>
          <span
            className="event-title"
            title="Limite de tolerância do cenário sob exposição constante Regra do Modelo:; não equivale a previsão de mortalidade em campo."
          >
            {criticalDays === null
              ? 'sem limite crítico em 10 anos'
              : `tolerância: ~${formatSimulatedTime(criticalDays)}`}
          </span>
        </div>
      ) : lastEvent && (
        <div className="timeline-event">
          <span className="event-day">dia {lastEvent.day}</span>
          <span className="event-title">{getMessageById(lastEvent.id).title}</span>
        </div>
      )}
    </aside>
  );
}
