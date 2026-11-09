/**
 * Objetos sólidos do recife no espaço normalizado dos peixes.
 *
 * O terreno publica as rochas e corais em coordenadas de mundo; este módulo
 * converte cada um para um volume elíptico 3D em `(u, elevação, profundidade)`.
 * Os peixes usam esses volumes para:
 *  - desviar antecipadamente por tangente lateral ou passagem por cima;
 *  - deslizar suavemente na superfície sem nunca inverter velocidade para trás;
 *  - escolher refúgios acessíveis (dentro/ao lado de corais ou atrás de pedras)
 *    quando se assustam ou descansam, e pontos de pastagem na coroa dos corais.
 */

import type { DioramaFrame } from './framing';
import type { Vec3Tuple } from './fish/steering';

export type ReefObstacleKind = 'rock' | 'coral';

/** Obstáculo em coordenadas de mundo, publicado pelo terreno a cada layout. */
export interface ReefObstacle {
  x: number;
  z: number;
  baseY: number;
  topY: number;
  radius: number;
  kind: ReefObstacleKind;
}

/** O mesmo obstáculo no espaço normalizado usado pelo cardume. */
export interface ScreenObstacle {
  u: number;
  depth: number;
  /** Centro vertical em elevação (0 = leito, 1 = superfície). */
  elevation: number;
  halfHeight: number;
  radiusU: number;
  radiusDepth: number;
  kind: ReefObstacleKind;
  source: ReefObstacle;
}

const MIN_RADIUS = 0.002;

/**
 * Projeta os obstáculos de mundo para o espaço de tela do `DioramaFrame`.
 * A profundidade normalizada é linear em Z, então o raio em profundidade é uma
 * fração constante do alcance da câmera.
 */
export function projectReefObstacles(
  frame: DioramaFrame,
  obstacles: readonly ReefObstacle[],
  floorY: number,
  surfaceY: number,
  maxDepth = 0.98,
): ScreenObstacle[] {
  const result: ScreenObstacle[] = [];
  const spanY = Math.max(1e-4, surfaceY - floorY);
  const spanZ = Math.max(1e-4, frame.profile.zFar - frame.profile.zNear);

  for (const obstacle of obstacles) {
    const height = Math.max(0.2, obstacle.topY - obstacle.baseY);
    const midY = obstacle.baseY + height * 0.55;
    const projected = frame.projectWorld(obstacle.x, midY, obstacle.z);
    if (!projected) continue;
    if (projected.depth < 0 || projected.depth > maxDepth) continue;

    const halfWidth = Math.max(1e-3, frame.halfWidthAtDepth(projected.depth));
    result.push({
      u: projected.u,
      depth: projected.depth,
      elevation: (midY - floorY) / spanY,
      halfHeight: (height * 0.5) / spanY,
      radiusU: Math.max(MIN_RADIUS, obstacle.radius / halfWidth),
      radiusDepth: Math.max(MIN_RADIUS, obstacle.radius / spanZ),
      kind: obstacle.kind,
      source: obstacle,
    });
  }
  return result;
}

function verticalOverlap(point: Vec3Tuple, obstacle: ScreenObstacle, bodyRadius: number): boolean {
  return Math.abs(point[1] - obstacle.elevation) < obstacle.halfHeight + bodyRadius;
}

/**
 * Empurra o peixe para fora de qualquer coral/rocha que ele esteja ocupando e,
 * quando `velocity` é fornecida, projeta a velocidade no plano tangente/superior
 * do obstáculo (deslizamento hidrodinâmico, sem ricochete para trás).
 */
export function resolveReefCollisions(
  point: Vec3Tuple,
  bodyRadius: number,
  obstacles: readonly ScreenObstacle[],
  velocity?: Vec3Tuple,
): boolean {
  let corrected = false;

  for (const obstacle of obstacles) {
    if (!verticalOverlap(point, obstacle, bodyRadius)) continue;

    const effRadiusU = obstacle.radiusU + bodyRadius * 0.65;
    const effRadiusD = obstacle.radiusDepth + bodyRadius * 0.65;
    const du = point[0] - obstacle.u;
    const dd = point[2] - obstacle.depth;
    const su = du / effRadiusU;
    const sd = dd / effRadiusD;
    const distance = Math.hypot(su, sd);

    if (distance >= 1) continue;

    const topElevation = obstacle.elevation + obstacle.halfHeight + bodyRadius * 0.85;
    // Se o peixe já está no terço superior do obstáculo e o topo está abaixo de 0.72,
    // é mais natural passar por cima da cabeça do coral/pedra do que ficar preso ao lado.
    if (point[1] > obstacle.elevation + obstacle.halfHeight * 0.38 && topElevation < 0.74 && distance > 0.35) {
      point[1] = Math.max(point[1], topElevation);
      if (velocity && velocity[1] < 0.01) {
        velocity[1] = Math.max(0.015, Math.abs(velocity[1]) * 0.5);
      }
      corrected = true;
      continue;
    }

    let nu = 1;
    let nd = 0;
    if (distance < 1e-4) {
      point[0] = obstacle.u + effRadiusU * 1.03;
      point[2] = obstacle.depth;
    } else {
      const push = 1.03 / distance;
      point[0] = obstacle.u + du * push;
      point[2] = obstacle.depth + dd * push;
      const normLen = Math.hypot(su / effRadiusU, sd / effRadiusD) || 1;
      nu = su / effRadiusU / normLen;
      nd = sd / effRadiusD / normLen;
    }

    // Deslizamento tangencial: remove apenas a componente que aponta para dentro
    // da pedra/coral e preserva o fluxo ao redor do obstáculo.
    if (velocity) {
      const vn = velocity[0] * nu + velocity[2] * nd;
      if (vn < 0) {
        velocity[0] -= vn * nu * 1.08;
        velocity[2] -= vn * nd * 1.08;
        // Adiciona um leve impulso tangencial para destravar colisões frontais
        const tangentSign = velocity[0] * -nd + velocity[2] * nu >= 0 ? 1 : -1;
        const speedHoriz = Math.hypot(velocity[0], velocity[2]);
        const minSlide = Math.max(0.018, speedHoriz * 0.85);
        velocity[0] = -nd * tangentSign * minSlide;
        velocity[2] = nu * tangentSign * minSlide;
      }
      if (topElevation < 0.72) {
        velocity[1] += 0.008;
      }
    }

    corrected = true;
  }

  return corrected;
}

/**
 * Desvio preditivo 3D ao redor e por cima de corais e rochas:
 * combina repulsão radial com vetor tangente orientado pelo sentido de nado,
 * para o peixe contornar o modelo 3D com antecedência sem bater de frente.
 */
export function steerAroundReef(
  point: Vec3Tuple,
  desired: Vec3Tuple,
  bodyRadius: number,
  obstacles: readonly ScreenObstacle[],
  velocity?: Vec3Tuple,
): void {
  const lookU = point[0] + (velocity ? velocity[0] * 0.85 : desired[0] * 0.55);
  const lookE = point[1] + (velocity ? velocity[1] * 0.85 : desired[1] * 0.55);
  const lookD = point[2] + (velocity ? velocity[2] * 0.85 : desired[2] * 0.55);

  for (const obstacle of obstacles) {
    const vertMargin = obstacle.halfHeight + bodyRadius + 0.048;
    if (
      Math.abs(point[1] - obstacle.elevation) >= vertMargin &&
      Math.abs(lookE - obstacle.elevation) >= vertMargin
    ) {
      continue;
    }

    const effRadiusU = obstacle.radiusU + bodyRadius * 0.5;
    const effRadiusD = obstacle.radiusDepth + bodyRadius * 0.5;

    const du = point[0] - obstacle.u;
    const dd = point[2] - obstacle.depth;
    const su = du / effRadiusU;
    const sd = dd / effRadiusD;
    const distNow = Math.hypot(su, sd);

    const ldu = lookU - obstacle.u;
    const ldd = lookD - obstacle.depth;
    const distLook = Math.hypot(ldu / effRadiusU, ldd / effRadiusD);

    const distance = Math.min(distNow, distLook);
    const horizonRadius = 2.75;
    if (distance >= horizonRadius || distance < 1e-4) continue;

    const urgency = Math.pow((horizonRadius - distance) / horizonRadius, 1.35);
    const radialStrength = urgency * 0.038;

    const invDist = 1 / Math.max(1e-4, distNow);
    const ru = (su * invDist) / effRadiusU;
    const rd = (sd * invDist) / effRadiusD;
    const rLen = Math.hypot(ru, rd) || 1;
    const nu = ru / rLen;
    const nd = rd / rLen;

    // Tangente horizontal no sentido em que o peixe já está tentando nadar
    const tu = -nd;
    const td = nu;
    const dotTang = desired[0] * tu + desired[2] * td;
    const tangSign = dotTang >= 0 ? 1 : -1;
    const tangentStrength = urgency * 0.038;

    desired[0] += (nu * radialStrength + tu * tangSign * tangentStrength) * effRadiusU * 18;
    desired[2] += (nd * radialStrength + td * tangSign * tangentStrength) * effRadiusD * 8.5;

    // Incentiva subir suavemente por cima do topo da rocha/coral (fluxo hidrodinâmico de recife)
    const topClearance = obstacle.elevation + obstacle.halfHeight + bodyRadius;
    if (point[1] >= obstacle.elevation - obstacle.halfHeight * 0.35 && topClearance < 0.74) {
      desired[1] += urgency * 0.044;
    }
  }
}

/**
 * Encontra o obstáculo mais próximo de um tipo, em distância elíptica
 * normalizada. `maxDistance` é medido em raios do próprio obstáculo.
 */
export function nearestReefObstacle(
  point: Vec3Tuple,
  obstacles: readonly ScreenObstacle[],
  kind: ReefObstacleKind,
  maxDistance = 6,
  bodyRadius = 0.04,
): ScreenObstacle | null {
  let best: ScreenObstacle | null = null;
  let bestDistance = maxDistance;

  for (const obstacle of obstacles) {
    if (obstacle.kind !== kind) continue;
    if (Math.abs(point[1] - obstacle.elevation) > obstacle.halfHeight + bodyRadius + 0.5) continue;

    const du = (point[0] - obstacle.u) / obstacle.radiusU;
    const dd = (point[2] - obstacle.depth) / obstacle.radiusDepth;
    const distance = Math.hypot(du, dd);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = obstacle;
    }
  }

  return best;
}

/**
 * Encontra o melhor abrigo 3D próximo (colônia de coral ramificada ou rocha)
 * para um peixe assustado ou procurando esconderijo.
 */
export function nearestReefShelter(
  point: Vec3Tuple,
  obstacles: readonly ScreenObstacle[],
  maxDistance = 8.5,
  bodyRadius = 0.04,
): ScreenObstacle | null {
  let best: ScreenObstacle | null = null;
  let bestScore = maxDistance;

  for (const obstacle of obstacles) {
    if (Math.abs(point[1] - obstacle.elevation) > obstacle.halfHeight + bodyRadius + 0.55) continue;
    // Ignora rochas coladas demais nas bordas extremas da tela
    if (obstacle.u < 0.07 || obstacle.u > 0.93) continue;

    const du = (point[0] - obstacle.u) / obstacle.radiusU;
    const dd = (point[2] - obstacle.depth) / obstacle.radiusDepth;
    const distance = Math.hypot(du, dd);
    // Corais e rochas médias no interior do recife têm leve preferência como abrigo
    const kindWeight = obstacle.kind === 'coral' ? 0.88 : 0.94;
    const score = distance * kindWeight;
    if (score < bestScore) {
      bestScore = score;
      best = obstacle;
    }
  }

  return best;
}

/**
 * Ponto de interação inteligente e acessível (sem atravessar o modelo 3D):
 *  - `nibble`: estaciona na coroa/borda iluminada do coral do lado de onde o peixe vem;
 *  - `hide`: abriga-se na reentrância lateral/sombra do coral ou atrás da pedra,
 *    escolhendo o flanco acessível a partir de `approachFrom` para nunca tentar
 *    atravessar a rocha pelo meio.
 */
export function reefInteractionTarget(
  obstacle: ScreenObstacle,
  mode: 'nibble' | 'hide',
  approachFrom?: Vec3Tuple,
): Vec3Tuple {
  if (!approachFrom) {
    if (mode === 'hide') {
      return [
        obstacle.u - obstacle.radiusU * 0.25,
        obstacle.elevation + obstacle.halfHeight * 0.15,
        obstacle.depth + obstacle.radiusDepth * 1.55,
      ];
    }
    return [
      obstacle.u + obstacle.radiusU * 0.55,
      obstacle.elevation + obstacle.halfHeight * 0.35,
      obstacle.depth - obstacle.radiusDepth * 1.45,
    ];
  }

  const du = (approachFrom[0] - obstacle.u) / Math.max(MIN_RADIUS, obstacle.radiusU);
  const dd = (approachFrom[2] - obstacle.depth) / Math.max(MIN_RADIUS, obstacle.radiusDepth);
  const baseAngle = Math.hypot(du, dd) > 1e-3 ? Math.atan2(dd, du) : -Math.PI * 0.35;

  if (mode === 'nibble') {
    // Pastagem no coral: posiciona o peixe logo fora do raio da colônia (1.16x)
    // na metade superior iluminada do modelo 3D do coral.
    const grazeAngle = baseAngle * 0.75 + (-Math.PI * 0.25) * 0.25;
    return [
      obstacle.u + Math.cos(grazeAngle) * obstacle.radiusU * 1.16,
      Math.min(0.72, obstacle.elevation + obstacle.halfHeight * 0.42),
      obstacle.depth + Math.sin(grazeAngle) * obstacle.radiusDepth * 1.18,
    ];
  }

  // Esconderijo ('hide'):
  // - Se o abrigo é um coral, o peixe entra na copa/base protetora lateral do coral (1.06x raio);
  // - Se é uma rocha, contorna ~52° para o flanco abrigado/traseiro da pedra (1.24x raio)
  //   sem nunca exigir que o peixe cruze o interior sólido da rocha!
  const sideSign = obstacle.u > 0.5 ? -1 : 1;
  const shelterAngle =
    obstacle.kind === 'coral'
      ? baseAngle + sideSign * 0.48
      : baseAngle + sideSign * 0.92;
  const radialScale = obstacle.kind === 'coral' ? 1.06 : 1.24;
  const shelterElevation =
    obstacle.kind === 'coral'
      ? obstacle.elevation + obstacle.halfHeight * 0.18
      : Math.max(0.16, obstacle.elevation - obstacle.halfHeight * 0.12);

  return [
    obstacle.u + Math.cos(shelterAngle) * obstacle.radiusU * radialScale,
    shelterElevation,
    obstacle.depth + Math.sin(shelterAngle) * obstacle.radiusDepth * radialScale,
  ];
}
