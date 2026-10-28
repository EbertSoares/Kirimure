import {
  type AnimationGroup,
  Color3,
  Color4,
  Constants,
  DirectionalLight,
  DynamicTexture,
  FreeCamera,
  HemisphericLight,
  ImageProcessingConfiguration,
  LoadAssetContainerAsync,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { normalizedReceivedLoad } from '../../simulation/model';
import type { FishSpeciesId, SimulationState } from '../../simulation/types';
import { MARINE_ASSET_URLS } from '../assets';
import { updateFishState } from '../fishAppearance';
import { createOceanEngine, type RendererBackend } from './engine';

const CAMERA_FOV = 0.80;
const TAN_HALF_FOV = Math.tan(CAMERA_FOV * 0.5);
const PLANE_Z = 20;
const REFERENCE_ASPECT = 1672 / 941;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const mixColor = (from: Color3, to: Color3, amount: number) => new Color3(
  from.r + (to.r - from.r) * amount,
  from.g + (to.g - from.g) * amount,
  from.b + (to.b - from.b) * amount,
);

/** Ruído determinístico contínuo 2D para simulação de turbulência e vórtices */
function hash2D(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2D(x: number, y: number): number {
  return (
    valueNoise2D(x, y) * 0.52
    + valueNoise2D(x * 2.05 + 5.2, y * 2.05 + 1.3) * 0.28
    + valueNoise2D(x * 4.15 + 9.7, y * 4.15 + 6.4) * 0.13
    + valueNoise2D(x * 8.30 + 2.1, y * 8.30 + 8.8) * 0.07
  );
}

/**
 * Campo de velocidade rotacional (Curl Noise) livre de divergência (∇·v = 0),
 * produzindo vórtices hidrodinâmicos reais para óleo e microplásticos.
 */
function sampleFluidCurlVelocity(u: number, v: number, time: number): { vx: number; vy: number } {
  const eps = 0.015;
  const sx = u * 5.5 - time * 0.18;
  const sy = v * 7.5 + time * 0.12;
  const psiX1 = fbm2D(sx + eps, sy);
  const psiX0 = fbm2D(sx - eps, sy);
  const psiY1 = fbm2D(sx, sy + eps);
  const psiY0 = fbm2D(sx, sy - eps);

  const dPsiDx = (psiX1 - psiX0) / (2 * eps);
  const dPsiDy = (psiY1 - psiY0) / (2 * eps);

  // Movimento orbital das ondas de superfície decaindo exponencialmente com a profundidade
  const depthFromSurface = Math.max(0, v - 0.27);
  const waveDecay = Math.exp(-depthFromSurface * 7.5);
  const wavePhase = u * 18.0 - time * 2.2;
  const waveOrbitalX = Math.cos(wavePhase) * 0.022 * waveDecay;
  const waveOrbitalY = Math.sin(wavePhase) * 0.014 * waveDecay;

  return {
    vx: dPsiDy * 0.024 + waveOrbitalX + 0.008,
    vy: -dPsiDx * 0.018 + waveOrbitalY,
  };
}

interface DeformableSubMesh {
  mesh: Mesh;
  material: StandardMaterial;
}

type FishDeathStage = 'alive' | 'sinking' | 'bottom' | 'floating' | 'surface' | 'repopulating';

/**
 * Ponto de navegação 3D autônomo para cada peixe:
 * - u: posição horizontal (0.06 .. 0.94)
 * - v: profundidade na coluna d'água (0.35 superfície iluminada .. 0.83 fundo de areia/corais)
 * - depth: distância câmera-fundo (0.06 lá no fundo distante .. 0.98 pertinho da câmera)
 */
interface FishWaypoint3D {
  u: number;
  v: number;
  depth: number;
}

/**
 * Cardume 3D dinâmico: move-se pelo recife em todas as direções (esquerda/direita,
 * cima/baixo, fundo ↔ perto da câmera) enquanto cada peixe mantém liberdade individual
 * dentro do grupo, espalhando-se quando o tubarão se aproxima e reagrupando-se depois.
 */
interface FishSchool3D {
  id: number;
  wp0: FishWaypoint3D;
  wp1: FishWaypoint3D;
  wp2: FishWaypoint3D;
  wp3: FishWaypoint3D;
  segmentProgress: number;
  segmentDuration: number;
  waypointCounter: number;
  speed: number;
  phase: number;
  currentU: number;
  currentV: number;
  currentDepth: number;
  velU: number;
  velV: number;
  velDepth: number;
}

interface FishSwimmer {
  id: number;
  schoolId: number;
  holder: TransformNode;
  healthy: DeformableSubMesh;
  stressed: DeformableSubMesh;
  dead: DeformableSubMesh;
  basePositions: Float32Array;
  workingPositions: Float32Array;
  width: number;
  species: FishSpeciesId;
  threshold: number;
  isHardy?: boolean;
  individualScale: number;
  baseTint: Color3;
  stressedTint: Color3;
  formationOffsetU: number;
  formationOffsetV: number;
  formationOffsetDepth: number;
  scatterOffsetU: number;
  scatterOffsetV: number;
  scatterVelU: number;
  scatterVelV: number;
  scaredTimer: number;
  speed: number;
  swimFreq: number;
  phase: number;
  direction: 1 | -1;
  depthZ: number;
  /** Fases integradas incrementalmente (evita nadar de costas ou tremer em 10x) */
  swimPhase: number;
  tailPhase: number;
  headTurn: number;
  tailTurn: number;
  currentDepth: number;
  deathStage: FishDeathStage;
  currentScreenX: number;
  currentScreenY: number;
  currentDir: 1 | -1;
  seabedScreenY: number;
  surfaceScreenY: number;
  deadElapsed: number;
  stageElapsed: number;
  verticalVelocity: number;
}

/**
 * Peixe 3D riggado (glTF com esqueleto de 43 ossos e animação 'Animation'):
 * nada em cardume com liberdade individual 3D e foge quando o tubarão se aproxima.
 */
interface RiggedFish3D {
  id: number;
  schoolId: number;
  isDepthRunner: boolean;
  holder: TransformNode;
  meshes: Mesh[];
  materials: StandardMaterial[];
  animGroup: AnimationGroup | null;
  threshold: number;
  isHardy?: boolean;
  individualScale: number;
  baseTint: Color3;
  formationOffsetU: number;
  formationOffsetV: number;
  formationOffsetDepth: number;
  scatterOffsetU: number;
  scatterOffsetV: number;
  scatterVelU: number;
  scatterVelV: number;
  scaredTimer: number;
  speed: number;
  phase: number;
  swimPhase: number;
  currentYaw: number;
  headTurn: number;
  tailTurn: number;
  wp0: FishWaypoint3D;
  wp1: FishWaypoint3D;
  wp2: FishWaypoint3D;
  wp3: FishWaypoint3D;
  segmentProgress: number;
  segmentDuration: number;
  waypointCounter: number;
  currentScreenX: number;
  currentScreenY: number;
  currentDepth: number;
  currentDir: 1 | -1;
  depthZ: number;
  seabedScreenY: number;
  deathStage: FishDeathStage;
  deadElapsed: number;
  stageElapsed: number;
  verticalVelocity: number;
}

type SharkPatrolStage = 'cooldown' | 'approaching' | 'turning_exit' | 'camera_flyby';

/**
 * Tubarão 3D único: aparece em momentos aleatórios e bem espaçados, alternando entre
 * surgir lá do centro do mar ou passar bem pertinho em frente à câmera de surpresa,
 * assustando e separando os cardumes de peixinhos antes de sair de vista.
 */
interface SharkSwimmer3D {
  id: number;
  holder: TransformNode;
  mesh: Mesh;
  material: StandardMaterial;
  basePositions: Float32Array;
  workingPositions: Float32Array;
  threshold: number;
  baseScale: number;
  swimFreq: number;
  tailPhase: number;
  patrolStage: SharkPatrolStage;
  lastPatrolMode: 'approaching' | 'camera_flyby';
  patrolElapsed: number;
  cooldownDuration: number;
  exitDir: 1 | -1;
  flybyScreenY: number;
  isScaring: boolean;
  turnBend: number;
  currentScreenX: number;
  currentScreenY: number;
  currentDepth: number;
  depthZ: number;
  seabedScreenY: number;
  deathStage: FishDeathStage;
  deadElapsed: number;
  stageElapsed: number;
  verticalVelocity: number;
}

interface AirBubble {
  mesh: Mesh;
  emitterScreenX: number;
  minScreenY: number;
  maxScreenY: number;
  depthZ: number;
  speed: number;
  phase: number;
  wobbleAmp: number;
  wobbleFreq: number;
  baseScale: number;
}

interface MicroplasticParticle {
  mesh: Mesh;
  material: StandardMaterial;
  baseColor: Color3;
  u: number;
  v: number;
  vx: number;
  vy: number;
  depthZ: number;
  baseScale: number;
  aspectRatio: number;
  tumbleSpeedX: number;
  tumbleSpeedY: number;
  rotSpeedZ: number;
  phase: number;
  buoyancyDrift: number;
  layerAlpha: number;
  threshold: number;
}

/**
 * Faixa subdividida de óleo superficial na linha d'água que ondula em tempo real na GPU.
 */
interface OilSurfaceRibbon {
  mesh: Mesh;
  basePositions: Float32Array;
  workingPositions: Float32Array;
  width: number;
  height: number;
  baseScreenX: number;
  baseScreenY: number;
  depthZ: number;
  waveFreq: number;
  waveSpeed: number;
  phase: number;
  threshold: number;
}

/**
 * Pluma volumétrica turbulenta de petróleo bruto (texturizada com FBM 2D + Domain Warping),
 * advectada por vórtices (Curl Noise) e puxada de volta à linha d'água por empuxo.
 */
interface OilVolumetricPlume {
  mesh: Mesh;
  basePositions: Float32Array;
  workingPositions: Float32Array;
  width: number;
  height: number;
  u: number;
  v: number;
  vx: number;
  vy: number;
  depthZ: number;
  baseScaleX: number;
  baseScaleY: number;
  rotationZ: number;
  rotVel: number;
  age: number;
  maxAge: number;
  phase: number;
  threshold: number;
}

/**
 * Micro-gotícula 3D de emulsão de petróleo bruto:
 * entranhada pelas ondas para baixo, rodopia em vórtices (Curl Noise) e sobe por empuxo de Arquimedes.
 */
interface OilGlobule {
  mesh: Mesh;
  u: number;
  v: number;
  vx: number;
  vy: number;
  depthZ: number;
  baseScale: number;
  mass: number;
  age: number;
  maxAge: number;
  wobbleFreq: number;
  phase: number;
  threshold: number;
}

interface OilSpillSystem {
  shadowMesh: Mesh;
  surfaceRibbons: OilSurfaceRibbon[];
  plumes: OilVolumetricPlume[];
  globules: OilGlobule[];
}

interface SewagePlume {
  mesh: Mesh;
  baseScreenX: number;
  baseScreenY: number;
  speedX: number;
  phase: number;
  baseScaleX: number;
  baseScaleY: number;
}

interface SandCausticCarpet {
  mesh: Mesh;
  basePositions: Float32Array;
  workingPositions: Float32Array;
  width: number;
  height: number;
  baseU: number;
  baseV: number;
  depthZ: number;
  driftSpeed: number;
  phase: number;
  baseAlpha: number;
}

interface SandSunPool {
  mesh: Mesh;
  u: number;
  baseV: number;
  speedU: number;
  bobAmpV: number;
  baseScaleX: number;
  baseScaleY: number;
  phase: number;
  baseAlpha: number;
  depthZ: number;
}

interface SandCausticsSystem {
  carpets: SandCausticCarpet[];
  sunPools: SandSunPool[];
}

function screenToWorld(screenX: number, screenY: number, depthZ = PLANE_Z, aspect = REFERENCE_ASPECT): Vector3 {
  const halfH = depthZ * TAN_HALF_FOV;
  const halfW = halfH * aspect;
  const x = (screenX * 2 - 1) * halfW;
  const y = (1 - screenY * 2) * halfH;
  return new Vector3(x, y, depthZ);
}

function createRawImageProcessing(): ImageProcessingConfiguration {
  const rawConfig = new ImageProcessingConfiguration();
  rawConfig.toneMappingEnabled = false;
  rawConfig.exposure = 1.0;
  rawConfig.contrast = 1.0;
  return rawConfig;
}

function createSubdividedFishMesh(
  name: string,
  width: number,
  height: number,
  scene: Scene,
): { mesh: Mesh; basePositions: Float32Array } {
  const cols = 14;
  const rows = 4;
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rows; r += 1) {
    const v = r / rows;
    const y = (v - 0.5) * height;
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const x = (u - 0.5) * width;
      positions.push(x, y, 0);
      uvs.push(u, v);
      normals.push(0, 0, -1);
    }
  }

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = a + (cols + 1);
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  data.applyToMesh(mesh, true);
  mesh.renderingGroupId = 2;
  mesh.isPickable = false;

  return {
    mesh,
    basePositions: Float32Array.from(positions),
  };
}

function createBackdrop(scene: Scene, camera: FreeCamera): { mesh: Mesh; material: StandardMaterial } {
  const distance = 60;
  const height = distance * TAN_HALF_FOV * 2;
  const width = height * REFERENCE_ASPECT;

  const plane = MeshBuilder.CreatePlane('oceano-recife-backdrop', {
    width,
    height,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  plane.parent = camera;
  plane.position.set(0, 0, distance);
  plane.renderingGroupId = 0;
  plane.isPickable = false;
  plane.applyFog = false;

  const texture = new Texture('/textures/ocean-backdrop.png', scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  const material = new StandardMaterial('oceano-recife-backdrop-mat', scene);
  material.diffuseTexture = texture;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.White();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  material.imageProcessingConfiguration = createRawImageProcessing();
  plane.material = material;

  return { mesh: plane, material };
}

/**
 * Avalia se um pixel (u, v) com cor (r, g, b) na imagem de referência pertence a uma
 * colônia de coral específica, retornando o peso [0..1] da máscara de branqueamento.
 */
function evaluateCoralPixelMask(u: number, v: number, r: number, g: number, b: number): number {
  if (v < 0.52 || v > 0.885) return 0;

  if (b > r * 1.04 && g >= r * 0.95) {
    if (!(u > 0.87 && v > 0.68 && r > g * 1.02 && b > g * 1.10)) {
      return 0;
    }
  }

  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const sat = maxC - minC;

  const boxWeight = (uMin: number, uMax: number, vMin: number, vMax: number, feather = 0.018) => {
    if (u < uMin - feather || u > uMax + feather || v < vMin - feather || v > vMax + feather) return 0;
    const wu = smoothstep(uMin - feather, uMin + feather, u) * (1 - smoothstep(uMax - feather, uMax + feather, u));
    const wv = smoothstep(vMin - feather, vMin + feather, v) * (1 - smoothstep(vMax - feather, vMax + feather, v));
    return wu * wv;
  };

  let mask = 0;

  const wYellowLeft = boxWeight(0.008, 0.172, 0.580, 0.722);
  if (wYellowLeft > 0 && r > 95 && g > 72 && r > b * 1.30 && g > b * 1.12 && sat > 24) {
    const chroma = clamp((r - b - 20) / 48);
    mask = Math.max(mask, wYellowLeft * chroma);
  }

  const wPinkLeft = boxWeight(0.075, 0.252, 0.622, 0.748);
  if (wPinkLeft > 0 && r > 86 && r > g * 1.05 && b > g * 0.88 && sat > 18) {
    const pinkness = clamp((r - g * 0.92) / 36);
    mask = Math.max(mask, wPinkLeft * pinkness);
  }

  const wStagLeft = boxWeight(0.180, 0.264, 0.540, 0.654, 0.014);
  if (wStagLeft > 0 && r > 112 && g > 92 && r > b * 1.06 && g < r * 1.05) {
    const warmth = clamp((r - b - 10) / 32);
    mask = Math.max(mask, wStagLeft * warmth);
  }

  const wOrangeLeft = boxWeight(0.218, 0.304, 0.654, 0.786, 0.015);
  if (wOrangeLeft > 0 && r > 98 && r > g * 1.10 && r > b * 1.12 && sat > 20) {
    const warmth = clamp((r - g) / 30);
    mask = Math.max(mask, wOrangeLeft * warmth);
  }

  const dxBrain = (u - 0.064) / 0.060;
  const dyBrain = (v - 0.768) / 0.075;
  const rBrain = Math.hypot(dxBrain, dyBrain);
  if (rBrain < 1.08 && g > 58 && g > b * 1.18 && r > b * 1.02) {
    const wBrain = 1 - smoothstep(0.75, 1.08, rBrain);
    const greenBrain = clamp((g - b - 12) / 32);
    mask = Math.max(mask, wBrain * greenBrain * 0.95);
  }

  const wMidCluster = boxWeight(0.340, 0.502, 0.575, 0.715, 0.016);
  if (wMidCluster > 0 && r > 68 && r > g * 1.03 && sat > 16) {
    const coralTone = clamp((r - g * 0.94) / 32);
    mask = Math.max(mask, wMidCluster * coralTone * 0.92);
  }

  const wMidRight = boxWeight(0.618, 0.684, 0.645, 0.745, 0.014);
  if (wMidRight > 0 && r > 70 && r > g * 1.03 && sat > 16) {
    const coralTone = clamp((r - g * 0.94) / 30);
    mask = Math.max(mask, wMidRight * coralTone * 0.92);
  }

  const wRedTable = boxWeight(0.742, 0.902, 0.578, 0.688, 0.016);
  if (wRedTable > 0 && r > 78 && r > g * 1.10 && sat > 20) {
    const redness = clamp((r - g) / 34);
    mask = Math.max(mask, wRedTable * redness);
  }

  const wRightBranch = boxWeight(0.872, 0.998, 0.548, 0.755, 0.016);
  if (wRightBranch > 0 && r > 98 && g > 74 && r > b * 1.08 && g < r * 1.04 && sat > 16) {
    const branchTone = clamp((r - b - 10) / 32);
    mask = Math.max(mask, wRightBranch * branchTone);
  }

  const wPurpleTubes = boxWeight(0.878, 0.992, 0.692, 0.872, 0.016);
  if (wPurpleTubes > 0 && r > 54 && b > 68 && r > g * 1.01 && b > g * 1.06) {
    const purpleTone = clamp(((r + b) * 0.5 - g) / 28);
    mask = Math.max(mask, wPurpleTubes * purpleTone);
  }

  return clamp(mask);
}

function createCoralBleachingLayer(
  scene: Scene,
  camera: FreeCamera,
): { mesh: Mesh; material: StandardMaterial } {
  const rawConfig = createRawImageProcessing();

  const coralDist = 58.3;
  const coralH = coralDist * TAN_HALF_FOV * 2;
  const coralW = coralH * REFERENCE_ASPECT;
  const coralPlane = MeshBuilder.CreatePlane('corais-branqueamento-overlay', {
    width: coralW,
    height: coralH,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  coralPlane.parent = camera;
  coralPlane.position.set(0, 0, coralDist);
  coralPlane.renderingGroupId = 0;
  coralPlane.isPickable = false;
  coralPlane.visibility = 0;

  const texW = 1024;
  const texH = 576;

  const coralTex = new DynamicTexture('corais-branqueamento-tex', { width: texW, height: texH }, scene, true);
  coralTex.hasAlpha = true;
  coralTex.wrapU = Texture.CLAMP_ADDRESSMODE;
  coralTex.wrapV = Texture.CLAMP_ADDRESSMODE;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (scene.isDisposed) return;
    const cCtx = coralTex.getContext();
    cCtx.clearRect(0, 0, texW, texH);
    cCtx.drawImage(img, 0, 0, texW, texH);
    const coralFrame = cCtx.getImageData(0, 0, texW, texH);
    const cData = coralFrame.data;

    for (let y = 0; y < texH; y += 1) {
      const v = y / texH;
      for (let x = 0; x < texW; x += 1) {
        const u = x / texW;
        const idx = (y * texW + x) * 4;
        const r = cData[idx];
        const g = cData[idx + 1];
        const b = cData[idx + 2];

        const coralMask = evaluateCoralPixelMask(u, v, r, g, b);
        if (coralMask <= 0.01) {
          cData[idx + 3] = 0;
        } else {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const peak = Math.max(r, g, b);
          const structure = 0.62 * peak + 0.38 * lum;
          const bone = clamp((132 + structure * 0.64) / 255, 0.50, 0.99) * 255;

          cData[idx] = Math.round(bone);
          cData[idx + 1] = Math.round(bone * 0.985);
          cData[idx + 2] = Math.round(bone * 0.955);
          cData[idx + 3] = Math.round(clamp(coralMask * 1.35) * 255);
        }
      }
    }

    cCtx.putImageData(coralFrame, 0, 0);
    coralTex.update(true);
  };
  img.src = '/textures/ocean-backdrop.png';

  const coralMat = new StandardMaterial('corais-branqueamento-mat', scene);
  coralMat.diffuseTexture = coralTex;
  coralMat.opacityTexture = coralTex;
  coralMat.useAlphaFromDiffuseTexture = true;
  coralMat.diffuseColor = Color3.Black();
  coralMat.emissiveColor = new Color3(1.0, 0.99, 0.96);
  coralMat.specularColor = Color3.Black();
  coralMat.disableLighting = true;
  coralMat.disableDepthWrite = true;
  coralMat.backFaceCulling = false;
  coralMat.imageProcessingConfiguration = rawConfig;
  coralPlane.material = coralMat;

  return { mesh: coralPlane, material: coralMat };
}

/**
 * Cria o sistema de esgoto: véu subaquático esverdeado (eutrofização, restrito ESTRITAMENTE
 * abaixo da linha d'água para jamais esverdear o céu ou o barco) + plumas orgânicas turvas.
 */
function createSewageSystem(
  scene: Scene,
  camera: FreeCamera,
): { veilMesh: Mesh; plumes: SewagePlume[] } {
  const distance = 58.8;
  const height = distance * TAN_HALF_FOV * 2;
  const width = height * REFERENCE_ASPECT;

  const veilMesh = MeshBuilder.CreatePlane('esgoto-veu-subaquatico', {
    width,
    height,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  veilMesh.parent = camera;
  veilMesh.position.set(0, 0, distance);
  veilMesh.renderingGroupId = 0;
  veilMesh.isPickable = false;
  veilMesh.visibility = 0;

  const texW = 256;
  const texH = 256;
  const veilTex = new DynamicTexture('esgoto-veu-tex', { width: texW, height: texH }, scene, true);
  veilTex.hasAlpha = true;
  veilTex.wrapU = Texture.CLAMP_ADDRESSMODE;
  veilTex.wrapV = Texture.CLAMP_ADDRESSMODE;

  const ctx = veilTex.getContext();
  const img = ctx.getImageData(0, 0, texW, texH);
  for (let y = 0; y < texH; y += 1) {
    const v = y / texH;
    // Acima de v = 0.285 (céu, nuvens, sol e barco) o alpha é ZERO absoluto!
    const underwaterMask = smoothstep(0.285, 0.350, v);
    const depthProfile = underwaterMask * (1 - smoothstep(0.74, 0.97, v) * 0.35);

    for (let x = 0; x < texW; x += 1) {
      const u = x / texW;
      const waveMod = Math.sin(u * Math.PI * 5) * 0.035 + Math.cos(v * Math.PI * 4) * 0.035;
      const alpha = underwaterMask <= 0 ? 0 : clamp(depthProfile + waveMod * underwaterMask);
      const idx = (y * texW + x) * 4;
      img.data[idx] = 26;
      img.data[idx + 1] = 106;
      img.data[idx + 2] = 44;
      img.data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  veilTex.update(true);

  const veilMat = new StandardMaterial('esgoto-veu-mat', scene);
  veilMat.diffuseTexture = veilTex;
  veilMat.opacityTexture = veilTex;
  veilMat.useAlphaFromDiffuseTexture = true;
  veilMat.diffuseColor = Color3.Black();
  veilMat.emissiveColor = new Color3(0.24, 0.62, 0.28);
  veilMat.specularColor = Color3.Black();
  veilMat.disableLighting = true;
  veilMat.disableDepthWrite = true;
  veilMat.backFaceCulling = false;
  veilMat.imageProcessingConfiguration = createRawImageProcessing();
  veilMesh.material = veilMat;

  const plumeSize = 128;
  const plumeTex = new DynamicTexture('esgoto-pluma-tex', { width: plumeSize, height: plumeSize }, scene, true);
  plumeTex.hasAlpha = true;
  const pCtx = plumeTex.getContext();
  const pImg = pCtx.getImageData(0, 0, plumeSize, plumeSize);
  for (let y = 0; y < plumeSize; y += 1) {
    for (let x = 0; x < plumeSize; x += 1) {
      const dx = (x - plumeSize * 0.5) / (plumeSize * 0.46);
      const dy = (y - plumeSize * 0.5) / (plumeSize * 0.42);
      const r = Math.hypot(dx, dy);
      const noise = Math.sin(dx * 5.2) * Math.cos(dy * 4.8) * 0.12;
      const falloff = Math.pow(clamp(1 - (r + noise)), 1.9);
      const idx = (y * plumeSize + x) * 4;
      pImg.data[idx] = 42;
      pImg.data[idx + 1] = 118;
      pImg.data[idx + 2] = 52;
      pImg.data[idx + 3] = Math.round(falloff * 220);
    }
  }
  pCtx.putImageData(pImg, 0, 0);
  plumeTex.update(true);

  const plumeMat = new StandardMaterial('esgoto-pluma-mat', scene);
  plumeMat.diffuseTexture = plumeTex;
  plumeMat.opacityTexture = plumeTex;
  plumeMat.useAlphaFromDiffuseTexture = true;
  plumeMat.diffuseColor = Color3.Black();
  plumeMat.emissiveColor = new Color3(0.30, 0.66, 0.30);
  plumeMat.specularColor = Color3.Black();
  plumeMat.disableLighting = true;
  plumeMat.disableDepthWrite = true;
  plumeMat.backFaceCulling = false;
  plumeMat.imageProcessingConfiguration = createRawImageProcessing();

  const plumes: SewagePlume[] = [];
  for (let i = 0; i < 8; i += 1) {
    const mesh = MeshBuilder.CreatePlane(`esgoto-pluma-${i}`, {
      width: 6.8,
      height: 3.2,
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    mesh.material = plumeMat;
    mesh.renderingGroupId = 1;
    mesh.isPickable = false;
    mesh.visibility = 0;

    plumes.push({
      mesh,
      baseScreenX: 0.10 + (i / 7) * 0.80,
      baseScreenY: 0.39 + (i % 3) * 0.11,
      speedX: 0.008 + (i % 4) * 0.003,
      phase: i * 1.37,
      baseScaleX: 0.9 + (i % 3) * 0.28,
      baseScaleY: 0.85 + ((i + 1) % 3) * 0.22,
    });
  }

  return { veilMesh, plumes };
}

/**
 * Cria uma malha subdividida genérica para deformação de vértices em tempo real na GPU.
 */
function createSubdividedGridMesh(
  name: string,
  width: number,
  height: number,
  cols: number,
  rows: number,
  scene: Scene,
): { mesh: Mesh; basePositions: Float32Array } {
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rows; r += 1) {
    const v = r / rows;
    const y = (v - 0.5) * height;
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const x = (u - 0.5) * width;
      positions.push(x, y, 0);
      uvs.push(u, v);
      normals.push(0, 0, -1);
    }
  }

  const stride = cols + 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i0 = r * stride + c;
      const i1 = i0 + 1;
      const i2 = (r + 1) * stride + c;
      const i3 = i2 + 1;
      indices.push(i0, i1, i2, i1, i3, i2);
    }
  }

  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.uvs = uvs;
  vertexData.normals = normals;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, true);
  mesh.renderingGroupId = 1;
  mesh.isPickable = false;

  return {
    mesh,
    basePositions: new Float32Array(positions),
  };
}

/**
 * Inicializa/recicla uma pluma volumétrica turbulenta de petróleo bruto sob o barco e a linha d'água.
 */
function resetOilPlume(plume: OilVolumetricPlume, index: number, total: number, initialRandom = false) {
  const nearBoat = index < total * 0.58;
  plume.u = nearBoat
    ? 0.14 + hash2D(index, 11) * 0.34
    : 0.05 + hash2D(index, 23) * 0.90;

  if (initialRandom) {
    plume.v = 0.296 + hash2D(index, 37) * (nearBoat ? 0.044 : 0.030);
  } else {
    plume.v = 0.295 + hash2D(index, 41) * 0.012;
  }

  plume.vx = (hash2D(index, 53) - 0.42) * 0.016;
  plume.vy = initialRandom
    ? (hash2D(index, 67) - 0.45) * 0.014
    : 0.011 + hash2D(index, 71) * 0.016;

  plume.maxAge = 5.5 + hash2D(index, 83) * 5.0;
  plume.age = initialRandom ? hash2D(index, 97) * plume.maxAge : 0;
  plume.rotationZ = (hash2D(index, 109) - 0.5) * 0.24;
  plume.rotVel = (hash2D(index, 113) - 0.5) * 0.09;
}

/**
 * Inicializa/recicla uma micro-gotícula de emulsão de petróleo bruto.
 */
function resetOilGlobule(globule: OilGlobule, index: number, total: number, initialRandom = false) {
  const nearBoat = index < total * 0.65;
  globule.u = nearBoat
    ? 0.16 + hash2D(index, 13) * 0.30
    : 0.07 + hash2D(index, 29) * 0.86;

  if (initialRandom) {
    globule.v = 0.300 + hash2D(index, 41) * (nearBoat ? 0.095 : 0.065);
  } else {
    globule.v = 0.298 + hash2D(index, 43) * 0.020;
  }

  globule.vx = (hash2D(index, 59) - 0.45) * 0.018;
  globule.vy = initialRandom
    ? (hash2D(index, 71) - 0.42) * 0.032
    : 0.024 + hash2D(index, 73) * (nearBoat ? 0.038 : 0.024);

  globule.maxAge = 4.0 + hash2D(index, 89) * 4.5;
  globule.age = initialRandom ? hash2D(index, 101) * globule.maxAge : 0;
}

/**
 * Cria o sistema físico de derramamento de óleo (`OilSpillSystem`) 100% acelerado por GPU:
 * 1. Feixes volumétricos de sombra subaquática inclinados no ângulo exato dos raios solares
 * 2. 7 faixas/cortinas subdivididas (512×192) na linha d'água com relevo 3D, brilho especular úmido,
 *    iridescência sutil de película fina e dedos viscosos (Rayleigh-Taylor) translúcidos âmbar-betume
 * 3. 42 plumas volumétricas subdivididas (256×256 com 3 níveis de Domain Warping FBM + normais 3D iluminadas
 *    pelo sol) que se deformam fisicamente nos vórtices (Curl Noise) e sobem por empuxo
 * 4. 64 gotículas 3D de emulsão (128×128) que se desprendem das plumas e sobem em trajetória helicoidal.
 */
function createOilSpillSystem(scene: Scene, camera: FreeCamera): OilSpillSystem {
  const rawConfig = createRawImageProcessing();

  // 1. Feixes volumétricos inclinados de sombra projetados sob a mancha de óleo (acompanhando o ângulo solar)
  const shadowDist = 58.2;
  const shadowH = shadowDist * TAN_HALF_FOV * 2;
  const shadowW = shadowH * REFERENCE_ASPECT;
  const shadowMesh = MeshBuilder.CreatePlane('oleo-sombra-subaquatica', {
    width: shadowW,
    height: shadowH,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  shadowMesh.parent = camera;
  shadowMesh.position.set(0, 0, shadowDist);
  shadowMesh.renderingGroupId = 0;
  shadowMesh.isPickable = false;
  shadowMesh.visibility = 0;

  const sTexW = 512;
  const sTexH = 256;
  const shadowTex = new DynamicTexture('oleo-sombra-tex', { width: sTexW, height: sTexH }, scene, true);
  shadowTex.hasAlpha = true;
  shadowTex.wrapU = Texture.CLAMP_ADDRESSMODE;
  shadowTex.wrapV = Texture.CLAMP_ADDRESSMODE;
  {
    const ctx = shadowTex.getContext();
    const img = ctx.getImageData(0, 0, sTexW, sTexH);
    for (let y = 0; y < sTexH; y += 1) {
      const v = y / sTexH;
      const topCut = smoothstep(0.286, 0.310, v);
      const bottomFade = 1 - smoothstep(0.312, 0.565, v);
      const vertProfile = topCut * bottomFade;
      if (vertProfile <= 0.002) continue;

      const depthSpan = Math.max(0, v - 0.286);
      for (let x = 0; x < sTexW; x += 1) {
        const u = x / sTexW;
        // Projeção inclinada acompanhando os raios solares que vêm de cima-direita (u ≈ 0.64)
        const rayU = u + depthSpan * 0.34;
        const shaftMod = 0.58
          + 0.26 * fbm2D(rayU * 14.0 + 1.7, depthSpan * 3.5 + 0.5)
          + 0.16 * Math.sin(rayU * Math.PI * 19.0);
        const boatFocus = 0.52 + 0.48 * Math.exp(-Math.pow((rayU - 0.33) / 0.27, 2));
        const edgeFade = smoothstep(0.0, 0.07, u) * (1 - smoothstep(0.93, 1.0, u));
        const alpha = vertProfile * boatFocus * shaftMod * edgeFade * 0.78;
        const idx = (y * sTexW + x) * 4;
        img.data[idx] = 4;
        img.data[idx + 1] = 9;
        img.data[idx + 2] = 15;
        img.data[idx + 3] = Math.round(clamp(alpha, 0, 1) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    shadowTex.update(true);
  }

  const shadowMat = new StandardMaterial('oleo-sombra-mat', scene);
  shadowMat.diffuseTexture = shadowTex;
  shadowMat.opacityTexture = shadowTex;
  shadowMat.useAlphaFromDiffuseTexture = true;
  shadowMat.diffuseColor = Color3.Black();
  shadowMat.emissiveColor = new Color3(0.02, 0.05, 0.08);
  shadowMat.specularColor = Color3.Black();
  shadowMat.disableLighting = true;
  shadowMat.disableDepthWrite = true;
  shadowMat.backFaceCulling = false;
  shadowMat.imageProcessingConfiguration = rawConfig;
  shadowMesh.material = shadowMat;

  // 2. Duas variantes de alta resolução (512×192) para o menisco superficial e cortina viscosa de óleo
  const slickW = 512;
  const slickH = 192;
  const slickMaterials: StandardMaterial[] = [0, 1].map((varIdx) => {
    const slickTex = new DynamicTexture(`oleo-menisco-tex-${varIdx}`, { width: slickW, height: slickH }, scene, true);
    slickTex.hasAlpha = true;
    slickTex.wrapU = Texture.CLAMP_ADDRESSMODE;
    slickTex.wrapV = Texture.CLAMP_ADDRESSMODE;

    const ctx = slickTex.getContext();
    const img = ctx.getImageData(0, 0, slickW, slickH);
    const dField = new Float32Array(slickW * slickH);
    const seedOffset = varIdx * 9.4;

    for (let x = 0; x < slickW; x += 1) {
      const u = x / (slickW - 1);
      const horizEnv = Math.sin(u * Math.PI);
      const lobeEnv = Math.pow(horizEnv, 0.48);

      // Perfil superior acompanhando as cristas de onda + dedos viscosos de Rayleigh-Taylor na base
      const topWave = 0.06 + 0.055 * fbm2D(u * 8.5 + 3.1 + seedOffset, 1.2);
      const fbmBase = fbm2D(u * 10.5 + 1.4 + seedOffset, 2.8);
      const fingerDrip = Math.pow(fbm2D(u * 22.0 + 5.7 + seedOffset, 4.3), 2.2) * 0.34;
      const botLimit = 0.26 + (0.28 + fbmBase * 0.46 + fingerDrip) * lobeEnv * 0.68;

      for (let y = 0; y < slickH; y += 1) {
        const v = y / (slickH - 1);
        const qx = fbm2D(u * 12.0 + seedOffset, v * 7.0 + 1.1);
        const internalTurb = fbm2D(u * 16.0 + qx * 1.8 + seedOffset, v * 10.0 + qx * 1.4);

        const topAlpha = smoothstep(topWave, topWave + 0.09, v);
        const botAlpha = 1 - smoothstep(botLimit * 0.48, botLimit, v);
        const edgeAlpha = smoothstep(0.0, 0.07, horizEnv);
        dField[y * slickW + x] = topAlpha * botAlpha * edgeAlpha * (0.68 + internalTurb * 0.48);
      }
    }

    for (let y = 0; y < slickH; y += 1) {
      const v = y / (slickH - 1);
      const row = y * slickW;
      const rowUp = Math.max(0, y - 2) * slickW;
      const rowDown = Math.min(slickH - 1, y + 2) * slickW;

      for (let x = 0; x < slickW; x += 1) {
        const u = x / (slickW - 1);
        const idx = (row + x) * 4;
        const d = dField[row + x];
        if (d <= 0.02) {
          img.data[idx + 3] = 0;
          continue;
        }

        // Normais 3D do relevo interno do óleo para reflexo especular úmido e refração âmbar
        const dL = dField[row + Math.max(0, x - 2)];
        const dR = dField[row + Math.min(slickW - 1, x + 2)];
        const dU = dField[rowUp + x];
        const dD = dField[rowDown + x];
        const nx = (dL - dR) * 2.6;
        const ny = (dU - dD) * 3.0;
        const invN = 1 / Math.hypot(nx, ny, 1.0);
        const normX = nx * invN;
        const normY = ny * invN;
        const normZ = invN;

        const sunDot = clamp(normX * 0.36 + normY * 0.78 + normZ * 0.50);
        const wetSpec = Math.pow(sunDot, 9.0) * smoothstep(0.55, 0.08, v);
        const meniscusCrest = Math.exp(-Math.pow((v - 0.14) / 0.048, 2)) * (0.45 + 0.55 * sunDot);

        const coreMask = smoothstep(0.38, 0.82, d);
        const amberRim = smoothstep(0.03, 0.46, d) * (1 - coreMask);

        // Iridescência sutil de petróleo (azul-pavão, bronze e violeta) apenas no menisco fino iluminado
        const iridPhase = d * 11.0 + u * 15.0 + seedOffset;
        const iridIntensity = amberRim * smoothstep(0.45, 0.12, v) * 0.45;
        const iridR = (0.5 + 0.5 * Math.sin(iridPhase)) * iridIntensity;
        const iridG = (0.5 + 0.5 * Math.sin(iridPhase + 2.1)) * iridIntensity;
        const iridB = (0.5 + 0.5 * Math.sin(iridPhase + 4.2)) * iridIntensity;

        const r = 5 + amberRim * 58 + meniscusCrest * 56 + wetSpec * 92 + iridR * 38 - coreMask * 2;
        const g = 7 + amberRim * 34 + meniscusCrest * 62 + wetSpec * 86 + iridG * 34 - coreMask * 2;
        const b = 11 + amberRim * 14 + meniscusCrest * 70 + wetSpec * 78 + iridB * 42 - coreMask * 3;
        const alpha = smoothstep(0.02, 0.36, d) * (0.76 + coreMask * 0.21);

        img.data[idx] = Math.round(clamp(r, 0, 255));
        img.data[idx + 1] = Math.round(clamp(g, 0, 255));
        img.data[idx + 2] = Math.round(clamp(b, 0, 255));
        img.data[idx + 3] = Math.round(clamp(alpha, 0, 0.97) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    slickTex.update(true);

    const slickMat = new StandardMaterial(`oleo-menisco-mat-${varIdx}`, scene);
    slickMat.diffuseTexture = slickTex;
    slickMat.opacityTexture = slickTex;
    slickMat.useAlphaFromDiffuseTexture = true;
    slickMat.diffuseColor = Color3.Black();
    slickMat.emissiveColor = Color3.White();
    slickMat.specularColor = Color3.Black();
    slickMat.disableLighting = true;
    slickMat.disableDepthWrite = true;
    slickMat.backFaceCulling = false;
    slickMat.imageProcessingConfiguration = rawConfig;
    return slickMat;
  });

  const ribbonConfigs = [
    { screenX: 0.29, screenY: 0.304, width: 13.0, height: 2.05, waveFreq: 3.4, waveSpeed: 1.55, phase: 0.0, threshold: 0.0 },
    { screenX: 0.23, screenY: 0.312, width: 10.8, height: 2.35, waveFreq: 4.1, waveSpeed: 1.35, phase: 1.4, threshold: 0.05 },
    { screenX: 0.38, screenY: 0.310, width: 12.2, height: 2.20, waveFreq: 3.7, waveSpeed: 1.40, phase: 2.1, threshold: 0.12 },
    { screenX: 0.50, screenY: 0.306, width: 15.5, height: 1.95, waveFreq: 3.1, waveSpeed: 1.45, phase: 2.9, threshold: 0.20 },
    { screenX: 0.68, screenY: 0.305, width: 15.8, height: 1.85, waveFreq: 3.6, waveSpeed: 1.50, phase: 3.9, threshold: 0.32 },
    { screenX: 0.16, screenY: 0.305, width: 11.5, height: 1.80, waveFreq: 3.9, waveSpeed: 1.48, phase: 4.5, threshold: 0.40 },
    { screenX: 0.50, screenY: 0.304, width: 30.2, height: 2.10, waveFreq: 2.8, waveSpeed: 1.25, phase: 5.2, threshold: 0.48 },
  ];

  const surfaceRibbons: OilSurfaceRibbon[] = ribbonConfigs.map((cfg, idx) => {
    const depthZ = PLANE_Z - 0.35 - idx * 0.03;
    const { mesh, basePositions } = createSubdividedGridMesh(
      `oleo-faixa-sup-${idx}`,
      cfg.width,
      cfg.height,
      36,
      6,
      scene,
    );
    mesh.material = slickMaterials[idx % slickMaterials.length];
    mesh.visibility = 0;
    mesh.position.copyFrom(screenToWorld(cfg.screenX, cfg.screenY, depthZ));

    return {
      mesh,
      basePositions,
      workingPositions: new Float32Array(basePositions.length),
      width: cfg.width,
      height: cfg.height,
      baseScreenX: cfg.screenX,
      baseScreenY: cfg.screenY,
      depthZ,
      waveFreq: cfg.waveFreq,
      waveSpeed: cfg.waveSpeed,
      phase: cfg.phase,
      threshold: cfg.threshold,
    };
  });

  // 3. Quatro texturas 256×256 com 3 níveis de Domain Warping FBM + sombreamento normal 3D para as plumas
  const plumeSize = 256;
  const plumeMaterials: StandardMaterial[] = [0, 1, 2, 3].map((variantIdx) => {
    const pTex = new DynamicTexture(`oleo-pluma-fbm-tex-${variantIdx}`, { width: plumeSize, height: plumeSize }, scene, true);
    pTex.hasAlpha = true;
    pTex.wrapU = Texture.CLAMP_ADDRESSMODE;
    pTex.wrapV = Texture.CLAMP_ADDRESSMODE;

    const ctx = pTex.getContext();
    const img = ctx.getImageData(0, 0, plumeSize, plumeSize);
    const pField = new Float32Array(plumeSize * plumeSize);
    const seedX = variantIdx * 7.3 + 2.1;
    const seedY = variantIdx * 11.7 + 4.8;

    for (let y = 0; y < plumeSize; y += 1) {
      const v = y / (plumeSize - 1);
      const dy = (v - 0.45) / 0.44;
      for (let x = 0; x < plumeSize; x += 1) {
        const u = x / (plumeSize - 1);
        const dx = (u - 0.5) / 0.46;
        const r = Math.hypot(dx, dy);
        if (r > 1.05) continue;

        // 3-Level Domain Warping FBM (estilo Inigo Quilez) para volutas e filamentos líquidos reais
        const qx = fbm2D(u * 4.2 + seedX, v * 4.2 + seedY);
        const qy = fbm2D(u * 4.2 + seedX + 5.2, v * 4.2 + seedY + 1.3);
        const rx = fbm2D(u * 4.6 + qx * 2.2 + 1.7 + seedX, v * 4.6 + qy * 2.2 + 9.2 + seedY);
        const ry = fbm2D(u * 4.6 + qx * 2.2 + 8.3 + seedX, v * 4.6 + qy * 2.2 + 2.8 + seedY);
        const fbmVal = fbm2D(u * 5.0 + rx * 2.4 + seedX, v * 5.0 + ry * 2.4 + seedY);

        const warpedR = r - (fbmVal - 0.40) * 0.56;
        const radialFalloff = smoothstep(0.90, 0.14, warpedR) * smoothstep(1.02, 0.66, r);
        pField[y * plumeSize + x] = clamp(radialFalloff * (0.44 + fbmVal * 0.94));
      }
    }

    for (let y = 0; y < plumeSize; y += 1) {
      const v = y / (plumeSize - 1);
      const row = y * plumeSize;
      const rowUp = Math.max(0, y - 2) * plumeSize;
      const rowDown = Math.min(plumeSize - 1, y + 2) * plumeSize;

      for (let x = 0; x < plumeSize; x += 1) {
        const idx = (row + x) * 4;
        const d = pField[row + x];
        if (d <= 0.02) {
          img.data[idx + 3] = 0;
          continue;
        }

        // Gradiente 3D de densidade da pluma para iluminação solar volumétrica e refração âmbar nas bordas finas
        const dL = pField[row + Math.max(0, x - 2)];
        const dR = pField[row + Math.min(plumeSize - 1, x + 2)];
        const dU = pField[rowUp + x];
        const dD = pField[rowDown + x];
        const nx = (dL - dR) * 2.8;
        const ny = (dU - dD) * 2.8;
        const invN = 1 / Math.hypot(nx, ny, 1.0);
        const normX = nx * invN;
        const normY = ny * invN;
        const normZ = invN;

        const sunDot = clamp(normX * 0.42 + normY * 0.72 + normZ * 0.55);
        const wetSpec = Math.pow(sunDot, 7.5) * smoothstep(0.85, 0.15, v);

        const coreWeight = smoothstep(0.34, 0.74, d);
        const amberSubsurface = smoothstep(0.03, 0.42, d) * (1 - coreWeight) * (0.45 + 0.55 * sunDot);

        const rCol = 5 + amberSubsurface * 66 + wetSpec * 78 - coreWeight * 2;
        const gCol = 7 + amberSubsurface * 38 + wetSpec * 70 - coreWeight * 2;
        const bCol = 11 + amberSubsurface * 15 + wetSpec * 62 - coreWeight * 3;
        const alpha = smoothstep(0.02, 0.44, d) * (0.66 + coreWeight * 0.28);

        img.data[idx] = Math.round(clamp(rCol, 0, 255));
        img.data[idx + 1] = Math.round(clamp(gCol, 0, 255));
        img.data[idx + 2] = Math.round(clamp(bCol, 0, 255));
        img.data[idx + 3] = Math.round(clamp(alpha, 0, 0.95) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    pTex.update(true);

    const pMat = new StandardMaterial(`oleo-pluma-fbm-mat-${variantIdx}`, scene);
    pMat.diffuseTexture = pTex;
    pMat.opacityTexture = pTex;
    pMat.useAlphaFromDiffuseTexture = true;
    pMat.diffuseColor = Color3.Black();
    pMat.emissiveColor = Color3.White();
    pMat.specularColor = Color3.Black();
    pMat.disableLighting = true;
    pMat.disableDepthWrite = true;
    pMat.backFaceCulling = false;
    pMat.imageProcessingConfiguration = rawConfig;
    return pMat;
  });

  const totalPlumes = 42;
  const plumes: OilVolumetricPlume[] = [];
  for (let i = 0; i < totalPlumes; i += 1) {
    const nearBoat = i < totalPlumes * 0.60;
    const baseW = (nearBoat ? 2.6 : 2.1) + hash2D(i, 19) * 1.9;
    const baseH = (nearBoat ? 1.35 : 1.05) + hash2D(i, 31) * 0.90;
    const { mesh, basePositions } = createSubdividedGridMesh(
      `oleo-pluma-vol-${i}`,
      baseW,
      baseH,
      6,
      6,
      scene,
    );
    mesh.material = plumeMaterials[i % plumeMaterials.length];
    mesh.renderingGroupId = 1;
    mesh.isPickable = false;
    mesh.visibility = 0;

    const plume: OilVolumetricPlume = {
      mesh,
      basePositions,
      workingPositions: new Float32Array(basePositions.length),
      width: baseW,
      height: baseH,
      u: 0.3,
      v: 0.31,
      vx: 0,
      vy: 0,
      depthZ: PLANE_Z - 0.42 - (i % 6) * 0.03,
      baseScaleX: 0.88 + hash2D(i, 43) * 0.36,
      baseScaleY: 0.84 + hash2D(i, 59) * 0.36,
      rotationZ: 0,
      rotVel: 0,
      age: 0,
      maxAge: 7,
      phase: i * 1.37,
      threshold: (i / totalPlumes) * 0.84,
    };
    resetOilPlume(plume, i, totalPlumes, true);
    plumes.push(plume);
  }

  // 4. Textura 3D (128×128) para gotículas de emulsão de petróleo bruto com brilho especular e borda âmbar
  const globSize = 128;
  const globTex = new DynamicTexture('oleo-globulo-3d-tex', { width: globSize, height: globSize }, scene, true);
  globTex.hasAlpha = true;
  globTex.wrapU = Texture.CLAMP_ADDRESSMODE;
  globTex.wrapV = Texture.CLAMP_ADDRESSMODE;
  {
    const ctx = globTex.getContext();
    const img = ctx.getImageData(0, 0, globSize, globSize);
    for (let y = 0; y < globSize; y += 1) {
      const dy = (y - globSize * 0.5) / (globSize * 0.44);
      for (let x = 0; x < globSize; x += 1) {
        const dx = (x - globSize * 0.5) / (globSize * 0.44);
        const r = Math.hypot(dx, dy);
        const idx = (y * globSize + x) * 4;
        if (r > 1.0) {
          img.data[idx + 3] = 0;
          continue;
        }

        const nz = Math.sqrt(Math.max(0, 1 - r * r));
        const spec1 = Math.pow(clamp(dx * 0.48 - dy * 0.56 + nz * 0.66), 11.0) * 0.78;
        const amberRim = Math.pow(1 - nz, 2.0) * 0.82;
        const alpha = smoothstep(1.0, 0.76, r);

        const rCol = 6 + amberRim * 46 + spec1 * 125;
        const gCol = 8 + amberRim * 28 + spec1 * 116;
        const bCol = 12 + amberRim * 12 + spec1 * 105;

        img.data[idx] = Math.round(clamp(rCol, 0, 255));
        img.data[idx + 1] = Math.round(clamp(gCol, 0, 255));
        img.data[idx + 2] = Math.round(clamp(bCol, 0, 255));
        img.data[idx + 3] = Math.round(clamp(alpha * 0.94, 0, 1) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    globTex.update(true);
  }

  const globMat = new StandardMaterial('oleo-globulo-3d-mat', scene);
  globMat.diffuseTexture = globTex;
  globMat.opacityTexture = globTex;
  globMat.useAlphaFromDiffuseTexture = true;
  globMat.diffuseColor = Color3.Black();
  globMat.emissiveColor = Color3.White();
  globMat.specularColor = Color3.Black();
  globMat.disableLighting = true;
  globMat.disableDepthWrite = true;
  globMat.backFaceCulling = false;
  globMat.imageProcessingConfiguration = rawConfig;

  const totalGlobules = 64;
  const globules: OilGlobule[] = [];
  for (let i = 0; i < totalGlobules; i += 1) {
    const diameter = 0.055 + hash2D(i, 17) * 0.105;
    const mesh = MeshBuilder.CreatePlane(`oleo-globulo-${i}`, {
      size: diameter,
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    mesh.material = globMat;
    mesh.renderingGroupId = 2;
    mesh.isPickable = false;
    mesh.visibility = 0;

    const globule: OilGlobule = {
      mesh,
      u: 0.3,
      v: 0.31,
      vx: 0,
      vy: 0,
      depthZ: PLANE_Z - 0.55 - (i % 6) * 0.04,
      baseScale: 1.0,
      mass: 0.6 + (diameter / 0.16) * 0.6,
      age: 0,
      maxAge: 5.5,
      wobbleFreq: 2.6 + hash2D(i, 79) * 2.4,
      phase: i * 1.17,
      threshold: (i / totalGlobules) * 0.85,
    };
    resetOilGlobule(globule, i, totalGlobules, true);
    globules.push(globule);
  }

  return {
    shadowMesh,
    surfaceRibbons,
    plumes,
    globules,
  };
}

/**
 * Atualiza em tempo real a física hidrodinâmica do derramamento de óleo na GPU:
 * - Ondulação orbital e dedos viscosos das lentes superficiais na linha d'água
 * - Advecção por vórtices (Curl Noise), deformação de malha por cisalhamento e empuxo das plumas volumétricas FBM
 * - Entranhamento por quebra de onda e subida helicoidal por Arquimedes das gotículas de emulsão
 */
function updateOilSpillSystem(
  system: OilSpillSystem,
  oilStrength: number,
  elapsed: number,
  dt: number,
  aspect: number,
) {
  if (oilStrength <= 0.01) {
    system.shadowMesh.visibility = 0;
    for (const r of system.surfaceRibbons) r.mesh.visibility = 0;
    for (const p of system.plumes) p.mesh.visibility = 0;
    for (const g of system.globules) g.mesh.visibility = 0;
    return;
  }

  // 1. Feixes volumétricos subaquáticos de sombra sob a mancha de óleo
  system.shadowMesh.visibility = clamp(oilStrength * 0.78);

  // 2. Faixas/cortinas superficiais de petróleo ondulando com as ondas na linha d'água (0 m a ~2 m)
  for (let i = 0; i < system.surfaceRibbons.length; i += 1) {
    const r = system.surfaceRibbons[i];
    if (oilStrength <= r.threshold) {
      r.mesh.visibility = 0;
      continue;
    }

    const localStrength = clamp((oilStrength - r.threshold) / (1 - r.threshold + 0.08));
    r.mesh.visibility = clamp(localStrength * 1.18, 0, 0.97);

    const driftX = Math.sin(elapsed * 0.35 + r.phase) * 0.012;
    const pos = screenToWorld(r.baseScreenX + driftX, r.baseScreenY, r.depthZ, aspect);
    r.mesh.position.copyFrom(pos);

    const spreadScaleX = 0.52 + localStrength * 0.52;
    const thicknessScaleY = 0.60 + localStrength * 0.46;
    r.mesh.scaling.set(spreadScaleX, thicknessScaleY, 1);

    const base = r.basePositions;
    const out = r.workingPositions;
    const count = base.length / 3;
    for (let vIdx = 0; vIdx < count; vIdx += 1) {
      const bx = base[vIdx * 3];
      const by = base[vIdx * 3 + 1];
      const uNorm = bx / r.width + 0.5;
      const vNorm = by / r.height + 0.5; // 0 = base inferior submersa, 1 = topo na linha d'água

      const surfaceWaveY = Math.sin(uNorm * Math.PI * r.waveFreq - elapsed * r.waveSpeed + r.phase) * 0.14
        + Math.cos(uNorm * Math.PI * (r.waveFreq * 1.7) + elapsed * (r.waveSpeed * 0.8) - r.phase) * 0.07;
      const bottomLobeY = (1 - vNorm)
        * Math.sin(uNorm * Math.PI * 6.0 - elapsed * 1.1 + r.phase)
        * 0.18
        * localStrength;
      const shearX = (1 - vNorm) * Math.cos(elapsed * 1.15 + uNorm * 5.5 + r.phase) * 0.15;

      out[vIdx * 3] = bx + shearX;
      out[vIdx * 3 + 1] = by + surfaceWaveY + bottomLobeY;
      out[vIdx * 3 + 2] = base[vIdx * 3 + 2];
    }
    r.mesh.updateVerticesData(VertexBuffer.PositionKind, out, false, false);
  }

  // 3. Plumas/nuvens volumétricas turbulentas (FBM) com deformação de vértices nos vórtices (Curl Noise)
  for (let i = 0; i < system.plumes.length; i += 1) {
    const p = system.plumes[i];
    if (oilStrength <= p.threshold) {
      p.mesh.visibility = 0;
      continue;
    }

    p.age += dt;
    if (p.age >= p.maxAge || p.u < 0.04 || p.u > 0.96) {
      resetOilPlume(p, i, system.plumes.length, false);
    }

    const localStrength = clamp((oilStrength - p.threshold) / (1 - p.threshold + 0.08));
    const curl = sampleFluidCurlVelocity(p.u, p.v, elapsed + p.phase * 0.15);

    const isBillowingDown = p.age < p.maxAge * 0.40;
    const downwardPulse = isBillowingDown ? (0.022 + 0.014 * Math.sin(elapsed * 1.7 + p.phase)) : 0;
    const surfaceTargetV = 0.298 + Math.sin(p.u * 16.0 - elapsed * 1.4) * 0.006;
    const buoyancyUp = Math.max(0, p.v - surfaceTargetV) * (isBillowingDown ? 0.10 : 0.36);

    p.vx += (curl.vx * 1.15 - p.vx) * Math.min(1, dt * 2.2);
    p.vy += (curl.vy * 1.25 + downwardPulse - buoyancyUp - p.vy) * Math.min(1, dt * 2.2);

    p.u += p.vx * dt;
    p.v = clamp(p.v + p.vy * dt, 0.294, 0.392);

    const pos = screenToWorld(p.u, p.v, p.depthZ, aspect);
    p.mesh.position.copyFrom(pos);

    const lifeProgress = p.age / p.maxAge;
    const spreadX = p.baseScaleX * (0.80 + lifeProgress * 0.54) * (0.68 + localStrength * 0.38);
    const spreadY = p.baseScaleY * (0.86 + Math.sin(lifeProgress * Math.PI) * 0.34) * (0.68 + localStrength * 0.38);
    p.mesh.scaling.set(spreadX, spreadY, 1);

    p.rotationZ += p.rotVel * dt;
    p.mesh.rotation.z = p.rotationZ * (1 - smoothstep(0.65, 1.0, lifeProgress) * 0.6);

    // Deformação hidrodinâmica dos vértices da pluma pelo cisalhamento dos vórtices
    const base = p.basePositions;
    const out = p.workingPositions;
    const vCount = base.length / 3;
    const swirlPhase = elapsed * 1.6 + p.phase;
    for (let vIdx = 0; vIdx < vCount; vIdx += 1) {
      const bx = base[vIdx * 3];
      const by = base[vIdx * 3 + 1];
      const uNorm = bx / p.width;
      const vNorm = by / p.height;
      const warpX = Math.sin(vNorm * Math.PI * 2.0 + swirlPhase) * p.width * 0.085 + curl.vx * (0.5 - vNorm) * 6.5;
      const warpY = Math.cos(uNorm * Math.PI * 2.0 - swirlPhase) * p.height * 0.085;
      out[vIdx * 3] = bx + warpX;
      out[vIdx * 3 + 1] = by + warpY;
      out[vIdx * 3 + 2] = base[vIdx * 3 + 2];
    }
    p.mesh.updateVerticesData(VertexBuffer.PositionKind, out, false, false);

    const fadeIn = smoothstep(0.0, 0.75, p.age);
    const fadeOut = 1 - smoothstep(p.maxAge - 1.5, p.maxAge, p.age);
    p.mesh.visibility = clamp(localStrength * fadeIn * fadeOut * 0.92, 0, 0.92);
  }

  // 4. Micro-gotículas 3D de emulsão: entranhamento descendente -> vórtices -> subida helicoidal por empuxo
  for (let i = 0; i < system.globules.length; i += 1) {
    const g = system.globules[i];
    if (oilStrength <= g.threshold) {
      g.mesh.visibility = 0;
      continue;
    }

    g.age += dt;
    if (g.age >= g.maxAge || g.u < 0.03 || g.u > 0.97) {
      resetOilGlobule(g, i, system.globules.length, false);
    }

    const localStrength = clamp((oilStrength - g.threshold) / (1 - g.threshold + 0.08));
    const curl = sampleFluidCurlVelocity(g.u, g.v, elapsed + g.phase * 0.15);

    const isPlunging = g.age < g.maxAge * 0.36;
    const wavePlunge = isPlunging ? (0.030 + 0.018 * Math.sin(elapsed * 2.1 + g.phase)) : 0;
    const surfaceTargetV = 0.296 + Math.sin(g.u * 18.0 - elapsed * 1.5) * 0.005;
    const buoyancyUp = Math.max(0, g.v - surfaceTargetV) * (isPlunging ? 0.12 : 0.46 * g.mass);

    // Oscilação helicoidal induzida por desprendimento de vórtices durante a subida da gota
    const helicalWobbleX = Math.cos(elapsed * g.wobbleFreq * 1.4 + g.phase) * 0.011;
    const targetVx = curl.vx * 1.35 + helicalWobbleX;
    const targetVy = curl.vy * 1.45 + wavePlunge - buoyancyUp;

    g.vx += (targetVx - g.vx) * Math.min(1, dt * 2.8);
    g.vy += (targetVy - g.vy) * Math.min(1, dt * 2.6);

    g.u += g.vx * dt;
    g.v = clamp(g.v + g.vy * dt, 0.294, 0.435);

    const pos = screenToWorld(g.u, g.v, g.depthZ, aspect);
    g.mesh.position.copyFrom(pos);

    const speed = Math.hypot(g.vx, g.vy);
    const stretch = 1 + clamp(speed * 6.5, 0, 0.38);
    const wobble = Math.sin(elapsed * g.wobbleFreq + g.phase) * 0.07;
    const nearSurfaceCoal = 1 - smoothstep(0.294, 0.312, g.v);

    const scaleX = g.baseScale * ((1 / Math.sqrt(stretch)) + wobble + nearSurfaceCoal * 0.48);
    const scaleY = g.baseScale * (stretch - wobble - nearSurfaceCoal * 0.34);
    g.mesh.scaling.set(Math.max(0.45, scaleX), Math.max(0.35, scaleY), 1);

    const motionAngle = Math.atan2(g.vy, g.vx) - Math.PI * 0.5;
    g.mesh.rotation.z = motionAngle * (1 - nearSurfaceCoal * 0.85);

    const fadeIn = smoothstep(0.0, 0.4, g.age);
    const fadeOut = 1 - smoothstep(g.maxAge - 0.9, g.maxAge, g.age);
    g.mesh.visibility = clamp(localStrength * fadeIn * fadeOut * 0.90, 0, 0.90);
  }
}

/**
 * Calcula filamentos ópticos de cáusticas marinhas por interferência celular de Voronoi/Worley (F2 - F1),
 * reproduzindo a refração real das ondas da superfície projetada no fundo de areia.
 */
function worleyCausticRidge(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  let f1 = 8.0;
  let f2 = 8.0;

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = dx + 0.14 + 0.72 * hash2D(ix + dx, iy + dy);
      const cy = dy + 0.14 + 0.72 * hash2D(ix + dx + 37, iy + dy + 71);
      const d = Math.hypot(cx - fx, cy - fy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }

  const border = Math.max(0, f2 - f1);
  // Filamento brilhante onde os raios refratados convergem (fronteira de Voronoi)
  const filament = Math.exp(-border * 8.2);
  // Ponto focal extra nos vértices triplos da malha celular
  const vertexGlow = filament * smoothstep(0.28, 0.58, f1) * 0.55;
  return clamp(filament * 0.82 + vertexGlow);
}

/**
 * Cria o sistema de iluminação dinâmica e cáusticas solares sobre o leito de areia:
 * 1. Tapetes de cáusticas celulares Voronoi em perspectiva com deformação de vértices na GPU
 * 2. Feixes e manchas de luz solar itinerantes ("sun pools") varrendo a areia conforme as ondas passam
 */
function createSandCausticsSystem(scene: Scene): SandCausticsSystem {
  const rawConfig = createRawImageProcessing();

  // 1. Duas variantes de textura de malha de cáusticas Voronoi em perspectiva (256x160)
  const carpetW = 256;
  const carpetH = 160;
  const carpetMats = [0, 1].map((variant) => {
    const tex = new DynamicTexture(
      `areia-caustica-tex-${variant}`,
      { width: carpetW, height: carpetH },
      scene,
      true,
    );
    tex.hasAlpha = true;
    const ctx = tex.getContext();
    const img = ctx.getImageData(0, 0, carpetW, carpetH);
    const seed = variant * 19.7 + 4.3;

    for (let y = 0; y < carpetH; y += 1) {
      const v = y / (carpetH - 1);
      // Escorço em perspectiva: células menores ao fundo (v=0) e maiores perto da câmera (v=1)
      const perspScale = 1.55 - v * 0.82;
      const envV = Math.sin(v * Math.PI);

      for (let x = 0; x < carpetW; x += 1) {
        const u = x / (carpetW - 1);
        const envU = Math.sin(u * Math.PI);
        const radialDist = Math.hypot((u - 0.5) * 1.85, (v - 0.5) * 1.85);
        const envelope = Math.pow(clamp(1 - radialDist), 1.45) * envU * envV;

        const idx = (y * carpetW + x) * 4;
        if (envelope <= 0.004) {
          img.data[idx] = 0;
          img.data[idx + 1] = 0;
          img.data[idx + 2] = 0;
          img.data[idx + 3] = 0;
          continue;
        }

        const wx = u * 5.8 * perspScale + seed;
        const wy = v * 3.8 * perspScale + seed * 0.6;
        const warpX = (fbm2D(wx * 0.65, wy * 0.65) - 0.5) * 0.55;
        const warpY = (fbm2D(wx * 0.65 + 7.1, wy * 0.65 + 3.4) - 0.5) * 0.55;

        const c1 = worleyCausticRidge(wx + warpX, wy + warpY);
        const c2 = worleyCausticRidge((wx - warpY) * 1.75 + 11.3, (wy + warpX) * 1.75 + 5.9);
        const caustic = clamp(Math.pow(c1 * 0.72 + c2 * 0.48, 1.35));

        const alpha = clamp(caustic * envelope * 0.92);
        // Luz solar dourada-ciano refratada na areia clara
        img.data[idx] = Math.round(clamp(0.88 + caustic * 0.12) * 255);
        img.data[idx + 1] = Math.round(clamp(0.96 + caustic * 0.04) * 255);
        img.data[idx + 2] = Math.round(clamp(0.68 + caustic * 0.24) * 255);
        img.data[idx + 3] = Math.round(alpha * 255);
      }
    }

    ctx.putImageData(img, 0, 0);
    tex.update(true);

    const mat = new StandardMaterial(`areia-caustica-mat-${variant}`, scene);
    mat.diffuseTexture = tex;
    mat.opacityTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.diffuseColor = Color3.Black();
    mat.emissiveColor = new Color3(1.0, 0.95, 0.76);
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.imageProcessingConfiguration = rawConfig;
    return mat;
  });

  const carpetSpecs = [
    { u: 0.34, v: 0.75, w: 9.2, h: 3.1, speed: 0.022, alpha: 0.42 },
    { u: 0.58, v: 0.76, w: 9.8, h: 3.2, speed: -0.019, alpha: 0.44 },
    { u: 0.46, v: 0.83, w: 12.4, h: 3.8, speed: 0.025, alpha: 0.48 },
    { u: 0.26, v: 0.88, w: 10.6, h: 3.6, speed: 0.020, alpha: 0.44 },
    { u: 0.68, v: 0.89, w: 11.2, h: 3.7, speed: -0.023, alpha: 0.46 },
    { u: 0.48, v: 0.93, w: 14.5, h: 4.0, speed: 0.018, alpha: 0.50 },
  ];

  const carpets: SandCausticCarpet[] = carpetSpecs.map((spec, i) => {
    const geo = createSubdividedGridMesh(`areia-caustica-malha-${i}`, spec.w, spec.h, 12, 5, scene);
    geo.mesh.material = carpetMats[i % carpetMats.length];
    geo.mesh.renderingGroupId = 1;
    geo.mesh.visibility = spec.alpha;
    const depthZ = PLANE_Z + 0.95 - i * 0.02;
    geo.mesh.position.copyFrom(screenToWorld(spec.u, spec.v, depthZ));

    return {
      mesh: geo.mesh,
      basePositions: geo.basePositions,
      workingPositions: new Float32Array(geo.basePositions.length),
      width: spec.w,
      height: spec.h,
      baseU: spec.u,
      baseV: spec.v,
      depthZ,
      driftSpeed: spec.speed,
      phase: i * 1.47,
      baseAlpha: spec.alpha,
    };
  });

  // 2. Manchas de luz solar passando na areia ("sun pools" focados pelas ondas)
  const poolSize = 160;
  const poolTex = new DynamicTexture('areia-sunpool-tex', { width: poolSize, height: poolSize }, scene, true);
  poolTex.hasAlpha = true;
  const pCtx = poolTex.getContext();
  const pImg = pCtx.getImageData(0, 0, poolSize, poolSize);

  for (let y = 0; y < poolSize; y += 1) {
    const v = y / (poolSize - 1);
    for (let x = 0; x < poolSize; x += 1) {
      const u = x / (poolSize - 1);
      const dx = (u - 0.5) * 2.0;
      const dy = (v - 0.5) * 2.0;
      const r = Math.hypot(dx, dy);
      const idx = (y * poolSize + x) * 4;
      if (r >= 1.0) {
        pImg.data[idx] = 0;
        pImg.data[idx + 1] = 0;
        pImg.data[idx + 2] = 0;
        pImg.data[idx + 3] = 0;
        continue;
      }

      const radialFalloff = Math.pow(1 - r, 1.85);
      const innerCaustic = worleyCausticRidge(u * 4.2 + 2.1, v * 3.4 + 5.7);
      const ripple = 0.62 + 0.38 * Math.sin((u * 3.5 + v * 2.0) * Math.PI * 2);
      const intensity = clamp(radialFalloff * (0.48 + innerCaustic * 0.65) * ripple);

      pImg.data[idx] = 255;
      pImg.data[idx + 1] = 246;
      pImg.data[idx + 2] = 196;
      pImg.data[idx + 3] = Math.round(intensity * 255);
    }
  }
  pCtx.putImageData(pImg, 0, 0);
  poolTex.update(true);

  const poolMat = new StandardMaterial('areia-sunpool-mat', scene);
  poolMat.diffuseTexture = poolTex;
  poolMat.opacityTexture = poolTex;
  poolMat.useAlphaFromDiffuseTexture = true;
  poolMat.diffuseColor = Color3.Black();
  poolMat.emissiveColor = new Color3(1.0, 0.96, 0.78);
  poolMat.specularColor = Color3.Black();
  poolMat.disableLighting = true;
  poolMat.disableDepthWrite = true;
  poolMat.backFaceCulling = false;
  poolMat.alphaMode = Constants.ALPHA_ADD;
  poolMat.imageProcessingConfiguration = rawConfig;

  const sunPools: SandSunPool[] = Array.from({ length: 10 }, (_, i) => {
    const w = 4.2 + (i % 4) * 1.4;
    const h = 1.4 + (i % 3) * 0.55;
    const mesh = MeshBuilder.CreatePlane(`areia-sunpool-${i}`, {
      width: w,
      height: h,
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    mesh.material = poolMat;
    mesh.renderingGroupId = 1;
    mesh.isPickable = false;

    const u = 0.14 + (i / 10) * 0.72;
    const baseV = 0.68 + ((i * 3) % 7) * 0.042;
    const depthZ = PLANE_Z + 0.88 - i * 0.01;
    mesh.position.copyFrom(screenToWorld(u, baseV, depthZ));

    return {
      mesh,
      u,
      baseV,
      speedU: 0.022 + (i % 4) * 0.006,
      bobAmpV: 0.012 + (i % 3) * 0.005,
      baseScaleX: 0.90 + (i % 3) * 0.18,
      baseScaleY: 0.85 + ((i + 1) % 3) * 0.16,
      phase: i * 1.23,
      baseAlpha: 0.34 + (i % 3) * 0.08,
      depthZ,
    };
  });

  return { carpets, sunPools };
}

/**
 * Atualiza a refração das luzes solares e cáusticas passando sobre a areia a cada quadro.
 */
function updateSandCausticsSystem(
  system: SandCausticsSystem,
  elapsed: number,
  dt: number,
  waterClarity: number,
  aspect: number,
) {
  // 1. Tapetes de cáusticas celulares com ondulação de vértices
  for (let i = 0; i < system.carpets.length; i += 1) {
    const carpet = system.carpets[i];
    const swayU = Math.sin(elapsed * 0.55 + carpet.phase) * 0.032
      + Math.cos(elapsed * 0.28 - carpet.phase) * 0.018;
    const swayV = Math.cos(elapsed * 0.42 + carpet.phase * 1.3) * 0.008;
    const pos = screenToWorld(carpet.baseU + swayU, carpet.baseV + swayV, carpet.depthZ, aspect);
    carpet.mesh.position.copyFrom(pos);

    const base = carpet.basePositions;
    const out = carpet.workingPositions;
    const count = base.length / 3;
    const w = carpet.width;
    const h = carpet.height;

    for (let vIdx = 0; vIdx < count; vIdx += 1) {
      const bx = base[vIdx * 3];
      const by = base[vIdx * 3 + 1];
      const bz = base[vIdx * 3 + 2];
      const u = bx / w + 0.5;
      const v = by / h + 0.5;

      const waveX = Math.sin(u * 9.0 + v * 5.0 - elapsed * 2.1 + carpet.phase) * 0.22
        + Math.cos(u * 15.0 - v * 8.0 + elapsed * 1.6) * 0.11;
      const waveY = Math.cos(u * 7.5 + v * 9.0 - elapsed * 1.8 + carpet.phase) * 0.09;

      out[vIdx * 3] = bx + waveX;
      out[vIdx * 3 + 1] = by + waveY;
      out[vIdx * 3 + 2] = bz;
    }
    carpet.mesh.updateVerticesData(VertexBuffer.PositionKind, out, false, false);

    // Cintilação natural por convergência das ondas + atenuação quando há óleo/esgoto
    const shimmer = 0.78 + 0.22 * Math.sin(elapsed * 2.4 + carpet.phase * 1.7);
    carpet.mesh.visibility = clamp(carpet.baseAlpha * shimmer * waterClarity, 0, 0.65);
  }

  // 2. Feixes e manchas de luz solar passando continuamente pela areia
  for (let i = 0; i < system.sunPools.length; i += 1) {
    const pool = system.sunPools[i];
    pool.u += pool.speedU * dt;
    if (pool.u > 0.88) {
      pool.u = 0.12 + (pool.u - 0.88);
    }

    const v = pool.baseV + Math.sin(elapsed * 0.75 + pool.phase) * pool.bobAmpV;
    pool.mesh.position.copyFrom(screenToWorld(pool.u, v, pool.depthZ, aspect));

    const stretch = 1 + 0.18 * Math.sin(elapsed * 1.8 + pool.phase);
    const breath = 1 + 0.12 * Math.cos(elapsed * 1.3 - pool.phase);
    pool.mesh.scaling.set(pool.baseScaleX * stretch, pool.baseScaleY * breath, 1);
    pool.mesh.rotation.z = -0.12 + 0.08 * Math.sin(elapsed * 0.6 + pool.phase);

    // Envoltória suave nas bordas do corredor de areia para surgir e sumir organicamente
    const edgeFade = smoothstep(0.12, 0.24, pool.u) * (1 - smoothstep(0.76, 0.88, pool.u));
    const waveFocus = 0.65 + 0.35 * Math.sin(elapsed * 2.1 + pool.phase * 2.3);
    pool.mesh.visibility = clamp(pool.baseAlpha * edgeFade * waveFocus * waterClarity, 0, 0.55);
  }
}

/**
 * Gera o próximo waypoint 3D independente para um peixe, permitindo que ele nade livremente:
 * - Para a esquerda ou direita por todo o recife (u ∈ [0.07, 0.93])
 * - Para cima (zona iluminada) e para baixo (perto da areia e corais) (v ∈ [0.35, 0.83])
 * - Lá para o fundo distante (depth → 0.06) e cá para a frente pertinho da câmera (depth → 0.98)
 */
function generateNextFishWaypoint(
  fishId: number,
  stepIndex: number,
  prevWp: FishWaypoint3D,
  prevDirU: 1 | -1,
): FishWaypoint3D {
  const s1 = hash2D(fishId * 53 + stepIndex * 17, 11);
  const s2 = hash2D(fishId * 71 + stepIndex * 29, 37);
  const s3 = hash2D(fishId * 97 + stepIndex * 43, 61);
  const s4 = hash2D(fishId * 113 + stepIndex * 19, 89);

  // Limites horizontais balanceados por cardume para manter toda a extensão do recife ocupada e viva
  const schoolSlot = Math.abs(fishId - 300) % 5;
  let minU = 0.08;
  let maxU = 0.92;
  if (schoolSlot === 0) { minU = 0.10; maxU = 0.52; }
  else if (schoolSlot === 1) { minU = 0.28; maxU = 0.72; }
  else if (schoolSlot === 2) { minU = 0.16; maxU = 0.62; }
  else if (schoolSlot === 3) { minU = 0.48; maxU = 0.90; }

  let dirU: 1 | -1 = prevDirU;
  if (prevWp.u < minU + 0.05) {
    dirU = 1;
  } else if (prevWp.u > maxU - 0.05) {
    dirU = -1;
  } else if (s1 < 0.42) {
    dirU = (prevDirU === 1 ? -1 : 1);
  }

  const spanU = 0.14 + s2 * 0.28;
  let nextU = prevWp.u + dirU * spanU;
  if (nextU > maxU || nextU < minU) {
    dirU = (dirU === 1 ? -1 : 1);
    nextU = clamp(prevWp.u + dirU * spanU, minU, maxU);
  }
  if (Math.abs(nextU - prevWp.u) < 0.10) {
    nextU = clamp(prevWp.u + (prevWp.u < (minU + maxU) * 0.5 ? 0.18 : -0.18), minU, maxU);
  }

  // Decide altura na coluna d'água (mergulhando até a areia/corais ou subindo em direção à luz)
  const targetBandV = s3 < 0.30
    ? 0.36 + s4 * 0.14 // Zona superior ensolarada
    : s3 < 0.72
      ? 0.48 + s4 * 0.20 // Zona média do recife
      : 0.68 + s4 * 0.14; // Perto da areia e das colônias de corais
  const nextV = clamp(prevWp.v * 0.25 + targetBandV * 0.75, 0.35, 0.83);

  // Decide profundidade 3D (alternando entre ir lá para o fundo, passear no meio e vir pertinho da câmera)
  const depthCycle = (fishId * 3 + stepIndex) % 7;
  let targetDepth: number;
  if (depthCycle === 0 || depthCycle === 4) {
    // Vai lá para o fundo azul-esverdeado distante
    targetDepth = 0.07 + s4 * 0.20;
  } else if (depthCycle === 2 || depthCycle === 6) {
    // Vem cá para a frente, pertinho da câmera!
    targetDepth = 0.74 + s1 * 0.24;
  } else {
    // Zona intermediária do recife
    targetDepth = 0.32 + s2 * 0.38;
  }

  return {
    u: nextU,
    v: nextV,
    depth: clamp(targetDepth, 0.06, 0.98),
  };
}

/**
 * Avalia a spline cúbica Hermite 3D monotônica (Fritsch-Carlson em u + curvatura 3D em v e depth),
 * garantindo movimento 100% fluido em 3D sem jamais nadar de costas ou tremer em 10x.
 */
function evaluateFishSpline3D(
  wp0: FishWaypoint3D,
  wp1: FishWaypoint3D,
  wp2: FishWaypoint3D,
  wp3: FishWaypoint3D,
  t: number,
  phase: number,
): {
  u: number;
  v: number;
  depth: number;
  velU: number;
  velV: number;
  velDepth: number;
} {
  const t2 = t * t;
  const t3 = t2 * t;

  // Funções base de Hermite e suas derivadas analíticas exatas
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const dh00 = 6 * t2 - 6 * t;
  const dh10 = 3 * t2 - 4 * t + 1;
  const dh01 = -6 * t2 + 6 * t;
  const dh11 = 3 * t2 - 2 * t;

  // Tangentes horizontais monotônicas (Fritsch-Carlson): velU nunca inverte sinal no meio do trecho
  const du0 = wp1.u - wp0.u;
  const du1 = wp2.u - wp1.u;
  const du2 = wp3.u - wp2.u;

  const maxSlopeU = Math.abs(du1) * 2.2;
  const m1u = du0 * du1 > 0
    ? clamp(0.5 * (du0 + du1), -maxSlopeU, maxSlopeU)
    : 0;
  const m2u = du1 * du2 > 0
    ? clamp(0.5 * (du1 + du2), -maxSlopeU, maxSlopeU)
    : 0;

  // Tangentes verticais e de profundidade com arco natural nas curvas de 180°
  const turnLoopV1 = m1u === 0 ? (Math.sin(phase) >= 0 ? 0.055 : -0.055) : 0;
  const turnLoopV2 = m2u === 0 ? (Math.cos(phase) >= 0 ? 0.055 : -0.055) : 0;
  const m1v = 0.5 * (wp2.v - wp0.v) + turnLoopV1;
  const m2v = 0.5 * (wp3.v - wp1.v) + turnLoopV2;

  const m1d = 0.5 * (wp2.depth - wp0.depth);
  const m2d = 0.5 * (wp3.depth - wp1.depth);

  const u = h00 * wp1.u + h10 * m1u + h01 * wp2.u + h11 * m2u;
  const v = h00 * wp1.v + h10 * m1v + h01 * wp2.v + h11 * m2v;
  const depth = h00 * wp1.depth + h10 * m1d + h01 * wp2.depth + h11 * m2d;

  const velU = dh00 * wp1.u + dh10 * m1u + dh01 * wp2.u + dh11 * m2u;
  const velV = dh00 * wp1.v + dh10 * m1v + dh01 * wp2.v + dh11 * m2v;
  const velDepth = dh00 * wp1.depth + dh10 * m1d + dh01 * wp2.depth + dh11 * m2d;

  return {
    u: clamp(u, 0.05, 0.95),
    v: clamp(v, 0.33, 0.85),
    depth: clamp(depth, 0.05, 0.99),
    velU,
    velV,
    velDepth,
  };
}

function createFishTextureSet(scene: Scene) {
  const loadTex = (url: string) => {
    const tex = new Texture(url, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
    tex.hasAlpha = true;
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    return tex;
  };

  return {
    'blue-tang': {
      healthy: loadTex(MARINE_ASSET_URLS.fishBlueTangHealthy),
      stressed: loadTex(MARINE_ASSET_URLS.fishBlueTangStressed),
    },
    'sergeant-major': {
      healthy: loadTex(MARINE_ASSET_URLS.fishSergeantMajorHealthy),
      stressed: loadTex(MARINE_ASSET_URLS.fishSergeantMajorStressed),
    },
    parrotfish: {
      healthy: loadTex(MARINE_ASSET_URLS.fishParrotfishHealthy),
      stressed: loadTex(MARINE_ASSET_URLS.fishParrotfishStressed),
    },
  } as const;
}

function createFishSchools3D(): FishSchool3D[] {
  const schoolSeeds = [
    // Cardume 0: Sargentos na ala esquerda/central vindo para a frente
    { u: 0.24, v: 0.49, depth: 0.72, dir: 1 as const, speed: 0.23 },
    // Cardume 1: Grande cardume central de Sargentos (bem na rota onde o tubarão passa!)
    { u: 0.50, v: 0.51, depth: 0.46, dir: -1 as const, speed: 0.22 },
    // Cardume 2: Cirurgiões-Patela (Blue Tangs)
    { u: 0.36, v: 0.60, depth: 0.80, dir: 1 as const, speed: 0.24 },
    // Cardume 3: Peixes-Papagaio (Parrotfish) perto dos corais direitos/centro
    { u: 0.76, v: 0.63, depth: 0.68, dir: -1 as const, speed: 0.21 },
    // Cardume 4: Peixes 3D Riggados (Pale Bleak) nadando juntos pelo recife
    { u: 0.58, v: 0.46, depth: 0.64, dir: -1 as const, speed: 0.24 },
  ];

  return schoolSeeds.map((seed, id) => {
    const wp1: FishWaypoint3D = { u: seed.u, v: seed.v, depth: seed.depth };
    const wp0: FishWaypoint3D = {
      u: clamp(seed.u - seed.dir * 0.20, 0.10, 0.90),
      v: clamp(seed.v - 0.04, 0.38, 0.78),
      depth: clamp(seed.depth - 0.14, 0.08, 0.94),
    };
    const wp2 = generateNextFishWaypoint(id + 300, 1, wp1, seed.dir);
    const dir12: 1 | -1 = wp2.u >= wp1.u ? 1 : -1;
    const wp3 = generateNextFishWaypoint(id + 300, 2, wp2, dir12);
    const dist12 = Math.hypot(wp2.u - wp1.u, (wp2.v - wp1.v) * 1.15, (wp2.depth - wp1.depth) * 0.42);

    return {
      id,
      wp0,
      wp1,
      wp2,
      wp3,
      segmentProgress: (id * 0.23) % 0.85,
      segmentDuration: clamp(dist12 * 3.2, 0.85, 2.10),
      waypointCounter: 3,
      speed: seed.speed,
      phase: id * 1.41,
      currentU: seed.u,
      currentV: seed.v,
      currentDepth: seed.depth,
      velU: seed.dir * 0.15,
      velV: 0,
      velDepth: 0,
    };
  });
}

function createAllFishes(scene: Scene, schools: FishSchool3D[]): FishSwimmer[] {
  const textures = createFishTextureSet(scene);
  const rawConfig = createRawImageProcessing();

  const makeMat = (name: string, tex: Texture, tint: Color3) => {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseTexture = tex;
    mat.opacityTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.diffuseColor = Color3.Black();
    mat.emissiveColor = tint.clone();
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.imageProcessingConfiguration = rawConfig;
    return mat;
  };

  const specs: Array<{
    species: FishSpeciesId;
    schoolId: number;
    offsetU: number;
    offsetV: number;
    offsetDepth: number;
    speed: number;
    swimFreq: number;
    tint: Color3;
  }> = [
    // Cardume 0 (8 Sargentos nadando em formação orgânica na ala esquerda/central)
    ...Array.from({ length: 8 }, (_, idx) => {
      const row = idx % 3;
      const col = Math.floor(idx / 3);
      return {
        species: 'sergeant-major' as FishSpeciesId,
        schoolId: 0,
        offsetU: (col - 1) * 0.038 + (row % 2) * 0.015,
        offsetV: (row - 1) * 0.024 + (col % 2) * 0.008,
        offsetDepth: ((idx % 4) - 1.5) * 0.055,
        speed: 0.23 + (idx % 3) * 0.012,
        swimFreq: 5.6 + (idx % 4) * 0.22,
        tint: new Color3(0.94, 0.98, 1.0),
      };
    }),

    // Cardume 1 (14 Sargentos no grande cardume central do recife)
    ...Array.from({ length: 14 }, (_, idx) => {
      const row = idx % 4;
      const col = Math.floor(idx / 4);
      return {
        species: 'sergeant-major' as FishSpeciesId,
        schoolId: 1,
        offsetU: (col - 1.5) * 0.034 + (row % 2) * 0.014,
        offsetV: (row - 1.5) * 0.020 + (col % 2) * 0.007,
        offsetDepth: ((idx % 5) - 2) * 0.048,
        speed: 0.22 + (idx % 4) * 0.01,
        swimFreq: 5.7 + (idx % 3) * 0.25,
        tint: new Color3(0.94, 0.98, 1.0),
      };
    }),

    // Cardume 2 (5 Cirurgiões-Patela / Blue Tangs)
    ...Array.from({ length: 5 }, (_, idx) => ({
      species: 'blue-tang' as FishSpeciesId,
      schoolId: 2,
      offsetU: ((idx % 3) - 1) * 0.045,
      offsetV: (Math.floor(idx / 3) - 0.5) * 0.032 + (idx % 2) * 0.012,
      offsetDepth: (idx - 2) * 0.06,
      speed: 0.24 + (idx % 3) * 0.012,
      swimFreq: 5.5 + (idx % 3) * 0.2,
      tint: new Color3(0.98, 0.98, 0.94),
    })),

    // Cardume 3 (6 Peixes-Papagaio / Parrotfish)
    ...Array.from({ length: 6 }, (_, idx) => ({
      species: 'parrotfish' as FishSpeciesId,
      schoolId: 3,
      offsetU: ((idx % 3) - 1) * 0.048,
      offsetV: (Math.floor(idx / 3) - 0.5) * 0.030 + (idx % 2) * 0.010,
      offsetDepth: (idx - 2.5) * 0.055,
      speed: 0.21 + (idx % 3) * 0.01,
      swimFreq: 5.4 + (idx % 3) * 0.22,
      tint: new Color3(1.0, 0.96, 0.92),
    })),
  ];

  const speciesBaseSize: Record<FishSpeciesId, number> = {
    parrotfish: 0.86,
    'blue-tang': 0.78,
    'sergeant-major': 0.75,
  };

  return specs.map((spec, index) => {
    const school = schools[spec.schoolId] ?? schools[0];
    const texPair = textures[spec.species];
    const refSize = speciesBaseSize[spec.species];
    const individualScale = 0.88 + hash2D(index, 19) * 0.22;
    const width = refSize * 1.28;
    const height = refSize;

    const initU = clamp(school.currentU + spec.offsetU, 0.06, 0.94);
    const initV = clamp(school.currentV + spec.offsetV, 0.35, 0.84);
    const initDepth = clamp(school.currentDepth + spec.offsetDepth, 0.06, 0.96);
    const depthZ = PLANE_Z + 1.8 - initDepth * 3.6;

    const holder = new TransformNode(`peixe-holder-${index}`, scene);
    const pos = screenToWorld(initU, initV, depthZ);
    holder.position.copyFrom(pos);

    const baseTint = spec.tint.clone();
    const stressedTint = new Color3(0.92, 0.88, 0.78);
    const deadTint = new Color3(0.55, 0.60, 0.64);

    const healthyGeo = createSubdividedFishMesh(`peixe-healthy-${index}`, width, height, scene);
    const stressedGeo = createSubdividedFishMesh(`peixe-stressed-${index}`, width, height, scene);
    const deadGeo = createSubdividedFishMesh(`peixe-dead-${index}`, width, height, scene);

    const healthyMat = makeMat(`peixe-healthy-mat-${index}`, texPair.healthy, baseTint);
    const stressedMat = makeMat(`peixe-stressed-mat-${index}`, texPair.stressed, stressedTint);
    const deadMat = makeMat(`peixe-dead-mat-${index}`, texPair.stressed, deadTint);

    healthyGeo.mesh.material = healthyMat;
    stressedGeo.mesh.material = stressedMat;
    deadGeo.mesh.material = deadMat;

    healthyGeo.mesh.parent = holder;
    stressedGeo.mesh.parent = holder;
    deadGeo.mesh.parent = holder;

    stressedGeo.mesh.setEnabled(false);
    deadGeo.mesh.setEnabled(false);

    const initDir: 1 | -1 = school.velU >= 0 ? 1 : -1;
    const seabedScreenY = 0.72 + initDepth * 0.17;
    const surfaceScreenY = 0.305 + (index % 5) * 0.008;

    const isHardy = index % 3 === 0;
    const threshold = isHardy ? 10 : 20 + ((index * 23) % 65);

    return {
      id: index,
      schoolId: spec.schoolId,
      holder,
      healthy: { mesh: healthyGeo.mesh, material: healthyMat },
      stressed: { mesh: stressedGeo.mesh, material: stressedMat },
      dead: { mesh: deadGeo.mesh, material: deadMat },
      basePositions: healthyGeo.basePositions,
      workingPositions: new Float32Array(healthyGeo.basePositions.length),
      width,
      species: spec.species,
      threshold,
      isHardy,
      individualScale,
      baseTint,
      stressedTint,
      formationOffsetU: spec.offsetU,
      formationOffsetV: spec.offsetV,
      formationOffsetDepth: spec.offsetDepth,
      scatterOffsetU: 0,
      scatterOffsetV: 0,
      scatterVelU: 0,
      scatterVelV: 0,
      scaredTimer: 0,
      speed: spec.speed,
      swimFreq: spec.swimFreq,
      phase: index * 1.17,
      direction: initDir,
      depthZ,
      swimPhase: index * 0.43,
      tailPhase: index * 0.91,
      headTurn: initDir,
      tailTurn: initDir,
      currentDepth: initDepth,
      deathStage: 'alive',
      currentScreenX: initU,
      currentScreenY: initV,
      currentDir: initDir,
      seabedScreenY,
      surfaceScreenY,
      deadElapsed: 0,
      stageElapsed: 0,
      verticalVelocity: 0,
    };
  });
}

/**
 * Gera waypoints 3D específicos para modelos 3D (`RiggedFish3D`), incluindo trajetos
 * retos para a frente (em direção à câmera, depth → 0.94) e retos para trás
 * (voltando lá para o fundo do mar, depth → 0.08), além de diagonais, cima/baixo e lado a lado.
 */
function generateNext3DFishWaypoint(
  fishId: number,
  step: number,
  prev: FishWaypoint3D,
  prevDir: 1 | -1,
  forceStraightDepth: boolean,
): FishWaypoint3D {
  const rMode = hash2D(fishId * 41 + 9, step * 19 + 5);
  const rU = hash2D(fishId * 17 + 3, step * 31 + 11);
  const rV = hash2D(fishId * 29 + 7, step * 43 + 19);
  const rD = hash2D(fishId * 53 + 13, step * 61 + 23);

  // ~60% dos trechos dos depth-runners (ou ~45% dos demais) nadam RETO para a frente ou RETO para trás no eixo da câmera!
  const isStraightZ = forceStraightDepth ? rMode < 0.65 : rMode < 0.45;

  if (isStraightZ) {
    // Alterna entre vir reto cá para a frente (perto da câmera) e voltar reto lá para o fundo
    const goForwardToCamera = prev.depth < 0.52 ? true : prev.depth > 0.72 ? false : rD > 0.45;
    const nextDepth = goForwardToCamera
      ? clamp(0.82 + rD * 0.14, 0.80, 0.96)
      : clamp(0.08 + rD * 0.16, 0.07, 0.24);
    // Mantém U quase constante para o peixe 3D nadar reto no sentido da câmera (frente/trás puro!)
    const nextU = clamp(prev.u + (rU - 0.5) * 0.035, 0.14, 0.86);
    const nextV = clamp(prev.v + (rV - 0.5) * 0.06, 0.38, 0.76);
    return { u: nextU, v: nextV, depth: nextDepth };
  }

  let dir: 1 | -1 = rU < 0.35 ? (-prevDir as 1 | -1) : prevDir;
  if (prev.u > 0.82) dir = -1;
  else if (prev.u < 0.18) dir = 1;

  const spanU = 0.16 + rU * 0.24;
  const nextU = clamp(prev.u + dir * spanU, 0.12, 0.88);
  const nextV = clamp(0.38 + rV * 0.38, 0.36, 0.78);
  const nextDepth = clamp(0.10 + rD * 0.84, 0.08, 0.95);
  return { u: nextU, v: nextV, depth: nextDepth };
}

/**
 * Carrega o modelo 3D riggado `cc0____pale_bleak_z` (/models/pale-bleak/scene.gltf),
 * que possui 43 ossos e a animação esqueletal 'Animation' de 5.625s,
 * formando um cardume 3D que nada para os lados, cima/baixo, diagonais e também
 * RETO para a frente (sentido da câmera) e RETO para trás (sentido do fundo),
 * fugindo quando o tubarão se aproxima e depois se reagrupando.
 */
async function loadRiggedPaleBleakFishes(scene: Scene, schools: FishSchool3D[]): Promise<RiggedFish3D[]> {
  try {
    const container = await LoadAssetContainerAsync('scene.gltf', scene, {
      rootUrl: '/models/pale-bleak/',
    });
    if (scene.isDisposed) {
      container.dispose();
      return [];
    }
    const rawConfig = createRawImageProcessing();
    const srcMat = container.materials[0] as PBRMaterial | undefined;
    const albedoTex = srcMat?.albedoTexture ?? null;

    // Textura pré-otimizada em WebP (412 KB) com recorte alpha e realce prateado-ciano
    // para carregamento instantâneo no celular sem gargalo de CPU ou readPixels()
    const cleanTex = new Texture(
      '/models/pale-bleak/textures/Material_baseColor_clean.webp',
      scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    cleanTex.hasAlpha = true;

    const school = schools[4] ?? schools[0];
    const count = 10;
    const items: RiggedFish3D[] = [];

    for (let i = 0; i < count; i += 1) {
      const entries = container.instantiateModelsToScene(
        (name) => `pale-bleak-3d-${i}-${name}`,
        false,
      );
      const holder = new TransformNode(`pale-bleak-holder-${i}`, scene);
      const modelPivot = new TransformNode(`pale-bleak-pivot-${i}`, scene);
      modelPivot.parent = holder;
      // Preserva a transformação interna do __root__ do glTF dentro do modelPivot
      // para manter o esqueleto de 43 ossos 100% com o dorso para cima (+Y) e focinho em +X
      modelPivot.scaling.set(9.0, 9.0, 9.0);

      for (const root of entries.rootNodes) {
        root.parent = modelPivot;
      }

      const mat = new StandardMaterial(`pale-bleak-mat-${i}`, scene);
      if (cleanTex) {
        mat.diffuseTexture = cleanTex;
        mat.opacityTexture = cleanTex;
        mat.useAlphaFromDiffuseTexture = true;
      } else if (albedoTex) {
        mat.diffuseTexture = albedoTex;
      }
      mat.diffuseColor = Color3.Black();
      mat.emissiveColor = new Color3(0.92, 0.97, 1.0);
      mat.specularColor = Color3.Black();
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.imageProcessingConfiguration = rawConfig;

      const childMeshes = holder.getChildMeshes().filter((m): m is Mesh => m instanceof Mesh);
      for (const m of childMeshes) {
        m.material = mat;
        m.renderingGroupId = 2;
        m.isPickable = false;
      }

      const animGroup = entries.animationGroups[0] ?? null;
      if (animGroup) {
        animGroup.start(true, 1.18 + (i % 4) * 0.14);
      }

      const row = i % 3;
      const col = Math.floor(i / 3);
      const offsetU = (col - 1) * 0.040 + (row % 2) * 0.015;
      const offsetV = (row - 1) * 0.024 + (col % 2) * 0.009;
      const offsetDepth = ((i % 4) - 1.5) * 0.06;

      // Os últimos 4 peixes 3D são "depth runners" dedicados a nadar reto para a frente (sentido câmera)
      // e reto para trás (sentido fundo do mar), além de diagonais 3D
      const isDepthRunner = i >= 6;
      const runnerU = 0.24 + (i - 6) * 0.17;
      const runnerV = 0.46 + ((i % 2) * 0.11);
      const runnerStartDepth = i % 2 === 0 ? 0.14 : 0.88;
      const runnerTargetDepth = i % 2 === 0 ? 0.92 : 0.12;

      const initU = isDepthRunner ? runnerU : clamp(school.currentU + offsetU, 0.08, 0.92);
      const initV = isDepthRunner ? runnerV : clamp(school.currentV + offsetV, 0.36, 0.82);
      const initDepth = isDepthRunner ? runnerStartDepth : clamp(school.currentDepth + offsetDepth, 0.08, 0.95);
      const initDir: 1 | -1 = school.velU >= 0 ? 1 : -1;
      const depthZ = PLANE_Z + 1.8 - initDepth * 3.6;

      const wp1: FishWaypoint3D = { u: initU, v: initV, depth: initDepth };
      const wp0: FishWaypoint3D = {
        u: initU,
        v: initV,
        depth: clamp(initDepth + (runnerStartDepth < 0.5 ? -0.10 : 0.10), 0.06, 0.96),
      };
      const wp2: FishWaypoint3D = isDepthRunner
        ? { u: clamp(initU + (i % 2 === 0 ? 0.02 : -0.02), 0.14, 0.86), v: initV, depth: runnerTargetDepth }
        : generateNext3DFishWaypoint(100 + i, 1, wp1, initDir, false);
      const wp3 = generateNext3DFishWaypoint(100 + i, 2, wp2, initDir, isDepthRunner);

      // Yaw inicial: no modelo pale-bleak, yaw = +PI/2 aponta reto para a câmera (-Z),
      // yaw = -PI/2 aponta reto para o fundo (+Z), yaw = 0 aponta para a direita (+X), yaw = PI para a esquerda (-X)
      const initYaw = isDepthRunner
        ? (runnerTargetDepth > runnerStartDepth ? Math.PI * 0.5 : -Math.PI * 0.5)
        : (initDir === 1 ? 0 : Math.PI);

      const isHardy = i % 3 === 0;
      const threshold = isHardy ? 12 : 22 + ((i * 21) % 65);

      items.push({
        id: 100 + i,
        schoolId: 4,
        isDepthRunner,
        isHardy,
        holder,
        meshes: childMeshes,
        materials: [mat],
        animGroup,
        threshold,
        individualScale: 0.92 + (i % 4) * 0.08,
        baseTint: new Color3(0.92, 0.97, 1.0),
        formationOffsetU: offsetU,
        formationOffsetV: offsetV,
        formationOffsetDepth: offsetDepth,
        scatterOffsetU: 0,
        scatterOffsetV: 0,
        scatterVelU: 0,
        scatterVelV: 0,
        scaredTimer: 0,
        speed: 0.24 + (i % 4) * 0.014,
        phase: i * 1.31,
        swimPhase: i * 0.52,
        currentYaw: initYaw,
        headTurn: initDir,
        tailTurn: initDir,
        wp0,
        wp1,
        wp2,
        wp3,
        segmentProgress: (i * 0.19) % 0.65,
        segmentDuration: 1.45,
        waypointCounter: 3,
        currentScreenX: initU,
        currentScreenY: initV,
        currentDepth: initDepth,
        currentDir: initDir,
        depthZ,
        seabedScreenY: 0.72 + initDepth * 0.17,
        deathStage: 'alive',
        deadElapsed: 0,
        stageElapsed: 0,
        verticalVelocity: 0,
      });
    }

    return items;
  } catch (err) {
    console.warn('Falha ao carregar modelo 3D pale-bleak:', err);
    return [];
  }
}

/**
 * Sorteia o tempo (em segundos reais de relógio) entre aparições do tubarão:
 * - Primeira aparição no início: entre 4s e 7s (para o usuário ver o tubarão de imediato ao iniciar)
 * - Próximas aparições: entre 40s e 80s de tempo real (conforme solicitado pelo usuário)
 */
function sampleSharkCooldownSeconds(isInitial = false): number {
  return isInitial ? 3 + Math.random() * 2 : 14 + Math.random() * 8;
}

/**
 * Carrega APENAS 1 modelo 3D de tubarão (/models/shark/shark.glb, gerado a partir de Shark_1.obj),
 * que aparece de forma equilibrada alternando entre:
 * 1. Surgir lá do fundo do centro reto para a câmera e virar de lado saindo de cena.
 * 2. Cruzar bem colado na câmera de surpresa (camera_flyby).
 */
async function load3DSharks(scene: Scene): Promise<SharkSwimmer3D[]> {
  try {
    const container = await LoadAssetContainerAsync('shark.glb', scene, {
      rootUrl: '/models/shark/',
    });
    if (scene.isDisposed) {
      container.dispose();
      return [];
    }
    const srcMesh = container.meshes.find(
      (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
    );
    if (!srcMesh) return [];

    const rawPos = srcMesh.getVerticesData(VertexBuffer.PositionKind);
    const rawNorm = srcMesh.getVerticesData(VertexBuffer.NormalKind);
    const rawCol = srcMesh.getVerticesData(VertexBuffer.ColorKind);
    const rawIdx = srcMesh.getIndices();
    if (!rawPos || !rawNorm || !rawIdx) return [];

    // Normaliza as coordenadas extraídas para x ∈ [-0.5 (focinho), +0.5 (cauda)]
    const normPositions = new Float32Array(rawPos.length);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < rawPos.length; i += 3) {
      if (rawPos[i] < minX) minX = rawPos[i];
      if (rawPos[i] > maxX) maxX = rawPos[i];
    }
    const spanX = Math.max(0.001, maxX - minX);
    const midX = 0.5 * (minX + maxX);
    for (let i = 0; i < rawPos.length; i += 3) {
      normPositions[i] = (rawPos[i] - midX) / spanX;
      normPositions[i + 1] = rawPos[i + 1] / spanX;
      normPositions[i + 2] = rawPos[i + 2] / spanX;
    }

    const rawConfig = createRawImageProcessing();
    const holder = new TransformNode('tubarao-3d-holder-0', scene);
    const mesh = new Mesh('tubarao-3d-mesh-0', scene);
    const vData = new VertexData();
    vData.positions = new Float32Array(normPositions);
    vData.normals = new Float32Array(rawNorm);
    if (rawCol) {
      const vCount = normPositions.length / 3;
      if (rawCol.length === vCount * 3) {
        const rgba = new Float32Array(vCount * 4);
        for (let v = 0; v < vCount; v += 1) {
          rgba[v * 4] = rawCol[v * 3];
          rgba[v * 4 + 1] = rawCol[v * 3 + 1];
          rgba[v * 4 + 2] = rawCol[v * 3 + 2];
          rgba[v * 4 + 3] = 1.0;
        }
        vData.colors = rgba;
      } else {
        vData.colors = new Float32Array(rawCol);
      }
    }
    vData.indices = Uint32Array.from(rawIdx);
    vData.applyToMesh(mesh, true);

    mesh.useVertexColors = true;
    mesh.hasVertexAlpha = false;
    mesh.renderingGroupId = 2;
    mesh.isPickable = false;
    mesh.parent = holder;

    const mat = new StandardMaterial('tubarao-3d-mat-0', scene);
    mat.diffuseColor = new Color3(0.84, 0.92, 0.98);
    mat.ambientColor = new Color3(0.58, 0.68, 0.76);
    mat.emissiveColor = new Color3(0.06, 0.14, 0.20);
    mat.specularColor = new Color3(0.22, 0.30, 0.36);
    mat.specularPower = 36;
    mat.backFaceCulling = false;
    mat.imageProcessingConfiguration = rawConfig;
    mesh.material = mat;

    // Começa oculto em cooldown para só aparecer de surpresa após o intervalo inicial
    mesh.setEnabled(false);

    return [
      {
        id: 200,
        holder,
        mesh,
        material: mat,
        basePositions: new Float32Array(normPositions),
        workingPositions: new Float32Array(normPositions.length),
        threshold: 8,
        baseScale: 5.2,
        swimFreq: 4.2,
        tailPhase: 0,
        patrolStage: 'cooldown',
        // Inicia com 'camera_flyby' para que a primeira aparição seja garantidamente 'approaching' (vindo de trás)
        lastPatrolMode: 'camera_flyby',
        patrolElapsed: 0,
        cooldownDuration: sampleSharkCooldownSeconds(true),
        exitDir: Math.random() < 0.5 ? -1 : 1,
        flybyScreenY: 0.48 + Math.random() * 0.14,
        isScaring: false,
        turnBend: 0,
        currentScreenX: 0.50,
        currentScreenY: 0.49,
        currentDepth: 0.14,
        depthZ: PLANE_Z + 1.4,
        seabedScreenY: 0.84,
        deathStage: 'alive',
        deadElapsed: 0,
        stageElapsed: 0,
        verticalVelocity: 0,
      },
    ];
  } catch (err) {
    console.warn('Falha ao carregar modelo 3D do tubarão:', err);
    return [];
  }
}

function createBubbleTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture('bolha-ar-dynamic-tex', { width: size, height: size }, scene, true);
  const ctx = tex.getContext();
  const img = ctx.getImageData(0, 0, size, size);

  const cx = size * 0.5;
  const cy = size * 0.5;
  const maxR = size * 0.45;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r = Math.hypot(dx, dy);
      const idx = (y * size + x) * 4;

      if (r > 1.05) {
        img.data[idx] = 0;
        img.data[idx + 1] = 0;
        img.data[idx + 2] = 0;
        img.data[idx + 3] = 0;
        continue;
      }

      const rim = Math.pow(clamp(1 - Math.abs(r - 0.86) / 0.16), 1.8) * 0.85;
      const innerFill = r < 0.86 ? 0.06 + Math.pow(r / 0.86, 3) * 0.26 : 0;

      const hx1 = (x - size * 0.37) / (size * 0.13);
      const hy1 = (y - size * 0.34) / (size * 0.09);
      const spec1 = Math.exp(-(hx1 * hx1 + hy1 * hy1) * 1.9) * 0.96;

      const hx2 = (x - size * 0.65) / (size * 0.10);
      const hy2 = (y - size * 0.68) / (size * 0.07);
      const spec2 = Math.exp(-(hx2 * hx2 + hy2 * hy2) * 2.2) * 0.48;

      const alpha = clamp(rim + innerFill + spec1 + spec2);
      const bright = clamp(0.76 + (spec1 + rim * 0.4) * 0.3);

      img.data[idx] = Math.round(clamp(bright * 0.88 + spec1 * 0.25) * 255);
      img.data[idx + 1] = Math.round(clamp(bright * 0.98 + spec1 * 0.15) * 255);
      img.data[idx + 2] = 255;
      img.data[idx + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  tex.hasAlpha = true;
  tex.update(true);
  return tex;
}

function createAirBubbles(scene: Scene): AirBubble[] {
  const bubbleTex = createBubbleTexture(scene);

  const mat = new StandardMaterial('bolha-ar-mat', scene);
  mat.diffuseTexture = bubbleTex;
  mat.opacityTexture = bubbleTex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.diffuseColor = Color3.Black();
  mat.emissiveColor = new Color3(0.94, 0.99, 1.0);
  mat.specularColor = Color3.Black();
  mat.disableLighting = true;
  mat.disableDepthWrite = true;
  mat.backFaceCulling = false;
  mat.imageProcessingConfiguration = createRawImageProcessing();

  const columns = [
    { screenX: 0.125, maxScreenY: 0.56, minScreenY: 0.285, count: 22, scale: 1.25 },
    { screenX: 0.372, maxScreenY: 0.64, minScreenY: 0.295, count: 18, scale: 0.92 },
    { screenX: 0.478, maxScreenY: 0.66, minScreenY: 0.295, count: 20, scale: 0.96 },
    { screenX: 0.838, maxScreenY: 0.58, minScreenY: 0.285, count: 22, scale: 1.28 },
  ];

  const bubbles: AirBubble[] = [];
  for (const [colIdx, col] of columns.entries()) {
    for (let i = 0; i < col.count; i += 1) {
      const diameter = (0.075 + ((i * 7 + colIdx * 3) % 9) * 0.020) * col.scale;
      const plane = MeshBuilder.CreatePlane(`bolha-ar-${colIdx}-${i}`, {
        size: diameter,
        sideOrientation: Mesh.DOUBLESIDE,
      }, scene);
      plane.material = mat;
      plane.renderingGroupId = 2;
      plane.isPickable = false;

      const jitterX = ((i % 5) - 2) * 0.0065;
      bubbles.push({
        mesh: plane,
        emitterScreenX: col.screenX + jitterX,
        minScreenY: col.minScreenY,
        maxScreenY: col.maxScreenY,
        depthZ: PLANE_Z - 0.6,
        speed: 0.068 + (i % 6) * 0.015,
        phase: i / col.count + colIdx * 0.27,
        wobbleAmp: 0.0048 + (i % 4) * 0.0018,
        wobbleFreq: 1.8 + (i % 5) * 0.38,
        baseScale: 0.78 + ((i * 13) % 7) * 0.09,
      });
    }
  }

  return bubbles;
}

/**
 * Gera 8 texturas de alta resolução (128×128) com sombreamento 3D, refração interna,
 * chanfro desgastado e brilho especular para representar fielmente as classes reais
 * de microplásticos marinhos (fragmentos PET/HDPE/PP, pellets "nurdles", películas e microfibras).
 */
function createDetailedMicroplasticTextures(scene: Scene): Array<{
  tex: DynamicTexture;
  baseColor: Color3;
  aspectRatio: number;
}> {
  const size = 128;

  // Função auxiliar para desenhar um fragmento de polímero erodido com chanfro 3D e refração interna
  const buildFacetedShard = (
    name: string,
    vertices: Array<[number, number]>,
    coreRGB: [number, number, number],
    rimRGB: [number, number, number],
    translucent: boolean,
    aspectRatio = 1.0,
  ) => {
    const tex = new DynamicTexture(`mp-det-${name}`, { width: size, height: size }, scene, true);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size, size);

    // 1. Sombra suave / volume 3D interno
    ctx.save();
    ctx.beginPath();
    vertices.forEach(([vx, vy], idx) => {
      const px = vx * size;
      const py = vy * size;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.clip();

    const grad = ctx.createLinearGradient(size * 0.18, size * 0.15, size * 0.85, size * 0.88);
    const alphaCore = translucent ? 0.62 : 0.92;
    const alphaShadow = translucent ? 0.38 : 0.84;
    grad.addColorStop(0, `rgba(${rimRGB[0]}, ${rimRGB[1]}, ${rimRGB[2]}, ${alphaCore})`);
    grad.addColorStop(0.48, `rgba(${coreRGB[0]}, ${coreRGB[1]}, ${coreRGB[2]}, ${alphaCore})`);
    grad.addColorStop(1, `rgba(${Math.round(coreRGB[0] * 0.62)}, ${Math.round(coreRGB[1] * 0.65)}, ${Math.round(coreRGB[2] * 0.72)}, ${alphaShadow})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Crista interna de fratura (facetado 3D de plástico quebrado)
    ctx.strokeStyle = `rgba(${rimRGB[0]}, ${rimRGB[1]}, ${rimRGB[2]}, ${translucent ? 0.55 : 0.45})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(vertices[0][0] * size, vertices[0][1] * size);
    ctx.lineTo(size * 0.52, size * 0.48);
    ctx.lineTo(vertices[Math.floor(vertices.length / 2)][0] * size, vertices[Math.floor(vertices.length / 2)][1] * size);
    ctx.stroke();

    // Brilho especular solar na face superior esquerda
    const specGrad = ctx.createRadialGradient(size * 0.38, size * 0.34, 2, size * 0.38, size * 0.34, size * 0.28);
    specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    specGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.28)');
    specGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = specGrad;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    // Borda chanfrada iluminada (efeito Fresnel de polímero submerso)
    ctx.beginPath();
    vertices.forEach(([vx, vy], idx) => {
      if (idx === 0) ctx.moveTo(vx * size, vy * size);
      else ctx.lineTo(vx * size, vy * size);
    });
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = `rgba(${rimRGB[0]}, ${rimRGB[1]}, ${rimRGB[2]}, 0.94)`;
    ctx.stroke();

    tex.update(true);
    return {
      tex,
      baseColor: new Color3(1, 1, 1),
      aspectRatio,
    };
  };

  // 1. Lasca PET translúcida azul-gelo (garrafa plástica quebrada com entalhe irregular)
  const petClear = buildFacetedShard(
    'pet-translucent',
    [[0.12, 0.38], [0.44, 0.14], [0.62, 0.28], [0.88, 0.22], [0.78, 0.66], [0.48, 0.84], [0.24, 0.68]],
    [135, 215, 245],
    [235, 252, 255],
    true,
    1.32,
  );

  // 2. Lasca angular HDPE turquesa/ciano erodida
  const hdpeCyan = buildFacetedShard(
    'hdpe-cyan',
    [[0.14, 0.48], [0.36, 0.18], [0.84, 0.26], [0.70, 0.52], [0.86, 0.74], [0.42, 0.82], [0.18, 0.66]],
    [28, 188, 224],
    [185, 246, 255],
    false,
    1.24,
  );

  // 3. Estilhaço PP vermelho-coral / laranja desbotado pelo sol
  const ppCoral = buildFacetedShard(
    'pp-coral',
    [[0.22, 0.18], [0.68, 0.14], [0.88, 0.44], [0.64, 0.62], [0.52, 0.86], [0.16, 0.70], [0.26, 0.44]],
    [238, 92, 74],
    [255, 212, 198],
    false,
    1.18,
  );

  // 4. Fragmento polimérico amarelo-âmbar oxidado e pontiagudo
  const ppAmber = buildFacetedShard(
    'pp-amber',
    [[0.14, 0.30], [0.56, 0.12], [0.86, 0.34], [0.72, 0.78], [0.38, 0.68], [0.18, 0.82]],
    [244, 192, 52],
    [255, 244, 192],
    false,
    1.22,
  );

  // 5. Lasca irregular verde-esmeralda (rede/embalagem rígida fragmentada)
  const peGreen = buildFacetedShard(
    'pe-green',
    [[0.16, 0.42], [0.48, 0.16], [0.88, 0.32], [0.76, 0.64], [0.44, 0.86], [0.28, 0.62]],
    [52, 204, 152],
    [204, 255, 232],
    false,
    1.28,
  );

  // 6. Pellet industrial translúcido ("Nurdle" / lágrima-de-sereia lenticular 3D)
  const nurdleTex = new DynamicTexture('mp-det-nurdle', { width: size, height: size }, scene, true);
  nurdleTex.hasAlpha = true;
  {
    const ctx = nurdleTex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size, size);
    const nImg = ctx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (x - size * 0.5) / (size * 0.36);
        const dy = (y - size * 0.5) / (size * 0.31);
        const r = Math.hypot(dx, dy);
        if (r > 1.0) continue;
        const idx = (y * size + x) * 4;
        const z = Math.sqrt(Math.max(0, 1 - r * r));
        // Espalhamento subsuperficial leitoso + cáustica interna + brilho especular
        const light = clamp(-dx * 0.45 - dy * 0.55 + z * 0.72);
        const spec = Math.pow(clamp(-dx * 0.52 - dy * 0.60 + z * 0.62), 9.0);
        const caustic = Math.pow(clamp(dx * 0.4 + dy * 0.5 + (1 - z) * 0.5), 3.0) * 0.45;
        const rim = Math.pow(1 - z, 2.2) * 0.75;
        const edgeFade = smoothstep(1.0, 0.86, r);

        const base = 185 + light * 48 + caustic * 35 + spec * 70;
        nImg.data[idx] = Math.round(clamp(base * 0.96 + spec * 40, 0, 255));
        nImg.data[idx + 1] = Math.round(clamp(base * 0.99 + spec * 30, 0, 255));
        nImg.data[idx + 2] = Math.round(clamp(base * 1.04 + rim * 30, 0, 255));
        nImg.data[idx + 3] = Math.round(edgeFade * clamp(0.58 + rim * 0.34 + spec * 0.38) * 255);
      }
    }
    ctx.putImageData(nImg, 0, 0);
    nurdleTex.update(true);
  }

  // 7. Película plástica fina amassada e translúcida (pedaço de sacola degradada)
  const filmTex = new DynamicTexture('mp-det-film', { width: size, height: size }, scene, true);
  filmTex.hasAlpha = true;
  {
    const ctx = filmTex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size, size);
    const fImg = ctx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      const v = y / size;
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const dx = (u - 0.5) * 2.2;
        const dy = (v - 0.5) * 2.4;
        const warp = Math.sin(u * 14 + v * 9) * 0.18 + Math.cos(u * 9 - v * 16) * 0.14;
        const dist = Math.hypot(dx + warp * 0.5, dy - warp * 0.4);
        if (dist > 0.92) continue;

        const env = smoothstep(0.92, 0.52, dist);
        // Dobras translúcidas que refletem a luz
        const crease = Math.pow(0.5 + 0.5 * Math.sin(u * 24 + v * 19 + warp * 4), 3.0);
        const rim = smoothstep(0.55, 0.84, dist) * env;
        const alpha = env * clamp(0.36 + crease * 0.52 + rim * 0.48);
        const idx = (y * size + x) * 4;

        fImg.data[idx] = Math.round(205 + crease * 48);
        fImg.data[idx + 1] = Math.round(234 + crease * 21);
        fImg.data[idx + 2] = 255;
        fImg.data[idx + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(fImg, 0, 0);
    filmTex.update(true);
  }

  // 8. Microfibra têxtil sintética curvada com brilho ao longo do filamento
  const fiberTex = new DynamicTexture('mp-det-fiber', { width: size, height: size }, scene, true);
  fiberTex.hasAlpha = true;
  {
    const ctx = fiberTex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(130, 225, 255, 0.52)';
    ctx.lineWidth = 7.5;
    ctx.beginPath();
    ctx.moveTo(size * 0.12, size * 0.78);
    ctx.bezierCurveTo(size * 0.34, size * 0.12, size * 0.66, size * 0.88, size * 0.88, size * 0.22);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(245, 253, 255, 0.98)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(size * 0.12, size * 0.78);
    ctx.bezierCurveTo(size * 0.34, size * 0.12, size * 0.66, size * 0.88, size * 0.88, size * 0.22);
    ctx.stroke();
    fiberTex.update(true);
  }

  return [
    petClear,
    hdpeCyan,
    ppCoral,
    ppAmber,
    peGreen,
    { tex: nurdleTex, baseColor: new Color3(1, 1, 1), aspectRatio: 1.18 },
    { tex: filmTex, baseColor: new Color3(1, 1, 1), aspectRatio: 1.32 },
    { tex: fiberTex, baseColor: new Color3(1, 1, 1), aspectRatio: 1.45 },
  ];
}

/**
 * Cria o sistema de partículas de microplásticos em 3 camadas de profundidade
 * (fundo em suspensão fina, meia-água detalhada com rotação 3D e primeiro plano com paralaxe).
 */
function createMicroplastics(scene: Scene): MicroplasticParticle[] {
  const rawConfig = createRawImageProcessing();
  const variants = createDetailedMicroplasticTextures(scene);
  const items: MicroplasticParticle[] = [];
  const totalParticles = 195;

  for (let i = 0; i < totalParticles; i += 1) {
    const variant = variants[i % variants.length];
    // Cada partícula possui material próprio para permitir cintilação especular individual ao girar em 3D
    const mat = new StandardMaterial(`microplastico-inst-mat-${i}`, scene);
    mat.diffuseTexture = variant.tex;
    mat.opacityTexture = variant.tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.diffuseColor = Color3.Black();
    mat.emissiveColor = variant.baseColor.clone();
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;
    mat.imageProcessingConfiguration = rawConfig;

    // 3 camadas de profundidade (0 = fundo em suspensão, 1 = meia-água detalhada, 2 = primeiro plano com paralaxe)
    const depthTier = i < 78 ? 0 : i < 168 ? 1 : 2;
    const baseScale = depthTier === 0
      ? 0.12 + hash2D(i, 17) * 0.07
      : depthTier === 1
        ? 0.19 + hash2D(i, 19) * 0.11
        : 0.28 + hash2D(i, 23) * 0.10;
    const depthZ = depthTier === 0
      ? PLANE_Z + 0.55
      : depthTier === 1
        ? PLANE_Z - 0.55 - (i % 5) * 0.05
        : PLANE_Z - 1.25;
    const layerAlpha = depthTier === 0 ? 0.72 : depthTier === 1 ? 0.96 : 0.84;

    const mesh = MeshBuilder.CreatePlane(`microplastico-${i}`, {
      width: baseScale * variant.aspectRatio,
      height: baseScale,
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    mesh.material = mat;
    mesh.renderingGroupId = 2;
    mesh.isPickable = false;
    mesh.visibility = 0;

    // Distribuição vertical concentrada na zona fótica superior e média (onde os peixes confundem com plâncton)
    const vRand = Math.pow(hash2D(i, 31), 1.08);
    const screenY = 0.295 + vRand * 0.56;
    const screenX = 0.03 + hash2D(i, 43) * 0.94;

    items.push({
      mesh,
      material: mat,
      baseColor: variant.baseColor.clone(),
      u: screenX,
      v: screenY,
      vx: 0,
      vy: 0,
      depthZ,
      baseScale: 1.0,
      aspectRatio: variant.aspectRatio,
      tumbleSpeedX: 0.9 + hash2D(i, 59) * 2.2,
      tumbleSpeedY: 0.8 + hash2D(i, 61) * 2.0,
      rotSpeedZ: (i % 2 === 0 ? 1 : -1) * (0.35 + hash2D(i, 71) * 1.1),
      phase: hash2D(i, 83) * Math.PI * 2,
      // Alguns polímeros (PE/PP) são levemente positivos em flutuabilidade, outros (PET/PVC) afundam devagar
      buoyancyDrift: (hash2D(i, 97) - 0.48) * 0.006,
      layerAlpha,
      threshold: (i / totalParticles) * 0.88,
    });
  }

  return items;
}

export class BabylonOceanRuntime {
  readonly backend: RendererBackend;
  private readonly scene: Scene;
  private readonly camera: FreeCamera;
  private readonly backdrop: { mesh: Mesh; material: StandardMaterial };
  private readonly coralBleachLayer: { mesh: Mesh; material: StandardMaterial };
  private readonly sandCausticsSystem: SandCausticsSystem;
  private readonly oilSpillSystem: OilSpillSystem;
  private readonly sewageSystem: { veilMesh: Mesh; plumes: SewagePlume[] };
  private schools: FishSchool3D[];
  private readonly fishes: FishSwimmer[];
  private riggedFishes3D: RiggedFish3D[] = [];
  private sharks3D: SharkSwimmer3D[] = [];
  private readonly bubbles: AirBubble[];
  private readonly microplastics: MicroplasticParticle[];
  private state: SimulationState;
  private elapsed = 0;
  private aspect = REFERENCE_ASPECT;
  private disposed = false;

  /** Intensidades visuais suavizadas (respondem tanto à meta aplicada quanto ao ambiente) */
  private visualOil = 0;
  private visualSewage = 0;
  private visualMicroplastics = 0;
  private visualCoralBleach = 0;

  private constructor(
    private readonly engine: Awaited<ReturnType<typeof createOceanEngine>>['engine'],
    backend: RendererBackend,
    state: SimulationState,
  ) {
    this.backend = backend;
    this.state = state;
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.02, 0.25, 0.44, 1);
    this.scene.ambientColor = new Color3(1, 1, 1);
    this.scene.fogMode = Scene.FOGMODE_NONE;

    this.camera = new FreeCamera('camera-oceano', new Vector3(0, 0, 0), this.scene);
    this.camera.fov = CAMERA_FOV;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 200;
    this.camera.setTarget(new Vector3(0, 0, 100));
    this.scene.activeCamera = this.camera;

    const hemi = new HemisphericLight('luz-ambiente', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 1.2;
    const sun = new DirectionalLight('luz-solar', new Vector3(-0.2, -0.8, 0.5), this.scene);
    sun.intensity = 1.5;

    this.backdrop = createBackdrop(this.scene, this.camera);
    this.coralBleachLayer = createCoralBleachingLayer(this.scene, this.camera);
    this.sandCausticsSystem = createSandCausticsSystem(this.scene);
    this.oilSpillSystem = createOilSpillSystem(this.scene, this.camera);
    this.sewageSystem = createSewageSystem(this.scene, this.camera);
    this.schools = createFishSchools3D();
    this.fishes = createAllFishes(this.scene, this.schools);
    this.bubbles = createAirBubbles(this.scene);
    this.microplastics = createMicroplastics(this.scene);

    this.scene.skipPointerMovePicking = true;
    this.resize();
  }

  static async create(canvas: HTMLCanvasElement, state: SimulationState) {
    const { engine, backend } = await createOceanEngine(canvas);
    const runtime = new BabylonOceanRuntime(engine, backend, state);
    engine.runRenderLoop(() => runtime.render());

    // Carregamento não-bloqueante em segundo plano para o oceano abrir instantaneamente (< 100ms) no celular
    Promise.all([
      loadRiggedPaleBleakFishes(runtime.scene, runtime.schools),
      load3DSharks(runtime.scene),
    ])
      .then(([riggedFishes, sharks]) => {
        if (!runtime.disposed) {
          runtime.riggedFishes3D = riggedFishes;
          runtime.sharks3D = sharks;
        }
      })
      .catch((err) => {
        console.warn('Falha ao carregar modelos 3D em segundo plano:', err);
      });

    return runtime;
  }

  updateState(state: SimulationState) {
    const prevDays = this.state.elapsedDays;
    this.state = state;
    // Se o estado foi reiniciado (tempo voltou a 0 de um valor anterior), restaura o recife imediatamente
    if (prevDays > 0.05 && state.elapsedDays < 0.01) {
      this.resetReefLife();
    }
  }

  /**
   * Restaura imediatamente a vida do recife:
   * - Cardumes voltam a posições bem distribuídas e ativas pela baía
   * - Ressuscita todos os peixes, reabilitando malhas e reiniciando animações esqueléticas
   * - Garante que o mar nunca fique vazio após um reset ou mudança de compartimento
   */
  public resetReefLife() {
    this.schools = createFishSchools3D();

    for (const fish of this.fishes) {
      fish.deathStage = 'alive';
      fish.deadElapsed = 0;
      fish.stageElapsed = 0;
      fish.verticalVelocity = 0;
      fish.scatterOffsetU = 0;
      fish.scatterOffsetV = 0;
      fish.scatterVelU = 0;
      fish.scatterVelV = 0;
      fish.scaredTimer = 0;

      const school = this.schools[fish.schoolId] ?? this.schools[0];
      fish.currentScreenX = clamp(school.currentU + fish.formationOffsetU, 0.06, 0.94);
      fish.currentScreenY = clamp(school.currentV + fish.formationOffsetV, 0.35, 0.84);
      fish.currentDepth = clamp(school.currentDepth + fish.formationOffsetDepth, 0.08, 0.95);
      fish.depthZ = PLANE_Z + 1.8 - fish.currentDepth * 3.6;
      fish.currentDir = school.velU >= 0 ? 1 : -1;
      fish.headTurn = fish.currentDir;
      fish.tailTurn = fish.currentDir;

      const perspectiveScale = fish.individualScale * (0.34 + Math.pow(fish.currentDepth, 1.32) * 1.38);
      const worldScale = perspectiveScale * (fish.depthZ / PLANE_Z);
      fish.holder.position.copyFrom(screenToWorld(fish.currentScreenX, fish.currentScreenY, fish.depthZ, this.aspect));
      fish.holder.scaling.set(worldScale, worldScale, 1);
      fish.holder.rotation.set(0, 0, 0);

      fish.healthy.mesh.setEnabled(true);
      fish.healthy.mesh.visibility = 1.0;
      fish.stressed.mesh.setEnabled(false);
      fish.stressed.mesh.visibility = 0.0;
      fish.dead.mesh.setEnabled(false);
      fish.dead.mesh.visibility = 0.0;
      fish.healthy.material.emissiveColor = fish.baseTint.clone();
    }

    for (let i = 0; i < this.riggedFishes3D.length; i += 1) {
      const fish = this.riggedFishes3D[i];
      fish.deathStage = 'alive';
      fish.deadElapsed = 0;
      fish.stageElapsed = 0;
      fish.verticalVelocity = 0;
      fish.scatterOffsetU = 0;
      fish.scatterOffsetV = 0;
      fish.scatterVelU = 0;
      fish.scatterVelV = 0;
      fish.scaredTimer = 0;

      const school = this.schools[fish.schoolId] ?? this.schools[0];
      if (fish.isDepthRunner) {
        fish.currentScreenX = 0.24 + (i - 6) * 0.17;
        fish.currentScreenY = 0.46 + ((i % 2) * 0.11);
        fish.currentDepth = i % 2 === 0 ? 0.20 : 0.85;
        fish.segmentProgress = 0;
      } else {
        fish.currentScreenX = clamp(school.currentU + fish.formationOffsetU, 0.08, 0.92);
        fish.currentScreenY = clamp(school.currentV + fish.formationOffsetV, 0.36, 0.82);
        fish.currentDepth = clamp(school.currentDepth + fish.formationOffsetDepth, 0.08, 0.95);
      }
      fish.depthZ = PLANE_Z + 1.8 - fish.currentDepth * 3.6;
      fish.currentDir = school.velU >= 0 ? 1 : -1;
      fish.currentYaw = fish.currentDir === 1 ? 0 : Math.PI;

      const perspectiveScale = fish.individualScale * (0.38 + Math.pow(fish.currentDepth, 1.30) * 1.38);
      const worldScale = perspectiveScale * (fish.depthZ / PLANE_Z);
      fish.holder.position.copyFrom(screenToWorld(fish.currentScreenX, fish.currentScreenY, fish.depthZ, this.aspect));
      fish.holder.scaling.set(worldScale, worldScale, worldScale);
      fish.holder.rotation.set(0, fish.currentYaw, 0);

      for (const m of fish.meshes) {
        m.setEnabled(true);
        m.visibility = 1.0;
      }
      for (const mat of fish.materials) {
        mat.emissiveColor = fish.baseTint.clone();
        mat.alpha = 1.0;
      }

      if (fish.animGroup) {
        fish.animGroup.stop();
        fish.animGroup.start(true, 1.18 + (i % 4) * 0.14);
      }
    }

    for (const shark of this.sharks3D) {
      shark.deathStage = 'alive';
      shark.deadElapsed = 0;
      shark.stageElapsed = 0;
      shark.verticalVelocity = 0;
      shark.patrolStage = 'cooldown';
      shark.patrolElapsed = 0;
      shark.cooldownDuration = sampleSharkCooldownSeconds(true);
      shark.isScaring = false;
      shark.mesh.setEnabled(false);
    }
  }

  resize() {
    this.engine.resize();
    const width = this.engine.getRenderWidth(true) || 1672;
    const height = this.engine.getRenderHeight(true) || 941;
    this.aspect = width / Math.max(1, height);
    // Escala uniforme para cobrir a viewport sem distorcer nem esticar a imagem verticalmente no celular
    const uniformScale = Math.max(this.aspect / REFERENCE_ASPECT, 1);
    this.backdrop.mesh.scaling.set(uniformScale, uniformScale, 1);
    this.coralBleachLayer.mesh.scaling.set(uniformScale, uniformScale, 1);
    this.oilSpillSystem.shadowMesh.scaling.set(uniformScale, uniformScale, 1);
    this.sewageSystem.veilMesh.scaling.set(uniformScale, uniformScale, 1);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }

  private render() {
    if (this.disposed) return;
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
    this.elapsed += dt;

    this.updateScientificEffects(dt);
    this.updateFishSchools3D(dt);
    this.updateSharks3D(dt);
    this.updateFishes(dt);
    this.updateRiggedFishes3D(dt);
    this.updateBubbles();

    this.scene.render();
  }

  /**
   * Atualiza os centros dos cardumes 3D (`FishSchool3D`), permitindo que cada cardume
   * nade coeso pelo recife (do fundo para a frente, para os lados, cima e baixo).
   */
  private updateFishSchools3D(dt: number) {
    const overallHealth = this.state.health.fish;
    const stressRatio = clamp((70 - overallHealth) / 70);
    const speedMul = 0.55 + (1 - stressRatio) * 0.45;

    for (const school of this.schools) {
      const stepAdvance = dt * school.speed * speedMul;
      school.segmentProgress += stepAdvance / school.segmentDuration;

      while (school.segmentProgress >= 1) {
        school.segmentProgress -= 1;
        school.wp0 = school.wp1;
        school.wp1 = school.wp2;
        school.wp2 = school.wp3;
        const prevDir: 1 | -1 = school.wp2.u >= school.wp1.u ? 1 : -1;
        school.wp3 =
          school.id === 4
            ? generateNext3DFishWaypoint(school.id + 300, school.waypointCounter, school.wp2, prevDir, false)
            : generateNextFishWaypoint(school.id + 300, school.waypointCounter, school.wp2, prevDir);
        school.waypointCounter += 1;

        const dist = Math.hypot(
          school.wp2.u - school.wp1.u,
          (school.wp2.v - school.wp1.v) * 1.15,
          (school.wp2.depth - school.wp1.depth) * 0.42,
        );
        school.segmentDuration = clamp(dist * 3.3, 0.90, 2.20);
      }

      const spline = evaluateFishSpline3D(
        school.wp0,
        school.wp1,
        school.wp2,
        school.wp3,
        school.segmentProgress,
        school.phase,
      );

      school.currentU = spline.u;
      school.currentV = spline.v;
      school.currentDepth = spline.depth;
      school.velU = spline.velU;
      school.velV = spline.velV;
      school.velDepth = spline.velDepth;
    }
  }

  private updateFishes(dt: number) {
    const overallFishHealth = this.state.health.fish;
    const dissolvedOxygen = this.state.dissolvedOxygen ?? 7.12;
    // Anóxia severa (< 2.0 mg/L) ou colapso da fauna (<= 1.5%) é letal para TODOS os peixes (sem exceção de indivíduo resistente)
    const isAnoxicOrLethal = dissolvedOxygen < 2.0 || overallFishHealth <= 1.5;

    const deepWaterTint = mixColor(
      new Color3(0.16, 0.46, 0.68),
      new Color3(0.18, 0.50, 0.36),
      clamp(this.visualSewage * 0.65),
    );
    const activeShark = this.sharks3D[0];
    const sharkScaring = Boolean(activeShark && activeShark.isScaring && activeShark.deathStage === 'alive');

    for (const fish of this.fishes) {
      const speciesHealth = this.state.species[fish.species] ?? overallFishHealth;
      const health = Math.min(overallFishHealth, speciesHealth);

      const appearance = {
        root: { alpha: 1 },
        healthy: { alpha: 1 },
        stressed: { alpha: 0 },
        dead: { alpha: 0 },
        threshold: fish.threshold,
      };
      updateFishState(appearance, health);

      const isDead = isAnoxicOrLethal || (health <= fish.threshold || appearance.dead.alpha > 0.65);

      if (!isDead) {
        if (fish.deathStage !== 'alive') {
          fish.deathStage = 'alive';
          fish.deadElapsed = 0;
          fish.stageElapsed = 0;
          fish.verticalVelocity = 0;
          fish.scatterOffsetU = 0;
          fish.scatterOffsetV = 0;
          fish.scatterVelU = 0;
          fish.scatterVelV = 0;
          fish.scaredTimer = 0;

          const school = this.schools[fish.schoolId] ?? this.schools[0];
          fish.currentScreenX = clamp(school.currentU + fish.formationOffsetU, 0.06, 0.94);
          fish.currentScreenY = clamp(school.currentV + fish.formationOffsetV, 0.35, 0.84);
          fish.currentDepth = clamp(school.currentDepth + fish.formationOffsetDepth, 0.08, 0.95);
          fish.depthZ = PLANE_Z + 1.8 - fish.currentDepth * 3.6;
          fish.currentDir = school.velU >= 0 ? 1 : -1;
          fish.headTurn = fish.currentDir;
          fish.tailTurn = fish.currentDir;
        }

        fish.deadElapsed = 0;
        fish.stageElapsed = 0;
        fish.verticalVelocity = 0;

        const school = this.schools[fish.schoolId] ?? this.schools[0];
        const stressRatio = clamp((70 - health) / 70);
        const speedMul = 0.52 + (1 - stressRatio) * 0.48;
        fish.swimPhase += dt * fish.speed * speedMul;

        // Oscilação individual suave e serena dentro do cardume
        const indivWeaveU = Math.sin(fish.swimPhase * 0.75 + fish.phase) * 0.006;
        const indivWeaveV = Math.cos(fish.swimPhase * 0.65 + fish.phase * 1.3) * 0.005;
        const indivWeaveDepth = Math.sin(fish.swimPhase * 0.55 + fish.phase * 0.7) * 0.020;

        const baseTargetU = clamp(school.currentU + fish.formationOffsetU + indivWeaveU, 0.06, 0.94);
        const baseTargetV = clamp(school.currentV + fish.formationOffsetV + indivWeaveV, 0.34, 0.84);
        const depth = clamp(school.currentDepth + fish.formationOffsetDepth + indivWeaveDepth, 0.06, 0.97);

        // Reação de dispersão ao tubarão quando ele se aproxima
        if (sharkScaring && activeShark) {
          const dx = (baseTargetU + fish.scatterOffsetU) - activeShark.currentScreenX;
          const dy = (baseTargetV + fish.scatterOffsetV) - activeShark.currentScreenY;
          const dist2D = Math.hypot(dx, dy * 1.15);
          const scareRadius = 0.34;
          if (dist2D < scareRadius) {
            fish.scaredTimer = 3.4;
            let awayX = dx;
            let awayY = dy;
            if (Math.hypot(awayX, awayY) < 0.03) {
              awayX = fish.formationOffsetU >= 0 ? 0.12 : -0.12;
              awayY = (fish.id % 2 === 0 ? -1 : 1) * 0.08;
            }
            const norm = Math.max(0.001, Math.hypot(awayX, awayY));
            const urgency = (1 - dist2D / scareRadius) * (0.45 + activeShark.currentDepth * 0.65);
            const burst = 0.72 * urgency;
            fish.scatterVelU += (awayX / norm) * burst * dt * 5.2;
            fish.scatterVelV += (awayY / norm) * burst * dt * 4.0;
          }
        }

        if (fish.scaredTimer > 0) {
          fish.scaredTimer = Math.max(0, fish.scaredTimer - dt);
        }

        fish.scatterOffsetU = clamp(fish.scatterOffsetU + fish.scatterVelU * dt, -0.32, 0.32);
        fish.scatterOffsetV = clamp(fish.scatterOffsetV + fish.scatterVelV * dt, -0.22, 0.22);
        const velDamping = Math.exp(-dt * (fish.scaredTimer > 0 ? 2.4 : 4.8));
        fish.scatterVelU *= velDamping;
        fish.scatterVelV *= velDamping;

        if (fish.scaredTimer <= 0) {
          const regroupRate = 1 - Math.exp(-dt * 1.85);
          fish.scatterOffsetU *= 1 - regroupRate;
          fish.scatterOffsetV *= 1 - regroupRate;
        }

        const screenX = clamp(baseTargetU + fish.scatterOffsetU, 0.05, 0.95);
        const screenY = clamp(baseTargetV + fish.scatterOffsetV, 0.34, 0.85);

        const schoolDir: 1 | -1 = school.velU >= 0 ? 1 : -1;
        const currentDir = schoolDir;

        const tailFreq = fish.swimFreq + stressRatio * 0.8 + Math.hypot(school.velU, school.velV) * 2.2;
        fish.tailPhase += dt * tailFreq;

        fish.currentScreenX = screenX;
        fish.currentScreenY = screenY;
        fish.currentDepth = depth;
        fish.currentDir = currentDir;
        fish.seabedScreenY = 0.71 + depth * 0.18;

        const dynamicDepthZ = PLANE_Z + 1.8 - depth * 3.6;
        fish.depthZ = dynamicDepthZ;
        const perspectiveScale = fish.individualScale * (0.34 + Math.pow(depth, 1.32) * 1.38);
        const worldScale = perspectiveScale * (dynamicDepthZ / PLANE_Z);

        const worldPos = screenToWorld(screenX, screenY, dynamicDepthZ, this.aspect);
        fish.holder.position.copyFrom(worldPos);
        // O sprite original possui a cabeça no lado esquerdo (X < 0) e cauda no lado direito (X > 0).
        // Para nadar para a frente:
        // currentDir = 1 (direita)  -> scaling.x negativo para inverter e apontar a cabeça para a direita (+X)
        // currentDir = -1 (esquerda) -> scaling.x positivo mantendo a cabeça para a esquerda (-X)
        fish.holder.scaling.set(-worldScale * currentDir, worldScale, 1);

        const depthClarity = smoothstep(0.05, 0.72, depth);
        fish.healthy.material.emissiveColor = mixColor(deepWaterTint, fish.baseTint, depthClarity);
        fish.stressed.material.emissiveColor = mixColor(deepWaterTint, fish.stressedTint, depthClarity);

        // Inclinação suave e orgânica ao subir ou descer na coluna d'água
        const targetPitch = clamp(-school.velV * 1.5, -0.16, 0.16) * currentDir;
        fish.holder.rotation.z += (targetPitch - fish.holder.rotation.z) * (1 - Math.exp(-dt * 4.0));

        this.deformFishBody(fish, health, false);

        const hAlpha = appearance.healthy.alpha;
        const sAlpha = appearance.stressed.alpha;
        const dAlpha = appearance.dead.alpha;

        fish.healthy.mesh.setEnabled(hAlpha > 0.01);
        fish.healthy.mesh.visibility = hAlpha;

        fish.stressed.mesh.setEnabled(sAlpha > 0.01);
        fish.stressed.mesh.visibility = sAlpha;

        fish.dead.mesh.setEnabled(dAlpha > 0.01);
        fish.dead.mesh.visibility = dAlpha;
      } else {
        // Mecânica de morte do peixe:
        // 1. 'sinking': Morre, para de se mexer, vira de barriga para cima e afunda até o fundo
        // 2. 'bottom': Bate no fundo de areia, para e depois de um tempo some devagar
        if (fish.deathStage === 'alive') {
          fish.deathStage = 'sinking';
          fish.deadElapsed = 0;
          fish.stageElapsed = 0;
          fish.verticalVelocity = 0.015;
          fish.headTurn = fish.currentDir === 1 ? 1 : -1;
          fish.tailTurn = fish.headTurn;
        }

        fish.deadElapsed += dt;
        fish.stageElapsed += dt;

        const perspectiveScale = fish.individualScale * (0.34 + Math.pow(fish.currentDepth, 1.32) * 1.38);
        const worldScale = perspectiveScale * (fish.depthZ / PLANE_Z);
        const flipProgress = smoothstep(0.0, 0.55, fish.deadElapsed);
        fish.holder.scaling.x = -worldScale * fish.currentDir;
        fish.holder.scaling.y = worldScale * (1 - flipProgress * 2);

        let fadeAlpha = 1;

        if (fish.deathStage === 'sinking') {
          fish.verticalVelocity = Math.min(fish.verticalVelocity + dt * 0.085, 0.095);
          fish.currentScreenY = Math.min(
            fish.seabedScreenY,
            fish.currentScreenY + fish.verticalVelocity * dt,
          );
          fish.currentScreenX = clamp(
            fish.currentScreenX + Math.sin(fish.deadElapsed * 2.4 + fish.phase) * 0.0002,
            0.04,
            0.96,
          );
          fish.holder.rotation.z = 0.14 * Math.sin(fish.deadElapsed * 1.8 + fish.phase);

          if (fish.currentScreenY >= fish.seabedScreenY - 0.001) {
            fish.currentScreenY = fish.seabedScreenY;
            fish.deathStage = 'bottom';
            fish.stageElapsed = 0;
            fish.verticalVelocity = 0;
          }
        } else if (fish.deathStage === 'bottom') {
          // Bateu no fundo: permanece parado no leito de areia por ~2.2s e depois some devagar
          fish.currentScreenY = fish.seabedScreenY;
          fish.holder.rotation.z = 0.04;
          const bottomWaitSeconds = 2.2;
          const fadeDurationSeconds = 3.8;
          fadeAlpha = fish.stageElapsed <= bottomWaitSeconds
            ? 1
            : clamp(1 - (fish.stageElapsed - bottomWaitSeconds) / fadeDurationSeconds);

          if (fadeAlpha <= 0.01) {
            fish.deathStage = 'repopulating';
            fish.stageElapsed = 0;
            fadeAlpha = 0;
          }
        } else if (fish.deathStage === 'repopulating') {
          fadeAlpha = 0;
          // Recolonização biológica: peixes só podem migrar/repovoar se o ambiente for sustentável
          // (oxigênio >= 3.5 mg/L, saúde da fauna > 15% e sem anóxia)
          const repopulateCooldown = 5.0 + (fish.id % 5) * 1.5;
          const waterViable = dissolvedOxygen >= 3.5 && overallFishHealth > 15 && !isAnoxicOrLethal;
          const waterAcceptable = waterViable && health > Math.max(15, fish.threshold);
          if (fish.stageElapsed >= repopulateCooldown && waterAcceptable) {
            fish.deathStage = 'alive';
            fish.deadElapsed = 0;
            fish.stageElapsed = 0;
            fish.verticalVelocity = 0;

            const school = this.schools[fish.schoolId] ?? this.schools[0];
            const enterLeft = (fish.id % 2 === 0);
            fish.currentScreenX = enterLeft ? -0.05 : 1.05;
            fish.currentScreenY = clamp(school.currentV + fish.formationOffsetV, 0.36, 0.82);
            fish.currentDepth = clamp(school.currentDepth + fish.formationOffsetDepth, 0.12, 0.90);
            fish.depthZ = PLANE_Z + 1.8 - fish.currentDepth * 3.6;
            fish.currentDir = enterLeft ? 1 : -1;
            fish.headTurn = fish.currentDir;
            fish.tailTurn = fish.currentDir;
            fish.scatterOffsetU = 0;
            fish.scatterOffsetV = 0;
            fish.scatterVelU = 0;
            fish.scatterVelV = 0;
            fish.scaredTimer = 0;
          }
        }

        const worldPos = screenToWorld(fish.currentScreenX, fish.currentScreenY, fish.depthZ, this.aspect);
        fish.holder.position.copyFrom(worldPos);

        this.deformFishBody(fish, 0, true);

        fish.healthy.mesh.setEnabled(false);
        fish.stressed.mesh.setEnabled(false);
        fish.dead.mesh.setEnabled(fadeAlpha > 0.01);
        fish.dead.mesh.visibility = fadeAlpha;
      }
    }
  }

  private deformFishBody(fish: FishSwimmer, health: number, isDead: boolean) {
    const base = fish.basePositions;
    const out = fish.workingPositions;
    const count = base.length / 3;

    if (isDead) {
      for (let i = 0; i < count; i += 1) {
        out[i * 3] = base[i * 3];
        out[i * 3 + 1] = base[i * 3 + 1];
        out[i * 3 + 2] = base[i * 3 + 2];
      }
      if (fish.dead.mesh.isEnabled()) {
        fish.dead.mesh.updateVerticesData(VertexBuffer.PositionKind, out, false, false);
      }
      return;
    }

    const stress = clamp((70 - health) / 70);
    const ampY = fish.width * (0.032 + stress * 0.010);
    const ampZ = fish.width * 0.038;

    for (let i = 0; i < count; i += 1) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bz = base[i * 3 + 2];

      // normalizedX = 0 no focinho, 1 na ponta da cauda
      const normalizedX = clamp(bx / fish.width + 0.5);
      const tailWeight = clamp((normalizedX - 0.22) / 0.78);
      const weightSq = tailWeight * tailWeight;

      // Onda propulsiva suave da cabeça para a cauda (sem inversão ou distorções no eixo X)
      const wavePhase = fish.tailPhase - normalizedX * 4.2;
      const bodyWaveY = Math.sin(wavePhase) * ampY * weightSq;
      const bodyWaveZ = Math.cos(wavePhase) * ampZ * weightSq;

      out[i * 3] = bx;
      out[i * 3 + 1] = by + bodyWaveY;
      out[i * 3 + 2] = bz + bodyWaveZ;
    }

    for (const layer of [fish.healthy, fish.stressed, fish.dead]) {
      if (layer.mesh.isEnabled()) {
        layer.mesh.updateVerticesData(VertexBuffer.PositionKind, out, false, false);
      }
    }
  }

  /**
   * Atualiza os peixes 3D riggados (`cc0____pale_bleak_z` com 43 ossos e animação esqueletal),
   * capazes de nadar em cardume, fugir do tubarão e também nadar RETO para a frente (sentido da câmera)
   * e RETO para trás (sentido do fundo do mar), além de lado a lado, cima/baixo e diagonal!
   */
  private updateRiggedFishes3D(dt: number) {
    const overallHealth = this.state.health.fish;
    const dissolvedOxygen = this.state.dissolvedOxygen ?? 7.12;
    const isAnoxicOrLethal = dissolvedOxygen < 2.0 || overallHealth <= 1.5;

    const deepWaterEmissive = mixColor(
      new Color3(0.08, 0.26, 0.42),
      new Color3(0.10, 0.30, 0.20),
      clamp(this.visualSewage * 0.65),
    );
    const activeShark = this.sharks3D[0];
    const sharkScaring = Boolean(activeShark && activeShark.isScaring && activeShark.deathStage === 'alive');

    for (const fish of this.riggedFishes3D) {
      const isDead = isAnoxicOrLethal || (overallHealth <= fish.threshold);

      if (!isDead) {
        if (fish.deathStage !== 'alive') {
          fish.deathStage = 'alive';
          fish.deadElapsed = 0;
          fish.stageElapsed = 0;
          fish.verticalVelocity = 0;
          fish.scatterOffsetU = 0;
          fish.scatterOffsetV = 0;
          fish.scatterVelU = 0;
          fish.scatterVelV = 0;
          fish.scaredTimer = 0;

          const school = this.schools[fish.schoolId] ?? this.schools[0];
          fish.currentScreenX = clamp(school.currentU + fish.formationOffsetU, 0.08, 0.92);
          fish.currentScreenY = clamp(school.currentV + fish.formationOffsetV, 0.36, 0.82);
          fish.currentDepth = clamp(school.currentDepth + fish.formationOffsetDepth, 0.08, 0.95);
          fish.depthZ = PLANE_Z + 1.8 - fish.currentDepth * 3.6;
          fish.currentDir = school.velU >= 0 ? 1 : -1;
          fish.currentYaw = fish.currentDir === 1 ? 0 : Math.PI;
          fish.segmentProgress = 0;

          for (const m of fish.meshes) {
            m.setEnabled(true);
            m.visibility = 1.0;
          }
        }

        if (fish.animGroup && !fish.animGroup.isPlaying) {
          fish.animGroup.start(true, 1.18 + (fish.id % 4) * 0.14);
        }

        fish.deadElapsed = 0;
        fish.stageElapsed = 0;
        fish.verticalVelocity = 0;

        const stressRatio = clamp((70 - overallHealth) / 70);
        const speedMul = 0.54 + (1 - stressRatio) * 0.46;
        const stepAdvance = dt * fish.speed * speedMul;
        fish.swimPhase += stepAdvance;

        let baseTargetU: number;
        let baseTargetV: number;
        let depth: number;
        let refVelU: number;
        let refVelV: number;
        let refVelDepth: number;

        if (fish.isDepthRunner) {
          // Peixes 3D que nadam prioritariamente reto para a frente (sentido câmera) e reto para trás (sentido fundo)
          fish.segmentProgress += stepAdvance / fish.segmentDuration;
          while (fish.segmentProgress >= 1) {
            fish.segmentProgress -= 1;
            fish.wp0 = fish.wp1;
            fish.wp1 = fish.wp2;
            fish.wp2 = fish.wp3;
            const prevDir: 1 | -1 = fish.wp2.u >= fish.wp1.u ? 1 : -1;
            fish.wp3 = generateNext3DFishWaypoint(fish.id, fish.waypointCounter, fish.wp2, prevDir, true);
            fish.waypointCounter += 1;

            const dist = Math.hypot(
              fish.wp2.u - fish.wp1.u,
              (fish.wp2.v - fish.wp1.v) * 1.15,
              (fish.wp2.depth - fish.wp1.depth) * 0.55,
            );
            fish.segmentDuration = clamp(dist * 3.0, 0.95, 2.15);
          }

          const spline = evaluateFishSpline3D(
            fish.wp0,
            fish.wp1,
            fish.wp2,
            fish.wp3,
            fish.segmentProgress,
            fish.phase,
          );
          baseTargetU = spline.u;
          baseTargetV = spline.v;
          depth = spline.depth;
          refVelU = spline.velU;
          refVelV = spline.velV;
          refVelDepth = spline.velDepth;
        } else {
          // Cardume 3D coeso que também faz trechos para frente/trás, lados e diagonais
          const school = this.schools[fish.schoolId] ?? this.schools[0];
          const indivWeaveU = Math.sin(fish.swimPhase * 2.5 + fish.phase) * 0.015;
          const indivWeaveV = Math.cos(fish.swimPhase * 2.9 + fish.phase * 1.2) * 0.011;
          const indivWeaveDepth = Math.sin(fish.swimPhase * 2.1 + fish.phase * 0.8) * 0.05;

          baseTargetU = clamp(school.currentU + fish.formationOffsetU + indivWeaveU, 0.07, 0.93);
          baseTargetV = clamp(school.currentV + fish.formationOffsetV + indivWeaveV, 0.35, 0.82);
          depth = clamp(school.currentDepth + fish.formationOffsetDepth + indivWeaveDepth, 0.07, 0.96);
          refVelU = school.velU;
          refVelV = school.velV;
          refVelDepth = school.velDepth;
        }

        // Fuga do tubarão e reagrupamento posterior
        if (sharkScaring && activeShark) {
          const dx = (baseTargetU + fish.scatterOffsetU) - activeShark.currentScreenX;
          const dy = (baseTargetV + fish.scatterOffsetV) - activeShark.currentScreenY;
          const dist2D = Math.hypot(dx, dy * 1.15);
          const scareRadius = 0.36;
          if (dist2D < scareRadius) {
            fish.scaredTimer = 3.5;
            let awayX = dx;
            let awayY = dy;
            if (Math.hypot(awayX, awayY) < 0.03) {
              awayX = (fish.id % 2 === 0 ? 1 : -1) * 0.14;
              awayY = -0.09;
            }
            const norm = Math.max(0.001, Math.hypot(awayX, awayY));
            const urgency = (1 - dist2D / scareRadius) * (0.5 + activeShark.currentDepth * 0.6);
            fish.scatterVelU += (awayX / norm) * 0.78 * urgency * dt * 5.0;
            fish.scatterVelV += (awayY / norm) * 0.78 * urgency * dt * 4.0;
          }
        }

        if (fish.scaredTimer > 0) {
          fish.scaredTimer = Math.max(0, fish.scaredTimer - dt);
        }

        fish.scatterOffsetU = clamp(fish.scatterOffsetU + fish.scatterVelU * dt, -0.34, 0.34);
        fish.scatterOffsetV = clamp(fish.scatterOffsetV + fish.scatterVelV * dt, -0.22, 0.22);
        const velDamping = Math.exp(-dt * (fish.scaredTimer > 0 ? 2.3 : 4.6));
        fish.scatterVelU *= velDamping;
        fish.scatterVelV *= velDamping;

        if (fish.scaredTimer <= 0) {
          const regroupRate = 1 - Math.exp(-dt * 1.85);
          fish.scatterOffsetU *= 1 - regroupRate;
          fish.scatterOffsetV *= 1 - regroupRate;
        }

        const prevX = fish.currentScreenX;
        const prevY = fish.currentScreenY;
        const prevDepth = fish.currentDepth;

        const screenX = clamp(baseTargetU + fish.scatterOffsetU, 0.06, 0.94);
        const screenY = clamp(baseTargetV + fish.scatterOffsetV, 0.35, 0.83);
        const effVelU = fish.scaredTimer > 0 ? (screenX - prevX) / Math.max(dt, 0.001) : refVelU;
        const effVelV = fish.scaredTimer > 0 ? (screenY - prevY) / Math.max(dt, 0.001) : refVelV;
        const effVelDepth = (depth - prevDepth) / Math.max(dt, 0.001) * 0.5 + refVelDepth * 0.5;

        const speed3D = Math.hypot(effVelU, effVelV, effVelDepth * 0.6);
        const panicSpeedBoost = fish.scaredTimer > 0 ? 0.85 : 0;
        if (fish.animGroup) {
          if (!fish.animGroup.isPlaying) fish.animGroup.play(true);
          fish.animGroup.speedRatio = clamp(
            (1.15 + speed3D * 1.9 + panicSpeedBoost) * speedMul,
            0.65,
            2.6,
          );
        }

        // Orientação 3D completa em 360° (frente, trás, lados e diagonais):
        // No modelo pale-bleak (focinho em +X local):
        //   yaw = 0         -> nada para a direita (+X)
        //   yaw = Math.PI   -> nada para a esquerda (-X)
        //   yaw = +Math.PI/2 -> nada RETO PARA A FRENTE em direção à câmera (-Z)!
        //   yaw = -Math.PI/2 -> nada RETO PARA TRÁS em direção ao fundo do mar (+Z)!
        let targetYaw = fish.currentYaw;
        if (Math.hypot(effVelU, effVelDepth * 1.35) > 0.008) {
          targetYaw = Math.atan2(effVelDepth * 1.35, effVelU);
        }

        let deltaYaw = targetYaw - fish.currentYaw;
        while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
        while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
        const yawRate = 1 - Math.exp(-dt * (fish.scaredTimer > 0 ? 11.0 : 6.5));
        fish.currentYaw += deltaYaw * yawRate;

        fish.currentScreenX = screenX;
        fish.currentScreenY = screenY;
        fish.currentDepth = depth;
        fish.currentDir = Math.cos(fish.currentYaw) >= 0 ? 1 : -1;
        fish.seabedScreenY = 0.72 + depth * 0.17;

        const dynamicDepthZ = PLANE_Z + 1.8 - depth * 3.6;
        fish.depthZ = dynamicDepthZ;
        const perspectiveScale = fish.individualScale * (0.38 + Math.pow(depth, 1.30) * 1.38);
        const worldScale = perspectiveScale * (dynamicDepthZ / PLANE_Z);

        fish.holder.position.copyFrom(screenToWorld(screenX, screenY, dynamicDepthZ, this.aspect));
        fish.holder.scaling.set(worldScale, worldScale, worldScale);

        // Em ordem Euler YXZ do Babylon:
        // rotation.z inclina o focinho para cima (+Y) ao subir (effVelV < 0) ou para baixo (-Y) ao mergulhar (effVelV > 0)
        // rotation.x inclina lateralmente (bank/roll) durante curvas
        // rotation.y gira 360° apontando para frente (câmera), trás (fundo), esquerda ou direita
        const horizSpeed = Math.max(0.08, Math.hypot(effVelU, effVelDepth) + 0.06);
        const pitchZ = clamp((-effVelV / horizSpeed) * 0.34, -0.28, 0.28);
        const bankX = clamp(-deltaYaw * 0.22, -0.20, 0.20);
        fish.holder.rotation.set(bankX, fish.currentYaw, pitchZ);

        const depthClarity = smoothstep(0.05, 0.72, depth);
        for (const mat of fish.materials) {
          mat.emissiveColor = mixColor(deepWaterEmissive, fish.baseTint, depthClarity);
          mat.alpha = 1.0;
        }
        for (const m of fish.meshes) {
          m.setEnabled(true);
          m.visibility = 1.0;
        }
      } else {
        // Quando morre: para a animação dos ossos, vira de barriga para cima, afunda até a areia e some devagar
        if (fish.deathStage === 'alive') {
          fish.deathStage = 'sinking';
          fish.deadElapsed = 0;
          fish.stageElapsed = 0;
          fish.verticalVelocity = 0.015;
          if (fish.animGroup) fish.animGroup.pause();
        }

        fish.deadElapsed += dt;
        fish.stageElapsed += dt;

        const perspectiveScale = fish.individualScale * (0.38 + Math.pow(fish.currentDepth, 1.30) * 1.38);
        const worldScale = perspectiveScale * (fish.depthZ / PLANE_Z);
        const flipAngle = smoothstep(0.0, 0.65, fish.deadElapsed) * Math.PI;

        let fadeAlpha = 1;
        if (fish.deathStage === 'sinking') {
          fish.verticalVelocity = Math.min(fish.verticalVelocity + dt * 0.085, 0.095);
          fish.currentScreenY = Math.min(
            fish.seabedScreenY,
            fish.currentScreenY + fish.verticalVelocity * dt,
          );
          if (fish.currentScreenY >= fish.seabedScreenY - 0.001) {
            fish.currentScreenY = fish.seabedScreenY;
            fish.deathStage = 'bottom';
            fish.stageElapsed = 0;
            fish.verticalVelocity = 0;
          }
        } else if (fish.deathStage === 'bottom') {
          fish.currentScreenY = fish.seabedScreenY;
          const bottomWaitSeconds = 2.2;
          const fadeDurationSeconds = 3.8;
          fadeAlpha = fish.stageElapsed <= bottomWaitSeconds
            ? 1
            : clamp(1 - (fish.stageElapsed - bottomWaitSeconds) / fadeDurationSeconds);

          if (fadeAlpha <= 0.01) {
            fish.deathStage = 'repopulating';
            fish.stageElapsed = 0;
            fadeAlpha = 0;
          }
        } else if (fish.deathStage === 'repopulating') {
          fadeAlpha = 0;
          const repopulateCooldown = 5.5 + (fish.id % 4) * 1.5;
          const waterViable = dissolvedOxygen >= 3.5 && overallHealth > 15 && !isAnoxicOrLethal;
          const waterAcceptable = waterViable && overallHealth > Math.max(15, fish.threshold);
          if (fish.stageElapsed >= repopulateCooldown && waterAcceptable) {
            fish.deathStage = 'alive';
            fish.deadElapsed = 0;
            fish.stageElapsed = 0;
            fish.verticalVelocity = 0;

            const enterLeft = fish.id % 2 === 0;
            fish.currentScreenX = enterLeft ? -0.06 : 1.06;
            fish.currentScreenY = 0.44 + (fish.id % 4) * 0.08;
            fish.currentDepth = 0.20 + (fish.id % 5) * 0.14;
            fish.depthZ = PLANE_Z + 1.8 - fish.currentDepth * 3.6;
            fish.currentDir = enterLeft ? 1 : -1;
            fish.currentYaw = enterLeft ? 0 : Math.PI;
            fish.segmentProgress = 0;
            if (fish.animGroup) {
              fish.animGroup.start(true, 1.18 + (fish.id % 4) * 0.14);
            }
            for (const m of fish.meshes) {
              m.setEnabled(true);
              m.visibility = 1.0;
            }
          }
        }

        fish.holder.position.copyFrom(
          screenToWorld(fish.currentScreenX, fish.currentScreenY, fish.depthZ, this.aspect),
        );
        fish.holder.scaling.set(worldScale, worldScale, worldScale);
        fish.holder.rotation.set(flipAngle, fish.currentYaw, 0.05);

        for (const m of fish.meshes) {
          m.setEnabled(fadeAlpha > 0.01);
          m.visibility = fadeAlpha;
        }
      }
    }
  }

  /**
   * Atualiza o Tubarão 3D único (`shark.glb`):
   * - Aparece apenas em momentos aleatórios e bem espaçados (`cooldownDuration` entre 32s e 62s)
   *   para pegar o usuário de surpresa sem ficar repetitivo.
   * - Alterna aleatoriamente entre dois modos de aparição:
   *   1. `'camera_flyby'`: passa MUITO pertinho em frente à câmera (primeiro plano absoluto),
   *      cruzando a lente de surpresa e assustando os peixes próximos.
   *   2. `'approaching'` -> `'turning_exit'`: surge lá do centro do mar vindo reto na direção da câmera,
   *      assusta e separa os cardumes, e depois vira para o lado e sai de vista.
   */
  private updateSharks3D(dt: number) {
    const overallHealth = this.state.health.fish;
    const deepWaterEmissive = mixColor(
      new Color3(0.04, 0.18, 0.30),
      new Color3(0.06, 0.24, 0.16),
      clamp(this.visualSewage * 0.65),
    );
    const closeEmissive = new Color3(0.08, 0.16, 0.22);

    for (const shark of this.sharks3D) {
      const isDead = overallHealth <= shark.threshold;

      if (!isDead) {
        shark.deathStage = 'alive';
        shark.deadElapsed = 0;
        shark.stageElapsed = 0;
        shark.verticalVelocity = 0;

        const stressRatio = clamp((70 - overallHealth) / 70);
        const speedMul = 0.65 + (1 - stressRatio) * 0.35;

        if (shark.patrolStage === 'cooldown') {
          shark.isScaring = false;
          shark.mesh.setEnabled(false);
          // O tubarão nada como criatura viva do recife no tempo real do relógio (dt)
          shark.patrolElapsed += dt;
          const safeCooldownTarget = shark.cooldownDuration;
          if (shark.patrolElapsed >= safeCooldownTarget) {
            shark.patrolElapsed = 0;
            // Escolhe aleatoriamente a direção lateral de saída
            shark.exitDir = Math.random() < 0.5 ? -1 : 1;
            shark.flybyScreenY = 0.45 + Math.random() * 0.17;
            // Alterna de forma garantida entre vir lá do fundo do centro ('approaching')
            // e passar bem colado na câmera de surpresa ('camera_flyby')
            const nextMode = shark.lastPatrolMode === 'camera_flyby' ? 'approaching' : 'camera_flyby';
            shark.patrolStage = nextMode;
            shark.lastPatrolMode = nextMode;
          }
          continue;
        }

        shark.patrolElapsed += dt * speedMul;

        const approachDuration = 5.0;
        const exitDuration = 3.8;
        const flybyDuration = 4.4;

        let screenX = 0.50;
        let screenY = 0.49;
        let depth = 0.04;
        let yaw = -Math.PI * 0.5;
        let pitchZ = 0;
        let bankX = 0;
        let visibility = 1.0;
        let closeScaleBoost = 1.0;

        if (shark.patrolStage === 'camera_flyby') {
          const t = clamp(shark.patrolElapsed / flybyDuration, 0, 1);
          // Passa MUITO perto da câmera (depth = 0.985 + closeScaleBoost), cruzando de um lado ao outro de surpresa
          const startX = shark.exitDir === 1 ? -0.46 : 1.46;
          const endX = shark.exitDir === 1 ? 1.46 : -0.46;
          screenX = startX + (endX - startX) * t;
          screenY = shark.flybyScreenY + Math.sin(t * Math.PI * 1.4) * 0.022;
          depth = 0.985;
          closeScaleBoost = 1.48;

          // Em shark.glb o focinho está em bx = -0.5: yaw = 0 aponta para a esquerda (-1), yaw = -PI aponta para a direita (+1)
          const baseYaw = shark.exitDir === -1 ? 0 : -Math.PI;
          yaw = baseYaw + Math.sin(shark.patrolElapsed * 2.8) * 0.05;
          pitchZ = Math.cos(t * Math.PI * 1.4) * 0.03;
          shark.turnBend = Math.sin(shark.patrolElapsed * 3.0) * 0.18;
          bankX = 0.03 * shark.exitDir;
          visibility = 1.0;
          shark.isScaring = screenX > -0.05 && screenX < 1.05;

          if (t >= 1) {
            shark.patrolStage = 'cooldown';
            shark.patrolElapsed = 0;
            shark.cooldownDuration = sampleSharkCooldownSeconds(false);
            shark.isScaring = false;
            shark.mesh.setEnabled(false);
            continue;
          }
        } else if (shark.patrolStage === 'approaching') {
          const t = clamp(shark.patrolElapsed / approachDuration, 0, 1);
          // Surge lá do fundo central do mar (depth = 0.02) vindo reto na direção da câmera (depth = 0.88)
          const easedT = smoothstep(0.0, 1.0, t) * 0.35 + t * 0.65;
          depth = 0.02 + easedT * 0.86;
          screenX = 0.50 + Math.sin(shark.patrolElapsed * 1.4) * 0.008;
          screenY = 0.49 + Math.sin(shark.patrolElapsed * 1.1) * 0.006;
          yaw = -Math.PI * 0.5 + Math.sin(shark.patrolElapsed * 2.2) * 0.04;
          pitchZ = 0.03;
          shark.turnBend = 0;
          visibility = smoothstep(0.0, 0.16, t);
          shark.isScaring = depth >= 0.18;

          if (t >= 1) {
            shark.patrolStage = 'turning_exit';
            shark.patrolElapsed = 0;
          }
        } else if (shark.patrolStage === 'turning_exit') {
          const t = clamp(shark.patrolElapsed / exitDuration, 0, 1);
          const turnProgress = smoothstep(0.0, 0.52, t);
          // Vira de frente (-PI/2) para a esquerda (0) ou para a direita (-PI) e nada para fora da tela
          const targetExitYaw = shark.exitDir === -1 ? 0 : -Math.PI;
          yaw = -Math.PI * 0.5 + (targetExitYaw - (-Math.PI * 0.5)) * turnProgress;

          const sideTravel = Math.pow(t, 1.18) * 0.82;
          screenX = 0.50 + shark.exitDir * sideTravel;
          screenY = 0.49 - Math.sin(t * Math.PI) * 0.035;
          depth = 0.88 - t * 0.12;

          // Curvatura natural da coluna durante a manobra de virada lateral
          shark.turnBend = Math.sin(clamp(t / 0.55, 0, 1) * Math.PI) * shark.exitDir * 1.15;
          bankX = -shark.turnBend * 0.14;
          pitchZ = -0.02;
          visibility = 1 - smoothstep(0.78, 1.0, t);
          shark.isScaring = t < 0.62;

          if (t >= 1) {
            shark.patrolStage = 'cooldown';
            shark.patrolElapsed = 0;
            shark.cooldownDuration = sampleSharkCooldownSeconds(false);
            shark.isScaring = false;
            shark.mesh.setEnabled(false);
            continue;
          }
        }

        const tailFreq =
          shark.swimFreq +
          (shark.patrolStage === 'turning_exit'
            ? 1.1
            : shark.patrolStage === 'camera_flyby'
              ? 0.85
              : 0.4);
        shark.tailPhase += dt * tailFreq;

        shark.currentScreenX = screenX;
        shark.currentScreenY = screenY;
        shark.currentDepth = depth;
        shark.seabedScreenY = 0.74 + depth * 0.15;

        const dynamicDepthZ = PLANE_Z + 1.9 - depth * 3.5;
        shark.depthZ = dynamicDepthZ;
        const perspectiveScale =
          shark.baseScale * (0.32 + Math.pow(depth, 1.32) * 1.22) * closeScaleBoost;
        const worldScale = perspectiveScale * (dynamicDepthZ / PLANE_Z);

        shark.holder.position.copyFrom(screenToWorld(screenX, screenY, dynamicDepthZ, this.aspect));
        shark.holder.scaling.set(worldScale, worldScale, worldScale);
        shark.holder.rotation.set(bankX, yaw, pitchZ);

        const depthClarity = smoothstep(0.04, 0.72, depth);
        shark.material.emissiveColor = mixColor(deepWaterEmissive, closeEmissive, depthClarity);
        shark.material.diffuseColor = mixColor(
          new Color3(0.28, 0.54, 0.74),
          new Color3(0.88, 0.94, 0.99),
          depthClarity,
        );

        this.deformSharkBody3D(shark, false);
        shark.mesh.setEnabled(visibility > 0.01);
        shark.mesh.visibility = visibility;
      } else {
        shark.isScaring = false;
        if (shark.deathStage === 'alive') {
          shark.deathStage = 'sinking';
          shark.deadElapsed = 0;
          shark.stageElapsed = 0;
          shark.verticalVelocity = 0.014;
        }

        shark.deadElapsed += dt;
        shark.stageElapsed += dt;

        const perspectiveScale = shark.baseScale * (0.32 + Math.pow(shark.currentDepth, 1.32) * 1.22);
        const worldScale = perspectiveScale * (shark.depthZ / PLANE_Z);
        const flipAngle = smoothstep(0.0, 0.85, shark.deadElapsed) * Math.PI;

        let fadeAlpha = 1;
        if (shark.deathStage === 'sinking') {
          shark.verticalVelocity = Math.min(shark.verticalVelocity + dt * 0.075, 0.085);
          shark.currentScreenY = Math.min(
            shark.seabedScreenY,
            shark.currentScreenY + shark.verticalVelocity * dt,
          );
          if (shark.currentScreenY >= shark.seabedScreenY - 0.001) {
            shark.currentScreenY = shark.seabedScreenY;
            shark.deathStage = 'bottom';
            shark.stageElapsed = 0;
            shark.verticalVelocity = 0;
          }
        } else {
          shark.currentScreenY = shark.seabedScreenY;
          const bottomWaitSeconds = 2.4;
          const fadeDurationSeconds = 4.0;
          fadeAlpha = shark.stageElapsed <= bottomWaitSeconds
            ? 1
            : clamp(1 - (shark.stageElapsed - bottomWaitSeconds) / fadeDurationSeconds);
        }

        shark.holder.position.copyFrom(
          screenToWorld(shark.currentScreenX, shark.currentScreenY, shark.depthZ, this.aspect),
        );
        shark.holder.scaling.set(worldScale, worldScale, worldScale);
        shark.holder.rotation.set(flipAngle, 0, 0.04);

        this.deformSharkBody3D(shark, true);
        shark.mesh.setEnabled(fadeAlpha > 0.01);
        shark.mesh.visibility = fadeAlpha;
      }
    }
  }

  /**
   * Deforma a malha 3D do tubarão com ondulação axial carangiforme/tuniforme da coluna
   * (focinho firme em x=-0.5, impulso lateral crescente até a nadadeira caudal em x=+0.5)
   * e curvatura lateral em C durante a manobra de saída lateral perto da câmera.
   */
  private deformSharkBody3D(shark: SharkSwimmer3D, isDead: boolean) {
    const base = shark.basePositions;
    const out = shark.workingPositions;
    const count = base.length / 3;

    if (isDead) {
      out.set(base);
      shark.mesh.updateVerticesData(VertexBuffer.PositionKind, out, false, false);
      return;
    }

    const turnDiff = shark.turnBend;
    const ampZ = 0.075 + Math.abs(turnDiff) * 0.045;
    const ampY = 0.016;

    for (let i = 0; i < count; i += 1) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bz = base[i * 3 + 2];

      // normalizedX = 0 no focinho (-0.5), 1 na ponta da nadadeira caudal (+0.5)
      const normalizedX = clamp(bx + 0.5, 0, 1);
      const tailWeight = clamp((normalizedX - 0.18) / 0.82);
      const weightSq = tailWeight * tailWeight;

      const wavePhase = shark.tailPhase - normalizedX * 5.2;
      // Onda lateral principal (eixo Z local = esquerda/direita do corpo do tubarão)
      const lateralWaveZ = Math.sin(wavePhase) * ampZ * weightSq;
      const subtleWaveY = Math.cos(wavePhase) * ampY * weightSq;
      // Curvatura natural da coluna durante giros 3D (C-turn)
      const cTurnZ = turnDiff * Math.sin(normalizedX * Math.PI) * 0.14;

      out[i * 3] = bx;
      out[i * 3 + 1] = by + subtleWaveY;
      out[i * 3 + 2] = bz + lateralWaveZ + cTurnZ;
    }

    shark.mesh.updateVerticesData(VertexBuffer.PositionKind, out, false, false);
  }

  private updateBubbles() {
    const coralHealthFactor = clamp((this.state.health.coral - 20) / 60);
    const bleachSuppression = clamp(1 - this.visualCoralBleach * 0.92);
    const coralVitality = clamp(coralHealthFactor * bleachSuppression);

    const activeBubbleFraction = coralVitality;
    const total = this.bubbles.length;
    // Ancoragem horizontal fiel aos corais do backdrop da imagem de referência (16:9)
    const backdropAspect = REFERENCE_ASPECT * Math.max(this.aspect / REFERENCE_ASPECT, 1);

    for (let i = 0; i < total; i += 1) {
      const bubble = this.bubbles[i];
      if (coralVitality <= 0.02 || (i % 10) / 10 > activeBubbleFraction) {
        bubble.mesh.visibility = 0;
        continue;
      }

      const spanY = bubble.maxScreenY - bubble.minScreenY;
      const progress = (this.elapsed * bubble.speed + bubble.phase) % 1;
      const screenY = bubble.maxScreenY - progress * spanY;
      const wobbleX = Math.sin(this.elapsed * bubble.wobbleFreq + bubble.phase * 11)
        * bubble.wobbleAmp
        * (0.4 + progress * 0.8);
      const screenX = bubble.emitterScreenX + wobbleX;

      const pos = screenToWorld(screenX, screenY, bubble.depthZ, backdropAspect);
      bubble.mesh.position.copyFrom(pos);

      const growth = bubble.baseScale * (0.78 + progress * 0.52);
      const squash = 1 + Math.sin(this.elapsed * 4.2 + bubble.phase * 7) * 0.06;
      bubble.mesh.scaling.set(growth * squash, growth / squash, 1);

      const fadeIn = clamp(progress / 0.14);
      const fadeOut = clamp((1 - progress) / 0.16);
      bubble.mesh.visibility = fadeIn * fadeOut * 0.92 * coralVitality;
    }
  }

  private updateScientificEffects(dt: number) {
    const envOil = normalizedReceivedLoad('oil', this.state.env.oil);
    const targetOil = normalizedReceivedLoad('oil', this.state.targets.oil);
    const desiredOil = Math.max(envOil, targetOil);

    const envSewage = normalizedReceivedLoad('sewage', this.state.env.sewage);
    const targetSewage = normalizedReceivedLoad('sewage', this.state.targets.sewage);
    const desiredSewage = Math.max(envSewage, targetSewage);

    const envPlastics = normalizedReceivedLoad('microplastics', this.state.env.microplastics);
    const targetPlastics = normalizedReceivedLoad('microplastics', this.state.targets.microplastics);
    const desiredPlastics = Math.max(envPlastics, targetPlastics);

    const coralHealthLoss = clamp((92 - this.state.health.coral) / 46);
    const dhwBleach = clamp(this.state.degreeHeatingWeeks / 3.8);
    const acidStress = clamp((8.02 - Math.min(this.state.env.ph, this.state.targets.ph)) / 0.25) * 0.75;
    const thermalPreview = clamp((Math.max(this.state.env.temperature, this.state.targets.temperature) - 28.8) / 1.8) * 0.82;
    const desiredBleach = clamp(Math.max(coralHealthLoss, dhwBleach, acidStress, thermalPreview));

    const smoothRate = Math.min(1, dt * 2.4);
    this.visualOil += (desiredOil - this.visualOil) * smoothRate;
    this.visualSewage += (desiredSewage - this.visualSewage) * smoothRate;
    this.visualMicroplastics += (desiredPlastics - this.visualMicroplastics) * smoothRate;
    this.visualCoralBleach += (desiredBleach - this.visualCoralBleach) * smoothRate;

    // 1. Atualiza camada de branqueamento seletivo dos corais
    this.coralBleachLayer.mesh.visibility = clamp(this.visualCoralBleach * 0.98);
    const deadCoralRatio = clamp((35 - this.state.health.coral) / 35);
    this.coralBleachLayer.material.emissiveColor = mixColor(
      new Color3(1.0, 0.99, 0.96),
      new Color3(0.74, 0.77, 0.68),
      deadCoralRatio * 0.55,
    );

    // 2. Atualiza água esverdeada por esgoto (ESTRITAMENTE no mar subaquático, céu e barco intocados)
    const sewageStrength = Math.pow(clamp(this.visualSewage), 0.72);
    this.sewageSystem.veilMesh.visibility = sewageStrength * 0.46;

    for (let i = 0; i < this.sewageSystem.plumes.length; i += 1) {
      const plume = this.sewageSystem.plumes[i];
      if (sewageStrength <= 0.02) {
        plume.mesh.visibility = 0;
        continue;
      }
      const sx = ((plume.baseScreenX + this.elapsed * plume.speedX) % 0.92) + 0.04;
      const sy = plume.baseScreenY + Math.sin(this.elapsed * 0.55 + plume.phase) * 0.022;
      plume.mesh.position.copyFrom(screenToWorld(sx, sy, PLANE_Z + 0.8, this.aspect));
      const pulse = 1 + Math.sin(this.elapsed * 0.8 + plume.phase) * 0.08;
      plume.mesh.scaling.set(plume.baseScaleX * pulse, plume.baseScaleY / pulse, 1);
      plume.mesh.visibility = sewageStrength * 0.28;
    }

    // 3. Atualiza sistema físico 3D do derramamento de óleo
    const oilStrength = Math.pow(clamp(this.visualOil), 0.68);
    updateOilSpillSystem(this.oilSpillSystem, oilStrength, this.elapsed, dt, this.aspect);

    // 3b. Atualiza cáusticas e feixes de luz solar passando na areia (atenuados pela turbidez/óleo)
    const waterClarity = clamp(1 - oilStrength * 0.72 - sewageStrength * 0.48, 0.12, 1.0);
    const backdropAspect = REFERENCE_ASPECT * Math.max(this.aspect / REFERENCE_ASPECT, 1);
    updateSandCausticsSystem(this.sandCausticsSystem, this.elapsed, dt, waterClarity, backdropAspect);

    // 4. Atualiza advecção por vórtices (Curl Noise) e tombamento 3D dos microplásticos
    const plasticsStrength = Math.pow(clamp(this.visualMicroplastics), 0.62);
    for (let i = 0; i < this.microplastics.length; i += 1) {
      const p = this.microplastics[i];
      if (plasticsStrength <= p.threshold || plasticsStrength <= 0.01) {
        p.mesh.visibility = 0;
        continue;
      }

      const localPresence = clamp((plasticsStrength - p.threshold) / (1 - p.threshold + 0.08));
      const flow = sampleFluidCurlVelocity(p.u, p.v, this.elapsed + p.phase * 0.2);

      // Advecção suave com inércia na correnteza e turbulência subaquática
      p.vx += (flow.vx * 0.55 - p.vx) * Math.min(1, dt * 3.0);
      p.vy += (flow.vy * 0.45 + p.buoyancyDrift - p.vy) * Math.min(1, dt * 3.0);

      p.u += p.vx * dt;
      p.v += p.vy * dt;

      // Recicla suavemente nas bordas do volume subaquático
      if (p.u > 0.97) p.u = 0.03;
      if (p.u < 0.03) p.u = 0.97;
      if (p.v > 0.86) {
        p.v = 0.305;
        p.vy = Math.abs(p.vy) * 0.2;
      } else if (p.v < 0.295) {
        p.v = 0.295 + Math.abs(p.v - 0.295);
        p.vy = Math.abs(p.vy) * 0.4;
      }

      p.mesh.position.copyFrom(screenToWorld(p.u, p.v, p.depthZ, this.aspect));

      // Tombamento 3D (flutter) na água + cintilação especular quando a faceta reflete os raios solares
      const tumbleX = this.elapsed * p.tumbleSpeedX + p.phase;
      const tumbleY = this.elapsed * p.tumbleSpeedY + p.phase * 1.7;
      const foreshortenX = 0.46 + 0.54 * Math.abs(Math.cos(tumbleX));
      const foreshortenY = 0.52 + 0.48 * Math.abs(Math.sin(tumbleY));

      p.mesh.scaling.set(p.baseScale * foreshortenX, p.baseScale * foreshortenY, 1);
      p.mesh.rotation.z = this.elapsed * p.rotSpeedZ + Math.sin(tumbleX) * 0.45;

      // Cintilação óptica quando o fragmento fica no ângulo de reflexão especular da luz solar
      const glint = Math.pow(Math.max(0, Math.sin(tumbleX * 2.0 + p.phase)), 8.0) * 0.38;
      p.material.emissiveColor.set(
        clamp(p.baseColor.r + glint),
        clamp(p.baseColor.g + glint),
        clamp(p.baseColor.b + glint),
      );

      p.mesh.visibility = clamp(localPresence * 1.35, 0, 1) * p.layerAlpha;
    }
  }
}
