/**
 * Fachada da cena 3D do Kirimurê.
 *
 * Monta câmera, céu, oceano espectral FFT, terreno, barco 6-DOF de Arquimedes,
 * peixes com Spatial Hash 3D e efeitos volumétricos; mantém o pipeline HDR ACES
 * calibrado e telemetria de diagnóstico técnico em tempo real.
 */

import '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/core/Shaders/default.vertex';
import '@babylonjs/core/Shaders/default.fragment';
import '@babylonjs/core/Shaders/pbr.vertex';
import '@babylonjs/core/Shaders/pbr.fragment';
import '@babylonjs/core/Shaders/rgbdDecode.fragment';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Scene } from '@babylonjs/core/scene';
import type { SimulationState } from '../../simulation/types';
import { CameraRig } from './cameraRig';
import { createBoatSystem, type BoatSystem } from './boat';
import { createEffectsSystem, type EffectsSystem } from './effects';
import { createFishSystem, type FishDiagnostic, type FishSystem } from './fish/FishSystem';
import type { DioramaFrame } from './framing';
import type { SceneQualityProfile } from './quality';
import { createSkySystem, type SkySystem } from './sky';
import { createTerrainSystem, type TerrainSystem } from './terrain';
import { VisualStateTracker } from './visualState';
import { createWaterSystem, type OceanDebugMode, type WaterSystem } from './water';
import { clamp } from './procedural';

export type SceneDebugVisualizationMode = OceanDebugMode | 'buoyancy';

export interface OceanPerformanceTelemetry {
  fps: number;
  frameTimeMs: number;
  oceanSimTimeMs: number;
  boatPhysicsTimeMs: number;
  fishAiTimeMs: number;
  activeMeshes: number;
  totalVertices: number;
  totalTriangles: number;
  fftResolution: string;
  qualityLabel: string;
  debugMode: SceneDebugVisualizationMode;
  boatPitchDeg: number;
  boatRollDeg: number;
  boatHeaveM: number;
}

export class OceanScene3D {
  readonly scene: Scene;
  readonly quality: SceneQualityProfile;
  readonly cameraRig: CameraRig;
  private readonly sky: SkySystem;
  private readonly water: WaterSystem;
  private readonly terrain: TerrainSystem;
  private readonly boat: BoatSystem;
  private readonly effects: EffectsSystem;
  private readonly fish: FishSystem;
  private readonly hdr: DefaultRenderingPipeline;
  private readonly visual = new VisualStateTracker();
  private state: SimulationState;
  private elapsed = 0;
  private lastTime = 0;
  private debugMode: SceneDebugVisualizationMode = 'none';
  private readonly telemetry: OceanPerformanceTelemetry;
  private readonly renderCallback: () => void;

  constructor(engine: AbstractEngine, canvas: HTMLCanvasElement, quality: SceneQualityProfile, state: SimulationState) {
    this.quality = quality;
    this.state = state;

    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.02, 0.28, 0.52, 1);
    this.scene.ambientColor = new Color3(0.08, 0.22, 0.34);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = new Color3(0.03, 0.34, 0.58);
    this.scene.fogDensity = 0.012;

    const renderWidth = engine.getRenderWidth();
    const renderHeight = engine.getRenderHeight();
    this.cameraRig = new CameraRig(this.scene, renderWidth, renderHeight);
    this.hdr = this.createHdrPipeline();

    this.sky = createSkySystem(this.scene, quality);
    this.terrain = createTerrainSystem(this.scene, quality);
    this.water = createWaterSystem(this.scene, quality);
    this.boat = createBoatSystem(this.scene);
    this.effects = createEffectsSystem(this.scene, quality);
    this.fish = createFishSystem(this.scene, quality, {
      obstacles: this.terrain.obstacles,
      seabedAt: this.terrain.heightAt,
    });

    for (const mesh of this.terrain.meshes) this.water.addRenderable(mesh);
    for (const mesh of this.boat.meshes) this.water.addRenderable(mesh);
    for (const mesh of this.effects.meshes) this.water.addRenderable(mesh);
    for (const mesh of this.fish.meshes) this.water.addRenderable(mesh);
    for (const mesh of this.sky.meshes) this.water.addReflectionRenderable(mesh);

    this.telemetry = {
      fps: 60,
      frameTimeMs: 16.6,
      oceanSimTimeMs: 0,
      boatPhysicsTimeMs: 0,
      fishAiTimeMs: 0,
      activeMeshes: this.scene.meshes.length,
      totalVertices: this.scene.getTotalVertices(),
      totalTriangles: Math.round(
        this.scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices(), 0) / 3,
      ),
      fftResolution: `${quality.fftCascades}×${quality.fftSize}×${quality.fftSize} JONSWAP/Phillips`,
      qualityLabel: quality.label,
      debugMode: 'none',
      boatPitchDeg: 0,
      boatRollDeg: 0,
      boatHeaveM: 0,
    };

    this.applyLayout(this.cameraRig.currentFrame);
    this.visual.update(state, 0, true);

    this.lastTime = typeof performance !== 'undefined' ? performance.now() : 0;
    this.renderCallback = () => this.tick(canvas);
    engine.runRenderLoop(this.renderCallback);
  }

  get fishes(): readonly FishDiagnostic[] {
    return this.fish.fishes;
  }

  get currentState(): SimulationState {
    return this.state;
  }

  get currentVisual() {
    return this.visual.value;
  }

  getDiagnostics(): OceanPerformanceTelemetry {
    return this.telemetry;
  }

  setDebugVisualizationMode(mode: SceneDebugVisualizationMode): void {
    this.debugMode = mode;
    this.telemetry.debugMode = mode;
    if (mode === 'buoyancy') {
      this.water.setDebugMode('none');
      this.boat.setDebugProbesVisible(true);
    } else {
      this.boat.setDebugProbesVisible(false);
      this.water.setDebugMode(mode);
    }
  }

  updateState(state: SimulationState): void {
    this.state = state;
  }

  resize(): void {
    const engine = this.scene.getEngine();
    this.scene.getEngine().resize();
    const width = engine.getRenderWidth();
    const height = engine.getRenderHeight();
    const result = this.cameraRig.resize(width, height);
    this.applyLayout(result.frame);
  }

  resetReefLife(): void {
    this.fish.reset();
    this.visual.reset();
    this.visual.update(this.state, 0, true);
  }

  dispose(): void {
    this.scene.getEngine().stopRenderLoop(this.renderCallback);
    this.hdr.dispose();
    this.scene.dispose();
  }

  private createHdrPipeline(): DefaultRenderingPipeline {
    const pipeline = new DefaultRenderingPipeline(
      'hdr-kirimure',
      true,
      this.scene,
      [this.cameraRig.camera],
    );
    pipeline.fxaaEnabled = this.quality.fxaa;
    pipeline.samples = this.quality.level === 'low' ? 0 : this.quality.level === 'medium' ? 2 : 4;
    pipeline.bloomEnabled = this.quality.bloom;
    pipeline.bloomThreshold = 0.94;
    pipeline.bloomWeight = 0.16;
    pipeline.bloomKernel = 32;
    pipeline.bloomScale = 0.5;

    const imageProcessing = pipeline.imageProcessing;
    imageProcessing.toneMappingEnabled = true;
    imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    imageProcessing.exposure = 0.98;
    imageProcessing.contrast = 1.1;
    imageProcessing.vignetteEnabled = false;
    return pipeline;
  }

  private tick(canvas: HTMLCanvasElement): void {
    const frameStart = typeof performance !== 'undefined' ? performance.now() : this.lastTime + 16;
    const dt = clamp((frameStart - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = frameStart;
    this.elapsed += dt;

    const visual = this.visual.update(this.state, dt);
    this.sky.update(dt, visual);
    this.sky.setCameraPosition(this.cameraRig.camera.position);

    const tBoat0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.boat.update(this.elapsed, dt, visual.waterClarity);
    const tBoat1 = typeof performance !== 'undefined' ? performance.now() : 0;

    // Alimenta a superfície oceânica com o estado atual da esteira Kelvin do barco
    this.water.setBoatWakeState(this.boat.getWakeState());

    const tOcean0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.water.update(this.elapsed, visual);
    const tOcean1 = typeof performance !== 'undefined' ? performance.now() : 0;

    this.terrain.updateVisual(visual, this.elapsed);
    this.effects.update(this.elapsed, dt, visual);

    const tFish0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.fish.update(this.elapsed, dt, this.state, visual, this.boat.getHullBounds());
    const tFish1 = typeof performance !== 'undefined' ? performance.now() : 0;

    // A névoa subaquática azul-turquesa acompanha turbidez, esgoto e óleo; o céu fica fora da névoa.
    this.scene.fogDensity = clamp(0.011 + visual.turbidity * 0.028 + visual.sewage * 0.012 + visual.oil * 0.006, 0.008, 0.052);
    this.scene.fogColor.set(
      0.028 + visual.turbidity * 0.06 + visual.sewage * 0.05,
      0.34 - visual.turbidity * 0.06 + visual.sewage * 0.03 - visual.oil * 0.08,
      0.58 - visual.turbidity * 0.16 - visual.sewage * 0.14 - visual.oil * 0.16,
    );

    this.scene.render();
    const frameEnd = typeof performance !== 'undefined' ? performance.now() : frameStart + 16;

    // Suaviza métricas de telemetria
    this.telemetry.fps = Math.round(this.scene.getEngine().getFps());
    this.telemetry.frameTimeMs = this.telemetry.frameTimeMs * 0.85 + (frameEnd - frameStart) * 0.15;
    this.telemetry.oceanSimTimeMs = this.telemetry.oceanSimTimeMs * 0.85 + (tOcean1 - tOcean0) * 0.15;
    this.telemetry.boatPhysicsTimeMs = this.telemetry.boatPhysicsTimeMs * 0.85 + (tBoat1 - tBoat0) * 0.15;
    this.telemetry.fishAiTimeMs = this.telemetry.fishAiTimeMs * 0.85 + (tFish1 - tFish0) * 0.15;
    this.telemetry.activeMeshes = this.scene.getActiveMeshes().length;
    this.telemetry.boatPitchDeg = (this.boat.solver.pitch * 180) / Math.PI;
    this.telemetry.boatRollDeg = (this.boat.solver.roll * 180) / Math.PI;
    this.telemetry.boatHeaveM = this.boat.solver.y;
    void canvas;
  }

  private applyLayout(frame: DioramaFrame): void {
    this.terrain.layout(frame);
    this.water.layout(frame);
    this.boat.layout(frame);
    this.effects.layout(frame, this.terrain.heightAt);
    this.fish.layout(frame);
    this.updateDepthVariables(frame);
  }

  private updateDepthVariables(frame: DioramaFrame): void {
    if (typeof document === 'undefined') return;
    const card = document.querySelector<HTMLElement>('.scene-card');
    if (!card) return;
    const referenceDepth = 0.72;
    const top = frame.surfaceScreenYAtDepth(referenceDepth);
    const bottom = frame.seabedScreenYAtDepth(referenceDepth, -8.4);
    card.style.setProperty('--depth-top', `${(top * 100).toFixed(2)}%`);
    card.style.setProperty('--depth-bottom', `${(bottom * 100).toFixed(2)}%`);
    card.setAttribute('data-camera-profile', frame.profile.id);
  }
}
