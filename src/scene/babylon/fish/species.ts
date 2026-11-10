/**
 * Geometria e identidade visual das três espécies suportadas pela simulação.
 *
 * Os peixes são procedurais e propositalmente simples: corpo elíptico com
 * nadadeira dorsal, cauda separada (pivô próprio para a batida) e textura
 * desenhada em canvas. Quando os modelos BTS chegarem, basta trocar a malha
 * em `createFishMeshes` mantendo o contrato de dimensões e de cauda.
 */

import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { FishSpeciesId } from '../../../simulation/types';

type FishSocialStyle = 'loose_cluster' | 'compact_school' | 'solitary_grazer';
type FishTrophicRole = 'herbivore' | 'omnivore' | 'corallivore';
/** Posição ecológica na coluna d'água, usada para separar as bandas verticais. */
export type FishHabitat = 'pelagic' | 'midwater' | 'benthic';

export interface FishEcologicalProfile {
  id: FishSpeciesId;
  scientificName: string;
  commonName: string;
  family: string;
  trophicRole: FishTrophicRole;
  socialStyle: FishSocialStyle;
  habitat: FishHabitat;
  /**
   * Faixa de elevação preferencial [mínima, máxima] na coluna d'água local
   * (0 = leito sob o peixe, 1 = superfície). A conversão para metros usa a
   * batimetria real sob cada indivíduo, não uma cota fixa.
   */
  elevationBand: readonly [number, number];
  /** Folga mínima acima do leito local, em metros, para cada habitat. */
  minClearanceM: number;
  /** Raio de percepção visual no espaço normalizado. */
  perceptionRadius: number;
  /** Campo de visão total horizontal em graus (ex: 280° -> 80° de ponto cego caudal). */
  fieldOfViewDeg: number;
  /** Tendência territorial (0 = não territorial; 1 = sentinela estrita). */
  territorialTendency: number;
  /** Multiplicador de velocidade em fuga (burst flee). */
  fleeBurstMultiplier: number;
  /** Velocidade de propagação da onda de direção pelo cardume (em unidades normalizadas por segundo). */
  wavePropagationSpeed: number;
  /** Intervalo médio de pastagem em segundos [mín, máx]. */
  foragingInterval: readonly [number, number];
}

export const FISH_ECOLOGY: Record<FishSpeciesId, FishEcologicalProfile> = {
  'blue-tang': {
    id: 'blue-tang',
    scientificName: 'Acanthurus bahianus / Acanthurus coeruleus',
    commonName: 'Peixe-cirurgião-azul / Cirurgião-da-Bahia',
    family: 'Acanthuridae',
    trophicRole: 'herbivore',
    socialStyle: 'loose_cluster',
    habitat: 'pelagic',
    elevationBand: [0.55, 0.96],
    minClearanceM: 0.95,
    perceptionRadius: 0.16,
    fieldOfViewDeg: 285,
    territorialTendency: 0.0,
    fleeBurstMultiplier: 1.55,
    wavePropagationSpeed: 2.8,
    foragingInterval: [4.0, 9.0],
  },
  'sergeant-major': {
    id: 'sergeant-major',
    scientificName: 'Abudefduf saxatilis',
    commonName: 'Sargentinho / Pintado',
    family: 'Pomacentridae',
    trophicRole: 'omnivore',
    socialStyle: 'compact_school',
    habitat: 'midwater',
    elevationBand: [0.34, 0.74],
    minClearanceM: 0.65,
    perceptionRadius: 0.14,
    fieldOfViewDeg: 290,
    territorialTendency: 0.35,
    fleeBurstMultiplier: 1.65,
    wavePropagationSpeed: 3.6,
    foragingInterval: [5.0, 11.0],
  },
  parrotfish: {
    id: 'parrotfish',
    scientificName: 'Sparisoma viride / Scarus trispinosus',
    commonName: 'Peixe-papagaio / Budião-azul',
    family: 'Scaridae',
    trophicRole: 'corallivore',
    socialStyle: 'solitary_grazer',
    habitat: 'benthic',
    elevationBand: [0.06, 0.32],
    minClearanceM: 0.22,
    perceptionRadius: 0.12,
    fieldOfViewDeg: 270,
    territorialTendency: 0.05,
    fleeBurstMultiplier: 1.35,
    wavePropagationSpeed: 1.8,
    foragingInterval: [2.5, 6.0],
  },
};

export interface FishVisualDefinition {
  id: FishSpeciesId;
  label: string;
  /** Comprimento do corpo em metros. */
  length: number;
  /** Meia-altura do corpo (fração do comprimento). */
  height: number;
  /** Meia-largura do corpo (fração do comprimento). */
  width: number;
  bodyColor: readonly [number, number, number];
  tailColor: readonly [number, number, number];
  finColor: readonly [number, number, number];
  bleachedColor: readonly [number, number, number];
  /** Velocidade de cruzeiro no espaço normalizado (frações de tela por segundo). */
  cruiseSpeed: number;
  maxSpeed: number;
  turnRate: number;
  acceleration: number;
  tailBeat: number;
  /** Quantidade de cardumes independentes. */
  schools: number;
  /** Amplitude da formação em u / elevação / profundidade. */
  spread: readonly [number, number, number];
}

export const FISH_VISUALS: Record<FishSpeciesId, FishVisualDefinition> = {
  'blue-tang': {
    id: 'blue-tang',
    label: 'Peixe-cirurgião',
    length: 0.30,
    height: 0.22,
    width: 0.09,
    bodyColor: [0.05, 0.28, 0.95],
    tailColor: [0.98, 0.78, 0.12],
    finColor: [0.04, 0.2, 0.65],
    bleachedColor: [0.82, 0.86, 0.88],
    cruiseSpeed: 0.068,
    maxSpeed: 0.125,
    turnRate: 2.8,
    acceleration: 0.22,
    tailBeat: 5.8,
    schools: 2,
    spread: [0.125, 0.072, 0.048],
  },
  'sergeant-major': {
    id: 'sergeant-major',
    label: 'Sargentinho',
    length: 0.18,
    height: 0.17,
    width: 0.08,
    bodyColor: [0.93, 0.87, 0.5],
    tailColor: [0.9, 0.84, 0.5],
    finColor: [0.85, 0.78, 0.42],
    bleachedColor: [0.88, 0.88, 0.82],
    cruiseSpeed: 0.052,
    maxSpeed: 0.096,
    turnRate: 3.4,
    acceleration: 0.24,
    tailBeat: 6.0,
    schools: 2,
    spread: [0.082, 0.048, 0.032],
  },
  parrotfish: {
    id: 'parrotfish',
    label: 'Peixe-papagaio',
    length: 0.60,
    height: 0.20,
    width: 0.12,
    bodyColor: [0.12, 0.62, 0.46],
    tailColor: [0.95, 0.44, 0.36],
    finColor: [0.1, 0.5, 0.4],
    bleachedColor: [0.82, 0.88, 0.82],
    cruiseSpeed: 0.028,
    maxSpeed: 0.056,
    turnRate: 1.9,
    acceleration: 0.09,
    tailBeat: 3.2,
    schools: 0,
    spread: [0.065, 0.032, 0.020],
  },
};

export interface FishMeshSet {
  body: Mesh;
  tail: Mesh;
  bodyMaterial: StandardMaterial;
  tailMaterial: StandardMaterial;
}

function bodyRadius(t: number, definition: FishVisualDefinition): number {
  // Perfil fechado: pedúnculo estreito na cauda, corpo alto no meio, focinho curto.
  const base = Math.pow(Math.sin(Math.PI * Math.min(0.999, 0.06 + t * 0.94)), 0.72);
  const dorsal = 1 + 0.1 * Math.sin(Math.PI * t * 2.2);
  void definition;
  return base * dorsal;
}

function createStripeTexture(scene: Scene, definition: FishVisualDefinition): DynamicTexture {
  const size = 256;
  const texture = new DynamicTexture(`peixe-textura-${definition.id}`, { width: size, height: size }, scene, false);
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  context.fillStyle = '#f2f2f2';
  context.fillRect(0, 0, size, size);

  if (definition.id === 'sergeant-major') {
    // Cinco barras verticais escuras, como no sargentinho.
    context.fillStyle = 'rgba(20, 24, 28, 0.78)';
    for (let index = 0; index < 5; index += 1) {
      const x = size * (0.12 + index * 0.16);
      context.fillRect(x, 0, size * 0.055, size);
    }
    context.fillStyle = 'rgba(255, 244, 190, 0.5)';
    context.fillRect(0, size * 0.72, size, size * 0.1);
  } else if (definition.id === 'blue-tang') {
    // Faixa escura do dorso + marcação lateral azul-escura.
    context.fillStyle = 'rgba(8, 14, 30, 0.7)';
    context.beginPath();
    context.ellipse(size * 0.52, size * 0.2, size * 0.3, size * 0.12, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(6, 12, 28, 0.7)';
    context.lineWidth = size * 0.05;
    context.beginPath();
    context.moveTo(size * 0.2, size * 0.48);
    context.bezierCurveTo(size * 0.4, size * 0.3, size * 0.7, size * 0.36, size * 0.86, size * 0.54);
    context.stroke();
  } else {
    // Escamas do papagaio: arcos claros e manchas rosadas.
    context.strokeStyle = 'rgba(40, 70, 55, 0.35)';
    context.lineWidth = 2;
    for (let y = 0; y < size; y += 18) {
      for (let x = (y / 18) % 2 === 0 ? 0 : 9; x < size; x += 18) {
        context.beginPath();
        context.arc(x, y, 8, 0.25 * Math.PI, 0.75 * Math.PI);
        context.stroke();
      }
    }
    context.fillStyle = 'rgba(255, 170, 150, 0.25)';
    context.fillRect(size * 0.55, 0, size * 0.08, size);
  }

  texture.update(false);
  texture.wrapU = DynamicTexture.WRAP_ADDRESSMODE;
  texture.wrapV = DynamicTexture.WRAP_ADDRESSMODE;
  return texture;
}

function createBodyMesh(scene: Scene, definition: FishVisualDefinition): Mesh {
  const rings = 18;
  const sides = 10;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const z = t - 0.5;
    const radius = bodyRadius(t, definition);
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      positions.push(
        Math.cos(angle) * definition.width * radius,
        Math.sin(angle) * definition.height * radius,
        z,
      );
      uvs.push(side / sides, t);
    }
  }

  for (let ring = 0; ring < rings; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const a = ring * sides + side;
      const b = ring * sides + ((side + 1) % sides);
      const c = a + sides;
      const d = b + sides;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Focinho fechado.
  const snout = positions.length / 3;
  positions.push(0, 0, 0.52);
  uvs.push(0.5, 1);
  const lastRing = rings * sides;
  for (let side = 0; side < sides; side += 1) {
    indices.push(lastRing + side, lastRing + ((side + 1) % sides), snout);
  }

  // Nadadeira dorsal e anal: lâminas finas, coerentes com o perfil do corpo.
  const addFin = (fromT: number, toT: number, height: number, lower: boolean) => {
    const base = positions.length / 3;
    for (let step = 0; step <= 8; step += 1) {
      const t = fromT + ((toT - fromT) * step) / 8;
      const z = t - 0.5;
      const radius = bodyRadius(t, definition);
      const y = (lower ? -1 : 1) * definition.height * radius;
      positions.push(0, y, z);
      positions.push(0, y + (lower ? -1 : 1) * height * Math.sin((Math.PI * step) / 8), z);
      uvs.push(0, t, 1, t);
    }
    for (let step = 0; step < 8; step += 1) {
      const a = base + step * 2;
      if (lower) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };

  addFin(0.18, 0.72, definition.height * 0.7, false);
  addFin(0.26, 0.62, definition.height * 0.42, true);

  const mesh = new Mesh(`peixe-corpo-${definition.id}`, scene);
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.isPickable = false;
  return mesh;
}

function createTailMesh(scene: Scene, definition: FishVisualDefinition): Mesh {
  const spread = definition.height * 1.55;
  const length = 0.4;
  const positions = [
    0, 0, 0,
    0, spread, -length,
    0, 0, -length * 0.5,
    0, -spread, -length,
  ];
  const uvs = [0.5, 0, 0.5, 1, 0.5, 0.5, 0.5, 0];
  const indices = [0, 1, 2, 0, 2, 3];

  const mesh = new Mesh(`peixe-cauda-${definition.id}`, scene);
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.isPickable = false;
  return mesh;
}

export function createFishMeshes(scene: Scene, definition: FishVisualDefinition): FishMeshSet {
  const texture = createStripeTexture(scene, definition);

  const bodyMaterial = new StandardMaterial(`peixe-corpo-material-${definition.id}`, scene);
  bodyMaterial.diffuseTexture = texture;
  bodyMaterial.diffuseColor = new Color3(1, 1, 1);
  bodyMaterial.specularColor = new Color3(0.72, 0.78, 0.74);
  bodyMaterial.specularPower = 64;
  bodyMaterial.emissiveColor = new Color3(0.012, 0.016, 0.014);
  bodyMaterial.backFaceCulling = false;

  const tailMaterial = new StandardMaterial(`peixe-cauda-material-${definition.id}`, scene);
  tailMaterial.diffuseTexture = texture;
  tailMaterial.diffuseColor = new Color3(1, 1, 1);
  tailMaterial.specularColor = new Color3(0.35, 0.38, 0.36);
  tailMaterial.specularPower = 32;
  tailMaterial.emissiveColor = new Color3(0.012, 0.016, 0.014);
  tailMaterial.backFaceCulling = false;

  const body = createBodyMesh(scene, definition);
  body.material = bodyMaterial;
  body.alwaysSelectAsActiveMesh = true;
  body.doNotSyncBoundingInfo = true;
  body.isPickable = false;
  body.receiveShadows = true;

  const tail = createTailMesh(scene, definition);
  tail.material = tailMaterial;
  tail.alwaysSelectAsActiveMesh = true;
  tail.doNotSyncBoundingInfo = true;
  tail.isPickable = false;
  tail.receiveShadows = true;

  return { body, tail, bodyMaterial, tailMaterial };
}
