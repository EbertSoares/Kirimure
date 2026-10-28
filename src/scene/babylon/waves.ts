export interface WaveSample {
  height: number;
  slopeX: number;
  slopeZ: number;
  velocityY: number;
}

interface WaveDefinition {
  amplitude: number;
  wavelength: number;
  speed: number;
  directionX: number;
  directionZ: number;
  phase: number;
}

/**
 * Deliberately deterministic. Rendering, foam and buoyancy must sample the
 * same surface instead of running visually similar but independent sines.
 */
const WAVES: readonly WaveDefinition[] = [
  { amplitude: 0.25, wavelength: 18, speed: 1.05, directionX: 0.93, directionZ: 0.36, phase: 0.2 },
  { amplitude: 0.14, wavelength: 10, speed: 0.82, directionX: -0.34, directionZ: 0.94, phase: 1.8 },
  { amplitude: 0.07, wavelength: 5.6, speed: 0.62, directionX: 0.7, directionZ: -0.71, phase: 3.1 },
  { amplitude: 0.025, wavelength: 2.4, speed: 0.48, directionX: -0.88, directionZ: -0.47, phase: 4.4 },
] as const;

export const MEAN_WATER_LEVEL = 0;

export function sampleOcean(x: number, z: number, seconds: number): WaveSample {
  let height = MEAN_WATER_LEVEL;
  let slopeX = 0;
  let slopeZ = 0;
  let velocityY = 0;

  for (const wave of WAVES) {
    const waveNumber = (Math.PI * 2) / wave.wavelength;
    const angularSpeed = wave.speed * waveNumber;
    const theta = waveNumber * (wave.directionX * x + wave.directionZ * z)
      - angularSpeed * seconds
      + wave.phase;
    const sine = Math.sin(theta);
    const cosine = Math.cos(theta);

    height += wave.amplitude * sine;
    slopeX += wave.amplitude * waveNumber * wave.directionX * cosine;
    slopeZ += wave.amplitude * waveNumber * wave.directionZ * cosine;
    velocityY -= wave.amplitude * angularSpeed * cosine;
  }

  return { height, slopeX, slopeZ, velocityY };
}

export function waterNormalAt(x: number, z: number, seconds: number) {
  const sample = sampleOcean(x, z, seconds);
  const nx = -sample.slopeX;
  const ny = 1;
  const nz = -sample.slopeZ;
  const length = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / length, y: ny / length, z: nz / length };
}
