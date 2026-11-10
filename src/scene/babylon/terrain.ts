import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { assetUrl } from './assetPaths';
import { reefSuitabilityAt, seabedHeightAt } from './bathymetry';
import type { DioramaFrame } from './framing';
import type { SceneQualityProfile } from './quality';
import { clamp, fbm2D, hash2D, mix, mulberry32, smoothstep, tileableFbm2D } from './procedural';
import type { ReefObstacle, ReefObstacleKind } from './reefObstacles';
import type { VisualState } from './visualState';

interface Anchor {
  u: number;
  depth: number;
  scale: number;
  rotation: number;
  tilt: number;
  color: readonly [number, number, number];
}

interface ThinGroup {
  mesh: Mesh;
  anchors: Anchor[];
  matrices: Float32Array;
  colors: Float32Array;
  matrix: Matrix;
  position: Vector3;
  rotation: Quaternion;
  scaling: Vector3;
}

export interface TerrainSystem {
  readonly meshes: AbstractMesh[];
  readonly shadowCasters: readonly AbstractMesh[];
  /** Rochas e corais sólidos, em coordenadas de mundo, recalculados no layout. */
  readonly obstacles: readonly ReefObstacle[];
  heightAt(x: number, z: number): number;
  layout(frame: DioramaFrame): void;
  updateVisual(visual: VisualState, elapsed: number, cameraDepth?: number): void;
}

const BRANCH_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.95, 0.72, 0.44],
  [0.92, 0.52, 0.34],
  [0.88, 0.42, 0.62],
  [0.96, 0.80, 0.52],
  [0.76, 0.38, 0.58],
];

const BRAIN_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.54, 0.66, 0.28],
  [0.68, 0.72, 0.32],
  [0.78, 0.58, 0.28],
  [0.44, 0.62, 0.36],
];

const FAN_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.88, 0.32, 0.48],
  [0.82, 0.38, 0.66],
  [0.92, 0.44, 0.38],
  [0.68, 0.34, 0.64],
];

const TUBE_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.56, 0.24, 0.62],
  [0.92, 0.72, 0.18],
  [0.66, 0.28, 0.56],
  [0.88, 0.62, 0.16],
];

const ROCK_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.72, 0.69, 0.61],
  [0.64, 0.65, 0.59],
  [0.78, 0.72, 0.63],
];

const PEBBLE_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.68, 0.7, 0.67],
  [0.78, 0.73, 0.64],
  [0.6, 0.64, 0.63],
];

/**
 * Areia de praia submersa com material PBR fotogramétrico 4K
 * (`aerial_beach_01`): albedo, normal map e rugosidade reais de areia
 * varrida pela corrente. Substitui a textura procedural, que não tinha
 * detalhe suficiente para leitura de grão/crista em close.
 *
 * O ladrilho fica em ~8 m no mundo (uScale 3 sobre o UV da malha): os
 * pequenos seixos e marcas de onda mantêm escala crível e a repetição fica
 * escondida pelo warp de UV e pelas manchas de cor do vértice.
 */
function createSandTextures(scene: Scene): {
  albedo: Texture;
  normal: Texture;
  roughness: Texture;
} {
  const make = (name: string, file: string): Texture => {
    const texture = new Texture(
      assetUrl(`textures/sand/${file}`),
      scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = name;
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 8;
    return texture;
  };

  const albedo = make('areia-aerial-beach-albedo', 'aerial-beach-diffuse-4k.jpg');
  const normal = make('areia-aerial-beach-normal', 'aerial-beach-normal-4k.jpg');
  const roughness = make('areia-aerial-beach-roughness', 'aerial-beach-roughness-4k.jpg');

  // Albedo em sRGB; normal e rugosidade são dados lineares.
  albedo.gammaSpace = true;
  normal.gammaSpace = false;
  roughness.gammaSpace = false;

  for (const texture of [albedo, normal, roughness]) {
    texture.uScale = 3;
    texture.vScale = 3;
  }

  return { albedo, normal, roughness };
}

/**
 * Rede de cáusticas solares suaves para areia e rocha.
 *
 * A versão anterior era um padrão de interferência elevado à 7ª potência:
 * isso formava pontos brancos isolados que liam como "estrelas" piscando no
 * fundo. Aqui a luz é construída como uma malha de bordas de Worley (F2-F1)
 * em duas escalas — filamentos largos e contínuos, com núcleo suave, halo
 * difuso e brilho máximo limitado. O resultado é a rede de luz que a
 * superfície ondulada projeta no leito, não faíscas pontuais.
 *
 * A amostragem é periódica (índices de célula em módulo), então a textura
 * ladrilha sem costura visível.
 */
function createCausticTexture(scene: Scene): DynamicTexture {
  const size = 512;
  const texture = new DynamicTexture('causticas-areia', { width: size, height: size }, scene, true);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const image = context.createImageData(size, size);

  /** Distância F2-F1 periódica: zero exatamente nas fronteiras das células. */
  const borderDistance = (u: number, v: number, cells: number, offsetU: number, offsetV: number): number => {
    const gx = (u + offsetU) * cells;
    const gy = (v + offsetV) * cells;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    let nearest = Number.POSITIVE_INFINITY;
    let second = Number.POSITIVE_INFINITY;

    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const cx = ix + ox;
        const cy = iy + oy;
        const wx = ((cx % cells) + cells) % cells;
        const wy = ((cy % cells) + cells) % cells;
        // Jitter no miolo da célula: fronteiras orgânicas, sem cantos duros.
        const jx = 0.12 + hash2D(wx * 1.37 + 4.1, wy * 2.11 + 7.3) * 0.76;
        const jy = 0.12 + hash2D(wx * 3.73 + 9.2, wy * 1.61 + 2.8) * 0.76;
        const dx = gx - (cx + jx);
        const dy = gy - (cy + jy);
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < nearest) {
          second = nearest;
          nearest = distance;
        } else if (distance < second) {
          second = distance;
        }
      }
    }

    return second - nearest;
  };

  for (let y = 0; y < size; y += 1) {
    const v = y / (size - 1);
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);

      // Duas redes sobrepostas (células grandes + médias) com deslocamentos
      // diferentes: a malha nunca parece uma grade repetitiva.
      const broad = borderDistance(u, v, 6, 0.0, 0.0);
      const fine = borderDistance(u, v, 11, 0.37, 0.61);

      const broadLine = 1 - smoothstep(0.02, 0.21, broad);
      const fineLine = 1 - smoothstep(0.02, 0.15, fine);
      const patch = 0.7 + 0.3 * tileableFbm2D(u, v, 4, 3);
      let glow = (broadLine * 0.72 + fineLine * 0.34) * patch;
      glow = clamp(Math.pow(glow, 1.2), 0, 1);

      // Núcleo limitado + halo difuso: nunca satura em branco puro.
      const core = Math.pow(glow, 1.55);
      const halo = glow * 0.34;
      const light = clamp(core * 0.78 + halo * 0.22, 0, 1);

      // Luz solar filtrada pela água: branco levemente ciano-esverdeado.
      const r = clamp(light * 214, 0, 255);
      const g = clamp(light * 234, 0, 255);
      const b = clamp(light * 216, 0, 255);

      const index = (y * size + x) * 4;
      image.data[index] = Math.round(r);
      image.data[index + 1] = Math.round(g);
      image.data[index + 2] = Math.round(b);
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  texture.update(false);
  // Malha de ~4,8 m no mundo: células grandes de ~0,8 m e filamentos finos
  // de ~45 cm, compatíveis com a escala da areia em close.
  texture.uScale = 4.4;
  texture.vScale = 5.2;
  return texture;
}

/**
 * Textura de rocha recifal incrustada (calcário biogênico + algas coralinas
 * arroxeadas e musgo marinho oliva).
 */
function createRockTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const texture = new DynamicTexture('rocha-recifal-textura', { width: size, height: size }, scene, true);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const image = context.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const n1 = tileableFbm2D(u, v, 4, 4);
      const n2 = tileableFbm2D((u * 2) % 1, (v * 2) % 1, 3, 8);
      const coralline = smoothstep(0.56, 0.78, n1);
      const crevice = smoothstep(0.45, 0.22, n2);

      // Base de rocha calcária iluminada com manchas de alga coralina rosada e fendas escuras
      let r = mix(118, 168, n2);
      let g = mix(122, 162, n2);
      let b = mix(112, 146, n2);

      r = mix(r, 148, coralline * 0.55);
      g = mix(g, 98, coralline * 0.55);
      b = mix(b, 132, coralline * 0.55);

      r = mix(r, 48, crevice * 0.65);
      g = mix(g, 68, crevice * 0.65);
      b = mix(b, 72, crevice * 0.65);

      const idx = (y * size + x) * 4;
      image.data[idx] = Math.round(r);
      image.data[idx + 1] = Math.round(g);
      image.data[idx + 2] = Math.round(b);
      image.data[idx + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  texture.update(false);
  texture.uScale = 2.5;
  texture.vScale = 2.5;
  return texture;
}

/**
 * Cortina óptica de volume azul subaquático ao fundo do recife.
 *
 * Cria a linha de "horizonte subaquático": um azul oceânico mais escuro no
 * fundo da coluna d'água (onde o caminho óptico Beer-Lambert é longo), enquanto
 * a zona próxima à superfície e o primeiro plano são de um azul-turquesa mais claro.
 */
function createUnderwaterVolumeBackdrop(scene: Scene): {
  mesh: Mesh;
  material: StandardMaterial;
} {
  const width = 512;
  const height = 256;
  const texture = new DynamicTexture('volume-azul-submarino-tex', { width, height }, scene, true);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const img = ctx.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1); // 0 = topo (logo abaixo das ondas), 1 = base junto ao fundo
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      // Gradiente oceânico vertical contínuo e atmosférico baseado na extinção óptica de Beer-Lambert
      // Topo raso: azul-turquesa luminoso sob a refração das ondas
      // Profundidade: azul oceânico profundo alinhado com a névoa da cena (fogColor 0.02, 0.29, 0.52)
      // Transição suave sem ruído 2D artificial ou faixas duras
      const topScatter = 1 - smoothstep(0.0, 0.38, v);
      const sunGradient = Math.exp(-Math.pow((u - 0.52) / 0.42, 2)) * topScatter * 0.35;
      const depthFade = smoothstep(0.12, 0.88, v);

      const r = mix(12, 3, depthFade) + sunGradient * 12;
      const g = mix(86, 46, depthFade) + sunGradient * 30;
      const b = mix(164, 104, depthFade) + sunGradient * 25;

      const idx = (y * width + x) * 4;
      img.data[idx] = Math.round(clamp(r, 0, 255));
      img.data[idx + 1] = Math.round(clamp(g, 0, 255));
      img.data[idx + 2] = Math.round(clamp(b, 0, 255));
      img.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  texture.update(false);

  // Painel curvo ao fundo da coluna d'água (z ~ 50..56), cobrindo de y = +0.15 até y = -15.4
  const cols = 48;
  const rows = 16;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rows; r += 1) {
    const v = r / rows;
    const y = mix(-1.45, -15.4, v);
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const s = u * 2 - 1;
      const x = s * 76;
      const z = 52 - (1 - s * s) * 3.5;
      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const stride = cols + 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = r * stride + c;
      const b = a + 1;
      const d = a + stride;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const mesh = new Mesh('cortina-azul-submarina', scene);
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.isPickable = false;
  mesh.applyFog = true;
  mesh.renderingGroupId = 0;

  const material = new StandardMaterial('cortina-azul-submarina-mat', scene);
  // Usa diffuseTexture + emissiveColor com disableLighting=true (sem emissiveTexture duplicada)
  // para multiplicar textura * cor sem soma aditiva branca.
  material.diffuseTexture = texture;
  material.emissiveColor = new Color3(1, 1, 1);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.fogEnabled = true;
  mesh.material = material;

  return { mesh, material };
}

function buildTerrainMesh(scene: Scene, material: PBRMaterial): Mesh {
  const columns = 116;
  const rows = 82;
  const xMin = -58;
  const xMax = 58;
  const zMin = -6;
  const zMax = 54;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= rows; row += 1) {
    const z = zMin + ((zMax - zMin) * row) / rows;

    for (let column = 0; column <= columns; column += 1) {
      const x = xMin + ((xMax - xMin) * column) / columns;
      const y = seabedHeightAt(x, z);
      const depth = -y;
      const patch = fbm2D(x * 0.18 + 11, z * 0.2 - 3.4, 3);

      // Atenuação óptica por profundidade real, não por posição de tela: a areia
      // permanece dourada nos baixios e mergulha no azul apenas nas cotas fundas.
      const waterDistanceMix = smoothstep(4.5, 14.5, depth);
      const shallowClarityBoost = (1 - smoothstep(2.5, 7, depth)) * 0.16;

      // Foco solar central no canal de areia da praia submersa
      const centerSunBoost = Math.exp(-Math.pow((x - 1.2) / 18.0, 2)) * (1 - smoothstep(22, 48, z));
      const bankShadow = smoothstep(9.5, 23, Math.abs(x)) * 0.24;
      const hardSubstrate = smoothstep(0.18, 0.68, reefSuitabilityAt(x, z));

      const warmSand = [0.97, 0.89, 0.72];
      const shadedSand = [0.68, 0.65, 0.52];
      const deepHorizonTint = [0.02, 0.15, 0.4];

      const sunFactor = clamp(0.64 + centerSunBoost * 0.3 + shallowClarityBoost - bankShadow + (patch - 0.5) * 0.14);
      let r = mix(shadedSand[0], warmSand[0], sunFactor);
      let g = mix(shadedSand[1], warmSand[1], sunFactor);
      let b = mix(shadedSand[2], warmSand[2], sunFactor);

      // Substrato rochoso/recifal: tom calcário mais frio sob as colônias.
      r = mix(r, 0.5, hardSubstrate * 0.35);
      g = mix(g, 0.48, hardSubstrate * 0.35);
      b = mix(b, 0.4, hardSubstrate * 0.35);

      // Transição suave apenas nas cotas profundas (fim da rampa e bacia).
      r = mix(r, deepHorizonTint[0], waterDistanceMix * 0.85);
      g = mix(g, deepHorizonTint[1], waterDistanceMix * 0.82);
      b = mix(b, deepHorizonTint[2], waterDistanceMix * 0.78);

      positions.push(x, y, z);
      colors.push(r, g, b, 1);
      // UV com deformação de baixa frequência: quebra a repetição do ladrilho
      // sem alterar a escala perceptual dos grãos de areia.
      const warpU = (fbm2D(x * 0.085 + 3.8, z * 0.085 - 1.2, 3) - 0.5) * 0.18;
      const warpV = (fbm2D(x * 0.1 - 7.1, z * 0.1 + 2.9, 3) - 0.5) * 0.18;
      uvs.push((x - xMin) * 0.042 + warpU, (z - zMin) * 0.042 + warpV);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const mesh = new Mesh('leito-recifal', scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.colors = colors;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh, true);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.applyFog = true;
  return mesh;
}

/**
 * Rochas recifais achatadas em bancadas/lajes naturais (nunca esferas pretas).
 */
function createRockSource(scene: Scene, seed: number): Mesh {
  const source = MeshBuilder.CreateIcoSphere(`rocha-base-${seed}`, { radius: 1, subdivisions: 2, updatable: true }, scene);
  const positions = source.getVerticesData(VertexBuffer.PositionKind);
  if (positions) {
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index];
      const y = positions[index + 1];
      const z = positions[index + 2];
      const noise = fbm2D(x * 1.5 + seed, z * 1.5 + y * 1.1 + seed * 0.7, 3);
      const ledgeStep = Math.sin(y * 5.2 + seed) * 0.08;
      const factor = 0.76 + noise * 0.48 + ledgeStep;
      positions[index] = x * factor * 1.38;
      // Achata verticalmente para formar lajes/cabeços recifais estratificados
      positions[index + 1] = (y < 0 ? y * 0.32 : y * 0.48) * factor + 0.12;
      positions[index + 2] = z * factor * 1.18;
    }
    source.setVerticesData(VertexBuffer.PositionKind, positions, false);
    source.createNormals(true);
    source.refreshBoundingInfo();
  }
  source.isPickable = false;
  return source;
}

function createPebbleSource(scene: Scene): Mesh {
  const pebble = MeshBuilder.CreateSphere('seixo-praia-fonte', { diameter: 0.55, segments: 6 }, scene);
  pebble.scaling.set(1.25, 0.42, 0.95);
  pebble.bakeCurrentTransformIntoVertices();
  pebble.isPickable = false;
  return pebble;
}

function mergeParts(parts: Mesh[], name: string): Mesh {
  const merged = Mesh.MergeMeshes(parts, true, true);
  if (!merged) throw new Error(`Falha ao montar geometria procedural: ${name}`);
  merged.name = name;
  merged.isPickable = false;
  return merged;
}

function createBranchingCoralSource(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  const trunk = MeshBuilder.CreateCylinder('coral-tronco', {
    height: 0.78,
    diameterTop: 0.08,
    diameterBottom: 0.16,
    tessellation: 6,
  }, scene);
  trunk.position.y = 0.38;
  parts.push(trunk);

  const branchAngles = [-1.1, -0.65, -0.2, 0.25, 0.7, 1.15];
  branchAngles.forEach((angle, index) => {
    const length = 0.62 + (index % 3) * 0.14;
    const branch = MeshBuilder.CreateCylinder(`coral-ramo-${index}`, {
      height: length,
      diameterTop: 0.035,
      diameterBottom: 0.08,
      tessellation: 6,
    }, scene);
    branch.position.set(Math.sin(angle) * 0.22, 0.56 + (index % 2) * 0.12, Math.cos(angle) * 0.18);
    branch.rotation.z = Math.cos(angle) * 0.65;
    branch.rotation.x = Math.sin(angle) * 0.52;
    parts.push(branch);

    const tip = MeshBuilder.CreateSphere(`coral-ponta-${index}`, { diameter: 0.095, segments: 5 }, scene);
    tip.position.set(
      branch.position.x + Math.sin(angle) * length * 0.44,
      branch.position.y + length * 0.44,
      branch.position.z + Math.cos(angle) * length * 0.22,
    );
    parts.push(tip);
  });

  return mergeParts(parts, 'coral-ramificado-fonte');
}

function createBrainCoralSource(scene: Scene): Mesh {
  const source = MeshBuilder.CreateIcoSphere('coral-cerebro-fonte', { radius: 0.58, subdivisions: 2, updatable: true }, scene);
  const positions = source.getVerticesData(VertexBuffer.PositionKind);
  if (positions) {
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      const grooves = 1 + Math.sin(x * 16 + Math.sin(z * 12) * 2.2) * 0.06;
      positions[i] = x * 1.15 * grooves;
      positions[i + 1] = Math.max(-0.1, y * 0.72 * grooves) + 0.18;
      positions[i + 2] = z * 1.08 * grooves;
    }
    source.setVerticesData(VertexBuffer.PositionKind, positions, false);
    source.createNormals(true);
    source.refreshBoundingInfo();
  }
  return source;
}

/**
 * Coral-mesa / leque recifal em camadas abertas (como as colônias rosa/coral
 * nas bancadas esquerda e direita da imagem de referência).
 *
 * O topo é uma lâmina radial com borda ondulada (não um cone de guarda-chuva):
 * a silhueta irregular e o relevo suave leem como colônia de Acropora/Montipora
 * mesmo a poucos metros da câmera.
 */
function createFanCoralSource(scene: Scene): Mesh {
  const buildPlate = (radius: number, y: number, phase: number): Mesh => {
    const sectors = 24;
    const rings = 3;
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    for (let ring = 0; ring <= rings; ring += 1) {
      const t = ring / rings;
      for (let s = 0; s <= sectors; s += 1) {
        const angle = (s / sectors) * Math.PI * 2;
        const rim =
          1 +
          Math.sin(angle * 3 + phase) * 0.12 +
          Math.sin(angle * 5 + phase * 1.7) * 0.07 +
          Math.sin(angle * 8 + phase * 0.6) * 0.035;
        const r = radius * t * rim;
        const dome = Math.pow(1 - t, 1.6) * 0.1 * (0.6 + 0.4 * Math.sin(angle * 2 + phase));
        positions.push(Math.cos(angle) * r, y + dome - t * 0.035, Math.sin(angle) * r);
        uvs.push(s / sectors, t);
      }
    }

    const stride = sectors + 1;
    for (let ring = 0; ring < rings; ring += 1) {
      for (let s = 0; s < sectors; s += 1) {
        const a = ring * stride + s;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const plate = new Mesh(`coral-mesa-plate-${phase}`, scene);
    const data = new VertexData();
    data.positions = positions;
    data.uvs = uvs;
    data.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.normals = normals;
    data.applyToMesh(plate, false);
    return plate;
  };

  const stem = MeshBuilder.CreateCylinder('leque-haste', {
    height: 0.46,
    diameterTop: 0.16,
    diameterBottom: 0.28,
    tessellation: 7,
  }, scene);
  stem.position.y = 0.23;

  const mainPlate = buildPlate(0.62, 0.52, 0.7);
  const crownPlate = buildPlate(0.34, 0.66, 2.4);
  crownPlate.position.set(0.14, 0, -0.08);
  return mergeParts([stem, mainPlate, crownPlate], 'coral-leque-fonte');
}

function createTubeCoralSource(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  const offsets: ReadonlyArray<readonly [number, number, number, number]> = [
    [-0.16, 0.06, 0.68, -0.1],
    [0.02, -0.08, 0.86, 0.04],
    [0.18, 0.08, 0.74, 0.12],
    [-0.06, 0.18, 0.58, -0.06],
    [0.14, -0.14, 0.62, 0.08],
  ];
  offsets.forEach(([ox, oz, height, tilt], index) => {
    const tube = MeshBuilder.CreateCylinder(`coral-tubo-${index}`, {
      height,
      diameterTop: 0.18,
      diameterBottom: 0.13,
      tessellation: 9,
    }, scene);
    tube.position.set(ox, height * 0.5, oz);
    tube.rotation.z = tilt;
    parts.push(tube);
  });
  return mergeParts(parts, 'coral-tubo-fonte');
}

function createSeagrassSource(scene: Scene): Mesh {
  const blades: Mesh[] = [];
  const bladeConfigs = [
    { ox: -0.12, oz: 0.0, h: 1.35, rot: -0.18 },
    { ox: 0.0, oz: 0.06, h: 1.55, rot: 0.05 },
    { ox: 0.12, oz: -0.04, h: 1.2, rot: 0.22 },
  ];

  bladeConfigs.forEach((cfg, bIdx) => {
    const segments = 6;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const width = 0.075 * (1 - t * 0.72);
      const y = t * cfg.h;
      const curveX = cfg.ox + Math.sin(t * Math.PI * 0.8) * cfg.rot * 0.4;
      positions.push(curveX - width, y, cfg.oz, curveX + width, y, cfg.oz);
      uvs.push(0, t, 1, t);
      if (index < segments) {
        const base = index * 2;
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
    const blade = new Mesh(`alga-folha-${bIdx}`, scene);
    const data = new VertexData();
    data.positions = positions;
    data.uvs = uvs;
    data.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.normals = normals;
    data.applyToMesh(blade, false);
    blades.push(blade);
  });

  return mergeParts(blades, 'algas-fonte');
}

/**
 * Distribui rochas e corais pelas bancadas laterais e pelos cantos do quadro.
 *
 * A composição antiga concentrava tudo entre 30% e 88% de profundidade — uma
 * faixa no meio da tela. Agora cada grupo sorteia uma profundidade em três
 * bandas (primeiro plano, médio e fundo) e uma posição lateral em duas faixas
 * (borda externa perto dos cantos ou banco interno). O canal central continua
 * aberto para a areia e as cáusticas, mas recebe cabeços esparsos no fundo.
 */
function createBankAnchors(
  count: number,
  seed: number,
  colorPalette: ReadonlyArray<readonly [number, number, number]>,
  scaleMin: number,
  scaleMax: number,
  depthMin = 0.34,
  depthMax = 0.88,
  allowDeepCenter = true,
  organized = false,
): Anchor[] {
  const random = mulberry32(seed);
  const anchors: Anchor[] = [];
  const span = Math.max(0.04, depthMax - depthMin);

  for (let index = 0; index < count; index += 1) {
    const color = colorPalette[Math.floor(random() * colorPalette.length) % colorPalette.length];

    let depth: number;
    let u: number;

    if (organized) {
      // Layout de celular: pares espelhados em três faixas de profundidade.
      // A leitura fica limpa, sem moitas aleatórias competindo com os peixes.
      const side = index % 2 === 0 ? -1 : 1;
      const inner = index % 4 < 2;
      const row = Math.floor(index / 4) % 3;
      const baseU = side < 0 ? (inner ? 0.235 : 0.085) : (inner ? 0.765 : 0.915);
      u = baseU + (random() - 0.5) * 0.028;
      depth = depthMin + span * ((row + 0.5) / 3) + (random() - 0.5) * span * 0.045;
    } else {
      // 36% primeiro plano, 32% meio, 32% fundo.
      const depthRoll = random();
      if (depthRoll < 0.36) {
        depth = depthMin + random() * span * 0.24;
      } else if (depthRoll < 0.68) {
        depth = depthMin + span * (0.24 + random() * 0.36);
      } else {
        depth = depthMin + span * (0.6 + random() * 0.4);
      }

      if (allowDeepCenter && depth > 0.62 && index % 6 === 0) {
        // Cabeços esparsos no fundo do canal, longe do barco.
        u = 0.34 + random() * 0.32;
      } else if (random() < 0.5) {
        // Bancada esquerda: 70% encostada no canto, 30% no banco interno.
        u = random() < 0.7 ? 0.02 + random() * 0.24 : 0.2 + random() * 0.2;
      } else {
        // Bancada direita, mesma lógica espelhada.
        u = random() < 0.7 ? 0.74 + random() * 0.24 : 0.6 + random() * 0.2;
      }
    }

    // Objetos muito perto da câmera ficam menores: evita "paredes" de coral
    // no primeiro plano e permite que caibam nos cantos sem perder leitura.
    const nearScale = depth < 0.24 ? 0.6 + (depth / 0.24) * 0.4 : 1;
    const scale = organized
      ? scaleMin + (scaleMax - scaleMin) * (0.5 + (index % 3) * 0.16)
      : scaleMin + random() * (scaleMax - scaleMin);

    anchors.push({
      u,
      depth,
      scale: scale * nearScale,
      rotation: organized ? (index % 2 === 0 ? Math.PI * 0.08 : Math.PI * 0.92) : random() * Math.PI * 2,
      tilt: (random() - 0.5) * (organized ? 0.06 : 0.14),
      color,
    });
  }
  return anchors;
}

/** Seixos baixos espalhados na areia do canal central e bordas. */
function createChannelPebbleAnchors(count: number, seed: number, organized = false): Anchor[] {
  const random = mulberry32(seed);
  const anchors: Anchor[] = [];
  for (let i = 0; i < count; i += 1) {
    const color = PEBBLE_COLORS[i % PEBBLE_COLORS.length];
    if (organized) {
      // Três colunas e três faixas: seixos alinhados sem parecer uma pilha.
      const column = [0.2, 0.5, 0.8][i % 3];
      const row = Math.floor(i / 3) % 3;
      anchors.push({
        u: column + (random() - 0.5) * 0.035,
        depth: 0.08 + row * 0.16 + (random() - 0.5) * 0.025,
        scale: 0.5 + (i % 3) * 0.13,
        rotation: random() * Math.PI * 2,
        tilt: (random() - 0.5) * 0.04,
        color,
      });
      continue;
    }

    // Metade dos seixos vem para o primeiro plano, onde a areia e as cáusticas
    // precisam de escala; a outra metade segue distribuída pelo canal.
    const foreground = i % 2 === 0;
    anchors.push({
      u: foreground ? 0.08 + random() * 0.84 : 0.16 + random() * 0.68,
      depth: foreground ? 0.06 + random() * 0.2 : 0.2 + random() * 0.5,
      scale: (foreground ? 0.4 : 0.55) + random() * (foreground ? 0.55 : 0.85),
      rotation: random() * Math.PI * 2,
      tilt: (random() - 0.5) * 0.08,
      color,
    });
  }
  return anchors;
}

function createThinGroup(
  scene: Scene,
  name: string,
  source: Mesh,
  anchors: Anchor[],
  material: PBRMaterial,
  withColors: boolean,
): ThinGroup {
  source.name = `${name}-fonte`;
  source.material = material;
  source.alwaysSelectAsActiveMesh = true;
  source.doNotSyncBoundingInfo = true;
  source.isPickable = false;
  source.renderingGroupId = 1;

  const matrices = new Float32Array(anchors.length * 16);
  const colors = new Float32Array(anchors.length * 4);
  const group: ThinGroup = {
    mesh: source,
    anchors,
    matrices,
    colors,
    matrix: Matrix.Identity(),
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    scaling: Vector3.One(),
  };

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    colors[index * 4] = anchor.color[0];
    colors[index * 4 + 1] = anchor.color[1];
    colors[index * 4 + 2] = anchor.color[2];
    colors[index * 4 + 3] = 1;
  }

  source.thinInstanceSetBuffer('matrix', matrices, 16, false);
  if (withColors) {
    source.thinInstanceSetBuffer('color', colors, 4, false);
  }
  return group;
}

function clampAnchorU(frame: DioramaFrame, anchor: Anchor, radiusFactor: number): number {
  if (radiusFactor <= 0) return anchor.u;
  const halfWidth = frame.halfWidthAtDepth(anchor.depth);
  const halfExtent = Math.max(0.02, (anchor.scale * radiusFactor) / Math.max(0.001, halfWidth));
  // Permite que a borda do objeto encoste/escape levemente do quadro nos
  // cantos (55% do raio): composição natural de diorama em vez de uma fileira
  // de corais todos contidos no mesmo retângulo seguro.
  const margin = Math.min(0.46, frame.profile.marginX + halfExtent * 0.55);
  return clamp(anchor.u, margin, 1 - margin);
}

type SubstratePreference = 'reef' | 'sand' | 'any';

/**
 * Escolhe uma posição ecológica para o grupo.
 *
 * O `u` do anchor define a composição na tela, mas corais não devem cair em
 * areia solta nem o capim-marinho sobre hardground. Quando o ponto sorteado não
 * combina com o substrato, caminhamos lateralmente em direção à bancada (ou ao
 * canal, no caso da areia) com deslocamento pequeno e determinístico.
 */
function resolveGroupPoint(
  frame: DioramaFrame,
  anchor: Anchor,
  radiusFactor: number,
  preference: SubstratePreference,
): { x: number; z: number } {
  let u = clampAnchorU(frame, anchor, radiusFactor);
  let depth = anchor.depth;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const point = frame.surfacePoint(u, depth);
    const suitability = reefSuitabilityAt(point.x, point.z);
    const fits =
      preference === 'any' ||
      (preference === 'reef' ? suitability >= 0.24 : suitability <= 0.52);
    if (fits) return point;

    const direction = preference === 'sand'
      ? (u < 0.5 ? 0.018 : -0.018)
      : (u < 0.5 ? -0.032 : 0.032);
    u = clamp(u + direction, 0.03, 0.97);
    depth = clamp(depth + (attempt % 2 === 0 ? 0.012 : -0.006), 0.04, 0.92);
  }

  return frame.surfacePoint(u, depth);
}

function writeGroupMatrices(
  group: ThinGroup,
  frame: DioramaFrame,
  yOffset: number,
  heightAt: (x: number, z: number) => number,
  radiusFactor: number,
  preference: SubstratePreference = 'any',
): void {
  const scale = new Vector3();
  const position = new Vector3();
  const rotation = Quaternion.RotationYawPitchRoll(0, 0, 0);
  const matrix = new Matrix();

  for (let index = 0; index < group.anchors.length; index += 1) {
    const anchor = group.anchors[index];
    const point = resolveGroupPoint(frame, anchor, radiusFactor, preference);
    position.set(point.x, heightAt(point.x, point.z) + yOffset, point.z);
    scale.set(anchor.scale, anchor.scale, anchor.scale);
    Quaternion.RotationYawPitchRollToRef(anchor.rotation, anchor.tilt, anchor.tilt * 0.5, rotation);
    Matrix.ComposeToRef(scale, rotation, position, matrix);
    matrix.copyToArray(group.matrices, index * 16);
  }

  group.mesh.thinInstanceBufferUpdated('matrix');
  group.mesh.thinInstanceRefreshBoundingInfo(false);
}

export function createTerrainSystem(scene: Scene, quality: SceneQualityProfile): TerrainSystem {
  const reefDensity = clamp(quality.reefDensity, 0.2, 1);
  const organized = quality.reefGardenLayout;
  const reefCount = (count: number) => Math.max(4, Math.round(count * reefDensity));
  const { albedo: sandAlbedo, normal: sandNormal, roughness: sandRoughness } = createSandTextures(scene);
  const causticTexture = createCausticTexture(scene);
  const rockTexture = createRockTexture(scene);
  const underwaterBackdrop = createUnderwaterVolumeBackdrop(scene);

  const sandMaterial = new PBRMaterial('areia-material', scene);
  sandMaterial.albedoTexture = sandAlbedo;
  // Leve aquecimento tropical: o scan é neutro e, sob o véu azul, ficaria
  // acinzentado. O albedo do vértice continua modulando profundidade/patch.
  sandMaterial.albedoColor = new Color3(1.0, 0.93, 0.79);
  sandMaterial.bumpTexture = sandNormal;
  sandMaterial.bumpTexture.level = 0.72;
  sandMaterial.metallic = 0;
  sandMaterial.roughness = 0.9;
  sandMaterial.metallicTexture = sandRoughness;
  sandMaterial.useRoughnessFromMetallicTextureGreen = true;
  sandMaterial.useMetallnessFromMetallicTextureBlue = false;
  sandMaterial.backFaceCulling = false;
  sandMaterial.twoSidedLighting = true;
  sandMaterial.emissiveTexture = causticTexture;
  sandMaterial.emissiveColor = new Color3(0.08, 0.09, 0.08);
  sandMaterial.emissiveIntensity = 0.12;

  const terrainMesh = buildTerrainMesh(scene, sandMaterial);

  const rockMaterial = new PBRMaterial('rocha-material', scene);
  rockMaterial.albedoTexture = rockTexture;
  rockMaterial.albedoColor = new Color3(0.9, 0.86, 0.78);
  rockMaterial.emissiveTexture = causticTexture;
  rockMaterial.emissiveColor = new Color3(0.04, 0.05, 0.05);
  rockMaterial.metallic = 0.02;
  rockMaterial.roughness = 0.78;

  const coralMaterial = new PBRMaterial('coral-material', scene);
  coralMaterial.albedoColor = new Color3(1, 1, 1);
  coralMaterial.metallic = 0.04;
  coralMaterial.roughness = 0.46;
  coralMaterial.emissiveColor = new Color3(0.12, 0.07, 0.05);

  const fanMaterial = coralMaterial.clone('coral-leque-material');
  fanMaterial.backFaceCulling = false;
  fanMaterial.twoSidedLighting = true;

  const rockA = createRockSource(scene, 1.7);
  const rockB = createRockSource(scene, 5.3);
  const pebble = createPebbleSource(scene);
  const branch = createBranchingCoralSource(scene);
  const brain = createBrainCoralSource(scene);
  const fan = createFanCoralSource(scene);
  const tube = createTubeCoralSource(scene);
  const seagrass = createSeagrassSource(scene);

  const rockAnchorsA = createBankAnchors(reefCount(14), 21, ROCK_COLORS, 1.15, 2.25, 0.06, 0.9, true, organized);
  const rockAnchorsB = createBankAnchors(reefCount(12), 33, ROCK_COLORS, 0.85, 1.75, 0.05, 0.88, true, organized);
  const pebbleAnchors = createChannelPebbleAnchors(reefCount(26), 109, organized);
  const branchAnchors = createBankAnchors(reefCount(28), 41, BRANCH_COLORS, 0.95, 1.85, 0.06, 0.88, false, organized);
  const brainAnchors = createBankAnchors(reefCount(18), 53, BRAIN_COLORS, 0.85, 1.55, 0.07, 0.86, false, organized);
  const fanAnchors = createBankAnchors(reefCount(14), 67, FAN_COLORS, 0.95, 1.65, 0.08, 0.84, false, organized);
  const tubeAnchors = createBankAnchors(reefCount(16), 79, TUBE_COLORS, 0.85, 1.55, 0.07, 0.86, false, organized);
  const grassAnchors = createBankAnchors(reefCount(34), 97, [[0.18, 0.48, 0.24]], 0.75, 1.45, 0.05, 0.9, true, organized);

  const rockGroupA = createThinGroup(scene, 'rochas-a', rockA, rockAnchorsA, rockMaterial, true);
  const rockGroupB = createThinGroup(scene, 'rochas-b', rockB, rockAnchorsB, rockMaterial, true);
  const pebbleGroup = createThinGroup(scene, 'seixos-praia', pebble, pebbleAnchors, rockMaterial, true);
  const branchGroup = createThinGroup(scene, 'coral-ramificado', branch, branchAnchors, coralMaterial, true);
  const brainGroup = createThinGroup(scene, 'coral-cerebro', brain, brainAnchors, coralMaterial, true);
  const fanGroup = createThinGroup(scene, 'coral-leque', fan, fanAnchors, fanMaterial, true);
  const tubeGroup = createThinGroup(scene, 'coral-tubo', tube, tubeAnchors, coralMaterial, true);

  const grassMaterial = new PBRMaterial('algas-material', scene);
  grassMaterial.albedoColor = new Color3(0.18, 0.52, 0.24);
  grassMaterial.emissiveColor = new Color3(0.04, 0.12, 0.05);
  grassMaterial.metallic = 0;
  grassMaterial.roughness = 0.65;
  grassMaterial.backFaceCulling = false;
  grassMaterial.twoSidedLighting = true;
  const grassGroup = createThinGroup(
    scene,
    'algas',
    seagrass,
    grassAnchors,
    grassMaterial,
    false,
  );

  const restorationAnchors = createBankAnchors(
    Math.max(8, reefCount(24)),
    131,
    [[0.3, 0.72, 0.46]],
    0.55,
    0.95,
    0.08,
    0.86,
    true,
    organized,
  );
  const restorationMaterial = new PBRMaterial('restauracao-material', scene);
  restorationMaterial.albedoColor = new Color3(0.34, 0.78, 0.52);
  restorationMaterial.emissiveColor = new Color3(0.06, 0.18, 0.10);
  restorationMaterial.metallic = 0;
  restorationMaterial.roughness = 0.62;
  const restorationSource = createBranchingCoralSource(scene);
  const restorationGroup = createThinGroup(
    scene,
    'corais-restaurados',
    restorationSource,
    restorationAnchors,
    restorationMaterial,
    false,
  );

  rockGroupA.mesh.receiveShadows = true;
  rockGroupB.mesh.receiveShadows = true;
  pebbleGroup.mesh.receiveShadows = true;
  branchGroup.mesh.receiveShadows = true;
  brainGroup.mesh.receiveShadows = true;
  fanGroup.mesh.receiveShadows = true;
  tubeGroup.mesh.receiveShadows = true;
  grassGroup.mesh.receiveShadows = true;
  restorationGroup.mesh.receiveShadows = true;

  const laidOutGroups: ReadonlyArray<{
    group: ThinGroup;
    radius: number;
    yOffset: number;
    substrate: SubstratePreference;
  }> = [
    { group: rockGroupA, radius: 1.35, yOffset: -0.08, substrate: 'any' },
    { group: rockGroupB, radius: 1.2, yOffset: -0.06, substrate: 'any' },
    { group: pebbleGroup, radius: 0.35, yOffset: -0.02, substrate: 'any' },
    { group: branchGroup, radius: 0.9, yOffset: 0.18, substrate: 'reef' },
    { group: brainGroup, radius: 0.75, yOffset: 0.12, substrate: 'reef' },
    { group: fanGroup, radius: 0.85, yOffset: 0.22, substrate: 'reef' },
    { group: tubeGroup, radius: 0.65, yOffset: 0.15, substrate: 'reef' },
    { group: grassGroup, radius: 0.15, yOffset: 0.02, substrate: 'sand' },
  ];
  const allGroups = laidOutGroups.map((entry) => entry.group);

  // Volume sólido aproximado de cada colônia/rocha para colisão e interação dos
  // peixes. Os raios são conservadores: preferimos desviar um pouco antes a
  // deixar uma nadadeira atravessar o coral.
  const obstacleSources: ReadonlyArray<{
    group: ThinGroup;
    kind: ReefObstacleKind;
    radiusFactor: number;
    heightFactor: number;
  }> = [
    { group: rockGroupA, kind: 'rock', radiusFactor: 1.08, heightFactor: 0.72 },
    { group: rockGroupB, kind: 'rock', radiusFactor: 0.98, heightFactor: 0.64 },
    { group: branchGroup, kind: 'coral', radiusFactor: 0.42, heightFactor: 1.12 },
    { group: brainGroup, kind: 'coral', radiusFactor: 0.62, heightFactor: 0.78 },
    { group: fanGroup, kind: 'coral', radiusFactor: 0.68, heightFactor: 0.7 },
    { group: tubeGroup, kind: 'coral', radiusFactor: 0.44, heightFactor: 0.9 },
  ];
  const obstacles: ReefObstacle[] = [];

  const baseTerrainColors = terrainMesh.getVerticesData(VertexBuffer.ColorKind)?.slice() ?? null;
  const terrainPositions = terrainMesh.getVerticesData(VertexBuffer.PositionKind);
  const workingTerrainColors = baseTerrainColors ? new Float32Array(baseTerrainColors.length) : null;

  const rebuildObstacles = (): void => {
    obstacles.length = 0;
    for (const spec of obstacleSources) {
      for (let index = 0; index < spec.group.anchors.length; index += 1) {
        const anchor = spec.group.anchors[index];
        const x = spec.group.matrices[index * 16 + 12];
        const baseY = spec.group.matrices[index * 16 + 13];
        const z = spec.group.matrices[index * 16 + 14];
        obstacles.push({
          x,
          z,
          baseY,
          topY: baseY + anchor.scale * spec.heightFactor,
          radius: anchor.scale * spec.radiusFactor,
          kind: spec.kind,
        });
      }
    }

    // Assa oclusão de contato (AO) suave onde rochas e corais encontram o fundo de areia
    // (As sombras solares projetadas dinâmicas são calculadas pelo ShadowGenerator da GPU).
    if (baseTerrainColors && terrainPositions && workingTerrainColors) {
      const vCount = terrainPositions.length / 3;
      for (let v = 0; v < vCount; v += 1) {
        const vx = terrainPositions[v * 3];
        const vz = terrainPositions[v * 3 + 2];
        let aoShade = 1.0;

        for (let o = 0; o < obstacles.length; o += 1) {
          const obs = obstacles[o];
          const dx = vx - obs.x;
          const dz = vz - obs.z;
          const r2 = dx * dx + dz * dz;
          const rad = Math.max(0.35, obs.radius * 1.15);
          if (r2 < rad * rad * 1.8) {
            const falloff = Math.exp(-r2 / (rad * rad * 0.75));
            const strength = obs.kind === 'rock' ? 0.22 : 0.16;
            aoShade *= 1.0 - falloff * strength;
          }
        }

        aoShade = Math.max(0.65, aoShade);
        workingTerrainColors[v * 4] = baseTerrainColors[v * 4] * aoShade;
        workingTerrainColors[v * 4 + 1] = baseTerrainColors[v * 4 + 1] * aoShade;
        workingTerrainColors[v * 4 + 2] = baseTerrainColors[v * 4 + 2] * aoShade;
        workingTerrainColors[v * 4 + 3] = 1;
      }
      terrainMesh.updateVerticesData(VertexBuffer.ColorKind, workingTerrainColors, false, false);
    }
  };

  const shadowCasters: AbstractMesh[] = [
    rockGroupA.mesh,
    rockGroupB.mesh,
    pebbleGroup.mesh,
    branchGroup.mesh,
    brainGroup.mesh,
    fanGroup.mesh,
    tubeGroup.mesh,
    grassGroup.mesh,
    restorationGroup.mesh,
  ];

  const sceneMeshes: AbstractMesh[] = [
    underwaterBackdrop.mesh,
    terrainMesh,
    ...allGroups.map((group) => group.mesh),
    restorationGroup.mesh,
  ];

  let lastSlowUpdate = -1;
  let currentFrame: DioramaFrame | null = null;
  let currentRestoration = 0;
  const grassScale = new Vector3();
  const grassPosition = new Vector3();
  const grassRotation = Quaternion.Identity();
  const grassMatrix = new Matrix();

  return {
    meshes: sceneMeshes,
    shadowCasters,
    obstacles,
    heightAt: seabedHeightAt,
    layout(frame: DioramaFrame): void {
      currentFrame = frame;
      for (const entry of laidOutGroups) {
        writeGroupMatrices(
          entry.group,
          frame,
          entry.yOffset,
          seabedHeightAt,
          entry.radius,
          entry.substrate,
        );
      }
      writeGroupMatrices(restorationGroup, frame, 0.14, seabedHeightAt, 0.8, 'reef');
      applyRestoration(frame, currentRestoration);
      rebuildObstacles();
    },
    updateVisual(visual: VisualState, elapsed: number, cameraDepth = 0): void {
      // Animação lenta das cáusticas: deriva contínua com pequena oscilação,
      // como o foco da luz refratada variando com a ondulação da superfície.
      causticTexture.uOffset = (elapsed * 0.011 + Math.sin(elapsed * 0.55) * 0.008) % 1;
      causticTexture.vOffset = (elapsed * 0.008 + Math.cos(elapsed * 0.43) * 0.006) % 1;

      const shimmer = 0.94 + 0.06 * Math.sin(elapsed * 1.7);
      const clarity = visual.waterClarity;

      // A rede de cáusticas perde contraste conforme a luz percorre a coluna
      // (Beer-Lambert) e a dispersão múltipla preenche a penumbra do padrão:
      // na superfície (0 m) força plena; próximo do leito (12 m) resta 42%.
      // Assim a mesma areia lê como área rasa iluminada de cima e como
      // recife profundo quando a câmera mergulha por ela.
      const depthFactor = clamp(cameraDepth / 12, 0, 1);
      const causticStrength = mix(1, 0.42, depthFactor);

      sandMaterial.emissiveColor.set(
        (0.06 + 0.06 * clarity) * shimmer * causticStrength,
        (0.07 + 0.07 * clarity) * shimmer * causticStrength,
        (0.07 + 0.05 * clarity) * shimmer * causticStrength,
      );

      // A rocha recifal também recebe a rede de luz na mesma frequência do
      // trecho de areia, mantendo continuidade entre substratos.
      rockMaterial.emissiveColor.set(
        0.04 * shimmer * causticStrength,
        0.05 * shimmer * causticStrength,
        0.05 * shimmer * causticStrength,
      );

      // Volume azul subaquático reage à turbidez, esgoto e óleo
      const murk = clamp(visual.turbidity * 0.55 + visual.sewage * 0.35 + visual.oil * 0.25);
      underwaterBackdrop.material.emissiveColor.set(
        mix(1.0, 0.42, murk),
        mix(1.0, 0.58, murk),
        mix(1.0, 0.48, murk),
      );

      // O capim-marinho (seagrass) precisa atualizar a cada quadro (60 FPS);
      // antes ficava preso atrás do throttle de 240 ms (~4 FPS) e parecia travado.
      updateSeagrass(grassGroup, elapsed);

      if (elapsed - lastSlowUpdate < 0.24) return;
      lastSlowUpdate = elapsed;

      updateCoralColors(branchGroup, visual);
      updateCoralColors(brainGroup, visual);
      updateCoralColors(fanGroup, visual);
      updateCoralColors(tubeGroup, visual);
      updateRockColors(rockGroupA, visual);
      updateRockColors(rockGroupB, visual);

      if (currentFrame) applyRestoration(currentFrame, visual.restoration);
    },
  };

  function applyRestoration(frame: DioramaFrame, amount: number): void {
    currentRestoration = amount;
    const visible = Math.floor(clamp(amount) * restorationGroup.anchors.length);
    const scale = new Vector3();
    const position = new Vector3();
    const rotation = Quaternion.Identity();
    const matrix = new Matrix();
    for (let index = 0; index < restorationGroup.anchors.length; index += 1) {
      const anchor = restorationGroup.anchors[index];
      const point = resolveGroupPoint(frame, anchor, 0.8, 'reef');
      const visibleScale = index < visible ? anchor.scale * (0.35 + amount * 0.65) : 0.0001;
      position.set(point.x, seabedHeightAt(point.x, point.z) + 0.14, point.z);
      scale.set(visibleScale, visibleScale, visibleScale);
      Quaternion.RotationYawPitchRollToRef(anchor.rotation, anchor.tilt, anchor.tilt, rotation);
      Matrix.ComposeToRef(scale, rotation, position, matrix);
      matrix.copyToArray(restorationGroup.matrices, index * 16);
    }
    restorationGroup.mesh.thinInstanceBufferUpdated('matrix');
  }

  function updateCoralColors(group: ThinGroup, visual: VisualState): void {
    for (let index = 0; index < group.anchors.length; index += 1) {
      updateCoralColor(group, index, visual);
    }
    group.mesh.thinInstanceBufferUpdated('color');
  }

  function updateCoralColor(group: ThinGroup, index: number, visual: VisualState): void {
    const anchor = group.anchors[index];
    const deadColor = [0.52, 0.52, 0.47];
    const bleached = [0.95, 0.94, 0.90];
    const deathMix = clamp(visual.coralDead * 0.8);
    const bleachMix = clamp(visual.bleaching * 0.92);
    const r = mix(mix(anchor.color[0], bleached[0], bleachMix), deadColor[0], deathMix * 0.55);
    const g = mix(mix(anchor.color[1], bleached[1], bleachMix), deadColor[1], deathMix * 0.55);
    const b = mix(mix(anchor.color[2], bleached[2], bleachMix), deadColor[2], deathMix * 0.55);
    group.colors[index * 4] = r;
    group.colors[index * 4 + 1] = g;
    group.colors[index * 4 + 2] = b;
    group.colors[index * 4 + 3] = 1;
  }

  function updateRockColors(group: ThinGroup, visual: VisualState): void {
    if (group.anchors.length === 0) return;
    for (let index = 0; index < group.anchors.length; index += 1) {
      const anchor = group.anchors[index];
      const algae = clamp(0.16 + (1 - visual.coralHealth) * 0.32 - visual.turbidity * 0.08);
      group.colors[index * 4] = mix(anchor.color[0], 0.32, algae * 0.35);
      group.colors[index * 4 + 1] = mix(anchor.color[1], 0.46, algae * 0.35);
      group.colors[index * 4 + 2] = mix(anchor.color[2], 0.36, algae * 0.35);
      group.colors[index * 4 + 3] = 1;
    }
    group.mesh.thinInstanceBufferUpdated('color');
  }

  function updateSeagrass(group: ThinGroup, elapsed: number): void {
    for (let index = 0; index < group.anchors.length; index += 1) {
      const anchor = group.anchors[index];
      const offset = index * 16;
      const x = group.matrices[offset + 12];
      const y = group.matrices[offset + 13];
      const z = group.matrices[offset + 14];
      const wavePhase = x * 0.26 + z * 0.18 - elapsed * 2.15 + anchor.rotation * 2.4;
      const swayRoll = Math.sin(wavePhase) * 0.16 + Math.sin(wavePhase * 1.9 + index) * 0.045;
      const swayPitch = Math.cos(wavePhase * 0.85 + anchor.tilt * 4) * 0.09;
      grassPosition.set(x, y, z);
      grassScale.set(anchor.scale, anchor.scale, anchor.scale);
      Quaternion.RotationYawPitchRollToRef(anchor.rotation, swayPitch, swayRoll, grassRotation);
      Matrix.ComposeToRef(grassScale, grassRotation, grassPosition, grassMatrix);
      grassMatrix.copyToArray(group.matrices, offset);
    }
    group.mesh.thinInstanceBufferUpdated('matrix');
  }
}
