/**
 * Matemática pura do enquadramento do diorama.
 *
 * A câmera é fixa e olha para +Z. O deslocamento vertical da composição é feito
 * por lens shift (`projectionPlaneTilt`), portanto o horizonte permanece reto.
 *
 * O `DioramaFrame` mapeia coordenadas normalizadas de tela para o frustum real.
 * Cardumes, recife, barco e efeitos navegam nesse espaço; assim, mudar de desktop
 * para mobile reposiciona tudo sem depender de "fittings" espalhados pelo runtime.
 */

import { clamp } from './procedural';

export type CameraProfileId = 'desktop' | 'mobile';

export interface CameraProfile {
  id: CameraProfileId;
  /** FOV vertical em radianos. */
  fov: number;
  /** Fração da altura da tela onde o horizonte aparece (0 = topo). */
  waterlineScreenY: number;
  lensShift: number;
  camY: number;
  camZ: number;
  zNear: number;
  zFar: number;
  /** Faixa vertical segura para conteúdo (0 = topo). */
  contentTop: number;
  contentBottom: number;
  /** Margem horizontal segura, em fração da largura. */
  marginX: number;
  /** Profundidade mínima/máxima para cardumes (normalizada). */
  fishDepthMin: number;
  fishDepthMax: number;
}

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export interface ScreenPoint {
  u: number;
  v: number;
  depth: number;
}

const DESKTOP_PROFILE: Omit<CameraProfile, 'lensShift'> = {
  id: 'desktop',
  fov: 0.95,
  waterlineScreenY: 0.27,
  camY: 1.85,
  camZ: -4,
  zNear: 6,
  zFar: 46,
  contentTop: 0.32,
  contentBottom: 0.93,
  marginX: 0.04,
  // Camada frontal bem perto da câmera: alguns cardumes cruzam o primeiro plano
  // em tamanho de leitura, enquanto as outras camadas seguem no recife.
  fishDepthMin: 0.09,
  fishDepthMax: 0.88,
};

const MOBILE_PROFILE: Omit<CameraProfile, 'lensShift'> = {
  id: 'mobile',
  fov: 1.18,
  waterlineScreenY: 0.25,
  camY: 1.6,
  camZ: -3,
  zNear: 6,
  zFar: 42,
  contentTop: 0.32,
  contentBottom: 0.9,
  marginX: 0.06,
  fishDepthMin: 0.12,
  fishDepthMax: 0.88,
};

function withLensShift(profile: Omit<CameraProfile, 'lensShift'>): CameraProfile {
  return {
    ...profile,
    lensShift: 1 - 2 * profile.waterlineScreenY,
  };
}

export function resolveCameraProfile(aspect: number, coarsePointer = false): CameraProfile {
  return aspect < 1.1 || coarsePointer ? withLensShift(MOBILE_PROFILE) : withLensShift(DESKTOP_PROFILE);
}

export class DioramaFrame {
  readonly profile: CameraProfile;
  readonly aspect: number;
  readonly shift: number;
  readonly tanHalfFov: number;
  readonly camY: number;
  readonly camZ: number;

  constructor(profile: CameraProfile, aspect: number) {
    this.profile = profile;
    this.aspect = Math.max(0.15, aspect || 1);
    this.shift = profile.lensShift;
    this.tanHalfFov = Math.tan(profile.fov * 0.5);
    this.camY = profile.camY;
    this.camZ = profile.camZ;
  }

  withAspect(aspect: number): DioramaFrame {
    if (Math.abs(aspect - this.aspect) < 1e-6) return this;
    return new DioramaFrame(this.profile, aspect);
  }

  get horizonScreenY(): number {
    return (1 - this.shift) / 2;
  }

  relativeDepth(depth: number): number {
    return this.profile.zNear + clamp(depth) * (this.profile.zFar - this.profile.zNear);
  }

  /** Converte (u, v, depth) em posição de mundo no frustum visível. */
  project(u: number, v: number, depth: number): WorldPoint {
    const relZ = this.relativeDepth(depth);
    const ndcX = u * 2 - 1;
    const ndcY = 1 - v * 2;
    return {
      x: ndcX * relZ * this.tanHalfFov * this.aspect,
      y: this.camY + (ndcY - this.shift) * relZ * this.tanHalfFov,
      z: this.camZ + relZ,
    };
  }

  /** Projeta um ponto de mundo de volta para coordenadas normalizadas. */
  projectWorld(x: number, y: number, z: number): ScreenPoint | null {
    const relZ = z - this.camZ;
    if (relZ <= 1e-4) return null;
    const ndcX = x / (relZ * this.tanHalfFov * this.aspect);
    const ndcY = (y - this.camY) / (relZ * this.tanHalfFov) + this.shift;
    return {
      u: (ndcX + 1) / 2,
      v: (1 - ndcY) / 2,
      depth: clamp((relZ - this.profile.zNear) / (this.profile.zFar - this.profile.zNear)),
    };
  }

  /** Altura de tela (fração a partir do topo) da superfície y = 0 nesta profundidade. */
  surfaceScreenYAtDepth(depth: number): number {
    const relZ = this.relativeDepth(depth);
    const ndcY = (0 - this.camY) / (relZ * this.tanHalfFov) + this.shift;
    return (1 - ndcY) / 2;
  }

  /** Altura de tela do leito nesta profundidade. */
  seabedScreenYAtDepth(depth: number, seabedY: number): number {
    const relZ = this.relativeDepth(depth);
    const ndcY = (seabedY - this.camY) / (relZ * this.tanHalfFov) + this.shift;
    return (1 - ndcY) / 2;
  }

  /** Largura horizontal visível (mundo) nesta profundidade, útil para dimensionar recife e barco. */
  halfWidthAtDepth(depth: number): number {
    return this.relativeDepth(depth) * this.tanHalfFov * this.aspect;
  }

  /**
   * Posição de um peixe dentro da coluna d'água.
   *
   * `elevation = 0` é o leito; `elevation = 1` é a lâmina d'água (com uma
   * pequena folga para nunca furar a superfície). A posição horizontal continua
   * sendo mapeada por `u`, então margens seguras garantem contenção mobile.
   */
  fishToWorld(
    u: number,
    elevation: number,
    depth: number,
    seabedAt: (x: number, z: number) => number,
    surfaceClearance = 0.45,
  ): WorldPoint {
    const relZ = this.relativeDepth(depth);
    const ndcX = u * 2 - 1;
    const x = ndcX * relZ * this.tanHalfFov * this.aspect;
    const z = this.camZ + relZ;
    const seabed = seabedAt(x, z);
    const ceiling = -surfaceClearance;
    const y = seabed + clamp(elevation) * (ceiling - seabed);
    return { x, y, z };
  }

  /** Ponto de superfície usado por barco/boias: mesma u/profundidade, y livre. */
  surfacePoint(u: number, depth: number): { x: number; z: number } {
    const relZ = this.relativeDepth(depth);
    return {
      x: (u * 2 - 1) * relZ * this.tanHalfFov * this.aspect,
      z: this.camZ + relZ,
    };
  }
}
