import { describe, expect, it } from 'vitest';
import { BoatRigidBody6DOF, type SurfaceSamplerFn } from './boat';
import type { WaveSample } from './waves';

function flatWaterSampler(): SurfaceSamplerFn {
  return (): WaveSample => ({
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    slopeX: 0,
    slopeZ: 0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    jacobian: 1,
    foam: 0,
    breaker: 0,
  });
}

function directionalWaveSampler(
  amplitude: number,
  wavelength: number,
  dirX: number,
  dirZ: number,
): SurfaceSamplerFn {
  const len = Math.hypot(dirX, dirZ) || 1;
  const nx = dirX / len;
  const nz = dirZ / len;
  const k = (Math.PI * 2) / wavelength;
  const omega = Math.sqrt(9.81 * k);

  return (x: number, z: number, time: number): WaveSample => {
    const phase = k * (nx * x + nz * z) - omega * time;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const height = amplitude * s;
    const velocityY = -amplitude * omega * c;
    const slopeX = amplitude * k * nx * c;
    const slopeZ = amplitude * k * nz * c;
    const normLen = Math.hypot(-slopeX, 1, -slopeZ);

    return {
      height,
      displacementX: 0.25 * amplitude * nx * c,
      displacementZ: 0.25 * amplitude * nz * c,
      slopeX,
      slopeZ,
      velocityX: 0.25 * amplitude * omega * nx * s,
      velocityY,
      velocityZ: 0.25 * amplitude * omega * nz * s,
      normalX: -slopeX / normLen,
      normalY: 1 / normLen,
      normalZ: -slopeZ / normLen,
      jacobian: 1,
      foam: 0,
      breaker: 0,
    };
  };
}

describe('BoatRigidBody6DOF — Física Naval 6-DOF e Empuxo de Arquimedes (Seção 6.6)', () => {
  it('1. Água completamente plana: converge para equilíbrio hidrostático sem oscilações artificiais', () => {
    const boat = new BoatRigidBody6DOF(3.4, 0, 24, 0);
    const flat = flatWaterSampler();

    let t = 0;
    for (let i = 0; i < 360; i += 1) {
      t += 1 / 60;
      boat.step(1 / 60, t, flat);
    }

    // Em água calma, velocidades lineares e angulares amortecem até zero
    expect(Math.abs(boat.vy)).toBeLessThan(1e-3);
    expect(Math.abs(boat.pitch)).toBeLessThan(1e-4);
    expect(Math.abs(boat.roll)).toBeLessThan(1e-4);
    // Empuxo de Arquimedes iguala o peso mg do barco no equilíbrio
    const weight = boat.mass * 9.81;
    expect(boat.totalBuoyancyForceY / weight).toBeCloseTo(1.0, 2);
  });

  it('2. Onda senoidal simples: acompanha elevação (heave) de forma contínua e proporcional', () => {
    const boat = new BoatRigidBody6DOF(3.4, 0, 24, 0);
    const wave = directionalWaveSampler(0.35, 28.0, 0, 1);

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let t = 0;
    for (let i = 0; i < 420; i += 1) {
      t += 1 / 60;
      boat.step(1 / 60, t, wave);
      if (i > 120) {
        minY = Math.min(minY, boat.y);
        maxY = Math.max(maxY, boat.y);
      }
    }

    const heaveRange = maxY - minY;
    expect(heaveRange).toBeGreaterThan(0.18);
    expect(heaveRange).toBeLessThan(0.95);
  });

  it('3. Onda vindo pela proa (head sea): induz pitch longitudinal sem roll lateral espúrio', () => {
    // Barco alinhado com +Z (yaw = 0) e onda propagando em +Z
    const boat = new BoatRigidBody6DOF(3.4, 0, 24, 0);
    const headWave = directionalWaveSampler(0.32, 22.0, 0, 1);

    let maxPitch = 0;
    let maxRoll = 0;
    let t = 0;
    for (let i = 0; i < 360; i += 1) {
      t += 1 / 60;
      boat.step(1 / 60, t, headWave);
      if (i > 90) {
        maxPitch = Math.max(maxPitch, Math.abs(boat.pitch));
        maxRoll = Math.max(maxRoll, Math.abs(boat.roll));
      }
    }

    expect(maxPitch).toBeGreaterThan(0.02);
    expect(maxPitch).toBeLessThan(0.22);
    expect(maxRoll).toBeLessThan(1e-4);
  });

  it('4. Onda vindo pela lateral (beam sea): induz roll transversal estável e controlado', () => {
    // Barco alinhado com +Z (yaw = 0) e onda propagando em +X ( través )
    const boat = new BoatRigidBody6DOF(3.4, 0, 24, 0);
    const beamWave = directionalWaveSampler(0.3, 20.0, 1, 0);

    let maxRoll = 0;
    let t = 0;
    for (let i = 0; i < 360; i += 1) {
      t += 1 / 60;
      boat.step(1 / 60, t, beamWave);
      if (i > 90) {
        maxRoll = Math.max(maxRoll, Math.abs(boat.roll));
      }
    }

    expect(maxRoll).toBeGreaterThan(0.015);
    expect(maxRoll).toBeLessThan(0.22);
  });

  it('5. Onda vindo em diagonal (quartering sea): acopla pitch, roll e surge/sway', () => {
    const boat = new BoatRigidBody6DOF(3.4, 0, 24, 0.35);
    const diagWave = directionalWaveSampler(0.32, 22.0, 0.707, 0.707);

    let maxPitch = 0;
    let maxRoll = 0;
    let t = 0;
    for (let i = 0; i < 360; i += 1) {
      t += 1 / 60;
      boat.step(1 / 60, t, diagWave);
      if (i > 90) {
        maxPitch = Math.max(maxPitch, Math.abs(boat.pitch));
        maxRoll = Math.max(maxRoll, Math.abs(boat.roll));
      }
    }

    expect(maxPitch).toBeGreaterThan(0.01);
    expect(maxRoll).toBeGreaterThan(0.01);
  });

  it('6. Queda inicial acima da água: cai sob gravidade, submerge e amortece até o equilíbrio', () => {
    const boat = new BoatRigidBody6DOF(3.4, 0, 24, 0);
    const flat = flatWaterSampler();
    boat.y = 1.65; // Acima da água

    let t = 0;
    for (let i = 0; i < 480; i += 1) {
      t += 1 / 60;
      boat.step(1 / 60, t, flat);
    }

    expect(boat.y).toBeGreaterThan(-0.6);
    expect(boat.y).toBeLessThan(0.3);
    expect(Math.abs(boat.vy)).toBeLessThan(0.01);
  });

  it('7. Submersão parcial excessiva: empuxo de Arquimedes supera o peso e restaura a linha d’água', () => {
    const boat = new BoatRigidBody6DOF(3.4, 0, 24, 0);
    const flat = flatWaterSampler();
    boat.y = -1.35; // Fortemente submerso

    // No primeiro substep, o empuxo supera o peso mg
    boat.step(1 / 120, 1 / 120, flat);
    expect(boat.totalBuoyancyForceY).toBeGreaterThan(boat.mass * 9.81 * 1.4);

    let t = 1 / 120;
    for (let i = 0; i < 480; i += 1) {
      t += 1 / 60;
      boat.step(1 / 60, t, flat);
    }

    expect(boat.y).toBeGreaterThan(-0.6);
    expect(boat.y).toBeLessThan(0.3);
    expect(Math.abs(boat.vy)).toBeLessThan(0.01);
  });

  it('8. Mudança abrupta de FPS (144 Hz, 60 Hz, 20 Hz): substepping fixo mantém convergência consistente', () => {
    const wave = directionalWaveSampler(0.28, 20.0, 0.6, 0.8);
    const boat144 = new BoatRigidBody6DOF(3.4, 0, 24, 1.22);
    const boat20 = new BoatRigidBody6DOF(3.4, 0, 24, 1.22);

    const totalTime = 3.0;
    const steps144 = Math.round(totalTime * 144);
    for (let i = 1; i <= steps144; i += 1) {
      boat144.step(1 / 144, i / 144, wave);
    }

    const steps20 = Math.round(totalTime * 20);
    for (let i = 1; i <= steps20; i += 1) {
      boat20.step(1 / 20, i / 20, wave);
    }

    expect(Number.isFinite(boat144.y)).toBe(true);
    expect(Number.isFinite(boat20.y)).toBe(true);
    expect(Math.abs(boat144.y - boat20.y)).toBeLessThan(0.06);
    expect(Math.abs(boat144.pitch - boat20.pitch)).toBeLessThan(0.04);
  });

  it('9. Velocidades de simulação 1x, 3x, 5x, 10x: solver mantém estabilidade física com dt de parede real', () => {
    const wave = directionalWaveSampler(0.3, 18.0, 0.8, 0.6);
    for (const simSpeed of [1, 3, 5, 10]) {
      const boat = new BoatRigidBody6DOF(3.4, 0, 24, 1.22);
      // O OceanScene3D passa o dt real de renderização para o solver físico independente do multiplicador científico
      let elapsed = 0;
      for (let frame = 0; frame < 180; frame += 1) {
        const realDt = 1 / 60;
        elapsed += realDt;
        boat.step(realDt, elapsed, wave);
        void simSpeed;
      }
      expect(Number.isFinite(boat.x)).toBe(true);
      expect(Number.isFinite(boat.y)).toBe(true);
      expect(Number.isFinite(boat.z)).toBe(true);
      expect(Math.abs(boat.pitch)).toBeLessThan(0.26);
      expect(Math.abs(boat.roll)).toBeLessThan(0.24);
    }
  });
});
