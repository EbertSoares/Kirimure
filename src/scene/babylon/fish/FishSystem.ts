/**
 * Sistema de peixes 3D do diorama com IA de cardume organizado (cadeia + vórtice
 * circular), separação Boids 3D sem sobreposição e reação inteligente aos
 * modelos 3D do recife (pastagem em corais e fuga/abrigo em corais e rochas).
 *
 * Quando os GLBs BTS chegarem, `species.ts` troca a malha-fonte e este arquivo
 * mantém o mesmo contrato de agentes, cardumes, ciclos de vida e diagnóstico.
 */

import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { FishSpeciesId, SimulationState } from '../../../simulation/types';
import type { DioramaFrame } from '../framing';
import { clamp, mix, mulberry32 } from '../procedural';
import type { SceneQualityProfile } from '../quality';
import {
  nearestReefObstacle,
  nearestReefShelter,
  projectReefObstacles,
  reefInteractionTarget,
  resolveReefCollisions,
  steerAroundReef,
  type ReefObstacle,
  type ScreenObstacle,
} from '../reefObstacles';
import type { VisualState } from '../visualState';
import { sampleMarineCurrent, sampleOcean } from '../waves';
import type { BoatHullBounds } from '../boat';
import {
  clampPointToBand,
  createSchoolState,
  formationPosition,
  repelSchools,
  schoolDepthBand,
  updateSchoolState,
  type SchoolBand,
  type SchoolConfig,
  type SchoolState,
} from './school';
import {
  add,
  length,
  normalize,
  scale,
  steer,
  sub,
  type Vec3Tuple,
} from './steering';
import {
  createFishMeshes,
  FISH_ECOLOGY,
  FISH_VISUALS,
  type FishMeshSet,
  type FishVisualDefinition,
} from './species';

type FishDeathStage = 'alive' | 'sinking' | 'bottom' | 'repopulating';
type FishBehavior =
  | 'school'
  | 'nibble'
  | 'hide'
  | 'hover'
  | 'wander'
  | 'dart'
  | 'flee';
type FishSocialRole = 'school' | 'solitary' | 'territorial';

export interface FishDiagnostic {
  species: FishSpeciesId;
  schoolId: number;
  socialRole: FishSocialRole;
  deathStage: FishDeathStage;
  /** Posição normalizada na tela: u horizontal, v vertical, depth profundidade. */
  position: { u: number; v: number; depth: number };
  u: number;
  v: number;
  depth: number;
  elevation: number;
  /** Saúde visual da espécie no instante (0..1). */
  health: number;
  /** Comportamento atual, útil para diagnóstico das interações com o recife. */
  behavior: FishBehavior;
  /** Intensidade da bicada no coral (0..1). */
  nibble: number;
  /** Velocidade escalar atual no espaço normalizado. */
  speed?: number;
  /** Quantidade de vizinhos detectados no raio de percepção. */
  neighborsCount?: number;
  /** Ponto-alvo da interação atual (null quando apenas nadando). */
  behaviorTarget: Vec3Tuple | null;
}

interface FishAgent {
  species: FishSpeciesId;
  schoolId: number;
  socialRole: FishSocialRole;
  localIndex: number;
  point: Vec3Tuple;
  velocity: Vec3Tuple;
  boidsForce: Vec3Tuple;
  dir: Vec3Tuple;
  seat: Vec3Tuple;
  wobble: number;
  size: number;
  phase: number;
  roll: number;
  bend: number;
  behavior: FishBehavior;
  scared: boolean;
  behaviorTimer: number;
  behaviorCooldown: number;
  minDwellTimer: number;
  decisionTimer: number;
  neighborsCount: number;
  behaviorTarget: Vec3Tuple | null;
  behaviorObstacle: ScreenObstacle | null;
  nibble: number;
  solitaryTarget: Vec3Tuple | null;
  solitaryTimer: number;
  pauseTimer: number;
  homeObstacle: ScreenObstacle | null;
  homePoint: Vec3Tuple | null;
  dartTimer: number;
  stage: FishDeathStage;
  stageElapsed: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  bodyRadiusU: number;
  bodyRadiusE: number;
  bodyRadiusD: number;
  hasPrevious: boolean;
  previousX: number;
  previousY: number;
  previousZ: number;
  screenV: number;
  currentQuat: Quaternion;
  diagnostic: FishDiagnostic | null;
}

interface SchoolRuntime {
  id: number;
  species: FishSpeciesId;
  config: SchoolConfig;
  state: SchoolState;
  agents: FishAgent[];
  /** Camada de profundidade (0 = perto da câmera; 2 = fundo do recife). */
  depthLayer: number;
}

interface SpeciesRuntime {
  definition: FishVisualDefinition;
  meshes: FishMeshSet;
  agents: FishAgent[];
  bodyMatrices: Float32Array;
  tailMatrices: Float32Array;
  bodyColors: Float32Array;
  tailColors: Float32Array;
}

export interface FishEnvironment {
  /** Array vivo mantido pelo terreno; é relido a cada layout. */
  obstacles: readonly ReefObstacle[];
  seabedAt(x: number, z: number): number;
}

export interface FishSystem {
  readonly meshes: AbstractMesh[];
  readonly shadowCasters: readonly AbstractMesh[];
  readonly fishes: FishDiagnostic[];
  layout(frame: DioramaFrame): void;
  update(
    seconds: number,
    dt: number,
    state: SimulationState,
    visual: VisualState,
    boatBounds?: BoatHullBounds,
  ): void;
  reset(): void;
}

const SPECIES_ORDER: FishSpeciesId[] = ['blue-tang', 'sergeant-major', 'parrotfish'];
/** Topo da coluna útil: ligeiramente abaixo da superfície para evitar corte da nadadeira. */
const FISH_SURFACE_Y = -0.7;
const DEFAULT_FLOOR_CLEARANCE_M = 0.54;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface FishColumn {
  x: number;
  z: number;
  relZ: number;
  floorY: number;
  spanY: number;
}

function writeIdentity(matrices: Float32Array, index: number): void {
  const offset = index * 16;
  matrices.fill(0, offset, offset + 16);
  matrices[offset] = 0.0001;
  matrices[offset + 5] = 0.0001;
  matrices[offset + 10] = 0.0001;
  matrices[offset + 15] = 1;
}

/**
 * Cria um agente com assento organizado em formação de fita/diamante 3D:
 * o índice 0 lidera a cadeia e os demais se distribuem em camadas escalonadas
 * sem colidir no mesmo ponto local.
 */
function createAgent(
  definition: FishVisualDefinition,
  school: SchoolRuntime | null,
  localIndex: number,
  totalInSchool: number,
  random: () => number,
  socialRole: FishSocialRole = 'school',
): FishAgent {
  const count = Math.max(1, totalInSchool);
  const progress = count > 1 ? localIndex / (count - 1) : 0.5;
  const ringRadius = Math.sqrt((localIndex + 0.5) / count);
  const angle = localIndex * GOLDEN_ANGLE;

  let seat: Vec3Tuple;
  if (definition.id === 'blue-tang') {
    // Cirurgiões-azuis: distribuição volumétrica 3D (casca + núcleo elipsoidal) com espaçamento variável
    const phi = Math.acos(1 - 2 * ((localIndex + 0.5) / count));
    const theta = angle;
    const r = Math.cbrt((localIndex + 0.35) / count) * (0.55 + random() * 0.45);
    seat = [
      Math.sin(phi) * Math.cos(theta) * definition.spread[0] * r * 1.35,
      Math.cos(phi) * definition.spread[1] * r * 1.35,
      Math.sin(phi) * Math.sin(theta) * definition.spread[2] * r * 1.45,
    ];
  } else {
    // Sargentinhos: formação compacta escalonada
    const zOffset = (0.5 - progress) * definition.spread[2] * 2.0;
    seat = [
      Math.cos(angle) * (0.28 + 0.72 * ringRadius) * definition.spread[0],
      Math.sin(angle * 1.15) * (0.28 + 0.72 * ringRadius) * definition.spread[1],
      zOffset + Math.cos(angle * 0.7) * definition.spread[2] * 0.45,
    ];
  }
  const wobble = localIndex * 0.52 + random() * 0.6;
  let point: Vec3Tuple;
  let velocity: Vec3Tuple;
  let dir: Vec3Tuple;

  if (school) {
    point = formationPosition(
      school.state.center,
      school.state.velocity,
      seat,
      wobble,
      0,
      school.config.band,
      school.state,
    );
    const dirSign = school.state.velocity[0] >= 0 ? 1 : -1;
    const initDirLen = Math.hypot(dirSign, school.state.velocity[2] * 2.5) || 1;
    dir = [dirSign / initDirLen, 0, (school.state.velocity[2] * 2.5) / initDirLen];
    velocity = [school.state.velocity[0], school.state.velocity[1], school.state.velocity[2]];
  } else {
    const dirSign = localIndex % 2 === 0 ? 1 : -1;
    point = [0.18 + (localIndex / count) * 0.64, 0.35, 0.5];
    velocity = socialRole === 'territorial' ? [0, 0, 0] : [dirSign * definition.cruiseSpeed, 0, 0];
    dir = [dirSign, 0, 0];
  }

  const initialBehavior: FishBehavior =
    socialRole === 'school' ? 'school' : socialRole === 'territorial' ? 'hover' : 'wander';

  return {
    species: definition.id,
    schoolId: school ? school.id : -1,
    socialRole,
    localIndex,
    point,
    velocity,
    boidsForce: [0, 0, 0],
    dir,
    seat,
    wobble,
    size: 0.86 + random() * 0.28,
    phase: random() * Math.PI * 2,
    roll: 0,
    bend: 0,
    behavior: initialBehavior,
    scared: false,
    behaviorTimer: 0,
    behaviorCooldown: 2.5 + random() * 6.5,
    minDwellTimer: 0,
    decisionTimer: random() * 0.5,
    neighborsCount: 0,
    behaviorTarget: null,
    behaviorObstacle: null,
    nibble: 0,
    solitaryTarget: null,
    solitaryTimer: 3.5 + random() * 6.5,
    pauseTimer: 0,
    homeObstacle: null,
    homePoint: null,
    dartTimer: 5.0 + random() * 6.5,
    stage: 'alive',
    stageElapsed: 0,
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    bodyRadiusU: 0.012,
    bodyRadiusE: 0.014,
    bodyRadiusD: 0.006,
    hasPrevious: false,
    previousX: 0,
    previousY: 0,
    previousZ: 0,
    screenV: 0.5,
    currentQuat: Quaternion.Identity(),
    diagnostic: null,
  };
}

export function createFishSystem(
  scene: Scene,
  quality: SceneQualityProfile,
  environment: FishEnvironment,
): FishSystem {
  const random = mulberry32(0x5eed1234);
  const speciesRuntime: SpeciesRuntime[] = [];
  const schoolRuntime: SchoolRuntime[] = [];
  const allAgents: Array<{ agent: FishAgent; definition: FishVisualDefinition; school: SchoolRuntime | null }> = [];
  const diagnostics: FishDiagnostic[] = [];

  const fishScale = Math.max(1, quality.fishScale);
  let frameRef: DioramaFrame | null = null;
  let schoolIdCounter = 0;
  let lastColorUpdate = -1;
  let startlePulseCooldown = 4.5;
  let screenObstacles: ScreenObstacle[] = [];

  for (const species of SPECIES_ORDER) {
    const definition = FISH_VISUALS[species];
    const ecology = FISH_ECOLOGY[species];
    const isBlueTang = species === 'blue-tang';
    const count = quality.fishPopulation[species];
    const meshes = createFishMeshes(scene, definition);
    const group: SpeciesRuntime = {
      definition,
      meshes,
      agents: [],
      bodyMatrices: new Float32Array(count * 16),
      tailMatrices: new Float32Array(count * 16),
      bodyColors: new Float32Array(count * 4),
      tailColors: new Float32Array(count * 4),
    };
    meshes.body.thinInstanceSetBuffer('matrix', group.bodyMatrices, 16, false);
    meshes.tail.thinInstanceSetBuffer('matrix', group.tailMatrices, 16, false);
    meshes.body.thinInstanceSetBuffer('color', group.bodyColors, 4, false);
    meshes.tail.thinInstanceSetBuffer('color', group.tailColors, 4, false);
    meshes.body.renderingGroupId = 1;
    meshes.tail.renderingGroupId = 1;

    const schoolsForSpecies: SchoolRuntime[] = [];
    const baseBand: SchoolBand = {
      uMin: 0.1,
      uMax: 0.9,
      elevationMin: ecology.elevationBand[0],
      elevationMax: ecology.elevationBand[1],
      depthMin: 0.28,
      depthMax: 0.88,
    };

    for (let index = 0; index < definition.schools; index += 1) {
      const depthLayer = (schoolIdCounter + index) % 3;
      const [depthMin, depthMax] = schoolDepthBand(baseBand.depthMin, baseBand.depthMax, depthLayer);
      const config: SchoolConfig = {
        band: { ...baseBand, depthMin, depthMax },
        speed: definition.cruiseSpeed,
        aMax: definition.acceleration * 0.32,
        turnMax: isBlueTang ? 1.05 : 1.35,
        retargetMin: isBlueTang ? 8.5 : 6.5,
        retargetMax: isBlueTang ? 15.5 : 13.0,
        spreadU: definition.spread[0],
        spreadElevation: definition.spread[1],
        spreadDepth: definition.spread[2],
        formationMode: isBlueTang ? 'cluster' : 'stream',
        wavePropagationSpeed: ecology.wavePropagationSpeed,
      };
      const state = createSchoolState(random, config);
      const slotFraction = (index + 0.5) / Math.max(1, definition.schools);
      state.center[0] = clamp(0.18 + slotFraction * 0.64, config.band.uMin + 0.06, config.band.uMax - 0.06);
      const elevSpan = config.band.elevationMax - config.band.elevationMin;
      state.center[1] = clamp(
        config.band.elevationMin + elevSpan * (0.35 + (index * 0.3) + (random() - 0.5) * 0.12),
        config.band.elevationMin + 0.04,
        config.band.elevationMax - 0.04,
      );
      state.center[2] = (depthMin + depthMax) * 0.5;
      const initialSign = schoolIdCounter % 2 === 0 ? 1 : -1;
      state.velocity[0] = initialSign * definition.cruiseSpeed * 0.92;
      state.velocity[1] = 0;
      state.velocity[2] = (random() - 0.5) * definition.cruiseSpeed * 0.12;
      state.heading = Math.atan2(state.velocity[0], state.velocity[2]);
      state.target[0] = initialSign > 0 ? config.band.uMax - 0.08 : config.band.uMin + 0.08;
      if (state.trail) {
        for (let tIdx = 0; tIdx < state.trail.length; tIdx += 1) {
          state.trail[tIdx] = clampPointToBand(
            [
              state.center[0] - state.velocity[0] * 0.065 * tIdx,
              state.center[1],
              state.center[2] - state.velocity[2] * 0.065 * tIdx,
            ],
            config.band,
          );
        }
      }

      const school: SchoolRuntime = {
        id: schoolIdCounter,
        species,
        config,
        state,
        agents: [],
        depthLayer,
      };
      schoolIdCounter += 1;
      schoolRuntime.push(school);
      schoolsForSpecies.push(school);
    }

    if (species === 'parrotfish') {
      // 100% Solitários ou pares independentes forrageando pelo recife (sem cardume)
      for (let index = 0; index < count; index += 1) {
        const agent = createAgent(definition, null, index, count, random, 'solitary');
        group.agents.push(agent);
        allAgents.push({ agent, definition, school: null });
        const diagnostic: FishDiagnostic = {
          species,
          schoolId: -1,
          socialRole: 'solitary',
          deathStage: 'alive',
          position: { u: agent.point[0], v: 0.5, depth: agent.point[2] },
          u: agent.point[0],
          v: 0.5,
          depth: agent.point[2],
          elevation: agent.point[1],
          health: 1,
          behavior: 'wander',
          nibble: 0,
          behaviorTarget: null,
        };
        agent.diagnostic = diagnostic;
        diagnostics.push(diagnostic);
      }
    } else if (species === 'blue-tang') {
      // Cardumes coordenados (stream + mill) + alguns vagantes solitários (wanderers)
      const wandererCount = Math.min(4, Math.max(2, Math.round(count * 0.08)));
      const schoolingCount = count - wandererCount;
      const perSchool = Math.ceil(schoolingCount / Math.max(1, schoolsForSpecies.length));

      for (let index = 0; index < schoolingCount; index += 1) {
        const school = schoolsForSpecies[index % schoolsForSpecies.length];
        const localIndex = school.agents.length;
        const agent = createAgent(definition, school, localIndex, perSchool, random, 'school');
        school.agents.push(agent);
        group.agents.push(agent);
        allAgents.push({ agent, definition, school });
        const diagnostic: FishDiagnostic = {
          species,
          schoolId: school.id,
          socialRole: 'school',
          deathStage: 'alive',
          position: { u: agent.point[0], v: 0.5, depth: agent.point[2] },
          u: agent.point[0],
          v: 0.5,
          depth: agent.point[2],
          elevation: agent.point[1],
          health: 1,
          behavior: 'school',
          nibble: 0,
          behaviorTarget: null,
        };
        agent.diagnostic = diagnostic;
        diagnostics.push(diagnostic);
      }

      for (let index = 0; index < wandererCount; index += 1) {
        const agent = createAgent(definition, null, index, wandererCount, random, 'solitary');
        group.agents.push(agent);
        allAgents.push({ agent, definition, school: null });
        const diagnostic: FishDiagnostic = {
          species,
          schoolId: -1,
          socialRole: 'solitary',
          deathStage: 'alive',
          position: { u: agent.point[0], v: 0.5, depth: agent.point[2] },
          u: agent.point[0],
          v: 0.5,
          depth: agent.point[2],
          elevation: agent.point[1],
          health: 1,
          behavior: 'wander',
          nibble: 0,
          behaviorTarget: null,
        };
        agent.diagnostic = diagnostic;
        diagnostics.push(diagnostic);
      }
    } else {
      // sergeant-major: Cardumes soltos de alimentação na meia-água + machos territoriais solitários
      const territorialCount = Math.max(6, Math.round(count * 0.32));
      const schoolingCount = count - territorialCount;
      const perSchool = Math.ceil(schoolingCount / Math.max(1, schoolsForSpecies.length));

      for (let index = 0; index < schoolingCount; index += 1) {
        const school = schoolsForSpecies[index % schoolsForSpecies.length];
        const localIndex = school.agents.length;
        const agent = createAgent(definition, school, localIndex, perSchool, random, 'school');
        school.agents.push(agent);
        group.agents.push(agent);
        allAgents.push({ agent, definition, school });
        const diagnostic: FishDiagnostic = {
          species,
          schoolId: school.id,
          socialRole: 'school',
          deathStage: 'alive',
          position: { u: agent.point[0], v: 0.5, depth: agent.point[2] },
          u: agent.point[0],
          v: 0.5,
          depth: agent.point[2],
          elevation: agent.point[1],
          health: 1,
          behavior: 'school',
          nibble: 0,
          behaviorTarget: null,
        };
        agent.diagnostic = diagnostic;
        diagnostics.push(diagnostic);
      }

      for (let index = 0; index < territorialCount; index += 1) {
        const agent = createAgent(definition, null, index, territorialCount, random, 'territorial');
        group.agents.push(agent);
        allAgents.push({ agent, definition, school: null });
        const diagnostic: FishDiagnostic = {
          species,
          schoolId: -1,
          socialRole: 'territorial',
          deathStage: 'alive',
          position: { u: agent.point[0], v: 0.5, depth: agent.point[2] },
          u: agent.point[0],
          v: 0.5,
          depth: agent.point[2],
          elevation: agent.point[1],
          health: 1,
          behavior: 'hover',
          nibble: 0,
          behaviorTarget: null,
        };
        agent.diagnostic = diagnostic;
        diagnostics.push(diagnostic);
      }
    }

    for (let index = 0; index < count; index += 1) {
      group.bodyColors[index * 4] = definition.bodyColor[0];
      group.bodyColors[index * 4 + 1] = definition.bodyColor[1];
      group.bodyColors[index * 4 + 2] = definition.bodyColor[2];
      group.bodyColors[index * 4 + 3] = 1;
      group.tailColors[index * 4] = definition.tailColor[0];
      group.tailColors[index * 4 + 1] = definition.tailColor[1];
      group.tailColors[index * 4 + 2] = definition.tailColor[2];
      group.tailColors[index * 4 + 3] = 1;
      writeIdentity(group.bodyMatrices, index);
      writeIdentity(group.tailMatrices, index);
    }
    meshes.body.thinInstanceBufferUpdated('matrix');
    meshes.tail.thinInstanceBufferUpdated('matrix');
    meshes.body.thinInstanceBufferUpdated('color');
    meshes.tail.thinInstanceBufferUpdated('color');
    speciesRuntime.push(group);
  }

  const scratchPosition = new Vector3();
  const scratchTailPosition = new Vector3();
  const scratchScale = new Vector3();
  const scratchRight = new Vector3();
  const scratchUp = new Vector3();
  const scratchForward = new Vector3();
  const scratchMatrix = new Matrix();
  const bodyQuaternion = Quaternion.Identity();
  const tailQuaternion = Quaternion.Identity();
  const bendQuaternion = Quaternion.Identity();
  const nibbleQuaternion = Quaternion.Identity();
  const finalBodyQuaternion = Quaternion.Identity();
  const scratchQuat1 = Quaternion.Identity();
  const tailOffset = new Vector3();

  function configureBand(
    frame: DioramaFrame,
    depthLayer: number,
    speciesId: FishSpeciesId = 'blue-tang',
  ): SchoolBand {
    // Margem horizontal folgada para manter os cardumes longe dos paredões laterais de rocha
    const margin = frame.profile.marginX + 0.048;
    const [depthMin, depthMax] = schoolDepthBand(
      frame.profile.fishDepthMin,
      frame.profile.fishDepthMax,
      depthLayer,
    );
    const ecology = FISH_ECOLOGY[speciesId];
    const elevMin = ecology.elevationBand[0];
    const elevMax =
      frame.profile.id === 'mobile'
        ? Math.min(0.86, ecology.elevationBand[1] + 0.04)
        : ecology.elevationBand[1];

    return {
      uMin: margin,
      uMax: 1 - margin,
      elevationMin: elevMin,
      elevationMax: elevMax,
      depthMin,
      depthMax,
    };
  }

  let hasLaidOutOnce = false;

  function updateSchoolBands(frame: DioramaFrame): void {
    for (const school of schoolRuntime) {
      const band = configureBand(frame, school.depthLayer, school.species);
      school.config.band = band;
      if (!hasLaidOutOnce) {
        school.state.center[2] = (band.depthMin + band.depthMax) * 0.5;
        school.state.center[1] = (band.elevationMin + band.elevationMax) * 0.5;
      }
      school.state.center = clampPointToBand(school.state.center, band);
      school.state.target = clampPointToBand(school.state.target, band);
      if (school.state.trail) {
        for (let tIdx = 0; tIdx < school.state.trail.length; tIdx += 1) {
          school.state.trail[tIdx] = clampPointToBand(
            [
              school.state.center[0] - school.state.velocity[0] * 0.065 * tIdx,
              school.state.center[1],
              school.state.center[2] - school.state.velocity[2] * 0.065 * tIdx,
            ],
            band,
          );
        }
      }
      if (!hasLaidOutOnce) {
        for (const agent of school.agents) {
          agent.point = formationPosition(
            school.state.center,
            school.state.velocity,
            agent.seat,
            agent.wobble,
            0,
            band,
            school.state,
          );
        }
      }
    }
    hasLaidOutOnce = true;
  }

  /**
   * Converte a posição normalizada do peixe para o mundo e resolve o leito
   * *local* sob ele. A elevação 0 é o sedimento naquele ponto; a elevação 1 é
   * a superfície útil. Assim cada espécie mantém sua banda vertical mesmo sobre
   * bancadas rasas, canais de 15 m e depressões.
   */
  function columnForPoint(frame: DioramaFrame, point: Vec3Tuple): FishColumn {
    const relZ = frame.relativeDepth(point[2]);
    const x = (point[0] * 2 - 1) * relZ * frame.tanHalfFov * frame.aspect;
    const z = frame.camZ + relZ;
    const floorY = Math.min(FISH_SURFACE_Y - 0.2, environment.seabedAt(x, z));
    return { x, z, relZ, floorY, spanY: FISH_SURFACE_Y - floorY };
  }

  function floorElevationAt(
    frame: DioramaFrame,
    point: Vec3Tuple,
    clearanceM = DEFAULT_FLOOR_CLEARANCE_M,
  ): number {
    const { spanY } = columnForPoint(frame, point);
    // A folga é convertida para elevação local (0 = leito). Corais, rochas e
    // ondulações de areia nunca são atravessados, independentemente da cota.
    return clamp(clearanceM / Math.max(1e-4, spanY), 0.02, 0.82);
  }

  function worldForPoint(
    frame: DioramaFrame,
    point: Vec3Tuple,
  ): { x: number; y: number; z: number; relZ: number; spanY: number } {
    const column = columnForPoint(frame, point);
    return {
      x: column.x,
      y: column.floorY + clamp(point[1]) * column.spanY,
      z: column.z,
      relZ: column.relZ,
      spanY: column.spanY,
    };
  }

  function updateColors(state: SimulationState): void {
    const overallHealth = clamp(state.health.fish / 100);
    for (const group of speciesRuntime) {
      const definition = group.definition;
      const speciesHealth = clamp((state.species?.[definition.id] ?? 100) / 100);
      const health = clamp(speciesHealth * 0.72 + overallHealth * 0.28);
      const stress = clamp(1 - health);
      const dead = clamp((12 - speciesHealth * 100) / 12);

      for (let index = 0; index < group.agents.length; index += 1) {
        const agent = group.agents[index];
        if (agent.stage === 'bottom' || agent.stage === 'sinking') {
          group.bodyColors[index * 4] = 0.36;
          group.bodyColors[index * 4 + 1] = 0.35;
          group.bodyColors[index * 4 + 2] = 0.31;
          group.bodyColors[index * 4 + 3] = 1;
          group.tailColors[index * 4] = 0.33;
          group.tailColors[index * 4 + 1] = 0.32;
          group.tailColors[index * 4 + 2] = 0.29;
          group.tailColors[index * 4 + 3] = 1;
          continue;
        }

        const pale = clamp(stress * 0.84 + dead * 0.12);
        group.bodyColors[index * 4] = mix(definition.bodyColor[0], definition.bleachedColor[0], pale);
        group.bodyColors[index * 4 + 1] = mix(definition.bodyColor[1], definition.bleachedColor[1], pale);
        group.bodyColors[index * 4 + 2] = mix(definition.bodyColor[2], definition.bleachedColor[2], pale);
        group.bodyColors[index * 4 + 3] = 1;
        group.tailColors[index * 4] = mix(definition.tailColor[0], definition.bleachedColor[0], pale * 0.7);
        group.tailColors[index * 4 + 1] = mix(definition.tailColor[1], definition.bleachedColor[1], pale * 0.7);
        group.tailColors[index * 4 + 2] = mix(definition.tailColor[2], definition.bleachedColor[2], pale * 0.7);
        group.tailColors[index * 4 + 3] = 1;
      }

      group.meshes.body.thinInstanceBufferUpdated('color');
      group.meshes.tail.thinInstanceBufferUpdated('color');
    }
  }

  function updateAgentBodyRadii(frame: DioramaFrame, agent: FishAgent, definition: FishVisualDefinition): number {
    const halfWidth = Math.max(1e-4, frame.halfWidthAtDepth(agent.point[2]));
    const spanY = Math.max(1e-4, columnForPoint(frame, agent.point).spanY);
    const spanZ = Math.max(1e-4, frame.profile.zFar - frame.profile.zNear);
    const bodyLen = definition.length * agent.size * fishScale;

    // Raios elípticos proporcionais à geometria 3D real do corpo (fino na vertical e lateral)
    agent.bodyRadiusU = clamp((bodyLen * 0.34) / halfWidth, 0.006, 0.032);
    agent.bodyRadiusE = clamp((bodyLen * 0.18) / spanY, 0.007, 0.024);
    agent.bodyRadiusD = clamp((bodyLen * 0.22) / spanZ, 0.0035, 0.016);
    return agent.bodyRadiusU;
  }

  /**
   * Aciona um comportamento contextual de susto/abrigo ou pastagem.
   */
  function beginBehavior(agent: FishAgent, bodyRadius: number, forceScared = false): void {
    if (forceScared) {
      const shelter = nearestReefShelter(agent.point, screenObstacles, 9.0, bodyRadius);
      if (shelter) {
        agent.behavior = 'hide';
        agent.scared = true;
        agent.behaviorObstacle = shelter;
        agent.behaviorTimer = 2.6 + random() * 2.2;
        agent.minDwellTimer = 1.8;
        agent.behaviorTarget = reefInteractionTarget(shelter, 'hide', agent.point);
        agent.nibble = 0;
        return;
      }
    }

    if (agent.species === 'parrotfish' || (agent.species === 'blue-tang' && random() < 0.45)) {
      const coral = nearestReefObstacle(agent.point, screenObstacles, 'coral', 8.0, bodyRadius);
      if (coral) {
        agent.behavior = 'nibble';
        agent.scared = false;
        agent.behaviorObstacle = coral;
        agent.behaviorTimer = 3.6 + random() * 3.0;
        agent.minDwellTimer = 2.4;
        agent.behaviorTarget = reefInteractionTarget(coral, 'nibble', agent.point);
        agent.nibble = 0;
        return;
      }
    }

    const shelter = nearestReefShelter(agent.point, screenObstacles, 8.2, bodyRadius);
    if (shelter) {
      agent.behavior = 'hide';
      agent.scared = random() < 0.35;
      agent.behaviorObstacle = shelter;
      agent.behaviorTimer = 2.8 + random() * 2.6;
      agent.minDwellTimer = 2.0;
      agent.behaviorTarget = reefInteractionTarget(shelter, 'hide', agent.point);
      return;
    }

    agent.behaviorCooldown = 3.5 + random() * 6.5;
  }

  /**
   * Máquina de estados hierárquica por prioridades com histerese (Etapa 5).
   * Prioridade 1: FLEE (ameaça do barco ou sobressalto agudo);
   * Prioridade 2: HIDE (busca de refúgio por estresse ou susto);
   * Prioridade 3: DART (machos territoriais defendendo o recife);
   * Prioridade 4: NIBBLE (pastagem em corais ou algas com bicadas rítmicas);
   * Prioridade 5: SCHOOL / WANDER / HOVER (nado social em 3D, exploração ou flutuação).
   */
  function evaluateAgentState(
    agent: FishAgent,
    definition: FishVisualDefinition,
    step: number,
    boatBounds?: BoatHullBounds,
  ): void {
    if (agent.stage !== 'alive') {
      agent.behavior = 'school';
      agent.scared = false;
      agent.behaviorTarget = null;
      agent.behaviorObstacle = null;
      agent.behaviorTimer = 0;
      agent.nibble += (0 - agent.nibble) * Math.min(1, step * 4);
      return;
    }

    agent.minDwellTimer = Math.max(0, agent.minDwellTimer - step);
    agent.decisionTimer = Math.max(0, agent.decisionTimer - step);

    // ── Prioridade 1: Fuga de Ameaças (Barco / Perturbação) ───────────
    let boatThreat = false;
    if (boatBounds && agent.hasPrevious) {
      const dxB = agent.worldX - boatBounds.x;
      const dzB = agent.worldZ - boatBounds.z;
      const dyB = agent.worldY - (boatBounds.y - boatBounds.draft * 0.5);
      if (
        Math.abs(dxB) < boatBounds.halfLength * 1.9 &&
        Math.abs(dzB) < boatBounds.halfLength * 1.9 &&
        dyB > -3.5
      ) {
        const bCos = Math.cos(boatBounds.yaw);
        const bSin = Math.sin(boatBounds.yaw);
        const localLong = dxB * bSin + dzB * bCos;
        const localLat = dxB * bCos - dzB * bSin;
        const hullDist = Math.hypot(
          localLong / Math.max(1, boatBounds.halfLength * 1.3),
          localLat / Math.max(1, boatBounds.halfBeam * 1.5),
        );
        if (hullDist < 1.45) {
          boatThreat = true;
        }
      }
    }

    if (boatThreat) {
      if (agent.behavior !== 'flee') {
        agent.behavior = 'flee';
        agent.scared = true;
        agent.behaviorTimer = 2.2 + random() * 1.4;
        agent.minDwellTimer = 1.8;
      }
    }

    if (agent.behavior === 'flee') {
      agent.behaviorTimer -= step;
      if (agent.behaviorTimer <= 0 && !boatThreat) {
        agent.behavior =
          agent.socialRole === 'school'
            ? 'school'
            : agent.socialRole === 'territorial'
              ? 'hover'
              : 'wander';
        agent.scared = false;
        agent.minDwellTimer = 1.0;
      }
      agent.nibble += (0 - agent.nibble) * Math.min(1, step * 4);
      return;
    }

    // ── Prioridade 2: Refúgio em Corais/Rochas (Hide) ─────────────────
    if (agent.behavior === 'hide') {
      agent.behaviorTimer -= step;
      if (agent.behaviorTimer <= 0 || !agent.behaviorTarget) {
        agent.behavior =
          agent.socialRole === 'school'
            ? 'school'
            : agent.socialRole === 'territorial'
              ? 'hover'
              : 'wander';
        agent.scared = false;
        agent.behaviorTarget = null;
        agent.behaviorObstacle = null;
        agent.minDwellTimer = 1.5;
        agent.behaviorCooldown = 4.0 + random() * 6.0;
      }
      agent.nibble += (0 - agent.nibble) * Math.min(1, step * 4);
      return;
    }

    // ── Prioridade 3: Defesa Territorial (Dart / Bote) ────────────────
    if (agent.socialRole === 'territorial') {
      agent.dartTimer -= step;
      if (agent.behavior === 'dart') {
        agent.behaviorTimer -= step;
        if (agent.behaviorTimer <= 0) {
          agent.behavior = 'hover';
          agent.minDwellTimer = 1.5;
        }
      } else if (agent.dartTimer <= 0) {
        agent.behavior = 'dart';
        agent.behaviorTimer = 0.45;
        agent.minDwellTimer = 0.45;
        agent.dartTimer = 5.0 + random() * 6.5;
        const dartDir = agent.dir[0] >= 0 ? 1 : -1;
        agent.velocity = [dartDir * 0.058, (random() - 0.4) * 0.015, (random() - 0.5) * 0.022];
      }
      return;
    }

    // ── Prioridade 4: Pastagem (Nibble) ───────────────────────────────
    if (agent.behavior === 'nibble') {
      agent.behaviorTimer -= step;
      if (agent.behaviorTimer <= 0 || !agent.behaviorTarget) {
        agent.behavior = agent.socialRole === 'school' ? 'school' : 'wander';
        agent.behaviorTarget = null;
        agent.behaviorObstacle = null;
        agent.behaviorCooldown =
          agent.species === 'parrotfish' ? 3.0 + random() * 4.0 : 6.0 + random() * 8.0;
        agent.minDwellTimer = 2.0;
      } else {
        const dist = length(sub(agent.behaviorTarget, agent.point));
        const atTarget = dist < 0.055 ? 1 : 0;
        agent.nibble += (atTarget - agent.nibble) * Math.min(1, step * 4.5);
      }
      return;
    }

    agent.nibble += (0 - agent.nibble) * Math.min(1, step * 4);

    // ── Prioridade 5: Linha de Base / Decisões Periódicas ─────────────
    if (agent.minDwellTimer <= 0 && agent.decisionTimer <= 0) {
      agent.decisionTimer = 0.5 + random() * 0.5;
      agent.behaviorCooldown -= step * 3;

      if (agent.behaviorCooldown <= 0 && screenObstacles.length > 0) {
        if (agent.species === 'parrotfish' || (agent.species === 'blue-tang' && random() < 0.35)) {
          const kind = agent.species === 'parrotfish' ? 'coral' : 'rock';
          const obs = nearestReefObstacle(agent.point, screenObstacles, kind, 7.5, agent.bodyRadiusU);
          if (obs) {
            agent.behavior = 'nibble';
            agent.behaviorObstacle = obs;
            agent.behaviorTarget = reefInteractionTarget(obs, 'nibble', agent.point);
            agent.behaviorTimer =
              agent.species === 'parrotfish' ? 3.8 + random() * 3.2 : 2.8 + random() * 2.2;
            agent.minDwellTimer = 2.5;
            return;
          }
        }
      }
    }
  }

  // Grade de Spatial Hashing 3D (16 x 10 x 10 = 1600 células) sem alocação em runtime (O(N))
  const GRID_U = 16;
  const GRID_E = 10;
  const GRID_D = 10;
  const GRID_TOTAL = GRID_U * GRID_E * GRID_D;
  const gridHeads = new Int32Array(GRID_TOTAL);
  const agentNext = new Int32Array(allAgents.length);

  function rebuildSpatialGrid(): void {
    gridHeads.fill(-1);
    for (let i = 0; i < allAgents.length; i += 1) {
      const a = allAgents[i].agent;
      if (a.stage !== 'alive' && a.stage !== 'repopulating') {
        agentNext[i] = -1;
        continue;
      }
      const cu = Math.min(GRID_U - 1, Math.max(0, Math.floor(a.point[0] * GRID_U)));
      const ce = Math.min(GRID_E - 1, Math.max(0, Math.floor(a.point[1] * GRID_E)));
      const cd = Math.min(GRID_D - 1, Math.max(0, Math.floor(a.point[2] * GRID_D)));
      const cellIdx = (cd * GRID_E + ce) * GRID_U + cu;
      agentNext[i] = gridHeads[cellIdx];
      gridHeads[cellIdx] = i;
    }
  }

  /**
   * Calcula forças Boids 3D via Spatial Hashing O(N) com percepção biológica:
   * Campo de Visão por espécie (FOV ~ 270°-290°, ponto cego caudal) + Separação +
   * Alinhamento suave com limite de taxa angular + Coesão dinâmica.
   */
  function computeBoidsForces(): void {
    rebuildSpatialGrid();

    for (let i = 0; i < allAgents.length; i += 1) {
      const a = allAgents[i].agent;
      a.boidsForce[0] = 0;
      a.boidsForce[1] = 0;
      a.boidsForce[2] = 0;
      a.neighborsCount = 0;
    }

    for (let i = 0; i < allAgents.length; i += 1) {
      const a = allAgents[i].agent;
      if (a.stage !== 'alive' && a.stage !== 'repopulating') continue;

      const aEcology = FISH_ECOLOGY[a.species];
      const cosHalfFov = Math.cos((aEcology.fieldOfViewDeg * 0.5 * Math.PI) / 180);

      const cu = Math.min(GRID_U - 1, Math.max(0, Math.floor(a.point[0] * GRID_U)));
      const ce = Math.min(GRID_E - 1, Math.max(0, Math.floor(a.point[1] * GRID_E)));
      const cd = Math.min(GRID_D - 1, Math.max(0, Math.floor(a.point[2] * GRID_D)));

      let alignVx = 0;
      let alignVy = 0;
      let alignVz = 0;
      let cohU = 0;
      let cohE = 0;
      let cohD = 0;
      let neighborWeightSum = 0;
      let localNeighbors = 0;

      const aSpeed = Math.hypot(a.velocity[0], a.velocity[1], a.velocity[2]);
      const fwdU = aSpeed > 1e-5 ? a.velocity[0] / aSpeed : 0;
      const fwdE = aSpeed > 1e-5 ? a.velocity[1] / aSpeed : 0;
      const fwdD = aSpeed > 1e-5 ? a.velocity[2] / aSpeed : 1;

      for (let dz = -1; dz <= 1; dz += 1) {
        const nd = cd + dz;
        if (nd < 0 || nd >= GRID_D) continue;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ne = ce + dy;
          if (ne < 0 || ne >= GRID_E) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nu = cu + dx;
            if (nu < 0 || nu >= GRID_U) continue;

            let j = gridHeads[(nd * GRID_E + ne) * GRID_U + nu];
            while (j !== -1) {
              if (j > i) {
                const b = allAgents[j].agent;
                const sameSchool =
                  a.schoolId !== -1 &&
                  a.schoolId === b.schoolId &&
                  a.socialRole === 'school' &&
                  b.socialRole === 'school';

                // Durante fuga (flee), o cardume se comprime mais sem sobrepor corpos
                const compressFactor = (a.behavior === 'flee' || b.behavior === 'flee') ? 0.75 : 1.0;
                const sepMultiplier = (sameSchool ? 1.6 : 2.4) * compressFactor;
                const radU = (a.bodyRadiusU + b.bodyRadiusU) * sepMultiplier;
                const radE = (a.bodyRadiusE + b.bodyRadiusE) * sepMultiplier;
                const radD = (a.bodyRadiusD + b.bodyRadiusD) * sepMultiplier;

                const du = a.point[0] - b.point[0];
                const de = a.point[1] - b.point[1];
                const dd = a.point[2] - b.point[2];

                if (
                  Math.abs(du) <= radU * 1.8 &&
                  Math.abs(de) <= radE * 1.8 &&
                  Math.abs(dd) <= radD * 1.8
                ) {
                  const su = du / Math.max(1e-4, radU);
                  const se = de / Math.max(1e-4, radE);
                  const sd = dd / Math.max(1e-4, radD);
                  const dist = Math.hypot(su, se, sd);

                  // 1. Separação suave sem vibrações
                  if (dist < 1 && dist > 1e-5) {
                    const strength = Math.pow(1 - dist, 1.4) * (sameSchool ? 0.026 : 0.048);
                    const inv = 1 / dist;
                    const fx = su * inv * strength;
                    const fy = se * inv * strength * 0.55;
                    const fz = sd * inv * strength * 0.4;

                    a.boidsForce[0] += fx;
                    a.boidsForce[1] += fy;
                    a.boidsForce[2] += fz;

                    b.boidsForce[0] -= fx;
                    b.boidsForce[1] -= fy;
                    b.boidsForce[2] -= fz;
                  }

                  // 2. Alinhamento e Coesão com Campo de Visão (FOV) e Ponto Cego Caudal
                  if (sameSchool && dist < 1.8 && dist > 1e-5) {
                    localNeighbors += 1;
                    b.neighborsCount += 1;

                    // Ponto de vista de 'a' olhando para 'b'
                    const toB_u = -du;
                    const toB_e = -de;
                    const toB_d = -dd;
                    const invDist = 1 / Math.max(1e-5, Math.hypot(toB_u, toB_e, toB_d));
                    const dotA = (toB_u * fwdU + toB_e * fwdE + toB_d * fwdD) * invDist;
                    const fovWeightA = dotA >= cosHalfFov ? 1.0 : 0.12;

                    alignVx += b.velocity[0] * fovWeightA;
                    alignVy += b.velocity[1] * fovWeightA;
                    alignVz += b.velocity[2] * fovWeightA;
                    cohU += b.point[0] * fovWeightA;
                    cohE += b.point[1] * fovWeightA;
                    cohD += b.point[2] * fovWeightA;
                    neighborWeightSum += fovWeightA;

                    // Ponto de vista de 'b' olhando para 'a'
                    const bSpeed = Math.hypot(b.velocity[0], b.velocity[1], b.velocity[2]);
                    const bFwdU = bSpeed > 1e-5 ? b.velocity[0] / bSpeed : 0;
                    const bFwdE = bSpeed > 1e-5 ? b.velocity[1] / bSpeed : 0;
                    const bFwdD = bSpeed > 1e-5 ? b.velocity[2] / bSpeed : 1;
                    const dotB = (du * bFwdU + de * bFwdE + dd * bFwdD) * invDist;
                    const fovWeightB = dotB >= cosHalfFov ? 1.0 : 0.12;

                    b.boidsForce[0] += (a.velocity[0] - b.velocity[0]) * 0.075 * fovWeightB;
                    b.boidsForce[1] += (a.velocity[1] - b.velocity[1]) * 0.055 * fovWeightB;
                    b.boidsForce[2] += (a.velocity[2] - b.velocity[2]) * 0.05 * fovWeightB;

                    b.boidsForce[0] += (a.point[0] - b.point[0]) * 0.038 * fovWeightB;
                    b.boidsForce[1] += (a.point[1] - b.point[1]) * 0.028 * fovWeightB;
                    b.boidsForce[2] += (a.point[2] - b.point[2]) * 0.025 * fovWeightB;
                  }
                }
              }
              j = agentNext[j];
            }
          }
        }
      }

      a.neighborsCount += localNeighbors;
      if (neighborWeightSum > 0) {
        const invW = 1 / neighborWeightSum;
        a.boidsForce[0] += (alignVx * invW - a.velocity[0]) * 0.13 + (cohU * invW - a.point[0]) * 0.058;
        a.boidsForce[1] += (alignVy * invW - a.velocity[1]) * 0.10 + (cohE * invW - a.point[1]) * 0.046;
        a.boidsForce[2] += (alignVz * invW - a.velocity[2]) * 0.09 + (cohD * invW - a.point[2]) * 0.038;
      }
    }
  }

  /**
   * Relaxação posicional suave O(N) via Spatial Hashing entre peixes vizinhos:
   * evita interpenetração de malhas sem gerar explosões verticais ou rotações bruscas.
   */
  function resolveFishOverlaps(): void {
    rebuildSpatialGrid();

    for (let i = 0; i < allAgents.length; i += 1) {
      const a = allAgents[i].agent;
      if (a.stage !== 'alive' && a.stage !== 'repopulating') continue;

      const cu = Math.min(GRID_U - 1, Math.max(0, Math.floor(a.point[0] * GRID_U)));
      const ce = Math.min(GRID_E - 1, Math.max(0, Math.floor(a.point[1] * GRID_E)));
      const cd = Math.min(GRID_D - 1, Math.max(0, Math.floor(a.point[2] * GRID_D)));

      for (let dz = -1; dz <= 1; dz += 1) {
        const nd = cd + dz;
        if (nd < 0 || nd >= GRID_D) continue;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ne = ce + dy;
          if (ne < 0 || ne >= GRID_E) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nu = cu + dx;
            if (nu < 0 || nu >= GRID_U) continue;

            let j = gridHeads[(nd * GRID_E + ne) * GRID_U + nu];
            while (j !== -1) {
              if (j > i) {
                const b = allAgents[j].agent;
                const minU = (a.bodyRadiusU + b.bodyRadiusU) * 0.92;
                const minE = (a.bodyRadiusE + b.bodyRadiusE) * 0.9;
                const minD = (a.bodyRadiusD + b.bodyRadiusD) * 0.9;

                const du = a.point[0] - b.point[0];
                const de = a.point[1] - b.point[1];
                const dd = a.point[2] - b.point[2];

                if (Math.abs(du) < minU && Math.abs(de) < minE && Math.abs(dd) < minD) {
                  const su = du / Math.max(1e-4, minU);
                  const se = de / Math.max(1e-4, minE);
                  const sd = dd / Math.max(1e-4, minD);
                  const dist = Math.hypot(su, se, sd);
                  if (dist < 1) {
                    let nx: number;
                    let ny: number;
                    let nz: number;
                    if (dist > 1e-5) {
                      nx = su / dist;
                      ny = se / dist;
                      nz = sd / dist;
                    } else {
                      const fallbackAngle = (i * 1.7 + j * 0.9) % (Math.PI * 2);
                      nx = Math.cos(fallbackAngle);
                      ny = 0.2;
                      nz = Math.sin(fallbackAngle) * 0.4;
                    }

                    const overlap = (1 - dist) * 0.34;
                    a.point[0] += nx * minU * overlap;
                    a.point[1] += ny * minE * overlap * 0.42;
                    a.point[2] += nz * minD * overlap * 0.38;

                    b.point[0] -= nx * minU * overlap;
                    b.point[1] -= ny * minE * overlap * 0.42;
                    b.point[2] -= nz * minD * overlap * 0.38;

                    const rvx = a.velocity[0] - b.velocity[0];
                    const rvy = a.velocity[1] - b.velocity[1];
                    const rvz = a.velocity[2] - b.velocity[2];
                    const vn = rvx * nx + rvy * ny + rvz * nz;
                    if (vn < 0) {
                      const impulse = vn * 0.28;
                      a.velocity[0] -= impulse * nx;
                      a.velocity[1] -= impulse * ny * 0.45;
                      a.velocity[2] -= impulse * nz * 0.35;
                      b.velocity[0] += impulse * nx;
                      b.velocity[1] += impulse * ny * 0.45;
                      b.velocity[2] += impulse * nz * 0.35;
                    }
                  }
                }
              }
              j = agentNext[j];
            }
          }
        }
      }
    }
  }

  function resetAgent(agent: FishAgent, school: SchoolRuntime | null): void {
    agent.stage = 'alive';
    agent.stageElapsed = 0;
    if (school && agent.socialRole === 'school') {
      agent.point = formationPosition(
        school.state.center,
        school.state.velocity,
        agent.seat,
        agent.wobble,
        0,
        school.config.band,
        school.state,
      );
      agent.velocity = [school.state.velocity[0], school.state.velocity[1], school.state.velocity[2]];
      const dirSign = school.state.velocity[0] >= 0 ? 1 : -1;
      const initDirLen = Math.hypot(dirSign, school.state.velocity[2] * 2.5) || 1;
      agent.dir = [dirSign / initDirLen, 0, (school.state.velocity[2] * 2.5) / initDirLen];
      agent.behavior = 'school';
    } else if (agent.socialRole === 'territorial' && agent.homePoint) {
      agent.point = [...agent.homePoint];
      agent.velocity = [0, 0, 0];
      agent.behavior = 'hover';
      agent.dartTimer = 5.0 + random() * 6.5;
    } else {
      agent.behavior = 'wander';
      agent.solitaryTimer = 3.0 + random() * 6.0;
      agent.velocity = [agent.dir[0] * FISH_VISUALS[agent.species].cruiseSpeed, 0, 0];
    }
    agent.boidsForce = [0, 0, 0];
    agent.roll = 0;
    agent.bend = 0;
    agent.scared = false;
    agent.behaviorTimer = 0;
    agent.behaviorCooldown = 2.0 + random() * 6.5;
    agent.minDwellTimer = 0;
    agent.decisionTimer = 0;
    agent.neighborsCount = 0;
    agent.currentQuat.copyFromFloats(0, 0, 0, 1);
    agent.behaviorTarget = null;
    agent.behaviorObstacle = null;
    agent.nibble = 0;
    agent.hasPrevious = false;
  }

  const schoolsById = new Map<number, SchoolRuntime>();
  for (const school of schoolRuntime) schoolsById.set(school.id, school);

  const fishMeshes = speciesRuntime.flatMap((group) => [group.meshes.body, group.meshes.tail]);

  return {
    meshes: fishMeshes,
    shadowCasters: fishMeshes,
    fishes: diagnostics,

    layout(frame: DioramaFrame): void {
      frameRef = frame;
      updateSchoolBands(frame);
      screenObstacles = projectReefObstacles(
        frame,
        environment.obstacles,
        FISH_SURFACE_Y,
        0.995,
      );

      // Assenta peixes territoriais junto aos cabeços de rochas/corais
      let territorialIdx = 0;
      let solitaryIdx = 0;
      const margin = frame.profile.marginX + 0.04;
      const depthSpan = frame.profile.fishDepthMax - frame.profile.fishDepthMin;

      for (const entry of allAgents) {
        const agent = entry.agent;
        if (agent.socialRole === 'territorial') {
          if (screenObstacles.length > 0) {
            const obs = screenObstacles[(territorialIdx * 3 + 1) % screenObstacles.length];
            territorialIdx += 1;
            agent.homeObstacle = obs;
            const side = territorialIdx % 2 === 0 ? 1 : -1;
            const homeU = clamp(obs.u + side * (obs.radiusU * 0.72 + 0.02), margin, 1 - margin);
            const homeElevation = clamp(obs.elevation + obs.halfHeight * 0.58, 0.22, 0.76);
            const homeDepth = clamp(
              obs.depth - obs.radiusDepth * 0.32,
              frame.profile.fishDepthMin + 0.03,
              frame.profile.fishDepthMax - 0.03,
            );
            agent.homePoint = [homeU, homeElevation, homeDepth];
            agent.point = [...agent.homePoint];
            const dirSign = homeU < 0.5 ? 1 : -1;
            agent.dir = [dirSign, 0, obs.depth > 0.5 ? -0.25 : 0.25];
            const dirL = Math.hypot(agent.dir[0], agent.dir[2]) || 1;
            agent.dir[0] /= dirL;
            agent.dir[2] /= dirL;
            agent.velocity = [0, 0, 0];
            agent.behavior = 'hover';
          }
        } else if (agent.socialRole === 'solitary' && !hasLaidOutOnce) {
          solitaryIdx += 1;
          const uSlot = (solitaryIdx * 0.618) % 1;
          const u = clamp(0.14 + uSlot * 0.72, margin, 1 - margin);
          const depth = clamp(
            frame.profile.fishDepthMin + 0.08 + (((solitaryIdx * 7) % 11) / 10) * (depthSpan - 0.16),
            frame.profile.fishDepthMin + 0.04,
            frame.profile.fishDepthMax - 0.04,
          );
          const clearance = FISH_ECOLOGY[agent.species].minClearanceM;
          const floorElev = floorElevationAt(frame, [u, 0.3, depth], clearance);
          const [bandMin, bandMax] = FISH_ECOLOGY[agent.species].elevationBand;
          const elev =
            agent.species === 'parrotfish'
              ? clamp(floorElev + 0.04 + (solitaryIdx % 3) * 0.04, bandMin, bandMax)
              : clamp(floorElev + 0.08 + (solitaryIdx % 4) * 0.05, bandMin, bandMax);
          agent.point = [u, elev, depth];
          const dirSign = solitaryIdx % 2 === 0 ? 1 : -1;
          agent.velocity = [dirSign * entry.definition.cruiseSpeed, 0, 0];
          agent.dir = [dirSign, 0, 0];
          agent.behavior = agent.species === 'parrotfish' && solitaryIdx % 3 === 0 ? 'nibble' : 'wander';
          agent.solitaryTarget = [
            clamp(u + dirSign * 0.28, margin, 1 - margin),
            elev,
            clamp(depth + (random() - 0.5) * 0.12, frame.profile.fishDepthMin + 0.05, frame.profile.fishDepthMax - 0.05),
          ];
          agent.solitaryTimer = 3.5 + random() * 6.5;
        }
      }

      for (const group of speciesRuntime) {
        for (const agent of group.agents) agent.hasPrevious = false;
        group.meshes.body.thinInstanceBufferUpdated('matrix');
        group.meshes.tail.thinInstanceBufferUpdated('matrix');
      }
    },

    update(
      seconds: number,
      dt: number,
      state: SimulationState,
      visual: VisualState,
      boatBounds?: BoatHullBounds,
    ): void {
      const frame = frameRef;
      if (!frame) return;
      const step = Math.min(0.05, Math.max(0, dt));
      if (step <= 0) return;

      const thermalStress = clamp((Math.abs(state.env.temperature - 26.5) - 1.5) / 5.5, 0, 1);
      const acidStress = clamp((7.95 - state.env.ph) / 0.45, 0, 1);

      // 1) Atualiza os centros de cardume, separa cardumes distintos e desvia-os das rochas e da areia
      for (const school of schoolRuntime) {
        updateSchoolState(school.state, step, random, school.config);
      }
      repelSchools(schoolRuntime, step);
      for (const school of schoolRuntime) {
        steerAroundReef(
          school.state.center,
          school.state.velocity,
          0.045,
          screenObstacles,
          school.state.velocity,
        );
        resolveReefCollisions(
          school.state.center,
          0.038,
          screenObstacles,
          school.state.velocity,
        );
        const minSchoolElev = Math.max(
          school.config.band.elevationMin,
          floorElevationAt(
            frame,
            school.state.center,
            FISH_ECOLOGY[school.species].minClearanceM,
          ) + 0.08,
        );
        if (school.state.center[1] < minSchoolElev) {
          school.state.center[1] = minSchoolElev;
          if (school.state.velocity[1] < 0) school.state.velocity[1] *= -0.35;
        }
        school.state.center = clampPointToBand(school.state.center, school.config.band);
      }

      // 2) Atualiza raios corporais normalizados e calcula forças Boids (separação + alinhamento)
      for (const entry of allAgents) {
        updateAgentBodyRadii(frame, entry.agent, entry.definition);
      }
      computeBoidsForces();

      // 3) Reflexo de susto coletivo ("quando se assustar se esconder dentro de um coral ou atrás de uma pedra")
      startlePulseCooldown -= step;
      if (startlePulseCooldown <= 0 && screenObstacles.length > 0) {
        startlePulseCooldown = 5.5 + random() * 6.0;
        const targetSchool = schoolRuntime[Math.floor(random() * schoolRuntime.length)];
        if (targetSchool) {
          let startledCount = 0;
          for (const agent of targetSchool.agents) {
            if (agent.stage === 'alive' && agent.behavior === 'school' && random() < 0.35) {
              beginBehavior(agent, agent.bodyRadiusU, true);
              startledCount += 1;
              if (startledCount >= 4) break;
            }
          }
        }
      }

      const hypoxia = clamp((3.6 - state.dissolvedOxygen) / 3.6);
      const fishing = clamp(visual.fishing);

      for (const group of speciesRuntime) {
        const definition = group.definition;
        const speciesHealth = clamp((state.species?.[definition.id] ?? 100) / 100);
        const activeCount = Math.max(
          0,
          Math.round(group.agents.length * (1 - fishing * 0.62)),
        );
        const lethal = state.dissolvedOxygen < 2.2 || state.health.fish < 5 || speciesHealth < 0.06;
        const distressed = state.dissolvedOxygen < 3.4 || state.health.fish < 24 || speciesHealth < 0.2;
        const recovered = state.dissolvedOxygen > 4.3 && state.health.fish > 38 && speciesHealth > 0.28;
        // Só intervenções reais de restauração liberam a repopulação visual.
        const restorationBoost = clamp((state.restoration?.restoredCoverPercent ?? 0) / 100) * 0.5;

        const globalBand: SchoolBand = configureBand(frame, 1, definition.id);

        for (let index = 0; index < group.agents.length; index += 1) {
          const agent = group.agents[index];
          const school = schoolsById.get(agent.schoolId) ?? null;
          const currentBand = school ? school.config.band : globalBand;

          if (agent.diagnostic) agent.diagnostic.health = speciesHealth;

          // ── Ciclo de vida ────────────────────────────────────────────
          if (agent.stage === 'alive') {
            if (lethal || (distressed && random() < step * 0.9)) {
              agent.stage = 'sinking';
              agent.stageElapsed = 0;
            }
          } else if (agent.stage === 'sinking') {
            agent.stageElapsed += step;
            const floor = floorElevationAt(frame, agent.point, 0.12);
            agent.point[1] = Math.max(floor + 0.004, agent.point[1] - step * 0.22);
            agent.roll += (Math.PI - agent.roll) * Math.min(1, step * 3);
            if (agent.point[1] <= floor + 0.008 || agent.stageElapsed > 4.5) {
              agent.stage = 'bottom';
              agent.stageElapsed = 0;
            }
          } else if (agent.stage === 'bottom') {
            agent.stageElapsed += step;
            agent.point[1] = floorElevationAt(frame, agent.point, 0.12) + 0.004;
            agent.roll = Math.PI;
            if (recovered && restorationBoost > 0.04 && agent.stageElapsed > 1.2) {
              agent.stage = 'repopulating';
              agent.stageElapsed = 0;
              if (school && agent.socialRole === 'school') {
                agent.velocity = [school.state.velocity[0], school.state.velocity[1], school.state.velocity[2]];
                agent.point = [
                  school.state.center[0] + (random() - 0.5) * 0.08,
                  clamp(school.state.center[1] + (random() - 0.3) * 0.08, 0.22, 0.72),
                  school.state.center[2] + (random() - 0.5) * 0.05,
                ];
              } else if (agent.socialRole === 'territorial' && agent.homePoint) {
                agent.velocity = [0, 0, 0];
                agent.point = [...agent.homePoint];
              } else {
                const dirSign = agent.localIndex % 2 === 0 ? 1 : -1;
                agent.velocity = [dirSign * definition.cruiseSpeed, 0, 0];
                agent.point = [
                  clamp(0.2 + random() * 0.6, currentBand.uMin, currentBand.uMax),
                  0.35,
                  (currentBand.depthMin + currentBand.depthMax) * 0.5,
                ];
              }
              agent.hasPrevious = false;
            }
          } else if (agent.stage === 'repopulating') {
            agent.stageElapsed += step;
            if (agent.stageElapsed > 1.6) {
              agent.stage = 'alive';
              agent.stageElapsed = 0;
            }
          }

          const hiddenByFishing = index >= activeCount;
          if (hiddenByFishing) {
            writeIdentity(group.bodyMatrices, index);
            writeIdentity(group.tailMatrices, index);
            agent.hasPrevious = false;
            updateDiagnostic(agent);
            continue;
          }

          // ── Movimento inteligente diferenciado por papel ecológico ──
          const alive = agent.stage === 'alive';
          const repopulating = agent.stage === 'repopulating';

          if (alive || repopulating) {
            const bodyRadius = agent.bodyRadiusU;
            let desired: Vec3Tuple = [0, 0, 0];
            let minSpeed = 0;
            let maxSpeed = definition.cruiseSpeed;
            let millBlend = 0;

            if (agent.socialRole === 'territorial') {
              // 1. MACHOS TERRITORIAIS (Sargentinho): guardam a pedra, quase parados com pequenos botes
              if (agent.scared) {
                agent.behavior = 'hide';
                agent.behaviorTimer -= step;
                if (agent.behaviorTimer <= 0) {
                  agent.scared = false;
                  agent.behavior = 'hover';
                }
                const shelterTarget = agent.behaviorTarget ?? agent.homePoint ?? agent.point;
                const toShelter = sub(shelterTarget, agent.point);
                desired = scale(toShelter, 2.4);
                maxSpeed = definition.maxSpeed;
              } else {
                agent.dartTimer -= step;
                if (agent.dartTimer <= 0) {
                  agent.behavior = 'dart';
                  agent.behaviorTimer = 0.45;
                  agent.dartTimer = 5.5 + random() * 6.5;
                  const dartDirSign = agent.dir[0] >= 0 ? 1 : -1;
                  agent.velocity = [dartDirSign * 0.055, (random() - 0.4) * 0.015, (random() - 0.5) * 0.02];
                }

                if (agent.behavior === 'dart') {
                  agent.behaviorTimer -= step;
                  if (agent.behaviorTimer <= 0) {
                    agent.behavior = 'hover';
                  }
                  desired = [agent.velocity[0], agent.velocity[1], agent.velocity[2]];
                  maxSpeed = definition.maxSpeed * 0.85;
                } else {
                  // Hovering mantendo posição ao lado da pedra (quase parado)
                  agent.behavior = 'hover';
                  const toHome: Vec3Tuple = agent.homePoint ? sub(agent.homePoint, agent.point) : [0, 0, 0];
                  desired = scale(toHome, 2.0);
                  maxSpeed = definition.cruiseSpeed * 0.16;
                }
              }

              desired[0] += agent.boidsForce[0] * 0.65;
              desired[1] += agent.boidsForce[1] * 0.65;
              desired[2] += agent.boidsForce[2] * 0.65;

            } else if (agent.socialRole === 'solitary') {
              // 2. PEIXES SOLITÁRIOS (Peixe-papagaio e cirurgiões vagantes): nado autônomo calmo, pastagem e pausas
              if (agent.scared) {
                agent.behavior = 'hide';
                agent.behaviorTimer -= step;
                if (agent.behaviorTimer <= 0) {
                  agent.scared = false;
                  agent.behavior = 'wander';
                  agent.solitaryTimer = 3.5 + random() * 4.5;
                }
                const shelterTarget = agent.behaviorTarget ?? agent.point;
                const toShelter = sub(shelterTarget, agent.point);
                desired = scale(toShelter, 2.2);
                maxSpeed = definition.maxSpeed * 1.15;
              } else {
                agent.solitaryTimer -= step;
                if (agent.solitaryTimer <= 0 || !agent.solitaryTarget) {
                  if (agent.species === 'parrotfish') {
                    const roll = random();
                    if (roll < 0.42 && screenObstacles.length > 0) {
                      const coral = nearestReefObstacle(agent.point, screenObstacles, 'coral', 7.5, bodyRadius);
                      if (coral) {
                        agent.behavior = 'nibble';
                        agent.behaviorObstacle = coral;
                        agent.behaviorTarget = reefInteractionTarget(coral, 'nibble', agent.point);
                        agent.solitaryTimer = 4.2 + random() * 4.0;
                      } else {
                        agent.behavior = 'hover';
                        agent.solitaryTimer = 2.6 + random() * 3.0;
                      }
                    } else if (roll < 0.72) {
                      agent.behavior = 'hover';
                      agent.solitaryTimer = 2.8 + random() * 3.2;
                    } else {
                      agent.behavior = 'wander';
                      agent.solitaryTimer = 6.0 + random() * 7.5;
                      const targetU = clamp(
                        agent.point[0] + (random() < 0.5 ? 1 : -1) * (0.24 + random() * 0.35),
                        currentBand.uMin,
                        currentBand.uMax,
                      );
                      const targetD = clamp(
                        agent.point[2] + (random() - 0.5) * 0.24,
                        currentBand.depthMin,
                        currentBand.depthMax,
                      );
                      const floorE = floorElevationAt(
                        frame,
                        [targetU, 0.3, targetD],
                        FISH_ECOLOGY[agent.species].minClearanceM,
                      );
                      agent.solitaryTarget = [targetU, clamp(floorE + 0.06 + random() * 0.14, 0.22, 0.48), targetD];
                    }
                  } else {
                    // Cirurgião vagante
                    if (random() < 0.35 && screenObstacles.length > 0) {
                      const obs = nearestReefObstacle(agent.point, screenObstacles, 'rock', 7.0, bodyRadius);
                      if (obs) {
                        agent.behavior = 'nibble';
                        agent.behaviorObstacle = obs;
                        agent.behaviorTarget = reefInteractionTarget(obs, 'nibble', agent.point);
                        agent.solitaryTimer = 3.5 + random() * 3.5;
                      } else {
                        agent.behavior = 'wander';
                        agent.solitaryTimer = 5.0 + random() * 7.0;
                      }
                    } else {
                      agent.behavior = 'wander';
                      agent.solitaryTimer = 5.0 + random() * 7.0;
                      const targetU = clamp(
                        agent.point[0] + (random() < 0.5 ? 1 : -1) * (0.25 + random() * 0.4),
                        currentBand.uMin,
                        currentBand.uMax,
                      );
                      const targetD = clamp(
                        agent.point[2] + (random() - 0.5) * 0.28,
                        currentBand.depthMin,
                        currentBand.depthMax,
                      );
                      const floorE = floorElevationAt(
                        frame,
                        [targetU, 0.3, targetD],
                        FISH_ECOLOGY[agent.species].minClearanceM,
                      );
                      agent.solitaryTarget = [targetU, clamp(floorE + 0.12 + random() * 0.22, 0.26, 0.68), targetD];
                    }
                  }
                }

                if (agent.behavior === 'hover') {
                  desired = [0, 0, 0];
                  minSpeed = 0;
                  maxSpeed = definition.cruiseSpeed * 0.12;
                  agent.nibble += (0 - agent.nibble) * Math.min(1, step * 4);
                } else if (agent.behavior === 'nibble' && agent.behaviorTarget) {
                  const toTarget = sub(agent.behaviorTarget, agent.point);
                  const distance = length(toTarget);
                  if (distance > 0.045) {
                    desired = scale(normalize(toTarget), definition.cruiseSpeed * 0.65);
                    agent.nibble += (0 - agent.nibble) * Math.min(1, step * 4);
                  } else {
                    desired = [0, 0, 0];
                    agent.nibble += (1 - agent.nibble) * Math.min(1, step * 5.0);
                  }
                  minSpeed = 0;
                  maxSpeed = definition.cruiseSpeed * 0.65;
                } else {
                  agent.nibble += (0 - agent.nibble) * Math.min(1, step * 4);
                  if (agent.solitaryTarget) {
                    const toTarget = sub(agent.solitaryTarget, agent.point);
                    const distance = length(toTarget);
                    if (distance > 0.04) {
                      desired = scale(normalize(toTarget), definition.cruiseSpeed * 0.95);
                      minSpeed = definition.cruiseSpeed * 0.25;
                      maxSpeed = definition.cruiseSpeed;
                    } else {
                      agent.solitaryTimer = 0;
                      desired = [0, 0, 0];
                      minSpeed = 0;
                      maxSpeed = definition.cruiseSpeed * 0.2;
                    }
                  } else {
                    desired = [agent.velocity[0], 0, 0];
                    minSpeed = definition.cruiseSpeed * 0.25;
                    maxSpeed = definition.cruiseSpeed;
                  }
                }
              }

              desired[0] += agent.boidsForce[0] * 0.75;
              desired[1] += agent.boidsForce[1] * 0.75;
              desired[2] += agent.boidsForce[2] * 0.75;

            } else if (school) {
              // 3. CARDUME ORGANIZADO (Cirurgião-azul e Sargentinho em nuvem)
              if (!repopulating) {
                if (agent.behavior === 'school' && agent.point[1] > 0.58 && random() < step * 0.25) {
                  const waveAtFish = sampleOcean(agent.worldX, agent.worldZ, seconds);
                  if (waveAtFish.breaker > 0.42) {
                    beginBehavior(agent, bodyRadius, true);
                  }
                }
                evaluateAgentState(agent, definition, step, boatBounds);
              }

              const seat = formationPosition(
                school.state.center,
                school.state.velocity,
                agent.seat,
                agent.wobble,
                seconds,
                currentBand,
                school.state,
              );
              seat[1] = Math.max(
                seat[1],
                floorElevationAt(
                  frame,
                  seat,
                  FISH_ECOLOGY[agent.species].minClearanceM,
                ) + 0.025,
              );

              millBlend = school.state.millBlend ?? (school.state.mode === 'mill' ? 1 : 0);
              let targetPoint: Vec3Tuple = seat;

              // Cadeia de seguimento: SOMENTE para sargentinhos em 'stream' mode, NUNCA para nuvens 3D de cirurgião!
              if (school.state.mode !== 'cluster' && millBlend < 0.45 && agent.localIndex > 0) {
                const predecessor = school.agents[agent.localIndex - 1];
                if (
                  predecessor &&
                  predecessor.stage === 'alive' &&
                  predecessor.behavior === 'school'
                ) {
                  const predSpeed = length(predecessor.velocity);
                  const trailDir: Vec3Tuple =
                    predSpeed > 1e-4
                      ? scale(predecessor.velocity, -1 / predSpeed)
                      : [school.state.velocity[0] >= 0 ? -1 : 1, 0, 0];
                  const followSpot: Vec3Tuple = [
                    predecessor.point[0] + trailDir[0] * agent.bodyRadiusU * 1.6 + (agent.seat[0] - predecessor.seat[0]) * 0.7,
                    predecessor.point[1] + (agent.seat[1] - predecessor.seat[1]) * 0.8,
                    predecessor.point[2] + trailDir[2] * agent.bodyRadiusD * 1.2 + (agent.seat[2] - predecessor.seat[2]) * 0.6,
                  ];
                  const chainWeight = 0.16 * (1 - millBlend);
                  targetPoint = [
                    seat[0] * (1 - chainWeight) + followSpot[0] * chainWeight,
                    seat[1] * (1 - chainWeight) + followSpot[1] * chainWeight,
                    seat[2] * (1 - chainWeight) + followSpot[2] * chainWeight,
                  ];
                }
              }

              let flowVelocity: Vec3Tuple = school.state.velocity;
              if (millBlend > 0.02) {
                const du = agent.point[0] - school.state.center[0];
                const dd = (agent.point[2] - school.state.center[2]) * 2.4;
                const tangLen = Math.hypot(du, dd) || 1;
                const millDir = school.state.millDirection ?? 1;
                const tangU = (dd / tangLen) * millDir * definition.cruiseSpeed * 1.12;
                const tangD = (-du / tangLen) * millDir * definition.cruiseSpeed * 0.34;
                const mVel: Vec3Tuple = [
                  school.state.velocity[0] * 0.28 + tangU,
                  school.state.velocity[1] * 0.45,
                  school.state.velocity[2] * 0.28 + tangD,
                ];
                flowVelocity = [
                  school.state.velocity[0] * (1 - millBlend) + mVel[0] * millBlend,
                  school.state.velocity[1] * (1 - millBlend) + mVel[1] * millBlend,
                  school.state.velocity[2] * (1 - millBlend) + mVel[2] * millBlend,
                ];
              }

              desired = add(
                scale(sub(targetPoint, agent.point), repopulating ? 1.15 : 1.65),
                scale(flowVelocity, repopulating ? 0.5 : 0.96),
              );

              desired[0] += agent.boidsForce[0];
              desired[1] += agent.boidsForce[1];
              desired[2] += agent.boidsForce[2];

              if (!repopulating && agent.behavior !== 'school' && agent.behaviorTarget) {
                const toTarget = sub(agent.behaviorTarget, agent.point);
                const distance = length(toTarget);
                const speedFactor = agent.scared ? 1.38 : agent.behavior === 'nibble' ? 0.54 : 0.8;
                const cruise = definition.cruiseSpeed * speedFactor;
                const maxApproach = definition.maxSpeed * (agent.scared ? 0.94 : 0.6);
                const approach =
                  distance > 1e-4
                    ? scale(normalize(toTarget), Math.min(maxApproach, distance * 1.55 + cruise * 0.45))
                    : ([0, 0, 0] as Vec3Tuple);

                const schoolBlend = agent.scared ? 0.08 : 0.18;
                desired = [
                  desired[0] * schoolBlend + approach[0] * (1 - schoolBlend) + agent.boidsForce[0] * 0.65,
                  desired[1] * schoolBlend + approach[1] * (1 - schoolBlend) + agent.boidsForce[1] * 0.65,
                  desired[2] * schoolBlend + approach[2] * (1 - schoolBlend) + agent.boidsForce[2] * 0.65,
                ];

                if (agent.behavior === 'nibble' && distance < 0.055 && agent.behaviorObstacle) {
                  const obs = agent.behaviorObstacle;
                  const peck = Math.max(0, Math.sin(seconds * 9.5 + agent.phase)) * 0.014;
                  desired[0] += (obs.u - agent.point[0]) * (0.18 + peck * 8);
                  desired[1] += (obs.elevation - agent.point[1]) * (0.12 + peck * 6);
                  desired[2] += (obs.depth - agent.point[2]) * (0.12 + peck * 5);
                } else if (agent.behavior === 'hide' && distance < 0.042) {
                  desired[0] *= 0.35;
                  desired[1] *= 0.35;
                  desired[2] *= 0.35;
                }
              }

              if (agent.behavior === 'flee') {
                desired[1] -= 0.07;
              }

              maxSpeed =
                definition.maxSpeed *
                (agent.behavior === 'flee' ? 1.55 : agent.scared ? 1.32 : 1.0) *
                (1 + (1 - speciesHealth) * 0.22 + thermalStress * 0.15) *
                (1 - hypoxia * 0.28);
              minSpeed =
                agent.behavior === 'flee'
                  ? definition.cruiseSpeed * 0.95
                  : agent.behavior !== 'school' && agent.behaviorTarget && length(sub(agent.behaviorTarget, agent.point)) < 0.045
                    ? definition.cruiseSpeed * 0.16
                    : definition.cruiseSpeed * 0.34;
            }

            // Acoplamento suave com o campo de correntes marinhas 3D
            if (agent.hasPrevious) {
              const flow = sampleMarineCurrent(agent.worldX, agent.worldY, agent.worldZ, seconds);
              const flowFactor = agent.socialRole === 'territorial' ? 0.45 : 1.0;
              desired[0] += (flow.currentX * 0.0042 + flow.orbitalX * 0.0028) * flowFactor;
              desired[1] += (flow.currentY * 0.0032 + flow.orbitalY * 0.0022) * flowFactor;
              desired[2] += (flow.currentZ * 0.0022 + flow.orbitalZ * 0.0016) * flowFactor;
            }

            // Hipóxia: sobe para a lâmina d'água; estresse térmico/ácido reduz coesão
            if (hypoxia > 0.01 || state.dissolvedOxygen < 3.4) {
              desired[1] += clamp((3.4 - state.dissolvedOxygen) / 3.4) * 0.055;
            }
            if (thermalStress > 0.1 || acidStress > 0.1) {
              const agitation = (thermalStress * 0.65 + acidStress * 0.35) * 0.016;
              desired[0] += Math.sin(seconds * 5.2 + agent.phase) * agitation;
              desired[1] += Math.cos(seconds * 4.4 + agent.wobble) * agitation * 0.55;
            }

            // Desvio 3D ativo do casco submerso do barco (usando boatBounds reais do solver 6-DOF)
            if (boatBounds && agent.hasPrevious) {
              const dxB = agent.worldX - boatBounds.x;
              const dzB = agent.worldZ - boatBounds.z;
              const dyB = agent.worldY - (boatBounds.y - boatBounds.draft * 0.5);
              if (Math.abs(dxB) < boatBounds.halfLength * 1.8 && Math.abs(dzB) < boatBounds.halfLength * 1.8 && dyB > -3.2) {
                const bCos = Math.cos(boatBounds.yaw);
                const bSin = Math.sin(boatBounds.yaw);
                const localLong = dxB * bSin + dzB * bCos;
                const localLat = dxB * bCos - dzB * bSin;
                const hullEllip = Math.hypot(
                  localLong / Math.max(1, boatBounds.halfLength * 1.25),
                  localLat / Math.max(1, boatBounds.halfBeam * 1.45),
                );
                if (hullEllip < 1.35) {
                  const push = (1.35 - hullEllip) * 0.065;
                  desired[1] -= push * 1.25; // Mergulha sob o casco
                  desired[0] += (dxB >= 0 ? 1 : -1) * push * 0.85;
                  if (hullEllip < 0.95 && agent.behavior === 'school' && random() < step * 2.5) {
                    beginBehavior(agent, bodyRadius, true);
                  }
                }
              }
            } else if (
              agent.point[1] > 0.72 &&
              agent.point[2] > 0.48 &&
              Math.abs(agent.point[0] - 0.28) < 0.18
            ) {
              desired[1] -= 0.04;
              desired[0] += agent.point[0] < 0.28 ? -0.03 : 0.03;
            }

            steerAroundReef(agent.point, desired, bodyRadius, screenObstacles, agent.velocity);

            steer(
              agent.velocity,
              desired,
              step,
              definition.acceleration * (agent.behavior === 'flee' ? 2.2 : agent.scared ? 1.55 : 1.0),
              definition.turnRate * (agent.behavior === 'flee' ? 1.6 : agent.scared ? 1.4 : 1.0),
              minSpeed,
              maxSpeed,
            );

            // Contém a velocidade vertical e de profundidade no modo normal de cardume
            if (agent.socialRole === 'school' && millBlend < 0.5) {
              const refLat = Math.max(definition.cruiseSpeed * 0.35, Math.abs(agent.velocity[0]));
              agent.velocity[1] = clamp(agent.velocity[1], -refLat * 0.36, refLat * 0.36);
              agent.velocity[2] = clamp(agent.velocity[2], -refLat * 0.32, refLat * 0.32);
            }

            agent.point[0] += agent.velocity[0] * step;
            agent.point[1] += agent.velocity[1] * step;
            agent.point[2] += agent.velocity[2] * step;

            const clamped = clampPointToBand(agent.point, currentBand);
            if (clamped[0] !== agent.point[0]) agent.velocity[0] *= -0.35;
            if (clamped[1] !== agent.point[1]) agent.velocity[1] *= -0.35;
            if (clamped[2] !== agent.point[2]) agent.velocity[2] *= -0.35;
            agent.point[0] = clamped[0];
            agent.point[1] = clamped[1];
            agent.point[2] = clamped[2];

            // Colisão tangencial/superior com corais e rochas (sem inverter velocidade para trás!)
            resolveReefCollisions(agent.point, bodyRadius, screenObstacles, agent.velocity);
            resolveReefCollisions(agent.point, bodyRadius, screenObstacles, agent.velocity);

            const settled = clampPointToBand(agent.point, currentBand);
            const minFloor = floorElevationAt(
              frame,
              settled,
              FISH_ECOLOGY[agent.species].minClearanceM,
            );
            agent.point[0] = settled[0];
            agent.point[1] = Math.max(settled[1], minFloor);
            agent.point[2] = settled[2];
            if (agent.point[1] <= minFloor + 1e-4 && agent.velocity[1] < 0) {
              agent.velocity[1] = Math.max(0.008, -agent.velocity[1] * 0.25);
            }

            const tailRateMultiplier =
              agent.behavior === 'hover'
                ? 0.42
                : agent.behavior === 'nibble'
                  ? 0.58
                  : agent.scared
                    ? 1.42
                    : 1.0;
            agent.phase += step * (definition.tailBeat * tailRateMultiplier + length(agent.velocity) * 28);
          } else {
            agent.phase += step * 0.4;
          }
        }
      }

      // 4) Passe global de não-sobreposição posicional entre todos os peixes
      resolveFishOverlaps();

      // 5) Projeta para coordenadas de mundo 3D e atualiza matrizes de corpo e cauda
      for (const group of speciesRuntime) {
        const definition = group.definition;
        const activeCount = Math.max(
          0,
          Math.round(group.agents.length * (1 - fishing * 0.62)),
        );

        for (let index = 0; index < group.agents.length; index += 1) {
          if (index >= activeCount) continue;
          const agent = group.agents[index];
          const alive = agent.stage === 'alive';
          const repopulating = agent.stage === 'repopulating';

          // Garante após resolveFishOverlaps que nenhum peixe entrou em pedra ou areia
          if (alive || repopulating) {
            resolveReefCollisions(agent.point, agent.bodyRadiusU, screenObstacles, agent.velocity);
            agent.point[1] = Math.max(
              agent.point[1],
              floorElevationAt(
                frame,
                agent.point,
                FISH_ECOLOGY[agent.species].minClearanceM,
              ),
            );
          }

          const world = worldForPoint(frame, agent.point);
          agent.worldX = world.x;
          agent.worldY = world.y;
          agent.worldZ = world.z;
          const relZ = world.relZ;
          const ndcY = (agent.worldY - frame.camY) / (relZ * frame.tanHalfFov) + frame.shift;
          agent.screenV = (1 - ndcY) / 2;

          // Vetor de direção 3D cinemático (derivado da velocidade suavizada do agente no mundo 3D,
          // imune a micro-ajustes posicionais de colisão e calibrado contra escorço excessivo em Z)
          const metricScaleX = 2 * relZ * frame.tanHalfFov * frame.aspect;
          const metricScaleY = world.spanY;
          const metricScaleZ = (frame.profile.zFar - frame.profile.zNear) * 0.34;

          let vxWorld = agent.velocity[0] * metricScaleX;
          let vyWorld = agent.velocity[1] * metricScaleY;
          let vzWorld = agent.velocity[2] * metricScaleZ;

          if (agent.hasPrevious) {
            const dispX = (agent.worldX - agent.previousX) / Math.max(step, 1e-3);
            const dispY = (agent.worldY - agent.previousY) / Math.max(step, 1e-3);
            const dispZ = ((agent.worldZ - agent.previousZ) * 0.34) / Math.max(step, 1e-3);
            vxWorld = vxWorld * 0.72 + dispX * 0.28;
            vyWorld = vyWorld * 0.72 + dispY * 0.28;
            vzWorld = vzWorld * 0.72 + dispZ * 0.28;
          }

          // Mantém ângulo de perfil/três-quartos legível durante o nado normal
          if (agent.behavior === 'school') {
            const minAbsX = Math.max(Math.abs(vxWorld), 0.12);
            vzWorld = clamp(vzWorld, -minAbsX * 0.72, minAbsX * 0.72);
          }

          const horizSpeedWorld = Math.hypot(vxWorld, vzWorld);
          if (agent.nibble < 0.25 && horizSpeedWorld > 1e-5) {
            vyWorld = clamp(vyWorld, -horizSpeedWorld * 0.24, horizSpeedWorld * 0.24);
          }

          const velLenWorld = Math.hypot(vxWorld, vyWorld, vzWorld);
          if ((alive || repopulating) && velLenWorld > 1e-5) {
            let dx = vxWorld / velLenWorld;
            let dy = vyWorld / velLenWorld;
            let dz = vzWorld / velLenWorld;

            // Durante a bicada no coral, orienta o vetor de olhar para o centro do coral
            if (agent.nibble > 0.25 && agent.behaviorObstacle) {
              const obsWorld = worldForPoint(frame, [
                agent.behaviorObstacle.u,
                agent.behaviorObstacle.elevation,
                agent.behaviorObstacle.depth,
              ]);
              const toCoralX = obsWorld.x - agent.worldX;
              const toCoralY = obsWorld.y - agent.worldY;
              const toCoralZ = (obsWorld.z - agent.worldZ) * 0.55;
              const toCoralLen = Math.hypot(toCoralX, toCoralY, toCoralZ) || 1;
              const blend = agent.nibble * 0.65;
              dx = dx * (1 - blend) + (toCoralX / toCoralLen) * blend;
              dy = dy * (1 - blend) + (toCoralY / toCoralLen) * blend;
              dz = dz * (1 - blend) + (toCoralZ / toCoralLen) * blend;
              const normLen = Math.hypot(dx, dy, dz) || 1;
              dx /= normLen;
              dy /= normLen;
              dz /= normLen;
            }

            // Suaviza a direção 3D para eliminar qualquer tremulação visual
            const smoothDir = agent.hasPrevious ? Math.min(1, step * 9.5) : 1.0;
            const sdx = agent.dir[0] + (dx - agent.dir[0]) * smoothDir;
            const sdy = agent.dir[1] + (dy - agent.dir[1]) * smoothDir;
            const sdz = agent.dir[2] + (dz - agent.dir[2]) * smoothDir;
            const sLen = Math.hypot(sdx, sdy, sdz) || 1;
            const ndx = sdx / sLen;
            const ndy = sdy / sLen;
            const ndz = sdz / sLen;

            const previousDir = agent.dir;
            const cross = previousDir[2] * ndx - previousDir[0] * ndz;
            const dot = previousDir[0] * ndx + previousDir[2] * ndz;
            const yawDelta = Math.atan2(cross, dot);
            const turnRate = agent.hasPrevious ? yawDelta / Math.max(step, 1e-4) : 0;
            const targetRoll =
              alive || repopulating ? clamp(-turnRate * 0.18, -0.36, 0.36) : Math.PI;
            agent.roll += (targetRoll - agent.roll) * Math.min(1, step * 4.5);
            const speed = Math.max(0.25, length(agent.velocity) * 26);
            const targetBend =
              alive || repopulating ? clamp(-(turnRate / speed) * 0.42, -0.3, 0.3) : 0;
            agent.bend += (targetBend - agent.bend) * Math.min(1, step * 6.5);
            agent.dir = [ndx, ndy, ndz];
            agent.hasPrevious = true;
          } else {
            agent.roll =
              alive || repopulating
                ? agent.roll
                : agent.stage === 'bottom'
                  ? Math.PI
                  : agent.roll;
            agent.hasPrevious = true;
          }
          agent.previousX = agent.worldX;
          agent.previousY = agent.worldY;
          agent.previousZ = agent.worldZ;

          const scaleFromStage = repopulating
            ? 0.3 + 0.7 * clamp(agent.stageElapsed / 1.6)
            : 1;
          const worldScale = definition.length * agent.size * fishScale * scaleFromStage;
          scratchScale.setAll(worldScale);

          const forward = scratchForward;
          const dirLength = Math.hypot(agent.dir[0], agent.dir[1], agent.dir[2]) || 1;
          forward.set(agent.dir[0] / dirLength, agent.dir[1] / dirLength, agent.dir[2] / dirLength);

          const right = scratchRight;
          right.set(forward.z, 0, -forward.x);
          const rightLength = right.length() || 1;
          right.scaleInPlace(1 / rightLength);

          const up = scratchUp;
          up.set(
            forward.y * right.z,
            forward.z * right.x - forward.x * right.z,
            -forward.y * right.x,
          );

          const cosRoll = Math.cos(agent.roll);
          const sinRoll = Math.sin(agent.roll);
          const rx = right.x * cosRoll + up.x * sinRoll;
          const ry = up.y * sinRoll;
          const rz = right.z * cosRoll + up.z * sinRoll;
          const ux = up.x * cosRoll - right.x * sinRoll;
          const uy = up.y * cosRoll;
          const uz = up.z * cosRoll - right.z * sinRoll;
          right.set(rx, ry, rz);
          up.set(ux, uy, uz);

          Quaternion.RotationQuaternionFromAxisToRef(right, up, forward, scratchQuat1);
          // Slerp suave da rotação para evitar qualquer estalo angular
          if (agent.hasPrevious) {
            Quaternion.SlerpToRef(agent.currentQuat, scratchQuat1, Math.min(1.0, step * definition.turnRate * 3.5), bodyQuaternion);
          } else {
            bodyQuaternion.copyFrom(scratchQuat1);
          }
          agent.currentQuat.copyFrom(bodyQuaternion);

          // Onda biomecânica em S: oscilação propulsiva sutil do tronco em fase com a cauda + curvatura da curva
          const bodySway = alive || repopulating ? Math.sin(agent.phase - 0.65) * 0.055 : 0;
          const bendAngle = alive || repopulating ? agent.bend * 0.22 + bodySway : 0;
          if (Math.abs(bendAngle) > 1e-5) {
            Quaternion.RotationAxisToRef(Vector3.UpReadOnly, bendAngle, bendQuaternion);
            bodyQuaternion.multiplyToRef(bendQuaternion, bodyQuaternion);
          }

          if (agent.nibble > 0.01) {
            const peck = (Math.sin(seconds * 11 + agent.phase * 2.3) * 0.22 - 0.22) * agent.nibble;
            Quaternion.RotationAxisToRef(right, peck, nibbleQuaternion);
            nibbleQuaternion.multiplyToRef(bodyQuaternion, finalBodyQuaternion);
            bodyQuaternion.copyFrom(finalBodyQuaternion);
          }

          scratchPosition.set(agent.worldX, agent.worldY, agent.worldZ);
          Matrix.ComposeToRef(scratchScale, bodyQuaternion, scratchPosition, scratchMatrix);
          scratchMatrix.copyToArray(group.bodyMatrices, index * 16);

          tailOffset.set(0, 0, -0.5 * worldScale);
          tailOffset.rotateByQuaternionToRef(bodyQuaternion, scratchTailPosition);
          scratchTailPosition.addInPlace(scratchPosition);
          const tailAmpMultiplier =
            agent.behavior === 'flee' ? 1.45 : agent.behavior === 'hover' ? 0.42 : 1.0;
          const tailAngle =
            alive || repopulating
              ? (Math.sin(agent.phase - 1.35) * (0.36 + Math.min(0.28, length(agent.velocity) * 2.8)) +
                agent.bend * 0.48) * tailAmpMultiplier
              : agent.bend * 0.2;
          Quaternion.RotationAxisToRef(Vector3.UpReadOnly, tailAngle, bendQuaternion);
          bodyQuaternion.multiplyToRef(bendQuaternion, tailQuaternion);
          Matrix.ComposeToRef(scratchScale, tailQuaternion, scratchTailPosition, scratchMatrix);
          scratchMatrix.copyToArray(group.tailMatrices, index * 16);

          updateDiagnostic(agent);
        }

        group.meshes.body.thinInstanceBufferUpdated('matrix');
        group.meshes.tail.thinInstanceBufferUpdated('matrix');
      }

      if (seconds - lastColorUpdate > 0.28) {
        lastColorUpdate = seconds;
        updateColors(state);
      }
    },

    reset(): void {
      for (const school of schoolRuntime) {
        school.state = createSchoolState(random, school.config);
        for (const agent of school.agents) resetAgent(agent, school);
      }
      for (const entry of allAgents) {
        if (entry.agent.socialRole !== 'school') {
          resetAgent(entry.agent, null);
        }
      }
      lastColorUpdate = -1;
      for (const group of speciesRuntime) {
        for (let index = 0; index < group.agents.length; index += 1) {
          writeIdentity(group.bodyMatrices, index);
          writeIdentity(group.tailMatrices, index);
        }
        group.meshes.body.thinInstanceBufferUpdated('matrix');
        group.meshes.tail.thinInstanceBufferUpdated('matrix');
      }
    },
  };

  function updateDiagnostic(agent: FishAgent): void {
    const diagnostic = agent.diagnostic;
    if (!diagnostic) return;
    diagnostic.deathStage = agent.stage;
    diagnostic.socialRole = agent.socialRole;
    diagnostic.u = agent.point[0];
    diagnostic.v = agent.screenV;
    diagnostic.depth = agent.point[2];
    diagnostic.elevation = agent.point[1];
    diagnostic.behavior = agent.behavior;
    diagnostic.nibble = agent.nibble;
    diagnostic.speed = length(agent.velocity);
    diagnostic.neighborsCount = agent.neighborsCount;
    diagnostic.behaviorTarget = agent.behaviorTarget;
    diagnostic.position.u = agent.point[0];
    diagnostic.position.v = agent.screenV;
    diagnostic.position.depth = agent.point[2];
  }
}
