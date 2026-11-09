/**
 * Steering físico de cardumes.
 *
 * Adaptado do projeto deepsea (código aberto) — `js/world.js`, funções
 * `steer`, `steerFish` e `rotateToward`. A formulação original foi mantida:
 * aceleração máxima, taxa de giro limitada, velocidade mínima/máxima e perda
 * de velocidade em curvas fechadas. O crédito é preservado aqui e no ADR-002.
 *
 * Aqui os vetores são tuplas puras para poderem ser testados sem Babylon.
 */

export type Vec3Tuple = [number, number, number];

export const tuple = (x = 0, y = 0, z = 0): Vec3Tuple => [x, y, z];

export function length(v: Vec3Tuple): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function normalize(v: Vec3Tuple): Vec3Tuple {
  const l = length(v);
  return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 1];
}

export function sub(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(v: Vec3Tuple, amount: number): Vec3Tuple {
  return [v[0] * amount, v[1] * amount, v[2] * amount];
}

export function dot(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function lerpTuple(a: Vec3Tuple, b: Vec3Tuple, amount: number): Vec3Tuple {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

export function clampLength(v: Vec3Tuple, min: number, max: number): Vec3Tuple {
  const l = length(v);
  if (l < 1e-9) return [0, 0, max];
  const target = Math.min(max, Math.max(min, l));
  return scale(v, target / l);
}

/** Gira `from` em direção a `to` no máximo `angle` radianos. */
export function rotateToward(from: Vec3Tuple, to: Vec3Tuple, angle: number): Vec3Tuple {
  const a = normalize(from);
  const b = normalize(to);
  const c = Math.max(-1, Math.min(1, dot(a, b)));
  const total = Math.acos(c);
  if (total < 1e-6 || angle <= 0) return a;

  const step = Math.min(total, angle);
  const sinTotal = Math.sin(total);
  if (sinTotal < 1e-6) return b;

  const wa = Math.sin(total - step) / sinTotal;
  const wb = Math.sin(step) / sinTotal;
  return normalize([
    a[0] * wa + b[0] * wb,
    a[1] * wa + b[1] * wb,
    a[2] * wa + b[2] * wb,
  ]);
}

/**
 * Steering com aceleração e giro limitados. Retorna a magnitude da aceleração
 * aplicada (usada para diagnóstico/testes).
 */
export function steer(
  velocity: Vec3Tuple,
  desired: Vec3Tuple,
  dt: number,
  aMax: number,
  turnMax: number,
  vMin: number,
  vMax: number,
): number {
  const step = Math.max(0, dt);
  const ax = desired[0] - velocity[0];
  const ay = desired[1] - velocity[1];
  const az = desired[2] - velocity[2];
  const al = Math.hypot(ax, ay, az);
  const k = al > aMax * step ? (aMax * step) / al : 1;

  let nx = velocity[0] + ax * k;
  let ny = velocity[1] + ay * k;
  let nz = velocity[2] + az * k;

  const s0 = length(velocity) || 1e-6;
  let s1 = Math.hypot(nx, ny, nz) || 1e-6;
  const c = (velocity[0] * nx + velocity[1] * ny + velocity[2] * nz) / (s0 * s1);
  const maxAngle = turnMax * step;

  if (c < Math.cos(maxAngle)) {
    const ux = velocity[0] / s0;
    const uy = velocity[1] / s0;
    const uz = velocity[2] / s0;
    let px = nx / s1 - ux * c;
    let py = ny / s1 - uy * c;
    let pz = nz / s1 - uz * c;
    const pl = Math.hypot(px, py, pz) || 1e-6;
    px /= pl;
    py /= pl;
    pz /= pl;
    nx = ux * Math.cos(maxAngle) + px * Math.sin(maxAngle);
    ny = uy * Math.cos(maxAngle) + py * Math.sin(maxAngle);
    nz = uz * Math.cos(maxAngle) + pz * Math.sin(maxAngle);
    nx *= s1;
    ny *= s1;
    nz *= s1;
  }

  s1 = Math.hypot(nx, ny, nz) || 1e-6;
  const sc = Math.min(vMax, Math.max(vMin, s1)) / s1;
  velocity[0] = nx * sc;
  velocity[1] = ny * sc;
  velocity[2] = nz * sc;
  return al;
}

/**
 * Peixes rápidos: nunca freiam "dando ré". A velocidade segue o empuxo e o
 * arrasto; a direção gira no máximo `turnMax` rad/s. Curvas fortes sangram
 * velocidade, mas o peixe continua nadando.
 */
export function steerFish(
  velocity: Vec3Tuple,
  desired: Vec3Tuple,
  dt: number,
  aMax: number,
  turnMax: number,
  vMin: number,
  vMax: number,
  decel = 1.2,
): number {
  const step = Math.max(0, dt);
  const s0 = length(velocity) || 1e-6;
  const dl = length(desired) || 1e-6;
  const f: Vec3Tuple = [velocity[0] / s0, velocity[1] / s0, velocity[2] / s0];
  const g: Vec3Tuple = [desired[0] / dl, desired[1] / dl, desired[2] / dl];
  const c = Math.max(-1, Math.min(1, dot(f, g)));
  const angle = Math.acos(c);
  const maxAngle = turnMax * step;

  let heading = g;
  if (angle > maxAngle) {
    let px = g[0] - f[0] * c;
    let py = g[1] - f[1] * c;
    let pz = g[2] - f[2] * c;
    let pl = Math.hypot(px, py, pz);
    if (pl < 1e-5) {
      px = f[2];
      py = 0;
      pz = -f[0];
      pl = Math.hypot(px, py, pz) || 1;
    }
    px /= pl;
    py /= pl;
    pz /= pl;
    heading = [
      f[0] * Math.cos(maxAngle) + px * Math.sin(maxAngle),
      f[1] * Math.cos(maxAngle) + py * Math.sin(maxAngle),
      f[2] * Math.cos(maxAngle) + pz * Math.sin(maxAngle),
    ];
  }

  const wanted = Math.min(
    vMax,
    Math.max(vMin, dl * (1 - 0.35 * Math.min(1, Math.max(0, angle / 1.5)))),
  );
  const next = s0 < wanted ? Math.min(wanted, s0 + aMax * step) : Math.max(wanted, s0 - decel * step);
  velocity[0] = heading[0] * next;
  velocity[1] = heading[1] * next;
  velocity[2] = heading[2] * next;
  return angle;
}
