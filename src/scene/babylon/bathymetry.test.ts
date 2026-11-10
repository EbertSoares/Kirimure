import { describe, expect, it } from 'vitest';
import {
  SEABED_MAX_DEPTH_M,
  SEABED_MIN_DEPTH_M,
  reefSuitabilityAt,
  seabedDepthAt,
  seabedHeightAt,
} from './bathymetry';

function channelCenterAt(z: number): number {
  return (
    Math.sin(z * 0.07 + 0.5) * 5.2 +
    Math.sin(z * 0.023 - 1.1) * 3.1
  );
}

describe('batimetria procedural da Baía de Todos-os-Santos', () => {
  it('mantém a profundidade dentro da faixa declarada de 2 a 15 m', () => {
    expect(SEABED_MIN_DEPTH_M).toBe(2);
    expect(SEABED_MAX_DEPTH_M).toBe(15);

    for (let x = -40; x <= 40; x += 1.5) {
      for (let z = -10; z <= 60; z += 1.5) {
        const depth = seabedDepthAt(x, z);
        expect(Number.isFinite(depth)).toBe(true);
        expect(depth).toBeGreaterThanOrEqual(SEABED_MIN_DEPTH_M);
        expect(depth).toBeLessThanOrEqual(SEABED_MAX_DEPTH_M);
      }
    }
  });

  it('devolve altura negativa coerente com a profundidade', () => {
    for (const [x, z] of [
      [-18, 4],
      [0, 12],
      [9, 28],
      [22, 46],
      [-6, 58],
    ] as const) {
      const depth = seabedDepthAt(x, z);
      expect(seabedHeightAt(x, z)).toBeCloseTo(-depth, 10);
      expect(seabedHeightAt(x, z)).toBeLessThan(0);
    }
  });

  it('é contínua em passos pequenos, sem degraus de parede vertical', () => {
    let maxDelta = 0;
    for (let x = -30; x <= 30; x += 0.5) {
      for (let z = 0; z <= 50; z += 0.5) {
        const here = seabedDepthAt(x, z);
        const dx = seabedDepthAt(x + 0.5, z);
        const dz = seabedDepthAt(x, z + 0.5);
        maxDelta = Math.max(maxDelta, Math.abs(dx - here), Math.abs(dz - here));
      }
    }
    // Afloramentos rochosos podem formar flancos de até ~69°, mas não paredes
    // verticais: nenhum passo de 0,5 m altera a cota em mais de 1,5 m.
    expect(maxDelta).toBeLessThan(1.5);
  });

  it('escava o canal central abaixo das bancadas laterais', () => {
    let channelSum = 0;
    let bankSum = 0;
    let samples = 0;

    for (let z = 18; z <= 44; z += 1) {
      const center = channelCenterAt(z);
      channelSum += seabedDepthAt(center, z);
      bankSum +=
        (seabedDepthAt(center - 18, z) + seabedDepthAt(center + 18, z)) * 0.5;
      samples += 1;
    }

    const channelMean = channelSum / samples;
    const bankMean = bankSum / samples;
    expect(channelMean - bankMean).toBeGreaterThan(1.5);
  });

  it('concentra substrato recifal nas bancadas e deixa o canal arenoso', () => {
    let bankSum = 0;
    let channelSum = 0;
    let samples = 0;
    let bankMax = 0;

    for (let z = 8; z <= 40; z += 1) {
      const center = channelCenterAt(z);
      for (const x of [center - 22, center + 22]) {
        const suitability = reefSuitabilityAt(x, z);
        expect(Number.isFinite(suitability)).toBe(true);
        expect(suitability).toBeGreaterThanOrEqual(0);
        expect(suitability).toBeLessThanOrEqual(1);
        bankSum += suitability;
        bankMax = Math.max(bankMax, suitability);
        samples += 1;
      }
      const channelSuitability = reefSuitabilityAt(center, z);
      expect(channelSuitability).toBeGreaterThanOrEqual(0);
      expect(channelSuitability).toBeLessThanOrEqual(1);
      channelSum += channelSuitability;
    }

    expect(bankMax).toBeGreaterThan(0.35);
    expect(bankSum / samples).toBeGreaterThan(channelSum / (samples / 2) + 0.15);
  });
});
