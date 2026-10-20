import { Icon } from './Icons';
import { PARAMETERS } from '../simulation/config';
import { getMessageById } from '../simulation/messages';
import { formatSimulatedTime, SIMULATION_SPEEDS } from '../simulation/time';
import type { SimulationSpeed, SimulationState } from '../simulation/types';

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
  const secondsPerDay = 1 / (PARAMETERS.daysPerRealSecond * state.speed);
  const scaledPace = secondsPerDay >= 1
    ? secondsPerDay.toFixed(1).replace('.', ',')
    : secondsPerDay.toFixed(2).replace('.', ',');

  return (
    <section className="timeline-bar" aria-label="Linha do tempo da simulação">
      <button
        type="button"
        className="pause-button"
        aria-pressed={state.paused}
        disabled={state.checkpoint?.locked ?? false}
        onClick={onTogglePause}
      >
        <Icon name={state.paused ? 'play' : 'pause'} />
        {state.checkpoint?.locked
          ? 'Encerrado'
          : state.checkpoint?.kind === 'critical'
            ? 'Continuar experimento'
            : state.paused ? 'Continuar' : 'Pausar'}
      </button>

      <div className="speed-control" aria-label="Velocidade da simulação">
        {SIMULATION_SPEEDS.map((speed) => (
          <button
            type="button"
            key={speed}
            className={state.speed === speed ? 'active' : ''}
            aria-pressed={state.speed === speed}
            disabled={state.checkpoint?.locked ?? false}
            onClick={() => onSpeed(speed)}
          >
            {speed}×
          </button>
        ))}
      </div>

      <div className="timeline-clock">
        <small>Tempo simulado</small>
        <strong>{formatSimulatedTime(state.elapsedDays)}</strong>
        <small className="clock-scale">1 dia ≈ {scaledPace} s</small>
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
