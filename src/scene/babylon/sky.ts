import '@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { SceneQualityProfile } from './quality';
import { clamp, fbm2D, hash2D, mix, smoothstep } from './procedural';
import type { VisualState } from './visualState';

export interface SkySystem {
  readonly meshes: AbstractMesh[];
  readonly sunDirection: Vector3;
  readonly sunLight: DirectionalLight;
  readonly hemiLight: HemisphericLight;
  update(dt: number, visual: VisualState): void;
  setCameraPosition(position: Vector3): void;
}

/**
 * Direção real do sol do EXR (u = 0.595, elevação ≈ 48°). Ele fica acima do
 * enquadramento da câmera; a luz direcional usa uma direção mais baixa para
 * iluminar o recife sem transformar o céu num clarão.
 */
const VISIBLE_SUN = new Vector3(0.377, 0.742, 0.555).normalize();
/** Direção usada pela luz direcional: mais alta para iluminar o recife e a areia. */
const LIGHT_SUN = new Vector3(0.28, 0.68, 0.68).normalize();

/**
 * O recorte do EXR guarda radiance linear de ~0,15 a ~1,4. O nível 0,95 leva
 * os cúmulos ao branco do ACES sem estourar o azul do céu.
 */
const SKY_HDR_LEVEL = 0.95;
const SKY_LDR_LEVEL = 1.15;

/** O domo cobre 360° na horizontal e 0..22,5° de elevação no recorte do HDR. */
const SKY_BAND_TOP = Math.PI / 8;

const MURK_TINT = new Color3(0.62, 0.64, 0.66);

/**
 * Fallback procedural imediato enquanto o panorama HDR/JPG é carregado.
 */
function createFallbackSkyTexture(scene: Scene): DynamicTexture {
  const width = 512;
  const height = 256;
  const texture = new DynamicTexture(
    'ceu-fallback-textura',
    { width, height },
    scene,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
    Constants.TEXTUREFORMAT_RGBA,
    false,
  );
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0.0, '#124999');
  gradient.addColorStop(0.22, '#1f6bd1');
  gradient.addColorStop(0.38, '#3f95eb');
  gradient.addColorStop(0.47, '#79c2f7');
  gradient.addColorStop(0.5, '#9ed9fb');
  gradient.addColorStop(0.53, '#1779c2');
  gradient.addColorStop(0.75, '#0b4b88');
  gradient.addColorStop(1.0, '#05264c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.update(false);
  return texture;
}

/**
 * Constrói o domo celeste com mapeamento equiretangular de verdade:
 * `u = 0.5 + az/2π` e `v = 1` no horizonte, subindo até `v = 0` a 22,5° de
 * elevação. Antes o domo comprimia ~67° de céu na faixa visível, o que deixava
 * as nuvens esticadas e trazia o sol (a 48°) para dentro do quadro.
 */
function buildSkyDomeMesh(scene: Scene): Mesh {
  const radius = 620;
  const rings = 36;
  const sectors = 64;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const phiTop = Math.PI * 0.5;
  const phiBottom = -0.045; // termina logo abaixo da linha do horizonte (nunca invade a cena subaquática)

  for (let r = 0; r <= rings; r += 1) {
    const vSph = r / rings;
    const phi = mix(phiTop, phiBottom, vSph);
    const cosPhi = Math.cos(phi);
    const y = Math.sin(phi) * radius;

    // O recorte do HDR cobre 0..22,5°; acima disso o topo do domo nunca aparece
    // no enquadramento, mas continua com UV válido para as reflexões.
    const bandT = clamp(phi / SKY_BAND_TOP, 0, 1);
    const vUv = 1 - bandT;

    for (let s = 0; s <= sectors; s += 1) {
      const uSph = s / sectors;
      const az = (uSph - 0.5) * Math.PI * 2; // 0 na direção +Z
      const x = Math.sin(az) * cosPhi * radius;
      const z = Math.cos(az) * cosPhi * radius;

      const uUv = 0.5 + az / (Math.PI * 2);
      positions.push(x, y, z);
      uvs.push(uUv, clamp(vUv, 0, 1));
    }
  }

  const stride = sectors + 1;
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < sectors; s += 1) {
      const a = r * stride + s;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // Orientação interna voltada para a câmera no centro
      indices.push(a, b, c, b, d, c);
    }
  }

  const mesh = new Mesh('ceu-diorama', scene);
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.isPickable = false;
  mesh.infiniteDistance = false;
  mesh.applyFog = false;
  mesh.renderingGroupId = 0;
  return mesh;
}

type RidgeColor = readonly [number, number, number];

interface HorizonRidge {
  name: string;
  z: number;
  xMin: number;
  xMax: number;
  segments: number;
  baseY: number;
  rows: number;
  height(t: number): number;
  color(rowT: number, t: number): RidgeColor;
}

function mixColor(a: RidgeColor, b: RidgeColor, amount: number): RidgeColor {
  return [
    mix(a[0], b[0], amount),
    mix(a[1], b[1], amount),
    mix(a[2], b[2], amount),
  ];
}

function hazed(color: RidgeColor, haze: number, hazeColor: RidgeColor): RidgeColor {
  return mixColor(color, hazeColor, haze);
}

/**
 * Constrói uma formação insular/costeira 3D com relevo volumétrico, iluminação
 * solar direcional, zoneamento geológico por altitude/declividade (espuma de
 * arrebentação costeira, faixa de areia/rocha molhada, escarpas rochosas íngremes
 * e dossel multi-espécie de Mata Atlântica) e perspectiva atmosférica física
 * de Rayleigh/Mie dependente da distância real em metros.
 */
function buildHorizonRidgeMesh(scene: Scene, ridge: HorizonRidge): Mesh {
  const { segments, rows, z, baseY } = ridge;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const spanX = Math.max(1, ridge.xMax - ridge.xMin);
  const dt = 1 / segments;
  const dx = spanX * dt;

  // Extinção atmosférica física de Rayleigh + Mie baseada na distância real z (260m..560m)
  const distanceFactor = clamp((z - 210) / 420, 0, 1);
  const rayleighHaze: RidgeColor = [0.54, 0.70, 0.82];
  const mieHorizonGlow: RidgeColor = [0.64, 0.77, 0.86];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const x = mix(ridge.xMin, ridge.xMax, t);
    const topY = Math.max(0, ridge.height(t));
    const hLeft = Math.max(0, ridge.height(Math.max(0, t - dt)));
    const hRight = Math.max(0, ridge.height(Math.min(1, t + dt)));
    const dHdx = (hRight - hLeft) / (2 * dx);
    const steepness = clamp(Math.abs(dHdx) * 3.2, 0, 1);

    // Relevo 3D longitudinal (pontas costeiras avançam em direção à baía; vales recuam)
    const spurNoise = fbm2D(t * 14.5 + z * 0.019, 2.7, 3) - 0.5;

    for (let row = 0; row < rows; row += 1) {
      const rowT = row / (rows - 1);
      const y = mix(baseY, topY, rowT);

      // Extrusão 3D: a linha de costa (rowT ~ 0.15) projeta-se para a frente,
      // enquanto a crista da serra recua em Z, criando encostas 3D reais.
      const zRelief =
        (1 - rowT) * -12.0 +
        spurNoise * 16.0 * Math.sin(rowT * Math.PI) +
        rowT * 9.0;
      const worldZ = z + zRelief;

      // Normal 3D aproximada da encosta para iluminação solar direcional coerente com o HDR
      const nx = -dHdx * (0.35 + 0.65 * rowT);
      const ny = 0.55 + 0.45 * rowT;
      const nz = -0.78 + spurNoise * 0.35;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      const sunDot = clamp(
        (nx * VISIBLE_SUN.x + ny * VISIBLE_SUN.y - nz * VISIBLE_SUN.z) / nLen,
        -0.4,
        1.0,
      );
      const solarLit = clamp(0.54 + 0.46 * sunDot, 0.32, 1.08);

      let baseColor = ridge.color(rowT, t);

      // 1) Escarpa rochosa exposta onde a declividade (steepness) é alta
      const cliffRockLit: RidgeColor = [0.44, 0.39, 0.33];
      const cliffRockShadow: RidgeColor = [0.24, 0.25, 0.27];
      const cliffColor = mixColor(cliffRockShadow, cliffRockLit, solarLit);
      const rockMask = clamp(steepness * smoothstep(0.12, 0.75, rowT) * 0.85, 0, 0.82);
      baseColor = mixColor(baseColor, cliffColor, rockMask);

      // 2) Faixa de areia costeira e bancada úmida junto à linha d'água (y entre -0.2m e +1.1m)
      if (topY > 0.8 && y > -0.35 && y < 1.35) {
        const beachBand = (1 - smoothstep(0.15, 1.35, Math.max(0, y))) * (1 - steepness * 0.65);
        const wetSand: RidgeColor = [0.68, 0.63, 0.50];
        baseColor = mixColor(baseColor, wetSand, clamp(beachBand * 0.62, 0, 0.65));

        // Fio sutil de espuma de arrebentação na linha d'água costeira (y ~ 0.0..0.35m)
        const surfLine = Math.exp(-Math.pow((y - 0.12) / 0.22, 2)) * (0.4 + 0.6 * fbm2D(t * 42 + z, 1.1, 2));
        const surfFoam: RidgeColor = [0.84, 0.92, 0.96];
        baseColor = mixColor(baseColor, surfFoam, clamp(surfLine * (1 - distanceFactor * 0.7), 0, 0.55));
      }

      // 3) Modulação tridimensional de dossel florestal (luz solar vs sombra de vale)
      const canopyDapple =
        fbm2D(t * 34 + z * 0.013, rowT * 11.5 + z * 0.017, 3) * 0.12 +
        (hash2D(i * 1.71 + z * 0.017, row * 0.83 + z * 0.023) - 0.5) * 0.035;
      const litFactor = clamp(0.84 + 0.24 * solarLit + canopyDapple, 0.68, 1.18);
      const litColor: RidgeColor = [
        clamp(baseColor[0] * litFactor, 0, 1),
        clamp(baseColor[1] * litFactor, 0, 1),
        clamp(baseColor[2] * litFactor, 0, 1),
      ];

      // 4) Perspectiva atmosférica Rayleigh/Mie adicional na bruma de base e distância
      const altitudeHaze = Math.pow(1 - rowT, 1.6) * 0.22 + distanceFactor * 0.18;
      const finalColor = hazed(
        litColor,
        clamp(altitudeHaze, 0, 0.68),
        mixColor(rayleighHaze, mieHorizonGlow, 1 - rowT),
      );

      positions.push(x, y, worldZ);
      colors.push(
        clamp(finalColor[0], 0, 1),
        clamp(finalColor[1], 0, 1),
        clamp(finalColor[2], 0, 1),
        1,
      );
    }
  }

  for (let i = 0; i < segments; i += 1) {
    for (let row = 0; row < rows - 1; row += 1) {
      const a = i * rows + row;
      const b = a + rows;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, b, c, c, b, d);
    }
  }

  const mesh = new Mesh(ridge.name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh, false);

  const material = new StandardMaterial(`${ridge.name}-material`, scene);
  material.diffuseColor = Color3.Black();
  material.emissiveColor = new Color3(1, 1, 1);
  material.disableLighting = true;
  material.specularColor = Color3.Black();
  material.ambientColor = Color3.Black();
  material.backFaceCulling = false;
  material.fogEnabled = false;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.applyFog = false;
  mesh.renderingGroupId = 0;
  return mesh;
}

function buildHorizonLayers(scene: Scene): Mesh[] {
  const skyHaze: RidgeColor = [0.52, 0.68, 0.8];
  const farHaze: RidgeColor = [0.58, 0.72, 0.82];

  // Serra continental muito distante: uma linha baixa e azulada, quase
  // dissolvida na bruma, que fecha o fundo da baía sem roubar a atenção.
  const farMainland: HorizonRidge = {
    name: 'serra-continental-distante',
    z: 560,
    xMin: -820,
    xMax: 820,
    segments: 180,
    baseY: -3,
    rows: 6,
    height(t) {
      const envelope = smoothstep(0.01, 0.1, t) * (1 - smoothstep(0.9, 0.99, t));
      const hills = fbm2D(t * 5.6 + 8.2, 3.1, 5) * 7.2 + Math.sin(t * 11.3 + 0.8) * 1.7;
      return envelope * (2.2 + hills);
    },
    color(rowT) {
      const top: RidgeColor = [0.33, 0.46, 0.57];
      const base: RidgeColor = [0.5, 0.64, 0.74];
      return hazed(mixColor(base, top, rowT), 0.2, farHaze);
    },
  };

  // Itaparica: serra média à esquerda, com colinas largas e um pequeno
  // contraforte mais alto. A bruma cobre quase metade da cor.
  const itaparica: HorizonRidge = {
    name: 'serra-itaparica',
    z: 380,
    xMin: -520,
    xMax: 45,
    segments: 190,
    baseY: -3,
    rows: 9,
    height(t) {
      const envelope = smoothstep(0.02, 0.14, t) * (1 - smoothstep(0.82, 0.985, t));
      const rolling = fbm2D(t * 4.1 + 12.7, 1.9, 4) * 9.5;
      const peak = Math.exp(-Math.pow((t - 0.58) / 0.12, 2)) * 5.5;
      const shoulder = Math.exp(-Math.pow((t - 0.24) / 0.1, 2)) * 3.2;
      return envelope * (3.2 + rolling + peak + shoulder);
    },
    color(rowT) {
      const top: RidgeColor = [0.2, 0.34, 0.37];
      const middle: RidgeColor = [0.26, 0.4, 0.43];
      const base: RidgeColor = [0.42, 0.56, 0.64];
      const local = rowT < 0.55
        ? mixColor(base, middle, rowT / 0.55)
        : mixColor(middle, top, (rowT - 0.55) / 0.45);
      return hazed(local, 0.42 * (1 - rowT * 0.4), skyHaze);
    },
  };

  // Cabeço central distante: preenche a abertura da baía entre o barco e a
  // Ilha dos Frades com uma silhueta baixa, quase toda dissolvida na bruma.
  const rightHeadland: HorizonRidge = {
    name: 'cabeco-central-distante',
    z: 455,
    xMin: -185,
    xMax: 125,
    segments: 150,
    baseY: -3,
    rows: 6,
    height(t) {
      const envelope = smoothstep(0.03, 0.18, t) * (1 - smoothstep(0.72, 0.98, t));
      const ridge = fbm2D(t * 6.4 + 2.2, 6.4, 4) * 5.8;
      const peak = Math.exp(-Math.pow((t - 0.42) / 0.17, 2)) * 3.4;
      return envelope * (1.4 + ridge + peak);
    },
    color(rowT) {
      const top: RidgeColor = [0.28, 0.41, 0.47];
      const base: RidgeColor = [0.44, 0.57, 0.66];
      return hazed(mixColor(base, top, rowT), 0.48, skyHaze);
    },
  };

  // Ilha dos Frades: a silhueta principal do quadro. Em vez de uma colina
  // única, três elevações com costões rochosos, vegetação em gradiente e
  // irregularidade de dossel na linha do topo.
  const ilhaDosFrades: HorizonRidge = {
    name: 'ilha-dos-frades',
    z: 262,
    xMin: 28,
    xMax: 350,
    segments: 280,
    baseY: -3.2,
    rows: 14,
    height(t) {
      const envelope = smoothstep(0.015, 0.12, t) * (1 - smoothstep(0.86, 1, t));
      const canopy = fbm2D(t * 21 + 3.4, 1.2, 4) * 2.3;
      // Copa miúda: quebra a linha do topo em copas de árvore em vez de uma
      // curva lisa, sem depender de textura ou height map.
      const canopyFine = fbm2D(t * 96 + 7.7, 4.2, 3) * 0.85;
      const peakA = Math.exp(-Math.pow((t - 0.3) / 0.125, 2)) * 21;
      const peakB = Math.exp(-Math.pow((t - 0.47) / 0.085, 2)) * 14;
      const peakC = Math.exp(-Math.pow((t - 0.63) / 0.07, 2)) * 8.2;
      const saddleA = Math.exp(-Math.pow((t - 0.39) / 0.035, 2)) * -2.6;
      const saddleB = Math.exp(-Math.pow((t - 0.55) / 0.03, 2)) * -2;
      return envelope * (1.8 + canopy + canopyFine + peakA + peakB + peakC + saddleA + saddleB);
    },
    color(rowT) {
      // Rocha molhada e algas na base; dossel verde-escuro no topo.
      const rockDark: RidgeColor = [0.25, 0.27, 0.26];
      const rockLit: RidgeColor = [0.33, 0.34, 0.3];
      const greenMid: RidgeColor = [0.19, 0.35, 0.24];
      const greenTop: RidgeColor = [0.27, 0.46, 0.32];

      let local: RidgeColor;
      if (rowT < 0.3) {
        local = mixColor(rockDark, rockLit, rowT / 0.3);
      } else if (rowT < 0.62) {
        local = mixColor(rockLit, greenMid, (rowT - 0.3) / 0.32);
      } else {
        local = mixColor(greenMid, greenTop, (rowT - 0.62) / 0.38);
      }

      // A base dissolve no azul da baía; o topo mantém o verde da Mata
      // Atlântica. Sem isso a ilha lê como um recorte preto colado no céu.
      return hazed(local, 0.5 * Math.pow(1 - rowT, 1.35) + 0.06, skyHaze);
    },
  };

  return [farMainland, itaparica, rightHeadland, ilhaDosFrades].map((ridge) =>
    buildHorizonRidgeMesh(scene, ridge),
  );
}

/**
 * Banda de bruma costeira logo acima da linha d'água.
 *
 * Fica à frente das ilhas e dissolve a base delas no azul do horizonte. É um
 * plano vertical com alfa por vértice (mais denso junto à água), o que evita o
 * recorte duro entre a silhueta e o mar.
 */
function buildHorizonHazeMesh(scene: Scene): Mesh {
  const z = 205;
  const rows: ReadonlyArray<readonly [number, number]> = [
    [-1, 0.5],
    [1.6, 0.3],
    [6.8, 0],
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const halfWidth = 900;

  for (let row = 0; row < rows.length; row += 1) {
    const [y, alpha] = rows[row];
    for (const x of [-halfWidth, halfWidth]) {
      positions.push(x, y, z);
      colors.push(0.62, 0.75, 0.84, alpha);
    }
  }

  for (let row = 0; row < rows.length - 1; row += 1) {
    const a = row * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }

  const mesh = new Mesh('bruma-horizonte', scene);
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.hasVertexAlpha = true;

  const material = new StandardMaterial('bruma-horizonte-material', scene);
  material.diffuseColor = Color3.Black();
  material.emissiveColor = new Color3(1, 1, 1);
  material.disableLighting = true;
  material.specularColor = Color3.Black();
  material.ambientColor = Color3.Black();
  material.backFaceCulling = false;
  material.fogEnabled = false;
  material.disableDepthWrite = true;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.applyFog = false;
  mesh.renderingGroupId = 0;
  return mesh;
}

export function createSkySystem(scene: Scene, _quality: SceneQualityProfile): SkySystem {
  const skybox = buildSkyDomeMesh(scene);
  const fallbackTexture = createFallbackSkyTexture(scene);

  const skyMaterial = new StandardMaterial('ceu-material', scene);
  skyMaterial.emissiveTexture = fallbackTexture;
  skyMaterial.emissiveColor = Color3.Black();
  skyMaterial.diffuseColor = Color3.Black();
  skyMaterial.specularColor = Color3.Black();
  skyMaterial.ambientColor = Color3.Black();
  skyMaterial.disableLighting = true;
  skyMaterial.backFaceCulling = false;
  skyMaterial.fogEnabled = false;
  skyMaterial.disableDepthWrite = true;
  skybox.material = skyMaterial;

  /**
   * O céu real é um panorama equiretangular (não um cubemap): o loader `.hdr`
   * do Babylon só decodifica texturas 2D. O arquivo já vem assado em 2048×1024,
   * com o horizonte em v = 0.5 e o sol em u = 0.445.
   */
  let skyTexture: Texture = fallbackTexture;
  let skyBaseLevel = SKY_LDR_LEVEL;
  skyTexture.level = skyBaseLevel;

  const usePanorama = (texture: Texture, level: number): void => {
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.level = level;
    texture.anisotropicFilteringLevel = 4;
    skyMaterial.emissiveTexture = texture;
    skyTexture = texture;
    skyBaseLevel = level;
    if (fallbackTexture !== texture) fallbackTexture.dispose();
  };

  const loadLdrFallback = (): void => {
    const panorama = new Texture(
      '/textures/sky/kirimure-sky.jpg',
      scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => usePanorama(panorama, SKY_LDR_LEVEL),
      () => {
        // Mantém o gradiente procedural: a cena continua legível sem rede.
      },
    );
  };

  const hdrTexture = new Texture(
    '/textures/sky/kirimure-sky.hdr',
    scene,
    false,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
    () => usePanorama(hdrTexture, SKY_HDR_LEVEL),
    () => loadLdrFallback(),
  );

  const horizonRidges = buildHorizonLayers(scene);
  const horizonHaze = buildHorizonHazeMesh(scene);

  const hemiLight = new HemisphericLight('luz-ambiente-marinha', new Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.88;
  hemiLight.diffuse = new Color3(0.44, 0.72, 0.94);
  // Luz de preenchimento vinda do leito: sem ela as faces verticais dos corais
  // ficavam quase pretas sob o véu azul.
  hemiLight.groundColor = new Color3(0.16, 0.36, 0.46);
  hemiLight.specular = new Color3(0.08, 0.14, 0.18);

  const sunLight = new DirectionalLight('luz-solar-hdr', LIGHT_SUN.scale(-1), scene);
  sunLight.intensity = 1.34;
  sunLight.diffuse = new Color3(1.0, 0.94, 0.82);
  sunLight.specular = new Color3(0.95, 0.92, 0.84);

  return {
    meshes: [skybox, ...horizonRidges, horizonHaze],
    sunDirection: VISIBLE_SUN,
    sunLight,
    hemiLight,
    update(_dt: number, visual: VisualState): void {
      // Turbidez/esgoto acinzenta suavemente o céu sem apagar o azul tropical.
      const murk = clamp(visual.turbidity * 0.45 + visual.sewage * 0.22 + visual.oil * 0.16, 0, 0.72);
      skyTexture.level = skyBaseLevel * (1 - murk * 0.45);
      const veil = murk * 0.28;
      skyMaterial.emissiveColor.set(MURK_TINT.r * veil, MURK_TINT.g * veil, MURK_TINT.b * veil);

      const clarity = visual.waterClarity;
      sunLight.intensity = 1.34 * (0.58 + clarity * 0.42);
      hemiLight.intensity = 0.88 * (0.62 + clarity * 0.38);
      hemiLight.diffuse.set(
        0.4 + 0.06 * (1 - visual.turbidity),
        0.68 + 0.08 * (1 - visual.turbidity),
        0.88 + 0.08 * (1 - visual.turbidity),
      );
      sunLight.diffuse.set(
        0.92 + 0.08 * clarity,
        0.86 + 0.08 * clarity,
        0.74 + 0.1 * clarity,
      );
    },
    setCameraPosition(_position: Vector3): void {
      // A esfera usa infiniteDistance; permanece centrada na câmera do diorama.
    },
  };
}
