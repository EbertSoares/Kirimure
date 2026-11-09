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
import type { DioramaFrame } from './framing';
import type { SceneQualityProfile } from './quality';
import { clamp, fbm2D, hash2D, mix, mulberry32, smoothstep, tileableFbm2D } from './procedural';
import type { ReefObstacle, ReefObstacleKind } from './reefObstacles';
import type { VisualState } from './visualState';

/**
 * Altimetria determinística do leito recifal e canal de areia.
 *
 * Forma um canal central de areia ondulada (como na referência split-level)
 * ladeado por bancadas recifais à esquerda e à direita, declinando suavemente
 * para o azul profundo ao fundo.
 */
export function seabedHeightAt(x: number, z: number): number {
  const broad = fbm2D(x * 0.055 + 3.1, z * 0.045 - 1.7, 4) * 0.95 - 0.45;
  const sandRipples =
    Math.sin(x * 0.62 + Math.sin(z * 0.25) * 1.4) * 0.13 +
    Math.sin(z * 0.74 - x * 0.21) * 0.10;
  // Bancadas laterais mais elevadas nas bordas esquerda/direita e amplo canal central de areia
  const lateralBank = smoothstep(6.2, 19.5, Math.abs(x)) * 1.55;
  // Rampa de praia: mais rasa perto da câmera (z < 26) para exibir a areia dourada em primeiro plano,
  // declinando suavemente até o horizonte azul escuro ao fundo (z > 38)
  const foregroundBeachLift = (1 - smoothstep(8, 30, z)) * 1.65;
  const depthDrop = smoothstep(28, 54, z) * 1.85;
  const microRelief = fbm2D(x * 0.16 - 4.2, z * 0.14 + 8.3, 3) * 0.22;
  return -7.75 + foregroundBeachLift + broad + sandRipples + lateralBank - depthDrop - microRelief;
}

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
  /** Rochas e corais sólidos, em coordenadas de mundo, recalculados no layout. */
  readonly obstacles: readonly ReefObstacle[];
  heightAt(x: number, z: number): number;
  layout(frame: DioramaFrame): void;
  updateVisual(visual: VisualState, elapsed: number): void;
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
  [0.54, 0.52, 0.46],
  [0.48, 0.49, 0.44],
  [0.58, 0.53, 0.47],
];

const PEBBLE_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.52, 0.54, 0.52],
  [0.62, 0.58, 0.50],
  [0.44, 0.48, 0.48],
];

/**
 * Textura de areia de praia submersa (albedo + mapa de normais):
 * ondas de areia dourada iluminadas pelo sol, cavas com sombra azul-esverdeada,
 * granulação fina de quartzo e pequenos fragmentos de conchas calcárias.
 */
function createSandTextures(scene: Scene): { albedo: DynamicTexture; normal: DynamicTexture } {
  const size = 512;
  const albedo = new DynamicTexture('areia-praia-albedo', { width: size, height: size }, scene, true);
  const normal = new DynamicTexture('areia-praia-normal', { width: size, height: size }, scene, true);
  albedo.wrapU = Texture.WRAP_ADDRESSMODE;
  albedo.wrapV = Texture.WRAP_ADDRESSMODE;
  normal.wrapU = Texture.WRAP_ADDRESSMODE;
  normal.wrapV = Texture.WRAP_ADDRESSMODE;

  const albedoCtx = albedo.getContext() as unknown as CanvasRenderingContext2D;
  const normalCtx = normal.getContext() as unknown as CanvasRenderingContext2D;
  const albedoImg = albedoCtx.createImageData(size, size);
  const normalImg = normalCtx.createImageData(size, size);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      // Ondulações assimétricas de corrente (stoss suave, lee íngreme, bifurcações) inspiradas em deepsea FLOOR (`ripple(xz)`)
      const warp =
        (tileableFbm2D(u, v, 3, 4) - 0.5) * 2.1 +
        Math.sin((u * 2 + v) * Math.PI * 2) * 0.32;
      const ph1 = ((u * 1 + v * 7) * Math.PI * 2 + warp * 2.6) / (Math.PI * 2);
      const f1 = ((ph1 % 1) + 1) % 1;
      const saw1 = smoothstep(0.0, 0.72, f1) * (1 - smoothstep(0.72, 1.0, f1));

      const ph2 = ((u * 3 - v * 14) * Math.PI * 2 + warp * 4.2) / (Math.PI * 2);
      const f2 = ((ph2 % 1) + 1) % 1;
      const saw2 = smoothstep(0.0, 0.70, f2) * (1 - smoothstep(0.70, 1.0, f2));

      const fineGrain = (hash2D(x * 1.7, y * 1.7) - 0.5) * 0.14;
      const mediumNoise = (tileableFbm2D(u, v, 4, 8) - 0.5) * 0.26;

      const h = clamp(saw1 * 0.74 + saw2 * 0.24 + mediumNoise + fineGrain + 0.18, 0, 1);
      heights[y * size + x] = h;

      // Crista de areia dourada iluminada pelo sol vs cava úmida em tom âmbar-areia
      const crest = clamp(smoothstep(0.18, 0.82, h));
      const grain = (hash2D(x * 3.1 + 7, y * 3.1 + 13) - 0.5) * 18;
      const shellSpec = hash2D(x * 5.3 + 19, y * 5.3 + 29) > 0.96 ? 26 : 0;

      // Areia tropical da Baía de Todos-os-Santos: dourado-creme quente nas cristas, bege-dourado nas cavas
      const r = clamp(mix(178, 244, crest) + grain + shellSpec, 0, 255);
      const g = clamp(mix(162, 220, crest) + grain * 0.92 + shellSpec * 0.95, 0, 255);
      const b = clamp(mix(124, 168, crest) + grain * 0.72 + shellSpec * 0.85, 0, 255);

      const idx = (y * size + x) * 4;
      albedoImg.data[idx] = Math.round(r);
      albedoImg.data[idx + 1] = Math.round(g);
      albedoImg.data[idx + 2] = Math.round(b);
      albedoImg.data[idx + 3] = 255;
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const up = (y - 1 + size) % size;
      const down = (y + 1) % size;
      const dx = heights[y * size + right] - heights[y * size + left];
      const dy = heights[down * size + x] - heights[up * size + x];
      const idx = (y * size + x) * 4;
      normalImg.data[idx] = Math.round(clamp(128 + dx * 165, 0, 255));
      normalImg.data[idx + 1] = Math.round(clamp(128 + dy * 165, 0, 255));
      normalImg.data[idx + 2] = 225;
      normalImg.data[idx + 3] = 255;
    }
  }

  albedoCtx.putImageData(albedoImg, 0, 0);
  normalCtx.putImageData(normalImg, 0, 0);
  albedo.update(false);
  normal.update(false);
  albedo.uScale = 7;
  albedo.vScale = 7;
  normal.uScale = 7;
  normal.vScale = 7;
  return { albedo, normal };
}

/**
 * Malha de cáusticas solares de praia rasa inspirada na função `caustic(uv, t)`
 * de 4 iterações (Dave Hoskins) usada em `deepsea/js/shaders.js:140-150`.
 */
function createCausticTexture(scene: Scene): DynamicTexture {
  const size = 512;
  const texture = new DynamicTexture('causticas-areia', { width: size, height: size }, scene, true);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const image = context.createImageData(size, size);
  const t = 1.85;

  for (let y = 0; y < size; y += 1) {
    const py = (y / size) * Math.PI * 2 - 250.0;
    for (let x = 0; x < size; x += 1) {
      const px = (x / size) * Math.PI * 2 - 250.0;

      let ix = px;
      let iy = py;
      let c = 1.0;
      for (let n = 0; n < 4; n += 1) {
        const tt = t * (1.0 - 3.5 / (n + 1));
        ix = px + Math.cos(tt - ix) + Math.sin(tt + iy);
        iy = py + Math.sin(tt - iy) + Math.cos(tt + ix);
        const sx = Math.sin(ix + tt) / 0.005;
        const cy = Math.cos(iy + tt) / 0.005;
        const denom = Math.hypot(px / (Math.abs(sx) < 1e-4 ? 1e-4 : sx), py / (Math.abs(cy) < 1e-4 ? 1e-4 : cy));
        c += 1.0 / Math.max(denom, 1e-4);
      }
      c = 1.17 - Math.pow(c / 4.0, 1.4);
      const filament = clamp(Math.pow(Math.abs(c), 7.2), 0, 1.4);
      const core = clamp(Math.pow(filament, 1.65), 0, 1);
      const halo = clamp(Math.pow(filament, 0.85), 0, 1);

      // Núcleo branco-dourado solar + halo ciano-dourado sobre a areia
      const r = clamp(core * 255 + halo * 135, 0, 255);
      const g = clamp(core * 246 + halo * 168, 0, 255);
      const b = clamp(core * 192 + halo * 142, 0, 255);

      const index = (y * size + x) * 4;
      image.data[index] = Math.round(r);
      image.data[index + 1] = Math.round(g);
      image.data[index + 2] = Math.round(b);
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  texture.update(false);
  texture.uScale = 5.0;
  texture.vScale = 6.0;
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
      // Zona central-direita iluminada pelo sol que atravessa a superfície
      const sunScatter = Math.exp(-Math.pow((u - 0.56) / 0.28, 2)) * (1 - smoothstep(0.0, 0.68, v));
      // Topo logo abaixo das ondas: azul-turquesa claro luminoso
      const topLightBlue = 1 - smoothstep(0.0, 0.24, v);
      // Faixa de horizonte subaquático (v = 0.22..0.72): azul oceânico cobalto mais escuro
      const deepHorizonBand = smoothstep(0.16, 0.42, v) * (1 - smoothstep(0.72, 0.98, v));
      // Base junto à areia (v > 0.72): transição suave para o azul-turquesa sobre a areia
      const sandHorizonGlow = smoothstep(0.68, 1.0, v);

      let r = mix(10, 4, deepHorizonBand) + topLightBlue * 26 + sunScatter * 28 + sandHorizonGlow * 28;
      let g = mix(118, 42, deepHorizonBand) + topLightBlue * 64 + sunScatter * 74 + sandHorizonGlow * 68;
      let b = mix(196, 108, deepHorizonBand) + topLightBlue * 46 + sunScatter * 58 + sandHorizonGlow * 48;

      // Silhuetas sutis de cabeços recifais distantes nas laterais imersos no horizonte azul escuro
      const edgeMask = smoothstep(0.16, 0.44, Math.abs(u - 0.5));
      const reefProfile = 0.48 + fbm2D(u * 9.5 + 2.1, 1.7, 4) * 0.22 * edgeMask;
      const inDistantReef = smoothstep(reefProfile - 0.04, reefProfile + 0.06, v) * (1 - sandHorizonGlow * 0.7);
      r = mix(r, 4, inDistantReef * 0.58);
      g = mix(g, 32, inDistantReef * 0.56);
      b = mix(b, 84, inDistantReef * 0.48);

      const idx = (y * width + x) * 4;
      img.data[idx] = Math.round(clamp(r, 0, 255));
      img.data[idx + 1] = Math.round(clamp(g, 0, 255));
      img.data[idx + 2] = Math.round(clamp(b, 0, 255));
      img.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  texture.update(false);

  // Painel curvo ao fundo da coluna d'água (z ~ 50..56), cobrindo de y = +0.15 até y = -14.5
  const cols = 48;
  const rows = 16;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rows; r += 1) {
    const v = r / rows;
    const y = mix(-1.45, -14.5, v);
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
  mesh.applyFog = false;
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
  material.fogEnabled = false;
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
    // Atenuação óptica subaquática: mantém a areia dourada viva em todo o primeiro
    // e médio plano (z < 35) e mergulha no horizonte azul escuro apenas no fundo (z = 36..53).
    const waterDistanceMix = smoothstep(35, 53, z);
    // Perto da câmera (z < 26), realça a luminosidade clara da água rasa sobre a areia
    const shallowClarityBoost = (1 - smoothstep(10, 32, z)) * 0.14;

    for (let column = 0; column <= columns; column += 1) {
      const x = xMin + ((xMax - xMin) * column) / columns;
      const y = seabedHeightAt(x, z);
      const patch = fbm2D(x * 0.18 + 11, z * 0.2 - 3.4, 3);

      // Foco solar central no canal de areia da praia submersa
      const centerSunBoost = Math.exp(-Math.pow((x - 1.2) / 18.0, 2)) * (1 - smoothstep(22, 48, z));
      const bankShadow = smoothstep(9.5, 23, Math.abs(x)) * 0.24;

      const warmSand = [1.0, 0.91, 0.70];
      const shadedSand = [0.76, 0.72, 0.56];
      const deepHorizonTint = [0.03, 0.20, 0.48];

      const sunFactor = clamp(0.64 + centerSunBoost * 0.38 + shallowClarityBoost - bankShadow + (patch - 0.5) * 0.14);
      let r = mix(shadedSand[0], warmSand[0], sunFactor);
      let g = mix(shadedSand[1], warmSand[1], sunFactor);
      let b = mix(shadedSand[2], warmSand[2], sunFactor);

      // Nas laterais sob as rochas, leve tom de substrato recifal
      const bankMix = smoothstep(11, 21, Math.abs(x)) * smoothstep(0.48, 0.78, patch) * 0.28;
      r = mix(r, 0.46, bankMix);
      g = mix(g, 0.48, bankMix);
      b = mix(b, 0.42, bankMix);

      // Transição suave apenas junto ao horizonte subaquático distante (z > 35)
      r = mix(r, deepHorizonTint[0], waterDistanceMix * 0.85);
      g = mix(g, deepHorizonTint[1], waterDistanceMix * 0.82);
      b = mix(b, deepHorizonTint[2], waterDistanceMix * 0.78);

      positions.push(x, y, z);
      colors.push(r, g, b, 1);
      uvs.push((x - xMin) * 0.042, (z - zMin) * 0.042);
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
  mesh.receiveShadows = false;
  mesh.applyFog = false;
  return mesh;
}

/**
 * Rochas recifais achatadas em bancadas/lajes naturais (nunca esferas pretas).
 */
function createRockSource(scene: Scene, seed: number): Mesh {
  const source = MeshBuilder.CreateIcoSphere(`rocha-base-${seed}`, { radius: 1, subdivisions: 3, updatable: true }, scene);
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
  const source = MeshBuilder.CreateIcoSphere('coral-cerebro-fonte', { radius: 0.58, subdivisions: 3, updatable: true }, scene);
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
 */
function createFanCoralSource(scene: Scene): Mesh {
  const topDisc = MeshBuilder.CreateCylinder('coral-mesa-topo', {
    height: 0.12,
    diameterTop: 1.35,
    diameterBottom: 0.65,
    tessellation: 14,
  }, scene);
  topDisc.position.y = 0.52;

  const innerCrown = MeshBuilder.CreateCylinder('coral-mesa-coroa', {
    height: 0.16,
    diameterTop: 0.95,
    diameterBottom: 0.42,
    tessellation: 12,
  }, scene);
  innerCrown.position.y = 0.60;

  const stem = MeshBuilder.CreateCylinder('leque-haste', {
    height: 0.46,
    diameterTop: 0.18,
    diameterBottom: 0.28,
    tessellation: 7,
  }, scene);
  stem.position.y = 0.23;
  return mergeParts([topDisc, innerCrown, stem], 'coral-leque-fonte');
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
 * Posiciona rochas e corais preferencialmente nas duas bancadas laterais
 * (esquerda u = 0.05..0.34 e direita u = 0.66..0.95), mantendo o canal central
 * de areia aberto em primeiro plano para destacar a textura de areia e as cáusticas.
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
): Anchor[] {
  const random = mulberry32(seed);
  const anchors: Anchor[] = [];
  for (let index = 0; index < count; index += 1) {
    const color = colorPalette[Math.floor(random() * colorPalette.length) % colorPalette.length];
    const depth = depthMin + random() * (depthMax - depthMin);
    let u: number;
    if (allowDeepCenter && depth > 0.72 && index % 5 === 0) {
      // Pequenos cabeços esparsos ao fundo do canal
      u = 0.32 + random() * 0.36;
    } else if (index % 2 === 0) {
      // Bancada recifal esquerda
      u = 0.055 + random() * 0.285;
    } else {
      // Bancada recifal direita
      u = 0.66 + random() * 0.285;
    }
    anchors.push({
      u,
      depth,
      scale: scaleMin + random() * (scaleMax - scaleMin),
      rotation: random() * Math.PI * 2,
      tilt: (random() - 0.5) * 0.14,
      color,
    });
  }
  return anchors;
}

/** Seixos baixos espalhados na areia do canal central e bordas. */
function createChannelPebbleAnchors(count: number, seed: number): Anchor[] {
  const random = mulberry32(seed);
  const anchors: Anchor[] = [];
  for (let i = 0; i < count; i += 1) {
    const color = PEBBLE_COLORS[i % PEBBLE_COLORS.length];
    anchors.push({
      u: 0.16 + random() * 0.68,
      depth: 0.26 + random() * 0.54,
      scale: 0.55 + random() * 0.85,
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
  const margin = Math.min(0.46, frame.profile.marginX + halfExtent);
  return clamp(anchor.u, margin, 1 - margin);
}

function writeGroupMatrices(
  group: ThinGroup,
  frame: DioramaFrame,
  yOffset: number,
  heightAt: (x: number, z: number) => number,
  radiusFactor: number,
): void {
  const scale = new Vector3();
  const position = new Vector3();
  const rotation = Quaternion.RotationYawPitchRoll(0, 0, 0);
  const matrix = new Matrix();

  for (let index = 0; index < group.anchors.length; index += 1) {
    const anchor = group.anchors[index];
    const u = clampAnchorU(frame, anchor, radiusFactor);
    const point = frame.surfacePoint(u, anchor.depth);
    position.set(point.x, heightAt(point.x, point.z) + yOffset, point.z);
    scale.set(anchor.scale, anchor.scale, anchor.scale);
    Quaternion.RotationYawPitchRollToRef(anchor.rotation, anchor.tilt, anchor.tilt * 0.5, rotation);
    Matrix.ComposeToRef(scale, rotation, position, matrix);
    matrix.copyToArray(group.matrices, index * 16);
  }

  group.mesh.thinInstanceBufferUpdated('matrix');
  group.mesh.thinInstanceRefreshBoundingInfo(false);
}

export function createTerrainSystem(scene: Scene, _quality: SceneQualityProfile): TerrainSystem {
  const { albedo: sandAlbedo, normal: sandNormal } = createSandTextures(scene);
  const causticTexture = createCausticTexture(scene);
  const rockTexture = createRockTexture(scene);
  const underwaterBackdrop = createUnderwaterVolumeBackdrop(scene);

  const sandMaterial = new PBRMaterial('areia-material', scene);
  sandMaterial.albedoTexture = sandAlbedo;
  sandMaterial.albedoColor = new Color3(0.98, 0.91, 0.74);
  sandMaterial.bumpTexture = sandNormal;
  sandMaterial.bumpTexture.level = 0.72;
  sandMaterial.metallic = 0;
  sandMaterial.roughness = 0.86;
  sandMaterial.backFaceCulling = false;
  sandMaterial.twoSidedLighting = true;
  sandMaterial.emissiveTexture = causticTexture;
  sandMaterial.emissiveColor = new Color3(0.52, 0.48, 0.34);
  sandMaterial.emissiveIntensity = 0.85;

  const terrainMesh = buildTerrainMesh(scene, sandMaterial);

  const rockMaterial = new PBRMaterial('rocha-material', scene);
  rockMaterial.albedoTexture = rockTexture;
  rockMaterial.albedoColor = new Color3(0.82, 0.79, 0.72);
  rockMaterial.emissiveTexture = causticTexture;
  rockMaterial.emissiveColor = new Color3(0.14, 0.18, 0.16);
  rockMaterial.metallic = 0.02;
  rockMaterial.roughness = 0.80;

  const coralMaterial = new PBRMaterial('coral-material', scene);
  coralMaterial.albedoColor = new Color3(1, 1, 1);
  coralMaterial.metallic = 0.02;
  coralMaterial.roughness = 0.52;
  coralMaterial.emissiveColor = new Color3(0.14, 0.08, 0.06);

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

  const rockAnchorsA = createBankAnchors(14, 21, ROCK_COLORS, 1.15, 2.25, 0.34, 0.88, true);
  const rockAnchorsB = createBankAnchors(12, 33, ROCK_COLORS, 0.85, 1.75, 0.32, 0.86, true);
  const pebbleAnchors = createChannelPebbleAnchors(22, 109);
  const branchAnchors = createBankAnchors(28, 41, BRANCH_COLORS, 0.95, 1.85, 0.30, 0.84, false);
  const brainAnchors = createBankAnchors(18, 53, BRAIN_COLORS, 0.85, 1.55, 0.30, 0.82, false);
  const fanAnchors = createBankAnchors(14, 67, FAN_COLORS, 0.95, 1.65, 0.32, 0.80, false);
  const tubeAnchors = createBankAnchors(16, 79, TUBE_COLORS, 0.85, 1.55, 0.28, 0.82, false);
  const grassAnchors = createBankAnchors(34, 97, [[0.18, 0.48, 0.24]], 0.75, 1.45, 0.30, 0.88, true);

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

  const restorationAnchors = createBankAnchors(24, 131, [[0.3, 0.72, 0.46]], 0.55, 0.95, 0.34, 0.84, true);
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

  const laidOutGroups: ReadonlyArray<{ group: ThinGroup; radius: number; yOffset: number }> = [
    { group: rockGroupA, radius: 1.35, yOffset: -0.08 },
    { group: rockGroupB, radius: 1.2, yOffset: -0.06 },
    { group: pebbleGroup, radius: 0.35, yOffset: -0.02 },
    { group: branchGroup, radius: 0.9, yOffset: 0.18 },
    { group: brainGroup, radius: 0.75, yOffset: 0.12 },
    { group: fanGroup, radius: 0.85, yOffset: 0.22 },
    { group: tubeGroup, radius: 0.65, yOffset: 0.15 },
    { group: grassGroup, radius: 0.15, yOffset: 0.02 },
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

    // Assa oclusão de contato (AO) e penumbra solar suave onde rochas e corais
    // encontram o fundo de areia (Seção 7.5: percepção de profundidade real no leito).
    if (baseTerrainColors && terrainPositions && workingTerrainColors) {
      const vCount = terrainPositions.length / 3;
      for (let v = 0; v < vCount; v += 1) {
        const vx = terrainPositions[v * 3];
        const vz = terrainPositions[v * 3 + 2];
        let aoShade = 1.0;

        for (let o = 0; o < obstacles.length; o += 1) {
          const obs = obstacles[o];
          // Sombra de contato direta na base + penumbra solar deslocada (-0.32, -0.45)
          const dx = vx - (obs.x - 0.24 * obs.radius);
          const dz = vz - (obs.z - 0.34 * obs.radius);
          const r2 = dx * dx + dz * dz;
          const rad = Math.max(0.45, obs.radius * 1.45);
          if (r2 < rad * rad * 2.2) {
            const falloff = Math.exp(-r2 / (rad * rad * 0.85));
            const strength = obs.kind === 'rock' ? 0.36 : 0.26;
            aoShade *= 1.0 - falloff * strength;
          }
        }

        aoShade = Math.max(0.52, aoShade);
        // Na sombra subaquática, o vermelho atenua mais rápido que o azul-esverdeado
        workingTerrainColors[v * 4] = baseTerrainColors[v * 4] * Math.pow(aoShade, 1.25);
        workingTerrainColors[v * 4 + 1] = baseTerrainColors[v * 4 + 1] * Math.pow(aoShade, 1.05);
        workingTerrainColors[v * 4 + 2] = baseTerrainColors[v * 4 + 2] * Math.pow(aoShade, 0.85);
        workingTerrainColors[v * 4 + 3] = 1;
      }
      terrainMesh.updateVerticesData(VertexBuffer.ColorKind, workingTerrainColors, false, false);
    }
  };

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
    obstacles,
    heightAt: seabedHeightAt,
    layout(frame: DioramaFrame): void {
      currentFrame = frame;
      for (const entry of laidOutGroups) {
        writeGroupMatrices(entry.group, frame, entry.yOffset, seabedHeightAt, entry.radius);
      }
      writeGroupMatrices(restorationGroup, frame, 0.14, seabedHeightAt, 0.8);
      applyRestoration(frame, currentRestoration);
      rebuildObstacles();
    },
    updateVisual(visual: VisualState, elapsed: number): void {
      // Animação contínua das cáusticas solares sobre a areia e rochas
      causticTexture.uOffset = (elapsed * 0.018 + Math.sin(elapsed * 0.7) * 0.012) % 1;
      causticTexture.vOffset = (elapsed * 0.014 + Math.cos(elapsed * 0.55) * 0.01) % 1;

      const shimmer = 0.92 + 0.08 * Math.sin(elapsed * 2.1);
      const clarity = visual.waterClarity;
      sandMaterial.emissiveColor.set(
        (0.36 + 0.38 * clarity) * shimmer,
        (0.33 + 0.36 * clarity) * shimmer,
        (0.22 + 0.25 * clarity) * shimmer,
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
      const point = frame.surfacePoint(clampAnchorU(frame, anchor, 0.8), anchor.depth);
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
