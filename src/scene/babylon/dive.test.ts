import { describe, expect, it } from 'vitest';
import {
  DIVE_DURATION_SECONDS,
  DiveController,
  easeInOutCubic,
} from './dive';

describe('easeInOutCubic', () => {
  it('parte e chega devagar, com derivada nula nas extremidades', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 10);
    expect(easeInOutCubic(0.75)).toBeCloseTo(0.9375, 10);
  });

  it('é simétrica e satura fora do intervalo 0..1', () => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      expect(easeInOutCubic(t) + easeInOutCubic(1 - t)).toBeCloseTo(1, 10);
    }
    expect(easeInOutCubic(-2)).toBe(0);
    expect(easeInOutCubic(3)).toBe(1);
  });

  it('usa uma duração padrão dentro da faixa pedida de 3 a 5 segundos', () => {
    expect(DIVE_DURATION_SECONDS).toBeGreaterThanOrEqual(3);
    expect(DIVE_DURATION_SECONDS).toBeLessThanOrEqual(5);
  });
});

describe('DiveController', () => {
  it('começa em repouso na superfície', () => {
    const controller = new DiveController(4);
    expect(controller.state).toBe('surface');
    expect(controller.progress).toBe(0);
    expect(controller.easedProgress).toBe(0);
    expect(controller.isTransitioning).toBe(false);
    expect(controller.isUnderwater).toBe(false);
  });

  it('desce, chega ao fundo e permanece estável', () => {
    const controller = new DiveController(4);
    expect(controller.toggle()).toBe(true);
    expect(controller.state).toBe('descending');
    expect(controller.isTransitioning).toBe(true);
    expect(controller.isUnderwater).toBe(true);

    controller.update(2);
    expect(controller.progress).toBeCloseTo(0.5, 10);
    expect(controller.easedProgress).toBeCloseTo(0.5, 10);
    expect(controller.state).toBe('descending');

    controller.update(2);
    expect(controller.progress).toBe(1);
    expect(controller.easedProgress).toBe(1);
    expect(controller.state).toBe('underwater');
    expect(controller.isTransitioning).toBe(false);

    controller.update(5);
    expect(controller.state).toBe('underwater');
    expect(controller.progress).toBe(1);
  });

  it('bloqueia cliques concorrentes durante a descida e a subida', () => {
    const controller = new DiveController(4);
    expect(controller.toggle()).toBe(true);

    for (let index = 0; index < 10; index += 1) {
      expect(controller.toggle()).toBe(false);
    }
    expect(controller.state).toBe('descending');

    controller.update(4);
    expect(controller.state).toBe('underwater');

    expect(controller.toggle()).toBe(true);
    expect(controller.state).toBe('ascending');
    expect(controller.toggle()).toBe(false);
    expect(controller.state).toBe('ascending');
  });

  it('sobe, retorna à superfície e restaura o progresso zero', () => {
    const controller = new DiveController(4);
    controller.toggle();
    controller.update(4);
    expect(controller.state).toBe('underwater');

    controller.toggle();
    controller.update(2);
    expect(controller.progress).toBeCloseTo(0.5, 10);
    expect(controller.state).toBe('ascending');

    controller.update(2);
    expect(controller.progress).toBe(0);
    expect(controller.easedProgress).toBe(0);
    expect(controller.state).toBe('surface');
    expect(controller.isUnderwater).toBe(false);
  });

  it('ignora delta time inválido e limita overshoot', () => {
    const controller = new DiveController(4);
    controller.toggle();
    controller.update(Number.NaN);
    expect(controller.progress).toBe(0);
    controller.update(-3);
    expect(controller.progress).toBe(0);

    controller.update(100);
    expect(controller.progress).toBe(1);
    expect(controller.state).toBe('underwater');
  });

  it('impõe uma duração mínima para nunca concluir instantaneamente', () => {
    const controller = new DiveController(0);
    controller.toggle();
    controller.update(0.25);
    expect(controller.progress).toBeCloseTo(0.5, 10);
    controller.update(0.25);
    expect(controller.state).toBe('underwater');
  });
});
