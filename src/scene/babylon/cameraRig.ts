import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { DioramaFrame, resolveCameraProfile, type CameraProfile } from './framing';
import { clamp } from './procedural';

export interface CameraRigResult {
  frame: DioramaFrame;
  profile: CameraProfile;
  profileChanged: boolean;
  aspectChanged: boolean;
}

type SeabedSampler = (x: number, z: number) => number;

/**
 * Câmera com deslocamento de lente vertical de verdade.
 *
 * `projectionPlaneTilt` do Babylon não desloca o horizonte: ele cisalha a
 * projeção e joga o conteúdo abaixo do plano d'água para fora do far clip.
 * Aqui o deslocamento entra no termo `m[9]` da matriz, exatamente como uma
 * lente descentrada: `y_ndc = f(y/z) + shift`, sem alterar o eixo Z.
 */
class DioramaCamera extends FreeCamera {
  private lensShift = 0;

  setLensShift(shift: number): void {
    this.lensShift = shift;
  }

  override getProjectionMatrix(force?: boolean): Matrix {
    const matrix = super.getProjectionMatrix(force);
    // O getter `m` é tipado como somente leitura; a matriz em si é mutável e
    // este é o mesmo objeto reutilizado pelo Babylon.
    (matrix.m as unknown as number[])[9] = this.lensShift;
    return matrix;
  }
}

function detectCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Câmera fixa do diorama.
 *
 * Sem órbita, sem zoom, sem inputs: a composição é parte do produto. O horizonte
 * é posicionado por lens shift, não por pitch, para manter o quadro reto.
 */
export class CameraRig {
  readonly camera: DioramaCamera;
  private profile: CameraProfile;
  private frame: DioramaFrame;
  private aspect: number;
  private diveProgress = 0;

  constructor(scene: Scene, width: number, height: number, coarsePointer = detectCoarsePointer()) {
    this.aspect = Math.max(0.15, width / Math.max(1, height));
    this.profile = resolveCameraProfile(this.aspect, coarsePointer);
    this.frame = new DioramaFrame(this.profile, this.aspect);

    this.camera = new DioramaCamera('camera-diorama-fixo', new Vector3(0, this.profile.camY, this.profile.camZ), scene);
    this.camera.inputs.clear();
    this.camera.inertia = 0;
    this.camera.minZ = 0.5;
    // A esfera do céu tem raio 600; o far plane precisa alcançá-la.
    this.camera.maxZ = 1600;
    this.camera.fov = this.profile.fov;
    this.camera.setLensShift(this.profile.lensShift);
    this.applyPose(0, this.profile.camY, this.profile.camZ, this.profile.camY, this.profile.camZ + 10);
    this.camera.getProjectionMatrix(true);
    scene.activeCamera = this.camera;
  }

  get currentFrame(): DioramaFrame {
    return this.frame;
  }

  get currentProfile(): CameraProfile {
    return this.profile;
  }

  get currentDiveProgress(): number {
    return this.diveProgress;
  }

  /** Altura atual da câmera; negativa quando a exploração está submersa. */
  get eyeY(): number {
    return this.camera.position.y;
  }

  /**
   * Aplica a descida vertical.
   *
   * `progress = 0` devolve a câmera de superfície original. `progress = 1`
   * leva a câmera para o canal central, 1,65 m acima do leito local, olhando
   * ligeiramente para cima. A posição é sempre elevada acima do terreno para
   * nunca atravessar o leito durante a transição.
   */
  setDiveProgress(progress: number, seabedAt: SeabedSampler): void {
    this.diveProgress = clamp(progress);
    const startY = this.profile.camY;
    const startZ = this.profile.camZ;
    const targetZ = startZ + (this.profile.zFar - this.profile.zNear) * 0.55;
    const targetY = seabedAt(0, targetZ) + 1.65;

    const x = 0;
    const z = startZ + (targetZ - startZ) * this.diveProgress;
    const y = startY + (targetY - startY) * this.diveProgress;
    const floorY = seabedAt(x, z) + 0.85;
    const safeY = Math.max(y, floorY);

    const targetStartY = startY;
    const targetStartZ = startZ + 10;
    const targetEndY = targetY + 2.55;
    const targetEndZ = targetZ + 11;
    const lookY = targetStartY + (targetEndY - targetStartY) * this.diveProgress;
    const lookZ = targetStartZ + (targetEndZ - targetStartZ) * this.diveProgress;

    this.applyPose(x, safeY, z, lookY, lookZ);
  }

  private applyPose(x: number, y: number, z: number, lookY: number, lookZ: number): void {
    this.camera.position.set(x, y, z);
    this.camera.setTarget(new Vector3(x, lookY, lookZ));
  }

  resize(width: number, height: number, coarsePointer = detectCoarsePointer()): CameraRigResult {
    const nextAspect = Math.max(0.15, width / Math.max(1, height));
    const nextProfile = resolveCameraProfile(nextAspect, coarsePointer);
    const profileChanged = nextProfile.id !== this.profile.id;
    const aspectChanged = Math.abs(nextAspect - this.aspect) > 1e-4;

    this.aspect = nextAspect;
    this.profile = nextProfile;
    this.frame = new DioramaFrame(nextProfile, nextAspect);

    this.camera.fov = nextProfile.fov;
    this.camera.setLensShift(nextProfile.lensShift);
    this.applyPose(0, nextProfile.camY, nextProfile.camZ, nextProfile.camY, nextProfile.camZ + 10);
    this.camera.getProjectionMatrix(true);

    return {
      frame: this.frame,
      profile: nextProfile,
      profileChanged,
      aspectChanged,
    };
  }

  dispose(): void {
    this.camera.dispose();
  }
}
