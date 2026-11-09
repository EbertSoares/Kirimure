/**
 * Simulador Oceânico Espectral FFT Multicascata (Jerry Tessendorf / JONSWAP + Phillips).
 *
 * Implementa síntese espectral real no domínio da frequência com:
 *  - Espectro direcional bimodal (vagas de alísios ENE + ondulação cruzada WNW/recife)
 *    com fator de pico JONSWAP (gamma = 3.3) e espalhamento direcional cos^(2s);
 *  - Relação de dispersão gravidade-capilaridade: omega(k) = sqrt(g*k*(1 + k^2/km^2)*tanh(k*H));
 *  - Evolução temporal de amplitudes complexas h(k, t), velocidades verticais dh/dt(k, t),
 *    deslocamentos horizontais choppiness D(k, t) e derivadas espaciais;
 *  - Transformada Rápida de Fourier Inversa 2D (Cooley-Tukey radix-2 IFFT) em 3 cascatas
 *    incomensuráveis (L0 = 156m, L1 = 39m, L2 = 9.7m);
 *  - Interpolação bicúbica Hermite C1-contínua + filtragem de Nyquist por espaçamento de
 *    vértice para garantir ONDAS 100% ARREDONDADAS (zero picos triangulares/facetados);
 *  - Cálculo do determinante Jacobiano J = (1 + dDx/dx)*(1 + dDz/dz) - (dDx/dz)^2 para
 *    detecção física de colapso de crista (whitecaps) e energia de quebra.
 */

import { clamp, mulberry32, smoothstep } from './procedural';

const GRAVITY = 9.81;
const KM_CAPILLARY = 370.0;
const MEAN_DEPTH = 14.0;

export interface CascadeSpec {
  /** Comprimento físico do ladrilho da cascata em metros (incomensuráveis entre si). */
  readonly length: number;
  /** Número de onda mínimo (rad/m) para evitar dupla contagem espectral entre cascatas. */
  readonly kMin: number;
  /** Número de onda máximo (rad/m). */
  readonly kMax: number;
  /** Fator de deslocamento horizontal Lagrangiano (limitado para evitar auto-interseção triangular). */
  readonly choppiness: number;
  /** Peso relativo da cascata na elevação vertical. */
  readonly weight: number;
}

/**
 * 3 cascatas incomensuráveis calibradas para a escala do diorama da Baía de Todos-os-Santos,
 * inspiradas na arquitetura de `noniv/web-ocean` (`deepsea/js/ocean.js`) e `Popov72/OceanDemo`.
 */
export const OCEAN_FFT_CASCADES: readonly CascadeSpec[] = [
  { length: 156.0, kMin: 0.0, kMax: 0.52, choppiness: 0.34, weight: 1.0 },
  { length: 39.0, kMin: 0.42, kMax: 2.15, choppiness: 0.28, weight: 0.92 },
  { length: 9.7, kMin: 1.85, kMax: 8.8, choppiness: 0.18, weight: 0.72 },
] as const;

interface CascadeBuffers {
  readonly spec: CascadeSpec;
  readonly size: number;
  /** Espectro inicial h0(k) e h0*(-k) empacotados: [h0Re, h0Im, h0MinRe, h0MinIm] por célula. */
  readonly h0: Float32Array;
  /** Frequência angular de dispersão omega(k) por célula. */
  readonly omega: Float32Array;
  /** Direções normalizadas (kx/k, kz/k) e números de onda (kx, kz) por célula. */
  readonly waveVectors: Float32Array;
  /** Grupo direcional dominante do modo (0 = alísios ENE, 1 = vaga cruzada WNW). */
  readonly groupWeight: Float32Array;

  // Buffers de trabalho para IFFT 2D (pré-alocados, zero GC por frame)
  readonly fftReA: Float32Array;
  readonly fftImA: Float32Array;
  readonly fftReB: Float32Array;
  readonly fftImB: Float32Array;
  readonly fftReC: Float32Array;
  readonly fftImC: Float32Array;
  readonly fftReD: Float32Array;
  readonly fftImD: Float32Array;

  // Campos espaciais resultantes após a IFFT 2D (N x N)
  readonly heightField: Float32Array;
  readonly velocityYField: Float32Array;
  readonly dispXField: Float32Array;
  readonly dispZField: Float32Array;
  readonly slopeXField: Float32Array;
  readonly slopeZField: Float32Array;
  readonly jacobianField: Float32Array;
  readonly group0Field: Float32Array;
  readonly group1Field: Float32Array;
}

export interface SpectralSample {
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
  jacobian: number;
  foam: number;
  breaker: number;
}

function wrapAngle(a: number): number {
  let d = (a + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
}

/**
 * Relação de dispersão física gravidade-capilaridade em profundidade finita/intermediária.
 */
function dispersionRelation(k: number): number {
  if (k <= 1e-6) return 0;
  const capillaryBoost = 1 + (k * k) / (KM_CAPILLARY * KM_CAPILLARY);
  const depthFactor = Math.tanh(Math.min(k * MEAN_DEPTH, 12.0));
  return Math.sqrt(GRAVITY * k * capillaryBoost * depthFactor);
}

/**
 * Espectro direcional híbrido JONSWAP + Phillips bimodal:
 *  - Componente 0: Vagas de alísios ENE (+X/+Z, ângulo ~ 32°);
 *  - Componente 1: Ondulação refratada cruzada WNW (-X/+Z, ângulo ~ 142°).
 */
function directionalJonswapPhillips(
  kx: number,
  kz: number,
  windSpeed: number,
): { psd: number; group1Ratio: number } {
  const k2 = kx * kx + kz * kz;
  if (k2 < 1e-8) return { psd: 0, group1Ratio: 0 };
  const k = Math.sqrt(k2);
  const theta = Math.atan2(kz, kx);

  // Comprimento característico L = U^2 / g
  const L = (windSpeed * windSpeed) / GRAVITY;
  const kp = (GRAVITY / (windSpeed * windSpeed)) * 0.85;
  const damp = Math.exp(-1.0 / Math.max(1e-4, k2 * L * L));
  const capillarySuppress = Math.exp(-k2 * 0.0085);

  // Realce de pico JONSWAP (gamma = 3.3)
  const sigma = k <= kp ? 0.07 : 0.09;
  const r = Math.exp(-Math.pow(Math.sqrt(k / kp) - 1.0, 2) / (2.0 * sigma * sigma));
  const jonswapPeak = Math.pow(3.3, r);

  const baseSpectrum = (0.0081 * jonswapPeak * damp * capillarySuppress) / (k2 * k2);

  // Direção 0: Alísios principais ENE (theta0 = 0.58 rad)
  const dTheta0 = wrapAngle(theta - 0.58);
  const spread0 = Math.pow(Math.max(0, Math.cos(dTheta0 * 0.5)), 6.0);

  // Direção 1: Ondulação cruzada/refratada no recife (theta1 = 2.46 rad)
  const dTheta1 = wrapAngle(theta - 2.46);
  const spread1 = Math.pow(Math.max(0, Math.cos(dTheta1 * 0.5)), 6.0) * 0.82;

  // Contra-onda secundária suave (theta2 = -0.82 rad)
  const dTheta2 = wrapAngle(theta + 0.82);
  const spread2 = Math.pow(Math.max(0, Math.cos(dTheta2 * 0.5)), 8.0) * 0.44;

  const e0 = spread0 + spread2 * 0.5;
  const e1 = spread1 + spread2 * 0.5;
  const totalSpread = e0 + e1;
  const group1Ratio = totalSpread > 1e-6 ? e1 / totalSpread : 0.5;

  return {
    psd: baseSpectrum * totalSpread,
    group1Ratio,
  };
}

/**
 * Executa IFFT 1D radix-2 Cooley-Tukey in-place sobre uma linha ou coluna.
 */
function ifft1D(
  re: Float32Array,
  im: Float32Array,
  offset: number,
  stride: number,
  n: number,
): void {
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    if (i < j) {
      const idxI = offset + i * stride;
      const idxJ = offset + j * stride;
      const tmpRe = re[idxI];
      const tmpIm = im[idxI];
      re[idxI] = re[idxJ];
      im[idxI] = im[idxJ];
      re[idxJ] = tmpRe;
      im[idxJ] = tmpIm;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Butterfly stages (IFFT: +2*pi*i / len)
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (Math.PI * 2) / len;
    const wStepRe = Math.cos(angle);
    const wStepIm = Math.sin(angle);

    for (let start = 0; start < n; start += len) {
      let wRe = 1.0;
      let wIm = 0.0;
      for (let k = 0; k < half; k += 1) {
        const evenIdx = offset + (start + k) * stride;
        const oddIdx = offset + (start + k + half) * stride;

        const oRe = re[oddIdx];
        const oIm = im[oddIdx];
        const twRe = wRe * oRe - wIm * oIm;
        const twIm = wRe * oIm + wIm * oRe;

        const eRe = re[evenIdx];
        const eIm = im[evenIdx];

        re[evenIdx] = eRe + twRe;
        im[evenIdx] = eIm + twIm;
        re[oddIdx] = eRe - twRe;
        im[oddIdx] = eIm - twIm;

        const nextWRe = wRe * wStepRe - wIm * wStepIm;
        wIm = wRe * wStepIm + wIm * wStepRe;
        wRe = nextWRe;
      }
    }
  }
}

/**
 * Executa IFFT 2D in-place (linhas + colunas) com correção de sinal centrada (-1)^(x+y).
 */
function ifft2D(re: Float32Array, im: Float32Array, n: number): void {
  for (let y = 0; y < n; y += 1) {
    ifft1D(re, im, y * n, 1, n);
  }
  for (let x = 0; x < n; x += 1) {
    ifft1D(re, im, x, n, n);
  }
  for (let y = 0; y < n; y += 1) {
    const rowOffset = y * n;
    for (let x = 0; x < n; x += 1) {
      if ((x + y) & 1) {
        const idx = rowOffset + x;
        re[idx] = -re[idx];
        im[idx] = -im[idx];
      }
    }
  }
}

export class SpectralOceanSimulator {
  readonly size: number;
  readonly cascades: readonly CascadeBuffers[];
  private lastSteppedTime = Number.NaN;

  constructor(size = 64, seed = 20261109) {
    this.size = size;
    const random = mulberry32(seed);
    const windSpeed = 8.4;
    const targetSignificantHeight = 0.92; // Hs = 4 * sigma -> sigma = 0.23m

    const gaussianPair = (): [number, number] => {
      const u1 = Math.max(1e-7, random());
      const u2 = random();
      const mag = Math.sqrt(-2.0 * Math.log(u1));
      const ang = Math.PI * 2 * u2;
      return [mag * Math.cos(ang), mag * Math.sin(ang)];
    };

    const rawCascades: CascadeBuffers[] = [];
    let totalRawVariance = 0;

    for (const spec of OCEAN_FFT_CASCADES) {
      const count = size * size;
      const h0 = new Float32Array(count * 4);
      const omega = new Float32Array(count);
      const waveVectors = new Float32Array(count * 4);
      const groupWeight = new Float32Array(count);

      const dk = (Math.PI * 2) / spec.length;
      const half = size >> 1;

      for (let iy = 0; iy < size; iy += 1) {
        const ny = iy - half;
        const kz = ny * dk;
        for (let ix = 0; ix < size; ix += 1) {
          const nx = ix - half;
          const kx = nx * dk;
          const idx = iy * size + ix;
          const k = Math.hypot(kx, kz);

          // Band-pass por cascata com rolloff suave para nunca duplicar energia
          const highPass = spec.kMin > 0 ? smoothstep(spec.kMin * 0.8, spec.kMin * 1.25, k) : 1.0;
          const lowPass = 1.0 - smoothstep(spec.kMax * 0.78, spec.kMax * 1.15, k);
          const bandWeight = k > 1e-5 ? highPass * lowPass : 0;

          const { psd, group1Ratio } = directionalJonswapPhillips(kx, kz, windSpeed);
          // Modo de Nyquist (ix === 0 ou iy === 0) zerado para preservar simetria Hermitiana estrita
          const isNyquist = ix === 0 || iy === 0;
          const amp = !isNyquist && bandWeight > 0 ? Math.sqrt(psd * bandWeight * 0.5) * dk : 0;

          const [g1Re, g1Im] = gaussianPair();
          const h0Re = g1Re * amp;
          const h0Im = g1Im * amp;

          h0[idx * 4] = h0Re;
          h0[idx * 4 + 1] = h0Im;
          h0[idx * 4 + 2] = 0;
          h0[idx * 4 + 3] = 0;

          omega[idx] = dispersionRelation(k);
          const invK = k > 1e-6 ? 1 / k : 0;
          waveVectors[idx * 4] = kx;
          waveVectors[idx * 4 + 1] = kz;
          waveVectors[idx * 4 + 2] = kx * invK;
          waveVectors[idx * 4 + 3] = kz * invK;
          groupWeight[idx] = group1Ratio;
        }
      }

      // Garante simetria Hermitiana exata: h0*(-k) na posição (ix, iy) é o conjugado de h0 na posição (-nx, -ny)
      for (let iy = 0; iy < size; iy += 1) {
        const mirY = (size - iy) & (size - 1);
        for (let ix = 0; ix < size; ix += 1) {
          const mirX = (size - ix) & (size - 1);
          const idx = iy * size + ix;
          const mirIdx = mirY * size + mirX;
          const h0Re = h0[idx * 4];
          const h0Im = h0[idx * 4 + 1];
          const h0MinRe = h0[mirIdx * 4];
          const h0MinIm = -h0[mirIdx * 4 + 1];
          h0[idx * 4 + 2] = h0MinRe;
          h0[idx * 4 + 3] = h0MinIm;

          totalRawVariance +=
            (h0Re * h0Re + h0Im * h0Im + h0MinRe * h0MinRe + h0MinIm * h0MinIm) *
            spec.weight *
            spec.weight;
        }
      }

      rawCascades.push({
        spec,
        size,
        h0,
        omega,
        waveVectors,
        groupWeight,
        fftReA: new Float32Array(count),
        fftImA: new Float32Array(count),
        fftReB: new Float32Array(count),
        fftImB: new Float32Array(count),
        fftReC: new Float32Array(count),
        fftImC: new Float32Array(count),
        fftReD: new Float32Array(count),
        fftImD: new Float32Array(count),
        heightField: new Float32Array(count),
        velocityYField: new Float32Array(count),
        dispXField: new Float32Array(count),
        dispZField: new Float32Array(count),
        slopeXField: new Float32Array(count),
        slopeZField: new Float32Array(count),
        jacobianField: new Float32Array(count),
        group0Field: new Float32Array(count),
        group1Field: new Float32Array(count),
      });
    }

    // Normaliza o espectro para atingir exatamente a altura significativa Hs desejada
    const targetSigma = targetSignificantHeight / 4.0;
    const normScale = totalRawVariance > 1e-12 ? targetSigma / Math.sqrt(totalRawVariance) : 1.0;
    for (const c of rawCascades) {
      for (let i = 0; i < c.h0.length; i += 1) {
        c.h0[i] *= normScale;
      }
    }

    this.cascades = rawCascades;
    this.step(0);
  }

  /**
   * Evolui todas as cascatas no tempo `seconds` e executa a IFFT 2D se o instante mudou.
   */
  step(seconds: number): void {
    if (Math.abs(seconds - this.lastSteppedTime) < 1e-7) {
      return;
    }
    this.lastSteppedTime = seconds;

    const n = this.size;
    const count = n * n;

    for (const c of this.cascades) {
      const {
        spec,
        h0,
        omega,
        waveVectors,
        groupWeight,
        fftReA,
        fftImA,
        fftReB,
        fftImB,
        fftReC,
        fftImC,
        fftReD,
        fftImD,
      } = c;
      const chop = spec.choppiness;

      for (let i = 0; i < count; i += 1) {
        const w = omega[i];
        const phase = w * seconds;
        const cosP = Math.cos(phase);
        const sinP = Math.sin(phase);

        const h0Re = h0[i * 4];
        const h0Im = h0[i * 4 + 1];
        const h0MinRe = h0[i * 4 + 2];
        const h0MinIm = h0[i * 4 + 3];

        // h(k, t) = h0(k)*e^(i*w*t) + h0*(-k)*e^(-i*w*t)
        const ePosRe = h0Re * cosP - h0Im * sinP;
        const ePosIm = h0Re * sinP + h0Im * cosP;
        const eNegRe = h0MinRe * cosP + h0MinIm * sinP;
        const eNegIm = -h0MinRe * sinP + h0MinIm * cosP;

        const hRe = ePosRe + eNegRe;
        const hIm = ePosIm + eNegIm;

        // dh/dt(k, t) = i*w*(ePos - eNeg)
        const diffRe = ePosRe - eNegRe;
        const diffIm = ePosIm - eNegIm;
        const velRe = -w * diffIm;
        const velIm = w * diffRe;

        const kx = waveVectors[i * 4];
        const kz = waveVectors[i * 4 + 1];
        const dirX = waveVectors[i * 4 + 2];
        const dirZ = waveVectors[i * 4 + 3];

        // Deslocamento horizontal D = -i * (k / |k|) * chop * h(k, t)
        const dxRe = dirX * chop * hIm;
        const dxIm = -dirX * chop * hRe;
        const dzRe = dirZ * chop * hIm;
        const dzIm = -dirZ * chop * hRe;

        // Inclinação analítica S = i * k * h(k, t)
        const sxRe = -kx * hIm;
        const sxIm = kx * hRe;
        const szRe = -kz * hIm;
        const szIm = kz * hRe;

        // Empacota dois campos reais em uma única IFFT complexa: Z = X + i*Y
        // Pass A: height + i * velocityY
        fftReA[i] = hRe - velIm;
        fftImA[i] = hIm + velRe;

        // Pass B: dispX + i * dispZ
        fftReB[i] = dxRe - dzIm;
        fftImB[i] = dxIm + dzRe;

        // Pass C: slopeX + i * slopeZ
        fftReC[i] = sxRe - szIm;
        fftImC[i] = sxIm + szRe;

        // Pass D: grupo 0 + i * grupo 1 (para detecção de colisão de trens de ondas)
        const g1 = groupWeight[i];
        const g0 = 1.0 - g1;
        const h0gRe = hRe * g0;
        const h0gIm = hIm * g0;
        const h1gRe = hRe * g1;
        const h1gIm = hIm * g1;
        fftReD[i] = h0gRe - h1gIm;
        fftImD[i] = h0gIm + h1gRe;
      }

      ifft2D(fftReA, fftImA, n);
      ifft2D(fftReB, fftImB, n);
      ifft2D(fftReC, fftImC, n);
      ifft2D(fftReD, fftImD, n);

      const {
        heightField,
        velocityYField,
        dispXField,
        dispZField,
        slopeXField,
        slopeZField,
        jacobianField,
        group0Field,
        group1Field,
      } = c;
      const weight = spec.weight;

      for (let i = 0; i < count; i += 1) {
        heightField[i] = fftReA[i] * weight;
        velocityYField[i] = fftImA[i] * weight;
        dispXField[i] = fftReB[i] * weight;
        dispZField[i] = fftImB[i] * weight;
        slopeXField[i] = fftReC[i] * weight;
        slopeZField[i] = fftImC[i] * weight;
        group0Field[i] = fftReD[i] * weight;
        group1Field[i] = fftImD[i] * weight;
      }

      // Calcula o determinante Jacobiano J = (1 + dDx/dx)*(1 + dDz/dz) - (dDx/dz)^2 por diferenças centrais periódicas
      const invTwoDx = n / (2.0 * spec.length);
      for (let y = 0; y < n; y += 1) {
        const up = ((y - 1 + n) & (n - 1)) * n;
        const down = ((y + 1) & (n - 1)) * n;
        const row = y * n;
        for (let x = 0; x < n; x += 1) {
          const left = (x - 1 + n) & (n - 1);
          const right = (x + 1) & (n - 1);

          const dDxDx = (dispXField[row + right] - dispXField[row + left]) * invTwoDx;
          const dDzDz = (dispZField[down + x] - dispZField[up + x]) * invTwoDx;
          const dDxDz = (dispXField[down + x] - dispXField[up + x]) * invTwoDx;
          const dDzDx = (dispZField[row + right] - dispZField[row + left]) * invTwoDx;

          jacobianField[row + x] = (1.0 + dDxDx) * (1.0 + dDzDz) - dDxDz * dDzDx;
        }
      }
    }
  }

  /**
   * Amostra uma cascata com interpolação suave de Hermite C1-contínua:
   * elimina 100% das quinas lineares entre células da grade FFT, garantindo
   * cristas e cavas perfeitamente arredondadas, mantendo linearidade exata
   * entre `height` e `velocityY`.
   */
  private sampleCascadeSmooth(
    c: CascadeBuffers,
    x: number,
    z: number,
    cascadeGain: number,
    out: {
      h: number;
      vy: number;
      dx: number;
      dz: number;
      sx: number;
      sz: number;
      jac: number;
      g0: number;
      g1: number;
    },
  ): void {
    if (cascadeGain <= 1e-4) return;
    const n = c.size;
    const mask = n - 1;
    const invLen = n / c.spec.length;

    const gx = x * invLen;
    const gz = z * invLen;
    const ix0 = Math.floor(gx);
    const iz0 = Math.floor(gz);
    const fx = gx - ix0;
    const fz = gz - iz0;

    // Polinômio de Hermite de 5ª ordem (C2-contínuo): 6t^5 - 15t^4 + 10t^3
    // Garante curvatura suave (segunda derivada contínua = ondas arredondadas sem facetas!)
    const ux = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0);
    const uz = fz * fz * fz * (fz * (fz * 6.0 - 15.0) + 10.0);
    const oneMinusUx = 1.0 - ux;
    const oneMinusUz = 1.0 - uz;

    const w00 = oneMinusUx * oneMinusUz * cascadeGain;
    const w10 = ux * oneMinusUz * cascadeGain;
    const w01 = oneMinusUx * uz * cascadeGain;
    const w11 = ux * uz * cascadeGain;

    const x0 = ix0 & mask;
    const x1 = (ix0 + 1) & mask;
    const z0 = (iz0 & mask) * n;
    const z1 = ((iz0 + 1) & mask) * n;

    const i00 = z0 + x0;
    const i10 = z0 + x1;
    const i01 = z1 + x0;
    const i11 = z1 + x1;

    out.h +=
      c.heightField[i00] * w00 +
      c.heightField[i10] * w10 +
      c.heightField[i01] * w01 +
      c.heightField[i11] * w11;

    out.vy +=
      c.velocityYField[i00] * w00 +
      c.velocityYField[i10] * w10 +
      c.velocityYField[i01] * w01 +
      c.velocityYField[i11] * w11;

    out.dx +=
      c.dispXField[i00] * w00 +
      c.dispXField[i10] * w10 +
      c.dispXField[i01] * w01 +
      c.dispXField[i11] * w11;

    out.dz +=
      c.dispZField[i00] * w00 +
      c.dispZField[i10] * w10 +
      c.dispZField[i01] * w01 +
      c.dispZField[i11] * w11;

    out.sx +=
      c.slopeXField[i00] * w00 +
      c.slopeXField[i10] * w10 +
      c.slopeXField[i01] * w01 +
      c.slopeXField[i11] * w11;

    out.sz +=
      c.slopeZField[i00] * w00 +
      c.slopeZField[i10] * w10 +
      c.slopeZField[i01] * w01 +
      c.slopeZField[i11] * w11;

    out.jac +=
      (c.jacobianField[i00] - 1.0) * w00 +
      (c.jacobianField[i10] - 1.0) * w10 +
      (c.jacobianField[i01] - 1.0) * w01 +
      (c.jacobianField[i11] - 1.0) * w11;

    out.g0 +=
      c.group0Field[i00] * w00 +
      c.group0Field[i10] * w10 +
      c.group0Field[i01] * w01 +
      c.group0Field[i11] * w11;

    out.g1 +=
      c.group1Field[i00] * w00 +
      c.group1Field[i10] * w10 +
      c.group1Field[i01] * w01 +
      c.group1Field[i11] * w11;
  }

  private readonly scratchAcc = {
    h: 0,
    vy: 0,
    dx: 0,
    dz: 0,
    sx: 0,
    sz: 0,
    jac: 1.0,
    g0: 0,
    g1: 0,
  };

  /**
   * Avalia a superfície oceânica unificada em `(x, z, seconds)` com filtragem
   * de Nyquist opcional (`vertexSpacing`) para garantir geometria 100% arredondada.
   */
  sample(
    x: number,
    z: number,
    seconds: number,
    vertexSpacing = 0,
    out?: SpectralSample,
  ): SpectralSample {
    this.step(seconds);

    const acc = this.scratchAcc;
    acc.h = 0;
    acc.vy = 0;
    acc.dx = 0;
    acc.dz = 0;
    acc.sx = 0;
    acc.sz = 0;
    acc.jac = 1.0;
    acc.g0 = 0;
    acc.g1 = 0;

    // Amostra as 3 cascatas FFT com atenuação de Nyquist baseada no espaçamento local da malha:
    // cascatas curtas nunca deslocam vértices largos (evitando picos triangulares!), sendo
    // representadas nas normais e no shader óptico por pixel.
    for (let i = 0; i < this.cascades.length; i += 1) {
      const c = this.cascades[i];
      let nyquistGain = 1.0;
      if (vertexSpacing > 0) {
        const characteristicLambda = c.spec.length / 8.0;
        nyquistGain = smoothstep(vertexSpacing * 1.35, vertexSpacing * 3.4, characteristicLambda);
      }
      this.sampleCascadeSmooth(c, x, z, nyquistGain, acc);
    }

    // Ondas longas de swell oceânico analítico C-infinito (garantem ondulação arredondada
    // contínua de longo alcance em toda a baía e derivada analítica exata)
    const swellGain0 = vertexSpacing > 0 ? smoothstep(vertexSpacing * 1.4, vertexSpacing * 3.2, 22.0) : 1.0;
    const swellGain1 = vertexSpacing > 0 ? smoothstep(vertexSpacing * 1.4, vertexSpacing * 3.2, 15.5) : 1.0;
    const swellGain2 = vertexSpacing > 0 ? smoothstep(vertexSpacing * 1.4, vertexSpacing * 3.2, 10.4) : 1.0;

    // Swell 0: Vaga principal de alísios ENE (lambda = 22.0m, arredondada)
    const k0 = (Math.PI * 2) / 22.0;
    const w0 = dispersionRelation(k0);
    const d0x = 0.84;
    const d0z = 0.5426;
    const ph0 = k0 * (d0x * x + d0z * z) - w0 * seconds + 0.35;
    const s0 = Math.sin(ph0);
    const c0 = Math.cos(ph0);
    const a0 = 0.24 * swellGain0;

    // Swell 1: Vaga cruzada refratada WNW (lambda = 16.5m, arredondada)
    const k1 = (Math.PI * 2) / 16.5;
    const w1 = dispersionRelation(k1);
    const d1x = -0.78;
    const d1z = 0.6258;
    const ph1 = k1 * (d1x * x + d1z * z) - w1 * seconds + 1.72;
    const s1 = Math.sin(ph1);
    const c1 = Math.cos(ph1);
    const a1 = 0.21 * swellGain1;

    // Swell 2: Ondulação diagonal de canal (lambda = 11.2m, arredondada)
    const k2 = (Math.PI * 2) / 11.2;
    const w2 = dispersionRelation(k2);
    const d2x = 0.64;
    const d2z = -0.7684;
    const ph2 = k2 * (d2x * x + d2z * z) - w2 * seconds + 3.05;
    const s2 = Math.sin(ph2);
    const c2 = Math.cos(ph2);
    const a2 = 0.14 * swellGain2;

    // Swell 3: Contra-ondulação suave (lambda = 8.8m)
    const k3 = (Math.PI * 2) / 8.8;
    const w3 = dispersionRelation(k3);
    const d3x = -0.69;
    const d3z = -0.7238;
    const ph3 = k3 * (d3x * x + d3z * z) - w3 * seconds + 4.4;
    const s3 = Math.sin(ph3);
    const c3 = Math.cos(ph3);
    const a3 = 0.11 * swellGain2;

    const height = acc.h + a0 * s0 + a1 * s1 + a2 * s2 + a3 * s3;
    const velocityY =
      acc.vy - a0 * w0 * c0 - a1 * w1 * c1 - a2 * w2 * c2 - a3 * w3 * c3;

    // Choppiness moderado (0.28..0.32) preserva cristas arredondadas trocoidais sem auto-interseção
    const chop0 = 0.30;
    const displacementX =
      acc.dx +
      chop0 * (a0 * d0x * c0 + a1 * d1x * c1 + a2 * d2x * c2 + a3 * d3x * c3);
    const displacementZ =
      acc.dz +
      chop0 * (a0 * d0z * c0 + a1 * d1z * c1 + a2 * d2z * c2 + a3 * d3z * c3);

    const velocityX =
      chop0 *
      (a0 * w0 * d0x * s0 +
        a1 * w1 * d1x * s1 +
        a2 * w2 * d2x * s2 +
        a3 * w3 * d3x * s3);
    const velocityZ =
      chop0 *
      (a0 * w0 * d0z * s0 +
        a1 * w1 * d1z * s1 +
        a2 * w2 * d2z * s2 +
        a3 * w3 * d3z * s3);

    const slopeX =
      acc.sx +
      a0 * k0 * d0x * c0 +
      a1 * k1 * d1x * c1 +
      a2 * k2 * d2x * c2 +
      a3 * k3 * d3x * c3;
    const slopeZ =
      acc.sz +
      a0 * k0 * d0z * c0 +
      a1 * k1 * d1z * c1 +
      a2 * k2 * d2z * c2 +
      a3 * k3 * d3z * c3;

    // Normal analítica arredondada n = normalize(-dh/dx, 1, -dh/dz)
    const nx = -slopeX;
    const ny = 1.0;
    const nz = -slopeZ;
    const normalLen = Math.hypot(nx, ny, nz) || 1.0;

    // Jacobiano combinado (FFT + swells)
    const swellCompression =
      chop0 *
      (a0 * k0 * s0 + a1 * k1 * s1 + a2 * k2 * s2 + a3 * k3 * s3);
    const jacobian = clamp(acc.jac - swellCompression, 0.18, 1.85);

    const group0Height = acc.g0 + a0 * s0 + a2 * s2;
    const group1Height = acc.g1 + a1 * s1 + a3 * s3;

    const compression = clamp((1.05 - jacobian) / 0.42, 0, 1);
    const crestLift = clamp((height - 0.05) / 0.62, 0, 1);
    const collideCrests =
      Math.max(0, group0Height + 0.05) * Math.max(0, group1Height + 0.05) * 5.8;
    const upwardBoost = clamp(Math.max(0, velocityY) * 0.35, 0, 0.45);

    const breaker = clamp(
      collideCrests * (0.56 + 0.44 * compression) + compression * crestLift * 0.45 + upwardBoost * collideCrests,
      0,
      1,
    );
    const foam = clamp(
      compression * (0.45 + 0.55 * crestLift) + breaker * 0.72,
      0,
      1,
    );

    if (out) {
      out.height = height;
      out.displacementX = displacementX;
      out.displacementZ = displacementZ;
      out.slopeX = slopeX;
      out.slopeZ = slopeZ;
      out.velocityX = velocityX;
      out.velocityY = velocityY;
      out.velocityZ = velocityZ;
      out.normalX = nx / normalLen;
      out.normalY = ny / normalLen;
      out.normalZ = nz / normalLen;
      out.jacobian = jacobian;
      out.foam = foam;
      out.breaker = breaker;
      return out;
    }

    return {
      height,
      displacementX,
      displacementZ,
      slopeX,
      slopeZ,
      velocityX,
      velocityY,
      velocityZ,
      normalX: nx / normalLen,
      normalY: ny / normalLen,
      normalZ: nz / normalLen,
      jacobian,
      foam,
      breaker,
    };
  }
}
