/**
 * Provedor Unificado da Superfície Oceânica Espectral FFT (`OceanSurfaceProvider`)
 * e Campo de Correntes Marinhas 3D do Kirimurê.
 *
 * A MESMA síntese espectral FFT multicascata (Tessendorf / JONSWAP + Phillips) alimenta:
 *  - deslocamento 3D dos vértices da superfície e do menisco frontal com filtro de Nyquist
 *    e interpolação Hermite C2 (ondas 100% arredondadas, zero picos triangulares);
 *  - normais analíticas, Jacobiano e energia de colisão/quebra usadas pelo shader;
 *  - solver hidrodinâmico 6-DOF de Arquimedes (18 elementos volumétricos do casco do barco);
 *  - feixes volumétricos subaquáticos, cáusticas e campo de correntes dos cardumes.
 */

import { SpectralOceanSimulator } from './oceanFft';

export interface WaveSample {
  height: number;
  displacementX: number;
  displacementZ: number;
  slopeX: number;
  slopeZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  /** Determinante Jacobiano horizontal J = (1 + dDx/dx)*(1 + dDz/dz) - (dDx/dz)^2. */
  jacobian: number;
  /** Intensidade de espuma/whitecap na crista (0..1). */
  foam: number;
  /** Intensidade de colisão entre trens de ondas cruzados/opostos (0..1). */
  breaker: number;
}

export interface MarineCurrentSample {
  /** Velocidade da corrente marinha permanente/maré em X (m/s). */
  currentX: number;
  /** Velocidade da corrente marinha permanente/maré em Y (m/s). */
  currentY: number;
  /** Velocidade da corrente marinha permanente/maré em Z (m/s). */
  currentZ: number;
  /** Velocidade orbital da onda atenuada pela profundidade exp(k*y) em X (m/s). */
  orbitalX: number;
  /** Velocidade orbital da onda atenuada pela profundidade exp(k*y) em Y (m/s). */
  orbitalY: number;
  /** Velocidade orbital da onda atenuada pela profundidade exp(k*y) em Z (m/s). */
  orbitalZ: number;
}

export const MEAN_WATER_LEVEL = 0;
export const WATER_LEVEL = MEAN_WATER_LEVEL;

/** Instância canônica compartilhada entre renderização, física 6-DOF e IA. */
const canonicalSimulator = new SpectralOceanSimulator(64, 20261109);

/**
 * Avança explicitamente o espectro FFT para o instante `seconds`.
 */
export function stepOceanSpectrum(seconds: number): void {
  canonicalSimulator.step(seconds);
}

/**
 * Amostra a superfície oceânica unificada (FFT multicascata + swells arredondados).
 * Quando `vertexSpacing > 0`, atenua comprimentos de onda menores que o limite de Nyquist
 * local da malha para evitar qualquer facetamento triangular.
 */
export function sampleOcean(
  x: number,
  z: number,
  seconds: number,
  vertexSpacing = 0,
  out?: WaveSample,
): WaveSample {
  return canonicalSimulator.sample(x, z, seconds, vertexSpacing, out);
}

export function waterNormalAt(x: number, z: number, seconds: number) {
  const sample = canonicalSimulator.sample(x, z, seconds, 0);
  return { x: sample.normalX, y: sample.normalY, z: sample.normalZ };
}

/** Amostra rápida de altura para boias, espuma e física 6-DOF do barco. */
export function waterHeightAt(x: number, z: number, seconds: number): number {
  return canonicalSimulator.sample(x, z, seconds, 0).height;
}

/**
 * Campo 3D de correntes marinhas da Baía de Todos-os-Santos:
 * separa explicitamente a circulação de maré/canal (`current`) do movimento
 * orbital oscilatório de curto período das ondas (`orbital`, atenuado por exp(k*y)).
 */
export function sampleMarineCurrent(
  x: number,
  y: number,
  z: number,
  seconds: number,
): MarineCurrentSample {
  const wave = canonicalSimulator.sample(x, z, seconds, 0);
  const depthBelowSurface = Math.max(0, wave.height - y);
  // Atenuação exponencial clássica do movimento orbital em águas profundas: exp(-k * d)
  const orbitalAtten = Math.exp(-0.42 * depthBelowSurface);

  // Corrente de maré suave fluindo pelo canal recifal com vórtices lentos ao redor dos bancos laterais
  const tidePhase = seconds * 0.14;
  const channelFlowX =
    0.18 * Math.cos(tidePhase + z * 0.035) +
    0.07 * Math.sin(x * 0.08 - seconds * 0.22);
  const channelFlowZ =
    0.11 * Math.sin(tidePhase * 0.8 + x * 0.04) +
    0.05 * Math.cos(z * 0.06 + seconds * 0.18);
  const upwellingY =
    0.025 * Math.sin(x * 0.12 + z * 0.09 - seconds * 0.35) *
    Math.exp(-0.25 * depthBelowSurface);

  return {
    currentX: channelFlowX,
    currentY: upwellingY,
    currentZ: channelFlowZ,
    orbitalX: wave.velocityX * orbitalAtten,
    orbitalY: wave.velocityY * orbitalAtten,
    orbitalZ: wave.velocityZ * orbitalAtten,
  };
}
