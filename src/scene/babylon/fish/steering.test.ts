import { describe, expect, it } from 'vitest';
import {
  clampLength,
  cross,
  distance,
  distanceSquared,
  isInFov,
  length,
  normalize,
  rotateToward,
  steer,
  steerFish,
  type Vec3Tuple,
} from './steering';

function angleBetween(a: Vec3Tuple, b: Vec3Tuple): number {
  const na = normalize(a);
  const nb = normalize(b);
  return Math.acos(Math.min(1, Math.max(-1, na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2])));
}

describe('steering portado do deepsea', () => {
  it('normaliza e limita comprimento de vetores', () => {
    expect(length(normalize([3, 0, 4]))).toBeCloseTo(1, 8);
    expect(length(clampLength([10, 0, 0], 1, 4))).toBeCloseTo(4, 8);
    expect(length(clampLength([0.1, 0, 0], 1, 4))).toBeCloseTo(1, 8);
  });

  it('gira no máximo o ângulo pedido', () => {
    const result = rotateToward([1, 0, 0], [0, 0, 1], 0.1);
    expect(angleBetween([1, 0, 0], result)).toBeCloseTo(0.1, 5);
    expect(angleBetween(result, [0, 0, 1])).toBeCloseTo(Math.PI / 2 - 0.1, 5);
  });

  it('respeita aceleração e velocidade máxima no steer genérico', () => {
    const velocity: Vec3Tuple = [0, 0, 1];
    const desired: Vec3Tuple = [10, 0, 10];
    const before = [...velocity] as Vec3Tuple;
    steer(velocity, desired, 0.1, 2, 20, 0.5, 3);

    const delta = Math.hypot(
      velocity[0] - before[0],
      velocity[1] - before[1],
      velocity[2] - before[2],
    );
    expect(delta).toBeLessThanOrEqual(2 * 0.1 + 1e-6);
    expect(length(velocity)).toBeLessThanOrEqual(3 + 1e-6);
    expect(length(velocity)).toBeGreaterThanOrEqual(0.5 - 1e-6);
  });

  it('nunca faz o peixe nadar de ré ao virar 180°', () => {
    const velocity: Vec3Tuple = [0, 0, 1];
    steerFish(velocity, [0, 0, -1], 0.1, 1.2, 1, 0.4, 1.6);
    expect(velocity[2]).toBeGreaterThan(0);
    expect(length(velocity)).toBeGreaterThanOrEqual(0.4 - 1e-6);
    expect(length(velocity)).toBeLessThanOrEqual(1.6 + 1e-6);
  });

  it('acelera e desacelera dentro dos limites', () => {
    const speeding: Vec3Tuple = [0, 0, 1];
    steerFish(speeding, [0, 0, 10], 0.1, 0.5, 3, 0.2, 3);
    expect(length(speeding)).toBeLessThanOrEqual(1 + 0.5 * 0.1 + 1e-6);

    const slowing: Vec3Tuple = [0, 0, 2];
    steerFish(slowing, [0, 0, 0.1], 0.1, 0.5, 3, 0.2, 3, 0.6);
    expect(length(slowing)).toBeGreaterThanOrEqual(2 - 0.6 * 0.1 - 1e-6);
  });

  it('calcula distâncias e produto vetorial', () => {
    expect(distance([0, 0, 0], [3, 4, 0])).toBeCloseTo(5, 6);
    expect(distanceSquared([0, 0, 0], [3, 4, 0])).toBeCloseTo(25, 6);

    const cr = cross([1, 0, 0], [0, 1, 0]);
    expect(cr[0]).toBeCloseTo(0, 6);
    expect(cr[1]).toBeCloseTo(0, 6);
    expect(cr[2]).toBeCloseTo(1, 6);
  });

  it('avalia campo de visão (FOV) tridimensional e zona cega caudal', () => {
    const pos: Vec3Tuple = [0, 0, 0];
    const forward: Vec3Tuple = [0, 0, 1];

    // Alvo à frente: dentro do campo
    expect(isInFov(pos, forward, [0, 0, 3], -0.7)).toBe(true);

    // Alvo lateral (90°): dentro para FOV amplo (~270°, cos = -0.7)
    expect(isInFov(pos, forward, [3, 0, 0], -0.7)).toBe(true);

    // Alvo logo atrás no cone cego caudal (180°): fora do campo
    expect(isInFov(pos, forward, [0, 0, -3], -0.7)).toBe(false);

    // Alvo a 140° (cos ~ -0.766): fora se exigido cos >= -0.7
    expect(isInFov(pos, forward, [0.3, 0, -1], -0.7)).toBe(false);
  });
});
