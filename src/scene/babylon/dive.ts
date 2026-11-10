/**
 * Máquina de estados pura da exploração vertical.
 *
 * A câmera nunca recebe cliques concorrentes: `toggle()` só inicia uma nova
 * transição quando o estado é `surface` ou `underwater`. O progresso é animado
 * com `easeInOutCubic`, que parte e termina devagar — sem velocidade linear
 * constante e sem corte seco ao chegar ao fundo.
 */

export type DiveState = 'surface' | 'descending' | 'underwater' | 'ascending';

/** Duração padrão da transição, dentro da faixa pedida de 3–5 s. */
export const DIVE_DURATION_SECONDS = 4.2;

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5
    ? 4 * x * x * x
    : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export class DiveController {
  private currentState: DiveState = 'surface';
  private rawProgress = 0;
  private direction: 1 | -1 = 1;
  private readonly duration: number;

  constructor(duration = DIVE_DURATION_SECONDS) {
    this.duration = Math.max(0.5, duration);
  }

  get state(): DiveState {
    return this.currentState;
  }

  /** Progresso linear 0..1 (0 = superfície, 1 = fundo). */
  get progress(): number {
    return this.rawProgress;
  }

  /** Progresso com easing, pronto para a câmera. */
  get easedProgress(): number {
    return easeInOutCubic(this.rawProgress);
  }

  get isTransitioning(): boolean {
    return this.currentState === 'descending' || this.currentState === 'ascending';
  }

  get isUnderwater(): boolean {
    return this.currentState === 'underwater' || this.currentState === 'descending' || this.currentState === 'ascending';
  }

  /** Inicia uma transição se a câmera estiver em repouso. */
  toggle(): boolean {
    if (this.isTransitioning) return false;

    if (this.currentState === 'surface') {
      this.currentState = 'descending';
      this.direction = 1;
    } else {
      this.currentState = 'ascending';
      this.direction = -1;
    }
    return true;
  }

  update(dt: number): void {
    if (!this.isTransitioning) return;

    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const step = safeDt / this.duration;
    this.rawProgress = Math.min(1, Math.max(0, this.rawProgress + this.direction * step));

    if (this.direction > 0 && this.rawProgress >= 1) {
      this.rawProgress = 1;
      this.currentState = 'underwater';
    } else if (this.direction < 0 && this.rawProgress <= 0) {
      this.rawProgress = 0;
      this.currentState = 'surface';
    }
  }
}
