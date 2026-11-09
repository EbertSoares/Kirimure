import { describe, expect, it } from 'vitest';
import { sampleOcean, waterHeightAt } from './waves';

describe('ondas Gerstner compartilhadas', () => {
  it('é determinística para o mesmo ponto e instante', () => {
    const first = sampleOcean(3.2, 7.1, 1.25);
    const second = sampleOcean(3.2, 7.1, 1.25);
    expect(second).toEqual(first);
  });

  it('varia no espaço e no tempo sem valores não finitos', () => {
    const here = sampleOcean(0, 12, 2);
    const there = sampleOcean(8, 12, 2);
    const later = sampleOcean(0, 12, 3.5);

    expect(here.height).not.toBeCloseTo(there.height, 4);
    expect(here.height).not.toBeCloseTo(later.height, 4);

    for (const value of Object.values(here)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('produz uma normal unitária apontando para cima', () => {
    const sample = sampleOcean(-4, 18, 9.75);
    const length = Math.hypot(sample.normalX, sample.normalY, sample.normalZ);
    expect(length).toBeCloseTo(1, 6);
    expect(sample.normalY).toBeGreaterThan(0);
  });

  it('mantém velocityY coerente com a derivada da altura', () => {
    const seconds = 4.2;
    const epsilon = 0.001;
    const before = waterHeightAt(2.5, -3.5, seconds - epsilon);
    const after = waterHeightAt(2.5, -3.5, seconds + epsilon);
    const numeric = (after - before) / (2 * epsilon);
    const sample = sampleOcean(2.5, -3.5, seconds);
    expect(sample.velocityY).toBeCloseTo(numeric, 3);
  });

  it('expõe waterHeightAt como a altura de sampleOcean', () => {
    expect(waterHeightAt(1, 2, 3)).toBe(sampleOcean(1, 2, 3).height);
  });

  it('calcula energia de colisão (breaker) e espuma limitadas entre 0 e 1 quando ondas se batem', () => {
    let maxBreaker = 0;
    let maxFoam = 0;
    for (let x = -20; x <= 20; x += 2.5) {
      for (let t = 0; t <= 6; t += 0.5) {
        const sample = sampleOcean(x, 21.5, t);
        expect(sample.breaker).toBeGreaterThanOrEqual(0);
        expect(sample.breaker).toBeLessThanOrEqual(1);
        expect(sample.foam).toBeGreaterThanOrEqual(0);
        expect(sample.foam).toBeLessThanOrEqual(1);
        maxBreaker = Math.max(maxBreaker, sample.breaker);
        maxFoam = Math.max(maxFoam, sample.foam);
      }
    }
    expect(maxBreaker).toBeGreaterThan(0.15);
    expect(maxFoam).toBeGreaterThan(0.2);
  });
});
