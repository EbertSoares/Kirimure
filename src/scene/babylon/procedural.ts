/**
 * Utilidades procedurais determinísticas usadas por céu, terreno, corais e efeitos.
 *
 * Tudo aqui é matemática pura (sem dependência de WebGL/WebGPU) para poder ser
 * testado em Node e reutilizado por render, física e layout responsivo.
 */

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
};

export const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function hash2D(ix: number, iy: number): number {
  const value = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export function valueNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);

  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

export function fbm2D(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let normalization = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise2D(x * frequency, y * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }

  return sum / (normalization || 1);
}

function periodicNoise2D(x: number, y: number, periodX: number, periodY: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const wrap = (n: number, period: number) => ((n % period) + period) % period;

  const a = hash2D(wrap(ix, periodX), wrap(iy, periodY));
  const b = hash2D(wrap(ix + 1, periodX), wrap(iy, periodY));
  const c = hash2D(wrap(ix, periodX), wrap(iy + 1, periodY));
  const d = hash2D(wrap(ix + 1, periodX), wrap(iy + 1, periodY));

  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

/** Ruído fBm que fecha perfeitamente nas bordas (u, v ∈ [0, 1)). */
export function tileableFbm2D(u: number, v: number, octaves = 4, basePeriod = 4): number {
  let sum = 0;
  let amplitude = 1;
  let normalization = 0;
  let period = basePeriod;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += periodicNoise2D(u * period, v * period, period, period) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    period *= 2;
  }

  return sum / (normalization || 1);
}

/** PRNG estável para variar corais, peixes e partículas sem Math.random no render. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lerpColor(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  amount: number,
): { r: number; g: number; b: number } {
  const t = clamp(amount);
  return {
    r: mix(from.r, to.r, t),
    g: mix(from.g, to.g, t),
    b: mix(from.b, to.b, t),
  };
}
