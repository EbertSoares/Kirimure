import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { DioramaFrame, resolveCameraProfile, type CameraProfile } from './framing';

export interface CameraRigResult {
  frame: DioramaFrame;
  profile: CameraProfile;
  profileChanged: boolean;
  aspectChanged: boolean;
}

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

export function detectCoarsePointer(): boolean {
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
    this.camera.setTarget(new Vector3(0, this.profile.camY, this.profile.camZ + 10));
    this.camera.getProjectionMatrix(true);
    scene.activeCamera = this.camera;
  }

  get currentFrame(): DioramaFrame {
    return this.frame;
  }

  get currentProfile(): CameraProfile {
    return this.profile;
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
    this.camera.position.set(0, nextProfile.camY, nextProfile.camZ);
    this.camera.setTarget(new Vector3(0, nextProfile.camY, nextProfile.camZ + 10));
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
