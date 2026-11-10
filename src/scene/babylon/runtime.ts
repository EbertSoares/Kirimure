import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { Scene } from '@babylonjs/core/scene';
import type { SimulationState } from '../../simulation/types';
import type { DiveState } from './dive';
import { createOceanEngine, type RendererBackend } from './engine';
import type { CameraProfileId } from './framing';
import {
  OceanScene3D,
  type OceanPerformanceTelemetry,
  type SceneDebugVisualizationMode,
} from './oceanScene';
import { detectSceneQualityProfile, type SceneQualityProfile } from './quality';

export type { DiveState, OceanPerformanceTelemetry, SceneDebugVisualizationMode };

export class BabylonOceanRuntime {
  readonly backend: RendererBackend;
  readonly quality: SceneQualityProfile;
  private readonly scene3D: OceanScene3D;
  private disposed = false;

  private constructor(backend: RendererBackend, quality: SceneQualityProfile, scene3D: OceanScene3D) {
    this.backend = backend;
    this.quality = quality;
    this.scene3D = scene3D;
  }

  static async create(canvas: HTMLCanvasElement, state: SimulationState): Promise<BabylonOceanRuntime> {
    const { engine, backend } = await createOceanEngine(canvas);
    const quality = detectSceneQualityProfile();
    const scaling = engine.getHardwareScalingLevel() * quality.hardwareScaling;
    engine.setHardwareScalingLevel(scaling);
    const scene3D = new OceanScene3D(engine, canvas, quality, state);
    return new BabylonOceanRuntime(backend, quality, scene3D);
  }

  get state(): SimulationState {
    return this.scene3D.currentState;
  }

  get fishes() {
    return this.scene3D.fishes;
  }

  get cameraProfile(): CameraProfileId {
    return this.scene3D.cameraRig.currentProfile.id;
  }

  /** Expostos apenas para diagnóstico/QA; o React não deve montar a cena por aqui. */
  get scene(): Scene {
    return this.scene3D.scene;
  }

  get engine(): AbstractEngine {
    return this.scene3D.scene.getEngine();
  }

  getDiagnostics(): OceanPerformanceTelemetry {
    return this.scene3D.getDiagnostics();
  }

  get diveState(): DiveState {
    return this.scene3D.diveState;
  }

  toggleDive(): boolean {
    if (this.disposed) return false;
    return this.scene3D.toggleDive();
  }

  onDiveStateChange(listener: (state: DiveState) => void): () => void {
    if (this.disposed) return () => {};
    return this.scene3D.onDiveStateChange(listener);
  }

  setDebugMode(mode: SceneDebugVisualizationMode): void {
    if (this.disposed) return;
    this.scene3D.setDebugVisualizationMode(mode);
  }

  updateState(state: SimulationState): void {
    if (this.disposed) return;
    this.scene3D.updateState(state);
  }

  resize(): void {
    if (this.disposed) return;
    this.scene3D.resize();
  }

  resetReefLife(): void {
    if (this.disposed) return;
    this.scene3D.resetReefLife();
  }

  getFps(): number {
    return Math.round(this.scene3D.scene.getEngine().getFps());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const engine = this.scene3D.scene.getEngine();
    this.scene3D.dispose();
    engine.dispose();
  }
}
