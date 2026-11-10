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
import '@babylonjs/core/Shaders/shadowMap.vertex';
import '@babylonjs/core/Shaders/shadowMap.fragment';
import '@babylonjs/core/Shaders/depth.vertex';
import '@babylonjs/core/Shaders/depth.fragment';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Scene } from '@babylonjs/core/scene';
import type { SimulationState } from '../../simulation/types';
import { CameraRig } from './cameraRig';
import { createBoatSystem, type BoatSystem } from './boat';
import { DiveController, type DiveState } from './dive';
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
  private readonly shadowGenerator: ShadowGenerator;
  private readonly hdr: DefaultRenderingPipeline;
  private readonly visual = new VisualStateTracker();
  private state: SimulationState;
  private elapsed = 0;
  private lastTime = 0;
  private debugMode: SceneDebugVisualizationMode = 'none';
  private readonly telemetry: OceanPerformanceTelemetry;
  private readonly renderCallback: () => void;
  private readonly baseHardwareScaling: number;
  private readonly dive = new DiveController();
  private readonly diveListeners = new Set<(state: DiveState) => void>();
  private lastDiveState: DiveState = 'surface';
  private governorTime = 0;
  private governorCooldown = 6;

  constructor(engine: AbstractEngine, canvas: HTMLCanvasElement, quality: SceneQualityProfile, state: SimulationState) {
    this.quality = quality;
    this.state = state;

    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.02, 0.28, 0.52, 1);
    this.scene.ambientColor = new Color3(0.08, 0.22, 0.34);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = new Color3(0.02, 0.29, 0.52);
    this.scene.fogDensity = 0.0085;

    const renderWidth = engine.getRenderWidth();
    const renderHeight = engine.getRenderHeight();
    this.cameraRig = new CameraRig(this.scene, renderWidth, renderHeight);
    this.hdr = this.createHdrPipeline();

    this.sky = createSkySystem(this.scene, quality);
    this.terrain = createTerrainSystem(this.scene, quality);
    this.water = createWaterSystem(this.scene, quality);
    this.boat = createBoatSystem(this.scene, quality, (loadedMesh) => {
      this.shadowGenerator.addShadowCaster(loadedMesh, false);
      this.water.addRenderable(loadedMesh);
    });
    this.effects = createEffectsSystem(this.scene, quality);
    this.fish = createFishSystem(this.scene, quality, {
      obstacles: this.terrain.obstacles,
      seabedAt: this.terrain.heightAt,
    });
    this.shadowGenerator = this.createShadowSystem();
    this.baseHardwareScaling = engine.getHardwareScalingLevel();

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

  get shadows(): ShadowGenerator {
    return this.shadowGenerator;
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

  get diveState(): DiveState {
    return this.dive.state;
  }

  get diveProgress(): number {
    return this.dive.easedProgress;
  }

  /** Inicia/retoma a exploração vertical. Retorna false durante transições. */
  toggleDive(): boolean {
    const started = this.dive.toggle();
    if (started) this.emitDiveState();
    return started;
  }

  /** Observa mudanças de estado da câmera vertical (surface/underwater/etc.). */
  onDiveStateChange(listener: (state: DiveState) => void): () => void {
    this.diveListeners.add(listener);
    return () => {
      this.diveListeners.delete(listener);
    };
  }

  private emitDiveState(): void {
    for (const listener of this.diveListeners) listener(this.dive.state);
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
    this.cameraRig.setDiveProgress(this.dive.easedProgress, this.terrain.heightAt);
  }

  resetReefLife(): void {
    this.fish.reset();
    this.visual.reset();
    this.visual.update(this.state, 0, true);
  }

  dispose(): void {
    this.scene.getEngine().stopRenderLoop(this.renderCallback);
    this.shadowGenerator.dispose();
    this.hdr.dispose();
    this.scene.dispose();
  }

  private createShadowSystem(): ShadowGenerator {
    const mapSize =
      this.quality.shadowMapSize ??
      (this.quality.level === 'ultra' ? 2048 : this.quality.level === 'low' ? 512 : 1024);
    const generator = new ShadowGenerator(mapSize, this.sky.sunLight);
    generator.usePercentageCloserFiltering = true;
    if (this.quality.level === 'ultra') {
      generator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
    } else if (this.quality.level === 'high') {
      generator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    } else {
      generator.filteringQuality = ShadowGenerator.QUALITY_LOW;
    }

    generator.bias = 0.0025;
    generator.normalBias = 0.01;
    generator.darkness = 0.52;
    generator.transparencyShadow = false;

    // 1. Sombras do barco
    for (const mesh of this.boat.shadowCasters) {
      generator.addShadowCaster(mesh, false);
    }

    // 2. Sombras das pedras e corais
    for (const mesh of this.terrain.shadowCasters) {
      generator.addShadowCaster(mesh, false);
    }

    // 3. Sombras dos peixes
    for (const mesh of this.fish.shadowCasters) {
      generator.addShadowCaster(mesh, false);
    }

    return generator;
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
    pipeline.bloomThreshold = 1.0;
    pipeline.bloomWeight = 0.22;
    pipeline.bloomKernel = 48;
    pipeline.bloomScale = 0.5;

    const imageProcessing = pipeline.imageProcessing;
    imageProcessing.toneMappingEnabled = true;
    imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    imageProcessing.exposure = 1.02;
    imageProcessing.contrast = 1.14;

    // Color grading sutil: saturação tropical sem estourar os brancos da
    // espuma e do céu, com sombras um pouco mais ricas.
    const curves = new ColorCurves();
    curves.globalSaturation = 13;
    curves.shadowsSaturation = 8;
    curves.highlightsSaturation = -6;
    imageProcessing.colorCurvesEnabled = true;
    imageProcessing.colorCurves = curves;

    // Vinheta discreta para fechar o diorama e puxar o olhar ao centro.
    imageProcessing.vignetteEnabled = true;
    imageProcessing.vignetteWeight = 1.15;
    imageProcessing.vignetteStretch = 0.28;
    imageProcessing.vignetteColor = new Color4(0.01, 0.045, 0.075, 1);
    return pipeline;
  }

  private tick(canvas: HTMLCanvasElement): void {
    const frameStart = typeof performance !== 'undefined' ? performance.now() : this.lastTime + 16;
    const dt = clamp((frameStart - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = frameStart;
    this.elapsed += dt;

    this.dive.update(dt);
    if (this.dive.state !== this.lastDiveState) {
      this.lastDiveState = this.dive.state;
      this.emitDiveState();
    }
    this.cameraRig.setDiveProgress(this.dive.easedProgress, this.terrain.heightAt);
    const cameraDepth = Math.max(0, -this.cameraRig.eyeY);
    this.water.setCameraDepth(cameraDepth);

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
    // Abaixo da superfície, a extinção cresce com a profundidade da câmera: a
    // luz solar é absorvida e espalhada ao longo do caminho óptico.
    const depthFactor = clamp(cameraDepth / 12, 0, 1);
    const underwaterFog = cameraDepth > 0.15 ? 0.004 + depthFactor * 0.02 : 0;
    this.scene.fogDensity = clamp(
      0.0085 + visual.turbidity * 0.026 + visual.sewage * 0.012 + visual.oil * 0.006 + underwaterFog,
      0.007,
      0.062,
    );
    const fogR = 0.024 + visual.turbidity * 0.06 + visual.sewage * 0.05;
    const fogG = 0.3 - visual.turbidity * 0.05 + visual.sewage * 0.03 - visual.oil * 0.08;
    const fogB = 0.52 - visual.turbidity * 0.14 - visual.sewage * 0.14 - visual.oil * 0.16;
    this.scene.fogColor.set(
      fogR + (0.008 - fogR) * depthFactor * 0.7,
      fogG + (0.13 - fogG) * depthFactor * 0.7,
      fogB + (0.3 - fogB) * depthFactor * 0.7,
    );
    this.scene.clearColor.set(
      this.scene.fogColor.r,
      this.scene.fogColor.g,
      this.scene.fogColor.b,
      1,
    );

    this.scene.render();
    this.updatePerformanceGovernor(dt);
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

  /**
   * Governador dinâmico de resolução: se o dispositivo não sustentar ~42 FPS,
   * reduz a resolução interna em passos de 12% (até 1.9x o scaling base). Se
   * sobrar folga (>56 FPS por 6 s), devolve a nitidez aos poucos. Isso mantém
   * celulares e GPUs integradas fluidos sem tocar na composição da cena.
   */
  private updatePerformanceGovernor(dt: number): void {
    this.governorTime += dt;
    this.governorCooldown = Math.max(0, this.governorCooldown - dt);
    if (this.governorTime < 1.6) return;
    this.governorTime = 0;

    const engine = this.scene.getEngine();
    const fps = engine.getFps();
    if (!Number.isFinite(fps) || fps <= 0) return;
    const current = engine.getHardwareScalingLevel();
    const min = this.baseHardwareScaling;
    const max = this.baseHardwareScaling * 1.9;

    if (fps < 42 && current < max - 1e-4) {
      engine.setHardwareScalingLevel(Math.min(max, current * 1.12));
      this.governorCooldown = 4;
    } else if (fps > 56 && this.governorCooldown <= 0 && current > min + 1e-4) {
      engine.setHardwareScalingLevel(Math.max(min, current * 0.93));
      this.governorCooldown = 6;
    }
  }

  private applyLayout(frame: DioramaFrame): void {
    this.terrain.layout(frame);
    this.water.layout(frame);
    this.boat.layout(frame);
    this.effects.layout(frame, this.terrain.heightAt);
    this.fish.layout(frame);
  }
}
