import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Material } from '@babylonjs/core/Materials/material';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/FBX';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import { assetUrl } from './assetPaths';
import type { DioramaFrame } from './framing';
import type { SceneQualityProfile } from './quality';
import { clamp, mix, smoothstep } from './procedural';
import { sampleOcean, waterHeightAt, type WaveSample } from './waves';
import type { BoatWakeState } from './water';

const WATER_DENSITY = 1025.0; // kg/m³ (água salgada tropical)
const GRAVITY = 9.81; // m/s²
const DEFAULT_SUBSTEP_HZ = 120;

// Geometria local do casco (escala 1.0). A linha d'água de projeto é y = 0:
// a raiz visual é posicionada nela, e o centro de massa do solver fica em
// localCmY. O calado visual é a profundidade real da quilha abaixo dessa linha.
const HULL_LENGTH_LOCAL = 4.4;
const HULL_HALF_LENGTH_LOCAL = HULL_LENGTH_LOCAL * 0.5;
const HULL_HALF_BEAM_LOCAL = 0.84 * 1.04;
const HULL_DRAFT_LOCAL = 0.52;

interface HullVolumeCell {
  /** Posição local em relação à origem do modelo (m, escala 1.0). */
  readonly localX: number;
  readonly localY: number;
  readonly localZ: number;
  /** Altura vertical do elemento de volume (m, escala 1.0). */
  readonly height: number;
  /** Volume máximo deslocado pelo elemento quando 100% submerso (m³, escala 1.0). */
  readonly volume: number;
  /** Área molhada efetiva do painel (m², escala 1.0). */
  readonly area: number;
  readonly zone: 'bow' | 'mid' | 'stern' | 'keel';
}

/**
 * Discretização volumétrica 3D do casco em 18 células hidrostáticas simétricas
 * (proa, meia-nau, popa, quilha e bojo a bombordo/estibordo).
 * Volume total (escala 1.0) = 2.76 m³; em equilíbrio hidrostático (h = 0),
 * ~50% do volume (1.38 m³) fica submerso na linha d'água de projeto.
 */
const HULL_VOLUME_CELLS: readonly HullVolumeCell[] = [
  // Quilha central (4 estações longitudinais simétricas, garantem lastro baixo e trim nivelado)
  { localX: 0.0, localY: -0.35, localZ: -1.45, height: 0.36, volume: 0.17, area: 0.54, zone: 'keel' },
  { localX: 0.0, localY: -0.38, localZ: -0.48, height: 0.36, volume: 0.20, area: 0.62, zone: 'keel' },
  { localX: 0.0, localY: -0.38, localZ: 0.48, height: 0.36, volume: 0.20, area: 0.62, zone: 'keel' },
  { localX: 0.0, localY: -0.35, localZ: 1.45, height: 0.36, volume: 0.17, area: 0.54, zone: 'keel' },

  // Bojo (chine) inferior — Bombordo (-X) e Estibordo (+X) em 5 estações longitudinais simétricas
  { localX: -0.52, localY: -0.14, localZ: -1.62, height: 0.44, volume: 0.14, area: 0.46, zone: 'stern' },
  { localX: 0.52, localY: -0.14, localZ: -1.62, height: 0.44, volume: 0.14, area: 0.46, zone: 'stern' },

  { localX: -0.72, localY: -0.15, localZ: -0.82, height: 0.44, volume: 0.20, area: 0.62, zone: 'mid' },
  { localX: 0.72, localY: -0.15, localZ: -0.82, height: 0.44, volume: 0.20, area: 0.62, zone: 'mid' },

  { localX: -0.78, localY: -0.15, localZ: 0.0, height: 0.44, volume: 0.22, area: 0.68, zone: 'mid' },
  { localX: 0.78, localY: -0.15, localZ: 0.0, height: 0.44, volume: 0.22, area: 0.68, zone: 'mid' },

  { localX: -0.72, localY: -0.15, localZ: 0.82, height: 0.44, volume: 0.20, area: 0.62, zone: 'mid' },
  { localX: 0.72, localY: -0.15, localZ: 0.82, height: 0.44, volume: 0.20, area: 0.62, zone: 'mid' },

  { localX: -0.52, localY: -0.14, localZ: 1.62, height: 0.44, volume: 0.14, area: 0.46, zone: 'bow' },
  { localX: 0.52, localY: -0.14, localZ: 1.62, height: 0.44, volume: 0.14, area: 0.46, zone: 'bow' },

  // Reserva de flutuabilidade superior (costado / flare simétrico)
  { localX: -0.68, localY: 0.18, localZ: -1.15, height: 0.40, volume: 0.11, area: 0.38, zone: 'stern' },
  { localX: 0.68, localY: 0.18, localZ: -1.15, height: 0.40, volume: 0.11, area: 0.38, zone: 'stern' },
  { localX: -0.68, localY: 0.18, localZ: 1.15, height: 0.40, volume: 0.11, area: 0.38, zone: 'bow' },
  { localX: 0.68, localY: 0.18, localZ: 1.15, height: 0.40, volume: 0.11, area: 0.38, zone: 'bow' },
] as const;

export type SurfaceSamplerFn = (x: number, z: number, time: number) => WaveSample;

export interface BoatCellDiagnostic {
  worldX: number;
  worldY: number;
  worldZ: number;
  submergedFraction: number;
  buoyancyForceY: number;
}

/**
 * Solver Hidrodinâmico de Corpo Rígido 6-DOF baseado no Princípio de Arquimedes
 * Distribuído, Tensor de Inércia, Arrasto Linear/Quadrático e Massa Adicional.
 *
 * Isolado de dependências de GPU para permitir testes unitários determinísticos
 * dos 9 cenários físicos (Seção 6.6).
 */
export class BoatRigidBody6DOF {
  anchorX = 0;
  anchorZ = 24;
  anchorYaw = 1.22;
  hullScale = 3.4;

  // Estado linear no espaço de mundo (m e m/s)
  x = 0;
  y = 0.26;
  z = 24;
  vx = 0;
  vy = 0;
  vz = 0;

  // Estado angular (rad e rad/s): yaw (Y), pitch (X longitudinal), roll (Z transversal)
  yaw = 1.22;
  pitch = 0;
  roll = 0;
  omegaYaw = 0;
  omegaPitch = 0;
  omegaRoll = 0;

  // Centro de massa local (abaixo da linha d'água para altura metacêntrica GM > 0)
  readonly localCmY = -0.18;
  readonly localCmZ = 0.0;

  // Diagnóstico da última etapa
  totalBuoyancyForceY = 0;
  bowSlamIntensity = 0.2;
  readonly cellDiagnostics: BoatCellDiagnostic[] = HULL_VOLUME_CELLS.map(() => ({
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    submergedFraction: 0,
    buoyancyForceY: 0,
  }));

  private accumulator = 0;
  private simTime = 0;
  /** Taxa efetiva de integração (Hz), configurada por perfil de qualidade. */
  substepHz = DEFAULT_SUBSTEP_HZ;

  constructor(scale = 3.4, anchorX = 0, anchorZ = 24, anchorYaw = 1.22) {
    this.configure(scale, anchorX, anchorZ, anchorYaw);
  }

  /**
   * Define a taxa de integração do solver conforme o orçamento do dispositivo.
   * 120 Hz em desktops fortes; 60 Hz em celulares, mantendo a mesma física.
   */
  setSubstepRate(hz: number): void {
    this.substepHz = Math.max(30, Math.min(240, Math.round(hz)));
  }

  configure(scale: number, anchorX: number, anchorZ: number, anchorYaw = 1.22): void {
    this.hullScale = Math.max(0.5, scale);
    this.anchorX = anchorX;
    this.anchorZ = anchorZ;
    this.anchorYaw = anchorYaw;
    this.x = anchorX;
    // Começa com o centro de massa na cota de projeto (linha d'água em y=0).
    // O aquecimento inicial do solver converge o equilíbrio com as ondas reais,
    // sem depender de um deslocamento vertical fixo.
    this.y = this.localCmY * this.hullScale;
    this.z = anchorZ;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = anchorYaw;
    this.pitch = 0;
    this.roll = 0;
    this.omegaYaw = 0;
    this.omegaPitch = 0;
    this.omegaRoll = 0;
    this.accumulator = 0;
  }

  /**
   * Massa total do barco (kg) calibrada para flutuar com ~45% do volume total submerso.
   */
  get mass(): number {
    const scale3 = this.hullScale * this.hullScale * this.hullScale;
    const totalVolume = 2.76 * scale3;
    return WATER_DENSITY * totalVolume * 0.455;
  }

  /**
   * Avança a simulação física com substepping fixo de 120 Hz.
   */
  step(
    dt: number,
    seconds: number,
    sampler: SurfaceSamplerFn = sampleOcean,
  ): void {
    const clampedDt = clamp(dt, 0, 0.1);
    if (clampedDt <= 0) return;

    this.accumulator += clampedDt;
    const fixedDt = 1 / this.substepHz;
    const maxSubsteps = 16;
    let steps = 0;

    while (this.accumulator >= fixedDt && steps < maxSubsteps) {
      this.accumulator -= fixedDt;
      steps += 1;
      this.integrateSubstep(fixedDt, seconds, sampler);
    }

    if (steps === 0 && this.accumulator > 1e-5) {
      this.integrateSubstep(this.accumulator, seconds, sampler);
      this.accumulator = 0;
    }
    this.simTime = seconds;
    void this.simTime;
  }

  private integrateSubstep(
    h: number,
    time: number,
    sampler: SurfaceSamplerFn,
  ): void {
    const scale = this.hullScale;
    const scale2 = scale * scale;
    const scale3 = scale2 * scale;
    const mass = this.mass;
    // Massa efetiva incluindo massa adicional hidrodinâmica (added mass)
    const effectiveMassHeave = mass * 1.75;
    const effectiveMassHorizontal = mass * 1.35;

    // Momentos principais de inércia de um casco de comprimento L=4.4*s e boca B=1.68*s (com inércia adicionada da água)
    const length = 4.4 * scale;
    const beam = 1.68 * scale;
    const draft = 0.72 * scale;
    const inertiaPitch = mass * ((length * length + draft * draft) / 12.0) * 1.85;
    const inertiaRoll = mass * ((beam * beam + draft * draft) / 12.0) * 2.15;
    const inertiaYaw = mass * ((length * length + beam * beam) / 12.0) * 1.65;

    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const cosRoll = Math.cos(this.roll);
    const sinRoll = Math.sin(this.roll);

    // Eixos locais do casco no espaço de mundo:
    // Forward (+Z local): (sinYaw * cosPitch, -sinPitch, cosYaw * cosPitch)
    // Right (+X local):   (cosYaw * cosRoll + sinYaw * sinPitch * sinRoll, cosPitch * sinRoll, -sinYaw * cosRoll + cosYaw * sinPitch * sinRoll)
    // Up (+Y local):      (-cosYaw * sinRoll + sinYaw * sinPitch * cosRoll, cosPitch * cosRoll, sinYaw * sinRoll + cosYaw * sinPitch * cosRoll)
    const fwdX = sinYaw * cosPitch;
    const fwdY = -sinPitch;
    const fwdZ = cosYaw * cosPitch;

    const rightX = cosYaw * cosRoll + sinYaw * sinPitch * sinRoll;
    const rightY = cosPitch * sinRoll;
    const rightZ = -sinYaw * cosRoll + cosYaw * sinPitch * sinRoll;

    const upX = -cosYaw * sinRoll + sinYaw * sinPitch * cosRoll;
    const upY = cosPitch * cosRoll;
    const upZ = sinYaw * sinRoll + cosYaw * sinPitch * cosRoll;

    // Gravidade total no centro de massa
    let forceX = 0;
    let forceY = -mass * GRAVITY;
    let forceZ = 0;

    let torquePitch = 0; // em torno do eixo Right (+X local)
    let torqueRoll = 0; // em torno do eixo Forward (+Z local)
    let torqueYaw = 0; // em torno do eixo Up (+Y mundo)

    let totalBuoyancyY = 0;
    let bowSubmergence = 0;
    let bowWaveBreaker = 0;

    for (let i = 0; i < HULL_VOLUME_CELLS.length; i += 1) {
      const cell = HULL_VOLUME_CELLS[i];
      // Posição relativa ao centro de massa no referencial local do casco
      const rxLocal = cell.localX * scale;
      const ryLocal = (cell.localY - this.localCmY) * scale;
      const rzLocal = (cell.localZ - this.localCmZ) * scale;

      // Vetor braço de alavanca r = R * r_local no espaço de mundo
      const rx = rightX * rxLocal + upX * ryLocal + fwdX * rzLocal;
      const ry = rightY * rxLocal + upY * ryLocal + fwdY * rzLocal;
      const rz = rightZ * rxLocal + upZ * ryLocal + fwdZ * rzLocal;

      const worldX = this.x + rx;
      const worldY = this.y + ry;
      const worldZ = this.z + rz;

      const wave = sampler(worldX, worldZ, time);
      const cellHeight = cell.height * scale;
      // Profundidade do centro da célula abaixo da superfície instantânea da onda
      const depthBelowSurface = wave.height - worldY;
      const subFraction = clamp((depthBelowSurface + 0.5 * cellHeight) / cellHeight, 0, 1);

      let cellBuoyancyY = 0;
      if (subFraction > 0) {
        const submergedVolume = cell.volume * scale3 * subFraction;
        // Força de Arquimedes vertical F_b = rho * g * V_sub
        cellBuoyancyY = WATER_DENSITY * GRAVITY * submergedVolume;
        totalBuoyancyY += cellBuoyancyY;

        // Componente de pressão hidrodinâmica normal da onda (Froude-Krylov):
        // inclina e desloca suavemente o casco segundo a inclinação da onda
        const fkHorizontal = cellBuoyancyY * 0.22;
        const cellFx = wave.normalX * fkHorizontal;
        const cellFy = cellBuoyancyY;
        const cellFz = wave.normalZ * fkHorizontal;

        // Velocidade linear do painel: v_cell = v_cm + omega x r
        const vCellX = this.vx + (this.omegaPitch * fwdY - this.omegaRoll * rightY) * rz + this.omegaYaw * rz;
        const vCellY =
          this.vy -
          this.omegaPitch * rzLocal +
          this.omegaRoll * rxLocal;
        const vCellZ = this.vz - this.omegaYaw * rx;

        // Velocidade relativa entre o painel do casco e a velocidade orbital da onda
        const relVx = vCellX - wave.velocityX * 0.75;
        const relVy = vCellY - wave.velocityY * 0.72;
        const relVz = vCellZ - wave.velocityZ * 0.75;

        const wettedArea = cell.area * scale2 * subFraction;
        // Arrasto hidrodinâmico linear + quadrático proporcional à área molhada + amortecimento de radiação de onda
        const dragLinVert = 4400.0 * wettedArea;
        const dragQuadVert = 2100.0 * wettedArea;
        const dragLinHoriz = 950.0 * wettedArea;
        const dragQuadHoriz = 480.0 * wettedArea;

        const dfx = -relVx * (dragLinHoriz + dragQuadHoriz * Math.abs(relVx));
        const dfy = -relVy * (dragLinVert + dragQuadVert * Math.abs(relVy));
        const dfz = -relVz * (dragLinHoriz + dragQuadHoriz * Math.abs(relVz));

        const totalCellFx = cellFx + dfx;
        const totalCellFy = cellFy + dfy;
        const totalCellFz = cellFz + dfz;

        forceX += totalCellFx;
        forceY += totalCellFy;
        forceZ += totalCellFz;

        // Torque hidrostático + hidrodinâmico no referencial do casco:
        // Elevação na proa (rzLocal > 0) gera pitch positivo (proa sobe -> sinPitch < 0 no Babylon,
        // ajustado na conversão final de quatérnion); elevação a estibordo (rxLocal > 0) gera roll.
        torquePitch += rzLocal * totalCellFy - ryLocal * (totalCellFx * fwdX + totalCellFz * fwdZ);
        torqueRoll += -rxLocal * totalCellFy + ryLocal * (totalCellFx * rightX + totalCellFz * rightZ);
        torqueYaw += rx * totalCellFz - rz * totalCellFx;

        if (cell.zone === 'bow') {
          bowSubmergence = Math.max(bowSubmergence, subFraction);
          bowWaveBreaker = Math.max(bowWaveBreaker, wave.breaker + wave.foam * 0.5);
        }
      }

      const diag = this.cellDiagnostics[i];
      diag.worldX = worldX;
      diag.worldY = worldY;
      diag.worldZ = worldZ;
      diag.submergedFraction = subFraction;
      diag.buoyancyForceY = cellBuoyancyY;
    }

    this.totalBuoyancyForceY = totalBuoyancyY;

    // Momento restaurador metacêntrico adicional (GM) e amortecimento viscoso de quilha de balanço (bilge keel)
    const submergenceRatio = clamp(totalBuoyancyY / Math.max(1, mass * GRAVITY), 0, 1.6);
    const gmPitchStiffness = inertiaPitch * 6.8 * Math.min(1.1, submergenceRatio);
    const gmRollStiffness = inertiaRoll * 8.4 * Math.min(1.1, submergenceRatio);
    const pitchViscousDamping = inertiaPitch * (4.4 + 2.2 * submergenceRatio);
    const rollViscousDamping = inertiaRoll * (5.2 + 2.6 * submergenceRatio);
    const yawViscousDamping = inertiaYaw * 4.8;

    torquePitch += -this.pitch * gmPitchStiffness - this.omegaPitch * pitchViscousDamping;
    torqueRoll += -this.roll * gmRollStiffness - this.omegaRoll * rollViscousDamping;

    // Amarração elástica suave (poita de fundeio na Baía de Todos-os-Santos):
    // mantém o barco na zona do diorama permitindo deriva orbital natural (surge/sway/yaw)
    const dxAnchor = this.x - this.anchorX;
    const dzAnchor = this.z - this.anchorZ;
    const mooringStiffness = mass * 2.8;
    const mooringDamping = mass * 2.4;
    forceX += -dxAnchor * mooringStiffness - this.vx * mooringDamping;
    forceZ += -dzAnchor * mooringStiffness - this.vz * mooringDamping;

    let yawError = (this.yaw - this.anchorYaw + Math.PI) % (Math.PI * 2);
    if (yawError < 0) yawError += Math.PI * 2;
    yawError -= Math.PI;
    torqueYaw += -yawError * inertiaYaw * 3.6 - this.omegaYaw * yawViscousDamping;

    // Integração semi-implícita de Euler (simplética) para velocidades e posições
    const ax = forceX / effectiveMassHorizontal;
    const ay = forceY / effectiveMassHeave;
    const az = forceZ / effectiveMassHorizontal;

    this.vx = clamp(this.vx + ax * h, -4.5, 4.5);
    this.vy = clamp(this.vy + ay * h, -5.5, 5.5);
    this.vz = clamp(this.vz + az * h, -4.5, 4.5);

    this.x += this.vx * h;
    this.y += this.vy * h;
    this.z += this.vz * h;

    const alphaPitch = torquePitch / inertiaPitch;
    const alphaRoll = torqueRoll / inertiaRoll;
    const alphaYaw = torqueYaw / inertiaYaw;

    this.omegaPitch = clamp(this.omegaPitch + alphaPitch * h, -2.2, 2.2);
    this.omegaRoll = clamp(this.omegaRoll + alphaRoll * h, -2.4, 2.4);
    this.omegaYaw = clamp(this.omegaYaw + alphaYaw * h, -1.2, 1.2);

    this.pitch = clamp(this.pitch + this.omegaPitch * h, -0.26, 0.26);
    this.roll = clamp(this.roll + this.omegaRoll * h, -0.24, 0.24);
    this.yaw += this.omegaYaw * h;

    this.bowSlamIntensity = clamp(
      bowSubmergence * 0.65 + bowWaveBreaker * 0.55 + Math.max(0, -this.omegaPitch * 0.8),
      0.15,
      1.5,
    );
  }
}

interface WakeParticle {
  age: number;
  life: number;
  size: number;
  driftX: number;
  lateral: number;
}

interface BowFoamParticle {
  age: number;
  life: number;
  size: number;
  lateral: number;
  forward: number;
}

const WAKE_COUNT = 24;
const BOW_FOAM_COUNT = 16;

export interface BoatHullBounds {
  x: number;
  y: number;
  z: number;
  yaw: number;
  halfLength: number;
  halfBeam: number;
  draft: number;
}

export interface BoatSystem {
  readonly meshes: AbstractMesh[];
  readonly shadowCasters: readonly AbstractMesh[];
  readonly root: TransformNode;
  readonly solver: BoatRigidBody6DOF;
  getWakeState(): BoatWakeState;
  getHullBounds(): BoatHullBounds;
  setDebugProbesVisible(visible: boolean): void;
  layout(frame: DioramaFrame): void;
  update(seconds: number, dt: number, clarity: number): void;
}

function buildHull(scene: Scene): Mesh {
  const stations = 16;
  const pointsPerStation = 7;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const length = 4.4;

  const widthAt = (t: number) => 0.84 * Math.pow(Math.sin(Math.PI * clamp(0.08 + t * 0.9)), 0.56);
  const depthAt = (t: number) => 0.36 + 0.16 * Math.sin(Math.PI * t);

  for (let station = 0; station <= stations; station += 1) {
    const t = station / stations;
    const z = -length * 0.5 + t * length;
    const width = widthAt(t);
    const depth = depthAt(t);
    const bowRise = Math.pow(clamp((t - 0.45) / 0.55), 1.7) * 0.22;
    const sternRise = Math.pow(clamp((0.35 - t) / 0.35), 1.8) * 0.06;
    const top = 0.28 + bowRise + sternRise;

    const section: ReadonlyArray<readonly [number, number, 'gunwale' | 'upper' | 'chine' | 'keel']> = [
      [-width * 1.04, top, 'gunwale'],
      [-width, top * 0.45, 'upper'],
      [-width * 0.86, -depth * 0.25, 'chine'],
      [0, -depth, 'keel'],
      [width * 0.86, -depth * 0.25, 'chine'],
      [width, top * 0.45, 'upper'],
      [width * 1.04, top, 'gunwale'],
    ];

    for (const [x, y, zone] of section) {
      positions.push(x, y, z);
      if (zone === 'gunwale') {
        colors.push(0.18, 0.12, 0.11, 1);
      } else if (zone === 'upper') {
        colors.push(0.84, 0.20, 0.14, 1);
      } else if (zone === 'chine') {
        colors.push(0.68, 0.14, 0.10, 1);
      } else {
        colors.push(0.36, 0.08, 0.07, 1);
      }
    }
  }

  for (let station = 0; station < stations; station += 1) {
    const base = station * pointsPerStation;
    const next = (station + 1) * pointsPerStation;
    for (let segment = 0; segment < pointsPerStation - 1; segment += 1) {
      const a = base + segment;
      const b = a + 1;
      const c = next + segment;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  for (let station = 0; station < stations; station += 1) {
    const a = station * pointsPerStation;
    const b = a + pointsPerStation - 1;
    const c = (station + 1) * pointsPerStation;
    const d = c + pointsPerStation - 1;
    indices.push(a, c, b, b, c, d);
  }

  for (let seg = 1; seg < pointsPerStation - 1; seg += 1) {
    indices.push(0, seg, seg + 1);
  }

  const mesh = new Mesh('casco-barco', scene);
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.isPickable = false;
  return mesh;
}

function createFoamTexture(scene: Scene): DynamicTexture {
  const size = 96;
  const texture = new DynamicTexture('espuma-textura', { width: size, height: size }, scene, false);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.hasAlpha = true;
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1)) * 2 - 1;
      const ny = (y / (size - 1)) * 2 - 1;
      const distance = Math.hypot(nx, ny);
      const edge = smoothstep(1.02, 0.18, distance);
      const breakup = 0.55 + 0.45 * Math.sin(nx * 15.7 + ny * 8.1) * Math.cos(ny * 12.4);
      const index = (y * size + x) * 4;
      image.data[index] = 255;
      image.data[index + 1] = 255;
      image.data[index + 2] = 255;
      image.data[index + 3] = clamp(edge * breakup) * 210;
    }
  }
  context.putImageData(image, 0, 0);
  texture.update(false);
  return texture;
}

function createFishingShipMaterials(scene: Scene): MultiMaterial {
  const multiMat = new MultiMaterial('barco-pesca-multimaterial', scene);

  const makeTexture = (file: string, invertY = true): Texture => {
    const tex = new Texture(
      assetUrl(`models/boat/${file}`),
      scene,
      false,
      invertY,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    tex.anisotropicFilteringLevel = 8;
    return tex;
  };

  // 1. Exterior do navio (Fishing_Ship — casco, cabine, mastro, decalque IH 102)
  const shipMat = new PBRMaterial('barco-pesca-exterior-mat', scene);
  shipMat.albedoTexture = makeTexture('Fishing_Ship_Base_Color.png', true);
  shipMat.bumpTexture = makeTexture('Fishing_Ship_Normal_OpenGL.png', true);
  shipMat.bumpTexture.level = 0.85;
  shipMat.ambientTexture = makeTexture('Fishing_Ship_Mixed_AO.png', true);
  shipMat.metallic = 0.06;
  shipMat.roughness = 0.65;
  shipMat.twoSidedLighting = true;
  shipMat.backFaceCulling = false;

  // 2. Interior e apetrechos do navio (Boat_Interior — boia salva-vidas, defensas, porta de madeira, comando)
  const interiorMat = new PBRMaterial('barco-pesca-interior-mat', scene);
  interiorMat.albedoTexture = makeTexture('Boat_Interior_Base_Color.png', true);
  interiorMat.bumpTexture = makeTexture('Boat_Interior_Normal_OpenGL.png', true);
  interiorMat.bumpTexture.level = 0.85;
  interiorMat.ambientTexture = makeTexture('Boat_Interior_Mixed_AO.png', true);
  interiorMat.metallic = 0.06;
  interiorMat.roughness = 0.65;
  interiorMat.twoSidedLighting = true;
  interiorMat.backFaceCulling = false;

  // 3. Vidros da cabine (Windows)
  const windowMat = new PBRMaterial('barco-pesca-vidros-mat', scene);
  windowMat.albedoColor = new Color3(0.08, 0.16, 0.22);
  windowMat.metallic = 0.1;
  windowMat.roughness = 0.08;
  windowMat.alpha = 0.45;
  windowMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  windowMat.backFaceCulling = false;

  // 4. Luz de navegação (Light)
  const lightMat = new PBRMaterial('barco-pesca-luz-mat', scene);
  lightMat.albedoColor = new Color3(1.0, 0.85, 0.5);
  lightMat.emissiveColor = new Color3(1.6, 0.9, 0.3);
  lightMat.emissiveIntensity = 2.0;

  multiMat.subMaterials.push(shipMat, interiorMat, windowMat, lightMat);
  return multiMat;
}

export function createBoatSystem(
  scene: Scene,
  quality?: SceneQualityProfile,
  onMeshLoaded?: (mesh: AbstractMesh) => void,
): BoatSystem {
  const root = new TransformNode('barco-pesca-bts', scene);
  const solver = new BoatRigidBody6DOF(3.4, 0, 24, 1.22);
  solver.setSubstepRate(quality?.physicsHz ?? DEFAULT_SUBSTEP_HZ);

  const hullMaterial = new PBRMaterial('barco-casco-material', scene);
  hullMaterial.albedoColor = new Color3(1, 1, 1);
  hullMaterial.emissiveColor = new Color3(0.14, 0.03, 0.02);
  hullMaterial.metallic = 0.04;
  hullMaterial.roughness = 0.48;
  hullMaterial.backFaceCulling = false;
  hullMaterial.twoSidedLighting = true;

  const bulwarkMaterial = new PBRMaterial('barco-borda-azul-material', scene);
  bulwarkMaterial.albedoColor = new Color3(0.24, 0.38, 0.56);
  bulwarkMaterial.emissiveColor = new Color3(0.04, 0.07, 0.12);
  bulwarkMaterial.metallic = 0.05;
  bulwarkMaterial.roughness = 0.52;

  const whiteMaterial = new PBRMaterial('barco-branco-material', scene);
  whiteMaterial.albedoColor = new Color3(0.92, 0.93, 0.95);
  whiteMaterial.emissiveColor = new Color3(0.12, 0.13, 0.14);
  whiteMaterial.metallic = 0.02;
  whiteMaterial.roughness = 0.44;

  const windowMaterial = new PBRMaterial('barco-janela-material', scene);
  windowMaterial.albedoColor = new Color3(0.05, 0.11, 0.16);
  windowMaterial.metallic = 0.45;
  windowMaterial.roughness = 0.16;

  const tireMaterial = new PBRMaterial('barco-pneu-material', scene);
  tireMaterial.albedoColor = new Color3(0.08, 0.09, 0.10);
  tireMaterial.metallic = 0.05;
  tireMaterial.roughness = 0.78;

  const darkMaterial = new PBRMaterial('barco-madeira-material', scene);
  darkMaterial.albedoColor = new Color3(0.28, 0.22, 0.18);
  darkMaterial.metallic = 0.1;
  darkMaterial.roughness = 0.65;

  const buoyMaterial = new PBRMaterial('barco-boia-material', scene);
  buoyMaterial.albedoColor = new Color3(0.95, 0.42, 0.12);
  buoyMaterial.emissiveColor = new Color3(0.22, 0.08, 0.02);
  buoyMaterial.metallic = 0.02;
  buoyMaterial.roughness = 0.42;

  const hull = buildHull(scene);
  hull.material = hullMaterial;
  hull.parent = root;

  const bulwark = MeshBuilder.CreateBox(
    'barco-borda-azul',
    { width: 1.32, height: 0.22, depth: 2.95 },
    scene,
  );
  bulwark.position.set(0, 0.39, -0.18);
  bulwark.material = bulwarkMaterial;
  bulwark.parent = root;

  const foreDeck = MeshBuilder.CreateBox(
    'barco-proa-azul',
    { width: 1.02, height: 0.18, depth: 1.05 },
    scene,
  );
  foreDeck.position.set(0, 0.42, 0.82);
  foreDeck.material = bulwarkMaterial;
  foreDeck.parent = root;

  const cabin = MeshBuilder.CreateBox(
    'barco-cabine',
    { width: 1.06, height: 0.76, depth: 1.42 },
    scene,
  );
  cabin.position.set(0, 0.84, -0.32);
  cabin.material = whiteMaterial;
  cabin.parent = root;

  const cabinWindowSide = MeshBuilder.CreateBox(
    'barco-janela-lateral',
    { width: 1.09, height: 0.32, depth: 1.02 },
    scene,
  );
  cabinWindowSide.position.set(0, 0.92, -0.30);
  cabinWindowSide.material = windowMaterial;
  cabinWindowSide.parent = root;

  const cabinWindowFront = MeshBuilder.CreateBox(
    'barco-janela-frontal',
    { width: 0.86, height: 0.30, depth: 1.45 },
    scene,
  );
  cabinWindowFront.position.set(0, 0.92, -0.31);
  cabinWindowFront.material = windowMaterial;
  cabinWindowFront.parent = root;

  const windowMullion = MeshBuilder.CreateBox(
    'barco-coluna-janela',
    { width: 1.11, height: 0.35, depth: 0.09 },
    scene,
  );
  windowMullion.position.set(0, 0.92, -0.28);
  windowMullion.material = whiteMaterial;
  windowMullion.parent = root;

  const roof = MeshBuilder.CreateBox(
    'barco-teto',
    { width: 1.24, height: 0.09, depth: 1.66 },
    scene,
  );
  roof.position.set(0, 1.25, -0.28);
  roof.material = whiteMaterial;
  roof.parent = root;

  const lifebuoy = MeshBuilder.CreateTorus(
    'barco-boia-teto',
    { diameter: 0.46, thickness: 0.09, tessellation: 16 },
    scene,
  );
  lifebuoy.position.set(0, 1.32, -0.18);
  lifebuoy.material = buoyMaterial;
  lifebuoy.parent = root;

  const fenders: Mesh[] = [];
  const fenderOffsetsZ = [-1.08, -0.52, 0.04];
  for (let i = 0; i < fenderOffsetsZ.length; i += 1) {
    const fz = fenderOffsetsZ[i];
    for (const side of [-1, 1] as const) {
      const tire = MeshBuilder.CreateTorus(
        `barco-pneu-${i}-${side > 0 ? 'L' : 'R'}`,
        { diameter: 0.42, thickness: 0.13, tessellation: 14 },
        scene,
      );
      tire.rotation.z = Math.PI / 2;
      tire.position.set(side * 0.83, 0.14, fz);
      tire.material = tireMaterial;
      tire.isPickable = false;
      tire.parent = root;
      fenders.push(tire);
    }
  }

  const mast = MeshBuilder.CreateCylinder(
    'barco-antena-mastro',
    { height: 1.45, diameterTop: 0.018, diameterBottom: 0.04, tessellation: 6 },
    scene,
  );
  mast.position.set(0, 1.88, -0.05);
  mast.rotation.x = -0.38;
  mast.material = whiteMaterial;
  mast.parent = root;

  const bowBollard = MeshBuilder.CreateCylinder(
    'barco-cunho-proa',
    { height: 0.22, diameter: 0.09, tessellation: 6 },
    scene,
  );
  bowBollard.position.set(0, 0.52, 1.35);
  bowBollard.material = darkMaterial;
  bowBollard.parent = root;

  const lampMaterial = new PBRMaterial('barco-lanterna-material', scene);
  lampMaterial.albedoColor = new Color3(1, 0.76, 0.38);
  lampMaterial.emissiveColor = new Color3(1.6, 0.9, 0.3);
  lampMaterial.metallic = 0;
  lampMaterial.roughness = 0.3;

  const lamp = MeshBuilder.CreateSphere('barco-lanterna', { diameter: 0.16, segments: 8 }, scene);
  lamp.position.set(0, 1.36, 0.18);
  lamp.material = lampMaterial;
  lamp.parent = root;

  // Sondas visuais de diagnóstico 6-DOF (ocultas por padrão, ativáveis no painel de diagnóstico)
  const debugProbeMat = new StandardMaterial('barco-sonda-debug-mat', scene);
  debugProbeMat.emissiveColor = new Color3(0.15, 0.98, 0.52);
  debugProbeMat.disableLighting = true;
  const debugProbeSource = MeshBuilder.CreateSphere('barco-sonda-fonte', { diameter: 0.42, segments: 6 }, scene);
  debugProbeSource.material = debugProbeMat;
  debugProbeSource.isVisible = false;
  debugProbeSource.isPickable = false;
  const debugProbes = HULL_VOLUME_CELLS.map((_, idx) => {
    const inst = debugProbeSource.createInstance(`barco-sonda-6dof-${idx}`);
    inst.isVisible = false;
    inst.isPickable = false;
    inst.renderingGroupId = 2;
    return inst;
  });
  let debugProbesVisible = false;

  // Espuma de popa e linha d'água do casco
  const foamTexture = createFoamTexture(scene);
  const foamMaterial = new StandardMaterial('espuma-material', scene);
  foamMaterial.diffuseTexture = foamTexture;
  foamMaterial.useAlphaFromDiffuseTexture = true;
  foamMaterial.emissiveColor = new Color3(0.88, 0.96, 1.0);
  foamMaterial.emissiveTexture = foamTexture;
  foamMaterial.disableLighting = true;
  foamMaterial.diffuseColor = Color3.Black();
  foamMaterial.specularColor = Color3.Black();
  foamMaterial.alpha = 0.72;
  foamMaterial.backFaceCulling = false;
  foamMaterial.disableDepthWrite = true;
  foamMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;

  const foamSource = MeshBuilder.CreatePlane(
    'espuma-fonte',
    { width: 1, height: 1, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  foamSource.material = foamMaterial;
  foamSource.rotation.x = Math.PI / 2;
  foamSource.bakeCurrentTransformIntoVertices();
  foamSource.isVisible = false;
  foamSource.isPickable = false;
  foamSource.renderingGroupId = 2;

  const wakeParticles: Array<{ instance: ReturnType<Mesh['createInstance']>; particle: WakeParticle }> = [];
  for (let index = 0; index < WAKE_COUNT; index += 1) {
    const instance = foamSource.createInstance(`espuma-${index}`);
    instance.isPickable = false;
    instance.renderingGroupId = 2;
    instance.billboardMode = 0;
    wakeParticles.push({
      instance,
      particle: {
        age: (index / WAKE_COUNT) * 1.6,
        life: 1.4 + (index % 4) * 0.25,
        size: 0.42 + (index % 4) * 0.14,
        driftX: -0.45 - (index % 3) * 0.15,
        lateral: (index % 2 === 0 ? 1 : -1) * (0.22 + (index % 5) * 0.05),
      },
    });
  }

  const bowFoam: Array<{ instance: ReturnType<Mesh['createInstance']>; particle: BowFoamParticle }> = [];
  for (let index = 0; index < BOW_FOAM_COUNT; index += 1) {
    const instance = foamSource.createInstance(`espuma-proa-${index}`);
    instance.isPickable = false;
    instance.renderingGroupId = 2;
    instance.billboardMode = 0;
    bowFoam.push({
      instance,
      particle: {
        age: (index / BOW_FOAM_COUNT) * 0.9,
        life: 0.8 + (index % 4) * 0.18,
        size: 0.3 + (index % 3) * 0.12,
        lateral: (index % 2 === 0 ? 1 : -1) * (0.16 + (index % 5) * 0.08),
        forward: 0.2 + (index % 4) * 0.3,
      },
    });
  }

  const proceduralParts: AbstractMesh[] = [
    hull,
    bulwark,
    foreDeck,
    cabin,
    cabinWindowSide,
    cabinWindowFront,
    windowMullion,
    roof,
    lifebuoy,
    ...fenders,
    mast,
    bowBollard,
    lamp,
  ];

  const solidMeshes: AbstractMesh[] = [
    hull,
    bulwark,
    foreDeck,
    cabin,
    roof,
    lifebuoy,
    ...fenders,
    mast,
    bowBollard,
  ];

  hull.receiveShadows = true;
  foreDeck.receiveShadows = true;
  roof.receiveShadows = true;

  const meshes: AbstractMesh[] = [
    hull,
    bulwark,
    foreDeck,
    cabin,
    cabinWindowSide,
    cabinWindowFront,
    windowMullion,
    roof,
    lifebuoy,
    ...fenders,
    mast,
    bowBollard,
    lamp,
    foamSource,
    ...wakeParticles.map((entry) => entry.instance),
    ...bowFoam.map((entry) => entry.instance),
  ];

  for (const m of meshes) {
    if (m !== foamSource) m.applyFog = false;
  }

  // Carregamento do modelo 3D FBX de alta fidelidade do barco de pesca
  const targetLength = 4.4;
  const fbxLength = 8.4782;
  const scaleFactor = (targetLength / fbxLength) * 0.01;

  SceneLoader.LoadAssetContainerAsync(
    '',
    assetUrl('models/boat/Fishing_Ship_Asset.fbx'),
    scene,
    null,
    '.fbx',
  )
    .then((container) => {
      // A cena pode ser desmontada enquanto o FBX ainda carrega (voltar ao mapa
      // logo após entrar no laboratório). Nunca toque em sombras, água ou
      // materiais de uma cena já descartada.
      if (scene.isDisposed) {
        container.dispose();
        return;
      }

      container.addAllToScene();
      const fbxRoot = container.transformNodes[0];
      if (fbxRoot) {
        fbxRoot.parent = root;
        // Preserva a escala Z negativa do loader FBX para não espelhar a malha nem inverter normais e UVs
        fbxRoot.scaling.set(scaleFactor, scaleFactor, -scaleFactor);
        fbxRoot.position.set(-0.5285, 0.12, -0.914);
      }
      const shipMesh =
        container.meshes.find((m) => m.name.includes('Fishing_Ship')) || container.meshes[0];
      if (shipMesh) {
        shipMesh.material = createFishingShipMaterials(scene);
        shipMesh.receiveShadows = true;
        shipMesh.applyFog = false;

        // Desativa completamente os sólidos procedurais de fallback
        for (const part of proceduralParts) {
          part.setEnabled(false);
          part.isVisible = false;
        }

        solidMeshes.length = 0;
        solidMeshes.push(shipMesh);
        meshes.push(shipMesh);

        if (onMeshLoaded) {
          onMeshLoaded(shipMesh);
        }
      }
    })
    .catch((err) => {
      console.warn('Carregamento do barco FBX falhou, mantendo casco procedural:', err);
    });

  const rootPosition = new Vector3();
  const rootRotation = Quaternion.Identity();
  const localCmOffset = new Vector3();
  const rotatedCmOffset = new Vector3();
  let initialized = false;

  return {
    meshes,
    shadowCasters: solidMeshes,
    root,
    solver,

    getWakeState(): BoatWakeState {
      return {
        x: solver.x,
        z: solver.z,
        yaw: solver.yaw,
        slam: solver.bowSlamIntensity,
        hullLength: 4.4 * solver.hullScale,
        hullBeam: 1.68 * solver.hullScale,
      };
    },

    getHullBounds(): BoatHullBounds {
      return {
        x: solver.x,
        y: solver.y,
        z: solver.z,
        yaw: solver.yaw,
        halfLength: HULL_HALF_LENGTH_LOCAL * solver.hullScale,
        halfBeam: HULL_HALF_BEAM_LOCAL * solver.hullScale,
        draft: HULL_DRAFT_LOCAL * solver.hullScale,
      };
    },

    setDebugProbesVisible(visible: boolean): void {
      debugProbesVisible = visible;
      for (const p of debugProbes) {
        p.isVisible = visible;
      }
    },

    layout(frame: DioramaFrame): void {
      const mobile = frame.profile.id === 'mobile';
      const anchorU = mobile ? 0.32 : 0.285;
      const anchorDepth = mobile ? 0.58 : 0.56;
      const point = frame.surfacePoint(anchorU, anchorDepth);
      const hullScale = mobile ? 2.05 : 3.4;
      root.scaling.setAll(hullScale);
      solver.configure(hullScale, point.x, point.z, 1.22);
      initialized = false;
    },

    update(seconds: number, dt: number, clarity: number): void {
      if (!initialized) {
        // Pré-aquece 0.6s no instante inicial para que o barco já comece no equilíbrio dinâmico da onda
        const warmupSteps = Math.max(16, Math.round(0.6 * solver.substepHz));
        const warmupDt = 1 / solver.substepHz;
        for (let s = warmupSteps; s >= 1; s -= 1) {
          solver.step(warmupDt, Math.max(0, seconds - s * warmupDt), sampleOcean);
        }
        initialized = true;
      }

      solver.step(dt, seconds, sampleOcean);

      const hullScale = solver.hullScale;
      const currentCos = Math.cos(solver.yaw);
      const currentSin = Math.sin(solver.yaw);

      // Em Babylon.js, pitch positivo em RotationYawPitchRoll inclina o eixo +Z (proa) para baixo;
      // por isso invertemos o sinal de solver.pitch (onde pitch > 0 = proa subindo).
      Quaternion.RotationYawPitchRollToRef(solver.yaw, -solver.pitch, solver.roll, rootRotation);
      root.rotationQuaternion = rootRotation;

      // A raiz visual fica na linha d'água de projeto (y local = 0). O centro de
      // massa do solver está em localCmY; rotacionamos esse braço com o mesmo
      // quaternion do casco para que o centro de massa visual coincida com o
      // físico em pitch/roll. Nenhum offset vertical arbitrário é somado.
      localCmOffset.set(0, solver.localCmY * hullScale, solver.localCmZ * hullScale);
      localCmOffset.rotateByQuaternionToRef(rootRotation, rotatedCmOffset);
      rootPosition.set(
        solver.x - rotatedCmOffset.x,
        solver.y - rotatedCmOffset.y,
        solver.z - rotatedCmOffset.z,
      );
      root.position.copyFrom(rootPosition);

      if (debugProbesVisible) {
        for (let i = 0; i < debugProbes.length; i += 1) {
          const diag = solver.cellDiagnostics[i];
          const probe = debugProbes[i];
          probe.position.set(diag.worldX, diag.worldY, diag.worldZ);
          const s = 0.45 + diag.submergedFraction * 0.95;
          probe.scaling.set(s, s + diag.submergedFraction * 1.4, s);
        }
      }

      const sternX = rootPosition.x - 1.8 * hullScale * currentSin;
      const sternZ = rootPosition.z - 1.8 * hullScale * currentCos;
      const bowX = rootPosition.x + 2.0 * hullScale * currentSin;
      const bowZ = rootPosition.z + 2.0 * hullScale * currentCos;
      const foamVisibility = clamp(clarity);
      const bowSlam = solver.bowSlamIntensity;

      for (const { instance, particle } of wakeParticles) {
        particle.age += dt * (0.95 + bowSlam * 0.35);
        if (particle.age > particle.life) {
          particle.age = 0;
          particle.life = 1.3 + Math.random() * 0.85;
          particle.size = 0.34 + Math.random() * 0.36;
          particle.driftX = -0.48 - Math.random() * 0.52;
          particle.lateral = (Math.random() - 0.5) * 1.18;
        }
        const t = clamp(particle.age / particle.life);
        const spread = mix(0.65, 1.95, t);
        const lateral = particle.lateral * hullScale * 0.55;
        const trail = particle.driftX * t * hullScale * 0.58;
        const worldX = sternX + lateral * currentCos + trail * currentSin;
        const worldZ = sternZ - lateral * currentSin + trail * currentCos;
        const surface = waterHeightAt(worldX, worldZ, seconds);
        instance.position.set(worldX, surface + 0.04, worldZ);
        const fade = Math.sin(t * Math.PI);
        const scale = particle.size * spread * (hullScale / 3.4) * (0.35 + 0.65 * fade);
        instance.scaling.set(scale, 1, scale);
        instance.rotation.y = solver.yaw;
        instance.isVisible = foamVisibility > 0.05 && t < 0.98;
      }

      for (const { instance, particle } of bowFoam) {
        particle.age += dt * (1.0 + bowSlam * 0.55);
        if (particle.age > particle.life) {
          particle.age = 0;
          particle.life = 0.68 + Math.random() * 0.62;
          particle.size = (0.28 + Math.random() * 0.28) * (0.85 + bowSlam * 0.45);
          particle.lateral = (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.38);
          particle.forward = 0.18 + Math.random() * 0.68;
        }
        const t = clamp(particle.age / particle.life);
        const side = particle.lateral * (0.48 + t * 1.85 * (0.85 + bowSlam * 0.3)) * hullScale * 0.46;
        const ahead = particle.forward * t * hullScale * 0.85;
        const worldX = bowX + side * currentCos + ahead * currentSin;
        const worldZ = bowZ - side * currentSin + ahead * currentCos;
        const surface = waterHeightAt(worldX, worldZ, seconds);
        instance.position.set(worldX, surface + 0.045, worldZ);
        const fade = Math.sin(t * Math.PI);
        const scale = particle.size * (0.58 + t * 1.2) * (hullScale / 3.4) * (0.38 + 0.62 * fade);
        instance.scaling.set(scale, 1, scale);
        instance.rotation.y = solver.yaw;
        instance.isVisible = foamVisibility > 0.05 && t < 0.98;
      }
    },
  };
}
