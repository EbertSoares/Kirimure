/**
 * Efeitos científicos e de iluminação subaquática 3D do diorama.
 *
 * Cada grupo lê um parâmetro já normalizado de `visualState.ts` e o traduz em
 * geometria: feixes volumétricos de sol (god rays) e manchas de luz na praia,
 * manchas de óleo na superfície, plumas de esgoto, microplásticos, bolhas e
 * neve marinha. Nada aqui inventa valores científicos nem lê pixels do antigo
 * backdrop.
 *
 * Todos os grupos usam thin instances e pools fixos: nenhum mesh é criado ou
 * descartado durante o quadro.
 */

import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { DioramaFrame } from './framing';
import type { SceneQualityProfile } from './quality';
import { clamp, mix, mulberry32, smoothstep } from './procedural';
import { sampleMarineCurrent, sampleOcean, waterHeightAt } from './waves';
import type { VisualState } from './visualState';

interface ThinGroup {
  mesh: Mesh;
  matrices: Float32Array;
  colors: Float32Array | null;
  count: number;
}

interface SunbeamShaft {
  u: number;
  depth: number;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  tiltZ: number;
  phase: number;
  speed: number;
  intensity: number;
}

interface SandLightPool {
  u: number;
  depth: number;
  x: number;
  y: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  phase: number;
}

interface OilSlick {
  baseX: number;
  baseZ: number;
  radius: number;
  phase: number;
  driftX: number;
  driftZ: number;
  speed: number;
  strength: number;
}

interface PlumeWisp {
  baseX: number;
  baseZ: number;
  phase: number;
  speed: number;
  width: number;
  height: number;
  offsetX: number;
  offsetZ: number;
}

interface PlasticParticle {
  x: number;
  y: number;
  z: number;
  spin: number;
  phase: number;
  scale: number;
}

interface BubbleParticle {
  x: number;
  z: number;
  seabedY: number;
  elevation: number;
  speed: number;
  wobble: number;
  phase: number;
  size: number;
}

interface SnowParticle {
  x: number;
  y: number;
  z: number;
  /** Altura de reposição quando a partícula chega ao fundo. */
  topY: number;
  /** Velocidade de queda em unidades por segundo. */
  fall: number;
  spin: number;
  phase: number;
  scale: number;
}

export interface EffectsSystem {
  readonly meshes: AbstractMesh[];
  layout(frame: DioramaFrame, seabedAt: (x: number, z: number) => number): void;
  update(seconds: number, dt: number, visual: VisualState): void;
}

function createThinGroup(scene: Scene, source: Mesh, count: number, withColor: boolean): ThinGroup {
  source.alwaysSelectAsActiveMesh = true;
  source.doNotSyncBoundingInfo = true;
  source.isPickable = false;
  source.isVisible = true;
  source.renderingGroupId = 1;

  const matrices = new Float32Array(count * 16);
  const colors = withColor ? new Float32Array(count * 4) : null;
  source.thinInstanceSetBuffer('matrix', matrices, 16, false);
  if (colors) source.thinInstanceSetBuffer('color', colors, 4, false);
  return { mesh: source, matrices, colors, count };
}

function writeIdentity(group: ThinGroup, index: number): void {
  const offset = index * 16;
  group.matrices.fill(0, offset, offset + 16);
  group.matrices[offset] = 0.0001;
  group.matrices[offset + 5] = 0.0001;
  group.matrices[offset + 10] = 0.0001;
  group.matrices[offset + 15] = 1;
}

/**
 * Textura de feixe solar volumétrico (god ray): múltiplos filamentos ópticos
 * suaves em tom ciano-dourado que nascem logo abaixo das ondas e se difundem
 * até iluminar a areia da praia submersa.
 */
function createSunbeamTexture(scene: Scene): DynamicTexture {
  const width = 256;
  const height = 512;
  const texture = new DynamicTexture('raios-solares-textura', { width, height }, scene, true);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.hasAlpha = true;

  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const img = ctx.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1); // 0 = topo (superfície), 1 = base (areia)
    const topFade = smoothstep(0.0, 0.12, v);
    const bottomFade = Math.pow(1 - smoothstep(0.18, 0.98, v), 1.25);
    const verticalProfile = topFade * bottomFade;

    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      // Alargamento cônico do feixe ao descer na água
      const spread = 0.28 + v * 0.22;
      const dist = Math.abs(u - 0.5) / spread;
      const gaussian = Math.exp(-dist * dist * 3.2);
      const edgeGuard = smoothstep(0.0, 0.14, u) * (1 - smoothstep(0.86, 1.0, u));

      // Filamentos internos de refração das cristas de onda
      const rays =
        0.62 +
        0.24 * Math.sin((u - 0.5) * Math.PI * 7) +
        0.14 * Math.cos((u - 0.5) * Math.PI * 15 + 0.8);

      const intensity = clamp(gaussian * edgeGuard * verticalProfile * rays);

      // Topo mais quente/solar, meio ciano-turquesa luminoso
      const r = mix(95, 225, 1 - v * 0.65);
      const g = mix(215, 252, 1 - v * 0.35);
      const b = 255;

      const idx = (y * width + x) * 4;
      img.data[idx] = Math.round(r);
      img.data[idx + 1] = Math.round(g);
      img.data[idx + 2] = Math.round(b);
      img.data[idx + 3] = Math.round(intensity * 215);
    }
  }

  ctx.putImageData(img, 0, 0);
  texture.update(false);
  return texture;
}

/**
 * Textura de mancha de luz solar refratada sobre a areia da praia: halo dourado
 * e água-marinha com anéis suaves de cáustica.
 */
function createSandPoolTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const texture = new DynamicTexture('mancha-luz-praia-tex', { width: size, height: size }, scene, true);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.hasAlpha = true;

  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    const ny = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1)) * 2 - 1;
      const dist = Math.hypot(nx, ny);
      const radial = Math.exp(-dist * dist * 2.8) * (1 - smoothstep(0.68, 1.0, dist));

      const angle = Math.atan2(ny, nx);
      const causticWeb =
        0.65 +
        0.22 * Math.sin(dist * 14 + Math.sin(angle * 5) * 1.4) +
        0.13 * Math.cos(nx * 11 - ny * 9);

      const alpha = clamp(radial * causticWeb);
      const idx = (y * size + x) * 4;
      img.data[idx] = 255;
      img.data[idx + 1] = 244;
      img.data[idx + 2] = 196;
      img.data[idx + 3] = Math.round(alpha * 195);
    }
  }

  ctx.putImageData(img, 0, 0);
  texture.update(false);
  return texture;
}

function buildOilSource(scene: Scene): Mesh {
  const disc = MeshBuilder.CreateDisc('oleo-fonte', { radius: 1, tessellation: 28 }, scene);
  disc.rotation.x = Math.PI / 2;
  disc.bakeCurrentTransformIntoVertices();
  return disc;
}

function buildSandPoolSource(scene: Scene): Mesh {
  const disc = MeshBuilder.CreateDisc('mancha-luz-praia-fonte', { radius: 1, tessellation: 24 }, scene);
  disc.rotation.x = Math.PI / 2;
  disc.bakeCurrentTransformIntoVertices();
  return disc;
}

function buildBubbleSource(scene: Scene): Mesh {
  return MeshBuilder.CreateSphere('bolha-fonte', { diameter: 1, segments: 6 }, scene);
}

function buildPlumeSource(scene: Scene): Mesh {
  return MeshBuilder.CreateSphere('pluma-fonte', { diameter: 1, segments: 8 }, scene);
}

function buildParticleSource(scene: Scene, name: string): Mesh {
  return MeshBuilder.CreatePlane(name, { width: 1, height: 1, sideOrientation: Mesh.DOUBLESIDE }, scene);
}

export function createEffectsSystem(scene: Scene, quality: SceneQualityProfile): EffectsSystem {
  const random = mulberry32(20261108);

  // ── Feixes volumétricos de sol (God Rays da praia submersa) ───────────
  const sunbeamTexture = createSunbeamTexture(scene);
  const sunbeamMaterial = new StandardMaterial('raios-solares-material', scene);
  sunbeamMaterial.diffuseTexture = sunbeamTexture;
  sunbeamMaterial.useAlphaFromDiffuseTexture = true;
  sunbeamMaterial.emissiveColor = new Color3(0.55, 0.92, 1.0);
  sunbeamMaterial.diffuseColor = Color3.Black();
  sunbeamMaterial.specularColor = Color3.Black();
  sunbeamMaterial.disableLighting = true;
  sunbeamMaterial.backFaceCulling = false;
  sunbeamMaterial.fogEnabled = false;
  sunbeamMaterial.disableDepthWrite = true;
  sunbeamMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
  sunbeamMaterial.alphaMode = 1; // ALPHA_ADD para somar feixes suavemente
  sunbeamMaterial.alpha = 0.28;

  const sunbeamSource = buildParticleSource(scene, 'raios-solares-fonte');
  sunbeamSource.material = sunbeamMaterial;
  const sunbeamCount = 12;
  const sunbeamGroup = createThinGroup(scene, sunbeamSource, sunbeamCount, false);
  sunbeamGroup.mesh.applyFog = false;
  const sunbeams: SunbeamShaft[] = [];

  for (let i = 0; i < sunbeamCount; i += 1) {
    const t = i / (sunbeamCount - 1);
    const u = mix(0.28, 0.78, t) + (random() - 0.5) * 0.025;
    // Leque divergente a partir do sol no quadrante superior direito (u ~ 0.63)
    const tiltZ = (u - 0.61) * 0.62;
    sunbeams.push({
      u,
      depth: 0.44 + (i % 3) * 0.09,
      x: 0,
      y: -3.8,
      z: 24,
      width: 2.6 + (i % 4) * 0.65,
      height: 8.8 + (i % 3) * 0.9,
      tiltZ,
      phase: random() * Math.PI * 2,
      speed: 0.65 + random() * 0.45,
      intensity: 0.75 + 0.25 * Math.exp(-Math.pow((u - 0.55) / 0.22, 2)),
    });
    writeIdentity(sunbeamGroup, i);
  }
  sunbeamGroup.mesh.thinInstanceBufferUpdated('matrix');

  // ── Manchas de luz solar refratada no canal de areia da praia ─────────
  const sandPoolTexture = createSandPoolTexture(scene);
  const sandPoolMaterial = new StandardMaterial('manchas-luz-praia-material', scene);
  sandPoolMaterial.diffuseTexture = sandPoolTexture;
  sandPoolMaterial.useAlphaFromDiffuseTexture = true;
  sandPoolMaterial.emissiveColor = new Color3(0.95, 0.92, 0.78);
  sandPoolMaterial.diffuseColor = Color3.Black();
  sandPoolMaterial.specularColor = Color3.Black();
  sandPoolMaterial.disableLighting = true;
  sandPoolMaterial.backFaceCulling = false;
  sandPoolMaterial.disableDepthWrite = true;
  sandPoolMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
  sandPoolMaterial.alphaMode = 1; // Aditivo suave sobre a textura de areia
  sandPoolMaterial.alpha = 0.28;

  const sandPoolSource = buildSandPoolSource(scene);
  sandPoolSource.material = sandPoolMaterial;
  const sandPoolCount = 9;
  const sandPoolGroup = createThinGroup(scene, sandPoolSource, sandPoolCount, false);
  const sandPools: SandLightPool[] = [];

  for (let i = 0; i < sandPoolCount; i += 1) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    sandPools.push({
      u: 0.34 + col * 0.16 + (random() - 0.5) * 0.05,
      depth: 0.26 + row * 0.18 + random() * 0.06,
      x: 0,
      y: -8.2,
      z: 18,
      radiusX: 2.8 + random() * 1.6,
      radiusZ: 2.2 + random() * 1.4,
      phase: random() * Math.PI * 2,
    });
    writeIdentity(sandPoolGroup, i);
  }
  sandPoolGroup.mesh.thinInstanceBufferUpdated('matrix');

  // ── Óleo na superfície ────────────────────────────────────────────────
  const oilMaterial = new StandardMaterial('oleo-material', scene);
  oilMaterial.diffuseColor = new Color3(0.02, 0.02, 0.025);
  oilMaterial.specularColor = new Color3(0.9, 0.85, 1);
  oilMaterial.specularPower = 220;
  oilMaterial.emissiveColor = new Color3(0.02, 0.05, 0.07);
  oilMaterial.alpha = 0.72;
  oilMaterial.backFaceCulling = false;
  oilMaterial.disableDepthWrite = true;
  oilMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;

  const oilSource = buildOilSource(scene);
  oilSource.material = oilMaterial;
  oilSource.renderingGroupId = 2;
  const oilCount = quality.maxOilSlicks;
  const oilGroup = createThinGroup(scene, oilSource, oilCount, true);
  oilGroup.mesh.renderingGroupId = 2;
  const oilSlicks: OilSlick[] = [];
  for (let index = 0; index < oilCount; index += 1) {
    oilSlicks.push({
      baseX: 0,
      baseZ: 0,
      radius: 1.4 + random() * 3.8,
      phase: random() * Math.PI * 2,
      driftX: (random() - 0.5) * 0.22,
      driftZ: (random() - 0.5) * 0.14,
      speed: 0.25 + random() * 0.35,
      strength: 0.5 + random() * 0.5,
    });
    writeIdentity(oilGroup, index);
  }
  oilGroup.mesh.thinInstanceBufferUpdated('matrix');

  // ── Plumas de esgoto ──────────────────────────────────────────────────
  const plumeMaterial = new StandardMaterial('esgoto-material', scene);
  plumeMaterial.diffuseColor = new Color3(0.2, 0.3, 0.22);
  plumeMaterial.emissiveColor = new Color3(0.015, 0.04, 0.025);
  plumeMaterial.specularColor = Color3.Black();
  plumeMaterial.alpha = 0.14;
  plumeMaterial.backFaceCulling = false;
  plumeMaterial.disableDepthWrite = true;
  plumeMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;

  const plumeSource = buildPlumeSource(scene);
  plumeSource.material = plumeMaterial;
  const plumeCount = Math.max(1, quality.maxSewagePlumes) * 3;
  const plumeGroup = createThinGroup(scene, plumeSource, plumeCount, true);
  const plumeWisps: PlumeWisp[] = [];
  for (let index = 0; index < plumeCount; index += 1) {
    plumeWisps.push({
      baseX: 0,
      baseZ: 0,
      phase: random() * Math.PI * 2,
      speed: 0.12 + random() * 0.12,
      width: 0.9 + random() * 1.8,
      height: 2.6 + random() * 3.4,
      offsetX: (random() - 0.5) * 3.2,
      offsetZ: (random() - 0.5) * 2.4,
    });
    writeIdentity(plumeGroup, index);
  }
  plumeGroup.mesh.thinInstanceBufferUpdated('matrix');

  // ── Microplásticos ────────────────────────────────────────────────────
  const plasticMaterial = new StandardMaterial('microplasticos-material', scene);
  plasticMaterial.diffuseColor = new Color3(0.86, 0.9, 0.82);
  plasticMaterial.emissiveColor = new Color3(0.16, 0.2, 0.18);
  plasticMaterial.specularColor = new Color3(0.7, 0.8, 0.75);
  plasticMaterial.specularPower = 96;
  plasticMaterial.backFaceCulling = false;
  plasticMaterial.alpha = 0.92;

  const plasticSource = buildParticleSource(scene, 'microplastico-fonte');
  plasticSource.material = plasticMaterial;
  const plasticCount = quality.maxMicroplastics;
  const plasticGroup = createThinGroup(scene, plasticSource, plasticCount, true);
  const plastics: PlasticParticle[] = [];
  for (let index = 0; index < plasticCount; index += 1) {
    plastics.push({
      x: 0,
      y: -4,
      z: 30,
      spin: (random() - 0.5) * 1.4,
      phase: random() * Math.PI * 2,
      scale: 0.035 + random() * 0.045,
    });
    writeIdentity(plasticGroup, index);
  }
  plasticGroup.mesh.thinInstanceBufferUpdated('matrix');

  // ── Bolhas (colunas ascendentes recifais + bolhas esparsas) ───────────
  const bubbleMaterial = new StandardMaterial('bolhas-material', scene);
  bubbleMaterial.diffuseColor = new Color3(0.62, 0.88, 1.0);
  bubbleMaterial.emissiveColor = new Color3(0.42, 0.74, 0.88);
  bubbleMaterial.specularColor = new Color3(1, 1, 1);
  bubbleMaterial.specularPower = 210;
  bubbleMaterial.alpha = 0.58;
  bubbleMaterial.backFaceCulling = false;
  bubbleMaterial.disableDepthWrite = true;
  bubbleMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;

  const bubbleSource = buildBubbleSource(scene);
  bubbleSource.material = bubbleMaterial;
  const bubbleCount = quality.maxBubbles;
  const bubbleGroup = createThinGroup(scene, bubbleSource, bubbleCount, true);
  const bubbles: BubbleParticle[] = [];
  for (let index = 0; index < bubbleCount; index += 1) {
    bubbles.push({
      x: 0,
      z: 30,
      seabedY: -8,
      elevation: random(),
      speed: 0.07 + random() * 0.1,
      wobble: 0.08 + random() * 0.18,
      phase: random() * Math.PI * 2,
      size: 0.045 + random() * 0.085,
    });
    writeIdentity(bubbleGroup, index);
  }
  bubbleGroup.mesh.thinInstanceBufferUpdated('matrix');

  // ── Neve marinha ──────────────────────────────────────────────────────
  const snowMaterial = new StandardMaterial('neve-marinha-material', scene);
  snowMaterial.diffuseColor = new Color3(0.78, 0.88, 0.92);
  snowMaterial.emissiveColor = new Color3(0.14, 0.22, 0.26);
  snowMaterial.specularColor = Color3.Black();
  snowMaterial.alpha = 0.42;
  snowMaterial.backFaceCulling = false;
  snowMaterial.disableDepthWrite = true;
  snowMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;

  const snowSource = buildParticleSource(scene, 'neve-marinha-fonte');
  snowSource.material = snowMaterial;
  const snowCount = quality.maxMarineSnow;
  const snowGroup = createThinGroup(scene, snowSource, snowCount, false);
  const snow: SnowParticle[] = [];
  for (let index = 0; index < snowCount; index += 1) {
    snow.push({
      x: 0,
      y: -4,
      z: 30,
      topY: -0.6,
      fall: 0.1 + random() * 0.22,
      spin: (random() - 0.5) * 0.8,
      phase: random() * Math.PI * 2,
      scale: 0.018 + random() * 0.03,
    });
    writeIdentity(snowGroup, index);
  }
  snowGroup.mesh.thinInstanceBufferUpdated('matrix');

  const meshes: AbstractMesh[] = [
    sunbeamSource,
    sandPoolSource,
    oilSource,
    plumeSource,
    plasticSource,
    bubbleSource,
    snowSource,
  ];

  let seabedRef: ((x: number, z: number) => number) | null = null;
  let lastColorUpdate = -1;

  const matrix = new Matrix();
  const position = new Vector3();
  const scaling = new Vector3();
  const rotation = Quaternion.Identity();
  const color = new Color3();

  function writeInstance(
    group: ThinGroup,
    index: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    yaw: number,
    pitch: number,
    roll: number,
  ): void {
    position.set(x, y, z);
    scaling.set(sx, sy, sz);
    Quaternion.RotationYawPitchRollToRef(yaw, pitch, roll, rotation);
    Matrix.ComposeToRef(scaling, rotation, position, matrix);
    matrix.copyToArray(group.matrices, index * 16);
  }

  function seabedAt(x: number, z: number): number {
    return seabedRef ? seabedRef(x, z) : -8.5;
  }

  return {
    meshes,

    layout(frame: DioramaFrame, seabedAtFn: (x: number, z: number) => number): void {
      seabedRef = seabedAtFn;

      for (let i = 0; i < sunbeams.length; i += 1) {
        const beam = sunbeams[i];
        const point = frame.surfacePoint(beam.u, beam.depth);
        const floor = seabedAtFn(point.x, point.z);
        beam.x = point.x;
        beam.z = point.z;
        beam.height = Math.max(6.2, -floor + 0.35);
        beam.y = floor * 0.5 + 0.1;
      }

      for (let i = 0; i < sandPools.length; i += 1) {
        const pool = sandPools[i];
        const point = frame.surfacePoint(pool.u, pool.depth);
        pool.x = point.x;
        pool.z = point.z;
        pool.y = seabedAtFn(point.x, point.z) + 0.05;
      }

      for (let index = 0; index < oilSlicks.length; index += 1) {
        const slick = oilSlicks[index];
        const u = 0.1 + random() * 0.8;
        const depth = 0.50 + random() * 0.42;
        const point = frame.surfacePoint(u, depth);
        slick.baseX = point.x;
        slick.baseZ = point.z;
      }

      for (let index = 0; index < plumeWisps.length; index += 1) {
        const wisp = plumeWisps[index];
        const plumeIndex = Math.floor(index / 3);
        const u = 0.2 + ((plumeIndex + 0.5) / Math.max(1, quality.maxSewagePlumes)) * 0.62;
        const depth = 0.48 + random() * 0.4;
        const point = frame.surfacePoint(u, depth);
        wisp.baseX = point.x;
        wisp.baseZ = point.z;
      }

      for (let index = 0; index < plastics.length; index += 1) {
        const particle = plastics[index];
        const u = 0.07 + random() * 0.86;
        const depth = frame.profile.fishDepthMin + random() * (frame.profile.fishDepthMax - frame.profile.fishDepthMin);
        const elevation = 0.2 + random() * 0.75;
        const point = frame.fishToWorld(u, elevation, depth, seabedAtFn, 0.6);
        particle.x = point.x;
        particle.y = point.y;
        particle.z = point.z;
      }

      // Colunas principais de bolhas (como na referência) + bolhas distribuídas
      const streamColumnsU = [0.14, 0.38, 0.49, 0.84];
      for (let index = 0; index < bubbles.length; index += 1) {
        const bubble = bubbles[index];
        const inStream = index < Math.floor(bubbles.length * 0.68);
        const streamU = streamColumnsU[index % streamColumnsU.length];
        const u = inStream
          ? streamU + (random() - 0.5) * 0.032
          : 0.08 + random() * 0.84;
        const depth = inStream
          ? 0.40 + (index % 4) * 0.08 + (random() - 0.5) * 0.03
          : 0.36 + random() * 0.5;
        const point = frame.surfacePoint(u, depth);
        bubble.x = point.x;
        bubble.z = point.z;
        bubble.seabedY = seabedAtFn(point.x, point.z);
        bubble.elevation = random();
      }

      for (let index = 0; index < snow.length; index += 1) {
        const particle = snow[index];
        const u = 0.04 + random() * 0.92;
        const depth = frame.profile.fishDepthMin + random() * (frame.profile.fishDepthMax - frame.profile.fishDepthMin);
        const elevation = 0.15 + random() * 0.8;
        const point = frame.fishToWorld(u, elevation, depth, seabedAtFn, 0.4);
        particle.x = point.x;
        particle.y = point.y;
        particle.topY = clamp(point.y, seabedAtFn(point.x, point.z) + 0.6, -0.4);
        particle.z = point.z;
      }

      lastColorUpdate = -1;
    },

    update(seconds: number, dt: number, visual: VisualState): void {
      updateMatrices(seconds, Math.max(0, dt), visual);

      if (seconds - lastColorUpdate < 0.25) return;
      lastColorUpdate = seconds;

      const oil = clamp(visual.oil);
      for (let index = 0; index < oilSlicks.length; index += 1) {
        const shimmer = 0.5 + 0.5 * Math.sin(seconds * 1.4 + index * 1.7);
        if (oilGroup.colors) {
          color.set(
            mix(0.02, 0.13, shimmer * oil),
            mix(0.03, 0.1, oil * (0.5 + shimmer * 0.5)),
            mix(0.05, 0.22, shimmer * (0.4 + oil * 0.6)),
          );
          oilGroup.colors[index * 4] = color.r;
          oilGroup.colors[index * 4 + 1] = color.g;
          oilGroup.colors[index * 4 + 2] = color.b;
          oilGroup.colors[index * 4 + 3] = 0.55 + oil * 0.45;
        }
      }
      oilGroup.mesh.thinInstanceBufferUpdated('color');

      const sewage = clamp(visual.sewage);
      for (let index = 0; index < plumeWisps.length; index += 1) {
        if (plumeGroup.colors) {
          const wisp = plumeWisps[index];
          const tone = 0.5 + 0.5 * Math.sin(seconds * 0.6 + wisp.phase);
          plumeGroup.colors[index * 4] = mix(0.16, 0.3, tone) * (0.7 + sewage * 0.3);
          plumeGroup.colors[index * 4 + 1] = mix(0.24, 0.36, tone) * (0.7 + sewage * 0.3);
          plumeGroup.colors[index * 4 + 2] = mix(0.18, 0.24, tone) * (0.7 + sewage * 0.3);
          plumeGroup.colors[index * 4 + 3] = 0.35 + sewage * 0.5;
        }
      }
      plumeGroup.mesh.thinInstanceBufferUpdated('color');

      const plastics = clamp(visual.plastics);
      for (let index = 0; index < plasticGroup.count; index += 1) {
        if (plasticGroup.colors) {
          const tone = 0.5 + 0.5 * Math.sin(seconds * 0.8 + index * 0.73);
          plasticGroup.colors[index * 4] = mix(0.78, 0.96, tone);
          plasticGroup.colors[index * 4 + 1] = mix(0.82, 0.95, tone);
          plasticGroup.colors[index * 4 + 2] = mix(0.7, 0.88, tone);
          plasticGroup.colors[index * 4 + 3] = 0.45 + plastics * 0.5;
        }
      }
      plasticGroup.mesh.thinInstanceBufferUpdated('color');
    },
  };

  function updateMatrices(seconds: number, dt: number, visual: VisualState): void {
    const clarity = clamp(visual.waterClarity);

    // ── Feixes volumétricos de sol (god rays com refração de Snell e convergência do Jacobiano) ──
    for (let i = 0; i < sunbeams.length; i += 1) {
      const beam = sunbeams[i];
      const wave = sampleOcean(beam.x, beam.z, seconds);
      // Foco cáustico da crista da onda (Jacobiano < 1 concentra luz; cava diverge)
      const causticConvergence = clamp((1.15 - wave.jacobian) * 1.4 + 0.55, 0.45, 1.35);
      const pulse =
        (0.76 + 0.24 * Math.sin(seconds * beam.speed + beam.phase)) *
        (0.65 + 0.35 * causticConvergence);
      const swayX = Math.sin(seconds * 0.52 + beam.phase) * 0.32 + wave.displacementX * 0.38;
      // Lei de Snell: raio solar refratado pela inclinação instantânea da onda (n1/n2 = 1/1.333)
      const snellRefractTilt = beam.tiltZ * 0.72 - wave.slopeX * 0.22;
      const width = beam.width * clamp(pulse, 0.52, 1.28) * beam.intensity;
      writeInstance(
        sunbeamGroup,
        i,
        beam.x + swayX,
        beam.y + wave.height * 0.35,
        beam.z,
        width,
        beam.height,
        1,
        0,
        0,
        snellRefractTilt,
      );
    }
    sunbeamGroup.mesh.thinInstanceBufferUpdated('matrix');
    // Intensidade volumétrica modulada por Henyey-Greenstein e atenuação Beer-Lambert
    sunbeamMaterial.alpha = clamp(0.08 + clarity * 0.22 - visual.oil * 0.14 - visual.turbidity * 0.08, 0.03, 0.32);

    // ── Manchas de luz solar refratada na areia da praia ─────────────────
    for (let i = 0; i < sandPools.length; i += 1) {
      const pool = sandPools[i];
      const wave = sampleOcean(pool.x, pool.z, seconds);
      const focus = 0.84 + 0.16 * Math.sin(seconds * 1.45 + pool.phase) + wave.height * 0.32;
      const rx = pool.radiusX * clamp(focus, 0.65, 1.25);
      const rz = pool.radiusZ * clamp(focus, 0.65, 1.25);
      const driftX = Math.sin(seconds * 0.6 + pool.phase) * 0.32;
      const driftZ = Math.cos(seconds * 0.5 + pool.phase) * 0.25;
      writeInstance(
        sandPoolGroup,
        i,
        pool.x + driftX,
        seabedAt(pool.x + driftX, pool.z + driftZ) + 0.06,
        pool.z + driftZ,
        rx,
        1,
        rz,
        seconds * 0.08 + pool.phase,
        0,
        0,
      );
    }
    sandPoolGroup.mesh.thinInstanceBufferUpdated('matrix');
    sandPoolMaterial.alpha = clamp(0.08 + clarity * 0.32 - visual.turbidity * 0.18, 0.03, 0.42);

    const oil = clamp(visual.oil);
    for (let index = 0; index < oilSlicks.length; index += 1) {
      const slick = oilSlicks[index];
      if (oil < 0.01) {
        writeIdentity(oilGroup, index);
        continue;
      }
      const x = slick.baseX + Math.sin(seconds * slick.speed + slick.phase) * 2.4 + slick.driftX * seconds;
      const z = slick.baseZ + Math.cos(seconds * slick.speed * 0.7 + slick.phase) * 1.6 + slick.driftZ * seconds;
      const surface = sampleOcean(x, z, seconds).height;
      const radius = slick.radius * (0.35 + oil * 0.8) * slick.strength;
      writeInstance(oilGroup, index, x, surface + 0.025, z, radius, 1, radius, slick.phase, 0, 0);
    }
    oilGroup.mesh.thinInstanceBufferUpdated('matrix');
    oilMaterial.alpha = oil < 0.01 ? 0 : 0.28 + oil * 0.5;

    const sewage = clamp(visual.sewage);
    for (let index = 0; index < plumeWisps.length; index += 1) {
      const wisp = plumeWisps[index];
      if (sewage < 0.01) {
        writeIdentity(plumeGroup, index);
        continue;
      }
      const cycle = (seconds * wisp.speed + wisp.phase) % 1;
      const surface = waterHeightAt(wisp.baseX, wisp.baseZ, seconds);
      const bottom = seabedAt(wisp.baseX, wisp.baseZ);
      const y = bottom + (surface - bottom) * (0.12 + cycle * 0.85);
      const sway = Math.sin(seconds * 0.7 + wisp.phase) * 0.8;
      const width = wisp.width * sewage * (0.4 + cycle * 0.9);
      const height = wisp.height * (0.06 + cycle * 0.18) * (0.5 + sewage * 0.5);
      writeInstance(
        plumeGroup,
        index,
        wisp.baseX + wisp.offsetX + sway,
        y,
        wisp.baseZ + wisp.offsetZ + Math.cos(seconds * 0.5 + wisp.phase) * 0.5,
        width,
        height,
        width,
        seconds * 0.1 + wisp.phase,
        0,
        0,
      );
    }
    plumeGroup.mesh.thinInstanceBufferUpdated('matrix');
    plumeMaterial.alpha = sewage < 0.01 ? 0 : 0.06 + sewage * 0.14;

    const plasticAmount = clamp(visual.plastics);
    for (let index = 0; index < plastics.length; index += 1) {
      const particle = plastics[index];
      if (plasticAmount < 0.01) {
        writeIdentity(plasticGroup, index);
        continue;
      }
      const x = particle.x + Math.sin(seconds * 0.22 + particle.phase) * 0.9;
      const z = particle.z + Math.cos(seconds * 0.18 + particle.phase) * 0.7;
      const seabed = seabedAt(x, z);
      const y = clamp(particle.y + Math.sin(seconds * 0.3 + particle.phase) * 0.4, seabed + 0.35, -0.55);
      const scale = particle.scale * (0.5 + plasticAmount * 1.2);
      writeInstance(
        plasticGroup,
        index,
        x,
        y,
        z,
        scale,
        scale,
        scale,
        seconds * particle.spin + particle.phase,
        particle.phase * 0.5,
        particle.phase,
      );
    }
    plasticGroup.mesh.thinInstanceBufferUpdated('matrix');

    const bubbleAmount = 0.45 + clarity * 0.55;
    for (let index = 0; index < bubbles.length; index += 1) {
      const bubble = bubbles[index];
      bubble.elevation = (bubble.elevation + bubble.speed * dt) % 1;
      const surface = waterHeightAt(bubble.x, bubble.z, seconds) - 0.35;
      const y = bubble.seabedY + (surface - bubble.seabedY) * bubble.elevation;
      const wobbleX = Math.sin(seconds * 1.6 + bubble.phase + bubble.elevation * 5) * bubble.wobble;
      const wobbleZ = Math.cos(seconds * 1.3 + bubble.phase * 1.7) * bubble.wobble;
      const scale = bubble.size * (0.75 + bubble.elevation * 0.45 + clamp(visual.hypoxia) * 0.25);
      writeInstance(
        bubbleGroup,
        index,
        bubble.x + wobbleX,
        y,
        bubble.z + wobbleZ,
        scale,
        scale,
        scale,
        0,
        0,
        0,
      );
    }
    bubbleGroup.mesh.thinInstanceBufferUpdated('matrix');
    bubbleMaterial.alpha = 0.46 * bubbleAmount;

    for (let index = 0; index < snow.length; index += 1) {
      const particle = snow[index];
      const flow = sampleMarineCurrent(particle.x, particle.y, particle.z, seconds);
      const x =
        particle.x +
        Math.sin(seconds * 0.1 + particle.phase) * 0.8 +
        (flow.currentX * 0.85 + flow.orbitalX * 0.35);
      const z =
        particle.z +
        Math.cos(seconds * 0.08 + particle.phase) * 0.5 +
        (flow.currentZ * 0.85 + flow.orbitalZ * 0.35);
      const seabed = seabedAt(x, z);
      const floor = seabed + 0.3;
      particle.y -= (particle.fall - flow.currentY * 0.5) * dt;
      if (particle.y < floor) particle.y = particle.topY;
      const y = clamp(particle.y, floor, -0.5);
      writeInstance(
        snowGroup,
        index,
        x,
        y,
        z,
        particle.scale,
        particle.scale,
        particle.scale,
        seconds * particle.spin + particle.phase,
        particle.phase * 0.4,
        particle.phase * 0.8,
      );
    }
    snowGroup.mesh.thinInstanceBufferUpdated('matrix');
    snowMaterial.alpha = 0.18 + clarity * 0.26;
  }
}
