/**
 * Efeitos ambientais e de dispersão subaquática 3D do diorama.
 *
 * Cada grupo lê um parâmetro já normalizado de `visualState.ts` e o traduz em
 * geometria: manchas de óleo na superfície, plumas de esgoto, microplásticos, bolhas e
 * neve marinha. Sem feixes falsos ou manchas de luz pontuais/estreladas.
 *
 * Todos os grupos usam thin instances e pools fixos: nenhum mesh é criado ou
 * descartado durante o quadro.
 */

import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { DioramaFrame } from './framing';
import type { SceneQualityProfile } from './quality';
import { clamp, mix, mulberry32 } from './procedural';
import { sampleMarineCurrent, sampleOcean, waterHeightAt } from './waves';
import type { VisualState } from './visualState';

interface ThinGroup {
  mesh: Mesh;
  matrices: Float32Array;
  colors: Float32Array | null;
  count: number;
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

function buildOilSource(scene: Scene): Mesh {
  const disc = MeshBuilder.CreateDisc('oleo-fonte', { radius: 1, tessellation: 28 }, scene);
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

    void clarity;

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
