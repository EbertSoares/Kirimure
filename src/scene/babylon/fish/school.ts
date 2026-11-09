/**
 * Cardume normalizado do Kirimurê com fluxo contínuo em cadeia (trilha de
 * trajetória) e vórtice circular ("mill" / carrossel).
 *
 * O centro do cardume navega no espaço do `DioramaFrame`: `u` horizontal,
 * `elevation` na coluna d'água e `depth` entre a câmera e o horizonte. Isso
 * garante, por construção, que nenhum peixe saia do enquadramento mobile.
 *
 * Para evitar que os peixes nadem na direção do eixo Z da câmera (ficando de
 * frente/costas e achatados em perspectiva) ou batam nas paredes estreitas da
 * camada de profundidade (`depthMin..depthMax`), a navegação prioriza o fluxo
 * lateral contínuo pelo recife em curvas S suaves, com histórico de trilha
 * (`trail`) para que a cadeia de peixes siga a curva real do líder.
 */

import type { Vec3Tuple } from './steering';
import { length, normalize, scale, sub, steer } from './steering';

export interface SchoolBand {
  uMin: number;
  uMax: number;
  elevationMin: number;
  elevationMax: number;
  depthMin: number;
  depthMax: number;
}

export interface SchoolConfig {
  band: SchoolBand;
  speed: number;
  aMax: number;
  turnMax: number;
  retargetMin: number;
  retargetMax: number;
  /** Afastamento lateral/local da formação. */
  spreadU: number;
  spreadElevation: number;
  spreadDepth: number;
}

export type SchoolFlowMode = 'stream' | 'mill';

const TRAIL_CAPACITY = 28;
const TRAIL_SAMPLE_INTERVAL = 0.065;

export interface SchoolState {
  center: Vec3Tuple;
  velocity: Vec3Tuple;
  target: Vec3Tuple;
  retarget: number;
  /** Fase fixa para o wobble e para a órbita circular não reiniciarem a cada retarget. */
  phase: number;
  /** Direção suavizada da formação no plano (u, depth), evitando inversões bruscas de assentos. */
  heading?: number;
  /** Modo coreográfico atual: fluxo em fita ('stream') ou giro circular em cardume ('mill'). */
  mode?: SchoolFlowMode;
  /** Transição contínua (0 = stream, 1 = mill) para evitar saltos ao entrar/sair do carrossel. */
  millBlend?: number;
  /** Sentido do giro circular (1 = horário, -1 = anti-horário). */
  millDirection?: 1 | -1;
  /** Fase acumulada do giro circular e da ondulação em cadeia. */
  flowTime?: number;
  /** Histórico recente de pontos do centro do cardume (índice 0 = posição atual, final = cauda). */
  trail?: Vec3Tuple[];
  /** Acumulador de tempo para amostragem do histórico da trilha. */
  trailTimer?: number;
}

interface RandomLike {
  (): number;
}

function wrapAngleDelta(delta: number): number {
  let d = (delta + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
}

export function clampPointToBand(point: Vec3Tuple, band: SchoolBand): Vec3Tuple {
  return [
    Math.min(band.uMax, Math.max(band.uMin, point[0])),
    Math.min(band.elevationMax, Math.max(band.elevationMin, point[1])),
    Math.min(band.depthMax, Math.max(band.depthMin, point[2])),
  ];
}

export function randomPointInBand(random: RandomLike, band: SchoolBand): Vec3Tuple {
  // Prefere o interior da faixa (margem suave) para evitar alvos colados nas bordas
  const padU = (band.uMax - band.uMin) * 0.1;
  const padE = (band.elevationMax - band.elevationMin) * 0.14;
  const padD = (band.depthMax - band.depthMin) * 0.18;
  return [
    band.uMin + padU + random() * Math.max(1e-4, band.uMax - band.uMin - padU * 2),
    band.elevationMin + padE + random() * Math.max(1e-4, band.elevationMax - band.elevationMin - padE * 2),
    band.depthMin + padD + random() * Math.max(1e-4, band.depthMax - band.depthMin - padD * 2),
  ];
}

function buildInitialTrail(center: Vec3Tuple, velocity: Vec3Tuple, band: SchoolBand): Vec3Tuple[] {
  const trail: Vec3Tuple[] = [];
  const dt = TRAIL_SAMPLE_INTERVAL;
  for (let i = 0; i < TRAIL_CAPACITY; i += 1) {
    trail.push(
      clampPointToBand(
        [
          center[0] - velocity[0] * dt * i,
          center[1] - velocity[1] * dt * i,
          center[2] - velocity[2] * dt * i,
        ],
        band,
      ),
    );
  }
  return trail;
}

export function createSchoolState(random: RandomLike, config: SchoolConfig): SchoolState {
  const center = randomPointInBand(random, config.band);
  const midU = (config.band.uMin + config.band.uMax) * 0.5;
  // Escolhe sentido inicial predominantemente lateral (+u ou -u) para nado em perfil
  const lateralSign = center[0] < midU ? 1 : -1;
  const target = randomPointInBand(random, config.band);
  const spanU = config.band.uMax - config.band.uMin;
  target[0] =
    lateralSign > 0
      ? config.band.uMin + spanU * (0.62 + random() * 0.26)
      : config.band.uMin + spanU * (0.12 + random() * 0.26);

  const vu = lateralSign * config.speed * (0.88 + random() * 0.12);
  const ve = (random() - 0.5) * config.speed * 0.14;
  const vd = (random() - 0.5) * config.speed * 0.18;
  const velocity: Vec3Tuple = [vu, ve, vd];
  const heading = Math.atan2(vu, vd);

  return {
    center,
    velocity,
    target: clampPointToBand(target, config.band),
    retarget: config.retargetMin + random() * (config.retargetMax - config.retargetMin),
    phase: random() * Math.PI * 2,
    heading,
    mode: 'stream',
    millBlend: 0,
    millDirection: random() < 0.5 ? 1 : -1,
    flowTime: random() * 20,
    trail: buildInitialTrail(center, velocity, config.band),
    trailTimer: 0,
  };
}

/** Atualiza o centro do cardume com curvas S contínuas pelo recife e alternância stream/mill. */
export function updateSchoolState(
  school: SchoolState,
  dt: number,
  random: RandomLike,
  config: SchoolConfig,
): void {
  const step = Math.max(0, dt);
  school.retarget -= step;
  school.flowTime = (school.flowTime ?? 0) + step;

  const spanU = Math.max(1e-4, config.band.uMax - config.band.uMin);
  const spanE = Math.max(1e-4, config.band.elevationMax - config.band.elevationMin);
  const spanD = Math.max(1e-4, config.band.depthMax - config.band.depthMin);
  const midU = (config.band.uMin + config.band.uMax) * 0.5;
  const midE = (config.band.elevationMin + config.band.elevationMax) * 0.52;
  const midD = (config.band.depthMin + config.band.depthMax) * 0.5;

  if (school.retarget <= 0) {
    school.retarget = config.retargetMin + random() * (config.retargetMax - config.retargetMin);
    const nextTarget = randomPointInBand(random, config.band);

    // Garante travessias amplas de um lado ao outro do recife (fluxo horizontal)
    const swimRight = school.center[0] < midU ? random() < 0.82 : random() < 0.18;
    nextTarget[0] = swimRight
      ? config.band.uMin + spanU * (0.64 + random() * 0.24)
      : config.band.uMin + spanU * (0.12 + random() * 0.24);
    school.target = clampPointToBand(nextTarget, config.band);

    // Alterna organicamente entre fluxo em cadeia ('stream') e carrossel circular ('mill')
    if (school.mode === 'mill') {
      school.mode = 'stream';
    } else if (random() < 0.32) {
      school.mode = 'mill';
      school.millDirection = random() < 0.5 ? 1 : -1;
      school.target = clampPointToBand(
        [
          school.center[0] * 0.68 + midU * 0.32,
          school.center[1] * 0.65 + midE * 0.35,
          school.center[2] * 0.6 + midD * 0.4,
        ],
        config.band,
      );
    }
  }

  // Transição suave entre o modo linear em fita (0) e o carrossel circular (1)
  const targetMill = school.mode === 'mill' ? 1 : 0;
  const currentMill = school.millBlend ?? targetMill;
  school.millBlend = currentMill + (targetMill - currentMill) * Math.min(1, step * 1.4);

  const toTarget = sub(school.target, school.center);
  const distance = length(toTarget);

  // Quando o cardume se aproxima lateralmente do alvo no modo 'stream', já escolhe um novo
  // ponto adiante para nunca parar nem inverter bruscamente.
  if (
    school.mode !== 'mill' &&
    (distance < 0.065 || Math.abs(toTarget[0]) < 0.055) &&
    school.retarget > 0.8
  ) {
    school.retarget = Math.min(school.retarget, 0.35);
  }

  const speedScale = 1 - (school.millBlend ?? 0) * 0.58;
  // Anisotropia controlada: prioriza deslocamento horizontal (u) e suaviza elevação e profundidade
  const weightedToTarget: Vec3Tuple = [
    toTarget[0],
    toTarget[1] * 0.55,
    toTarget[2] * Math.min(0.45, (spanD / spanU) * 1.35),
  ];
  const weightedLen = length(weightedToTarget);

  const desired: Vec3Tuple =
    weightedLen > 1e-4
      ? scale(
          normalize(weightedToTarget),
          Math.min(config.speed * speedScale, distance * 0.72 + config.speed * 0.38 * speedScale),
        )
      : [0, 0, 0];

  // Ondulação senoidal suave (curva S de cardume recifal)
  const flowT = school.flowTime ?? 0;
  desired[0] += Math.cos(flowT * 0.38 + school.phase) * config.speed * 0.12;
  desired[1] += Math.sin(flowT * 0.52 + school.phase * 1.3) * config.speed * 0.09;
  desired[2] += Math.sin(flowT * 0.44 + school.phase * 0.7) * config.speed * Math.min(0.08, (spanD / spanU) * 0.32);

  // Pré-curva suave antes de tocar nas bordas da faixa (evita quicar nas paredes)
  const marginU = spanU * 0.15;
  const marginE = spanE * 0.18;
  const marginD = spanD * 0.24;

  if (school.center[0] < config.band.uMin + marginU) {
    const t = 1 - (school.center[0] - config.band.uMin) / marginU;
    desired[0] += config.speed * t * 1.05;
  } else if (school.center[0] > config.band.uMax - marginU) {
    const t = 1 - (config.band.uMax - school.center[0]) / marginU;
    desired[0] -= config.speed * t * 1.05;
  }

  if (school.center[1] < config.band.elevationMin + marginE) {
    const t = 1 - (school.center[1] - config.band.elevationMin) / marginE;
    desired[1] += config.speed * t * 0.75;
  } else if (school.center[1] > config.band.elevationMax - marginE) {
    const t = 1 - (config.band.elevationMax - school.center[1]) / marginE;
    desired[1] -= config.speed * t * 0.75;
  }

  if (school.center[2] < config.band.depthMin + marginD) {
    const t = 1 - (school.center[2] - config.band.depthMin) / marginD;
    desired[2] += config.speed * t * 0.55;
  } else if (school.center[2] > config.band.depthMax - marginD) {
    const t = 1 - (config.band.depthMax - school.center[2]) / marginD;
    desired[2] -= config.speed * t * 0.55;
  }

  steer(
    school.velocity,
    desired,
    step,
    config.aMax,
    config.turnMax,
    config.speed * 0.26,
    config.speed * 1.65,
  );

  // Mantém a componente de profundidade (Z) proporcional à componente lateral (U),
  // garantindo que o cardume nade sempre em perfil/três-quartos e nunca reto para o fundo.
  const absU = Math.max(config.speed * 0.18, Math.abs(school.velocity[0]));
  const maxDepthVel = absU * Math.min(0.32, (spanD / spanU) * 1.4);
  const maxElevVel = absU * 0.26;
  school.velocity[2] = Math.max(-maxDepthVel, Math.min(maxDepthVel, school.velocity[2]));
  school.velocity[1] = Math.max(-maxElevVel, Math.min(maxElevVel, school.velocity[1]));

  school.center[0] += school.velocity[0] * step;
  school.center[1] += school.velocity[1] * step;
  school.center[2] += school.velocity[2] * step;

  const clamped = clampPointToBand(school.center, config.band);
  if (clamped[0] !== school.center[0]) school.velocity[0] *= -0.45;
  if (clamped[1] !== school.center[1]) school.velocity[1] *= -0.35;
  if (clamped[2] !== school.center[2]) school.velocity[2] *= -0.35;
  school.center[0] = clamped[0];
  school.center[1] = clamped[1];
  school.center[2] = clamped[2];

  // Atualiza a orientação suavizada do cardume
  const horizontal = Math.hypot(school.velocity[0], school.velocity[2]);
  if (horizontal > 1e-5) {
    const targetHeading = Math.atan2(school.velocity[0], school.velocity[2]);
    if (school.heading === undefined) {
      school.heading = targetHeading;
    } else {
      const diff = wrapAngleDelta(targetHeading - school.heading);
      const maxHeadingStep = config.turnMax * 0.85 * step;
      school.heading += Math.max(-maxHeadingStep, Math.min(maxHeadingStep, diff));
    }
  }

  // Atualiza o histórico de trilha do centro para a formação em cadeia ("ribbon trail")
  if (!school.trail || school.trail.length === 0) {
    school.trail = buildInitialTrail(school.center, school.velocity, config.band);
  }
  school.trailTimer = (school.trailTimer ?? 0) + step;
  if (school.trailTimer >= TRAIL_SAMPLE_INTERVAL) {
    school.trailTimer = 0;
    school.trail.pop();
    school.trail.unshift([school.center[0], school.center[1], school.center[2]]);
  } else {
    school.trail[0] = [school.center[0], school.center[1], school.center[2]];
  }
}

/**
 * Repulsão mútua entre centros de cardumes distintos para que dois cardumes
 * nunca se misturem ou ocupem o mesmo volume ao mesmo tempo.
 */
export function repelSchools(
  schools: ReadonlyArray<{ state: SchoolState; config: SchoolConfig; depthLayer: number }>,
  dt: number,
): void {
  const step = Math.max(0, dt);
  if (step <= 0) return;

  for (let i = 0; i < schools.length; i += 1) {
    const a = schools[i];
    for (let j = i + 1; j < schools.length; j += 1) {
      const b = schools[j];
      const du = a.state.center[0] - b.state.center[0];
      const de = a.state.center[1] - b.state.center[1];
      const dd = a.state.center[2] - b.state.center[2];

      const normU = du / 0.24;
      const normE = de / 0.18;
      const normD = dd / 0.14;
      const dist = Math.hypot(normU, normE, normD);
      if (dist >= 1 || dist < 1e-5) continue;

      const push = (1 - dist) * 0.032 * step;
      const inv = 1 / dist;
      const pu = normU * inv * push;
      const pe = normE * inv * push * 0.75;
      const pd = normD * inv * push * 0.35;

      a.state.velocity[0] += pu * 12;
      a.state.velocity[1] += pe * 10;
      a.state.velocity[2] += pd * 5;

      b.state.velocity[0] -= pu * 12;
      b.state.velocity[1] -= pe * 10;
      b.state.velocity[2] -= pd * 5;

      a.state.center = clampPointToBand(
        [a.state.center[0] + pu, a.state.center[1] + pe, a.state.center[2] + pd],
        a.config.band,
      );
      b.state.center = clampPointToBand(
        [b.state.center[0] - pu, b.state.center[1] - pe, b.state.center[2] - pd],
        b.config.band,
      );
    }
  }
}

/**
 * Posição de um assento de formação no espaço normalizado.
 *
 * `offset` é local:
 *  - `offset[0]`: afastamento lateral na faixa da cadeia;
 *  - `offset[1]`: afastamento vertical;
 *  - `offset[2]`: posição ao longo da espinha longitudinal da cadeia (+frente .. -cauda).
 *
 * No modo `'stream'`, os peixes seguem a trilha histórica (`school.trail`) com
 * ondulação progressiva em S; no modo `'mill'`, orbitam em carrossel circular
 * sincronizado com transição suave (`millBlend`).
 */
export function formationPosition(
  center: Vec3Tuple,
  velocity: Vec3Tuple,
  offset: Vec3Tuple,
  wobble: number,
  seconds: number,
  band: SchoolBand,
  school?: SchoolState,
): Vec3Tuple {
  const spanU = Math.max(1e-4, band.uMax - band.uMin);
  const spanD = Math.max(1e-4, band.depthMax - band.depthMin);
  // Fator de aspecto para nunca estourar a espessura estreita da camada de profundidade
  const depthAspect = Math.min(0.32, (spanD / spanU) * 0.9);

  const horizontal = Math.hypot(velocity[0], velocity[2]);
  const yaw =
    school?.heading !== undefined
      ? school.heading
      : horizontal > 1e-5
        ? Math.atan2(velocity[0], velocity[2])
        : Math.PI * 0.5;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);

  // 1) Posição em cadeia fluida ('stream'): usa o histórico de trilha quando disponível
  let baseCenter: Vec3Tuple = center;
  if (school?.trail && school.trail.length > 1) {
    // Mapeia offset[2] (+frente .. -cauda) para índice contínuo na trilha [0 .. trail.length - 1]
    const normalizedLag = Math.min(1, Math.max(0, 0.45 - offset[2] * 5.2));
    const exactIdx = normalizedLag * (school.trail.length - 1);
    const i0 = Math.floor(exactIdx);
    const i1 = Math.min(school.trail.length - 1, i0 + 1);
    const frac = exactIdx - i0;
    const p0 = school.trail[i0];
    const p1 = school.trail[i1];
    baseCenter = [
      p0[0] + (p1[0] - p0[0]) * frac,
      p0[1] + (p1[1] - p0[1]) * frac,
      p0[2] + (p1[2] - p0[2]) * frac,
    ];
  }

  // Ondulação progressiva ao longo do eixo longitudinal como uma fita viva
  const streamWave = Math.sin(seconds * 1.55 - offset[2] * 22 + wobble * 0.55) * 0.011;
  const lx = offset[0] + streamWave + Math.sin(seconds * 0.48 + wobble) * 0.005;
  const ly = offset[1] + Math.sin(seconds * 0.62 + wobble * 1.2 - offset[2] * 14) * 0.012;
  const lz = (school?.trail && school.trail.length > 1 ? offset[2] * 0.35 : offset[2]) +
    Math.cos(seconds * 0.32 + wobble * 0.7) * 0.005;

  const streamU = baseCenter[0] + lx * cos + lz * sin;
  const streamE = baseCenter[1] + ly;
  const streamD = baseCenter[2] + (-lx * sin + lz * cos) * depthAspect;

  const effectiveMill =
    school?.millBlend !== undefined
      ? school.millBlend
      : school?.mode === 'mill'
        ? 1
        : 0;

  if (effectiveMill <= 1e-3) {
    return clampPointToBand([streamU, streamE, streamD], band);
  }

  // 2) Posição no carrossel/vórtice circular ('mill')
  const dir = school?.millDirection ?? 1;
  const baseAngle = Math.atan2(offset[0], offset[2] || 1e-4) + wobble * 0.42;
  const orbitAngle = baseAngle + dir * seconds * 0.95;
  const radiusFactor = Math.min(1.25, Math.max(0.48, Math.hypot(offset[0], offset[2]) * 11));
  const ringU = Math.max(0.038, Math.min(0.088, spanU * 0.095 * radiusFactor));
  const ringD = Math.max(0.012, Math.min(0.036, spanD * 0.28 * radiusFactor));
  const waveY =
    offset[1] * 0.82 + Math.sin(orbitAngle * 2 + (school?.phase ?? 0)) * 0.02;

  const millU = center[0] + Math.sin(orbitAngle) * ringU;
  const millE = center[1] + waveY;
  const millD = center[2] + Math.cos(orbitAngle) * ringD;

  return clampPointToBand(
    [
      streamU + (millU - streamU) * effectiveMill,
      streamE + (millE - streamE) * effectiveMill,
      streamD + (millD - streamD) * effectiveMill,
    ],
    band,
  );
}

/**
 * Profundidade visual (0..1) do centro, para separar cardumes em camadas.
 *
 * A camada frontal é deliberadamente estreita: os cardumes ficam no terço
 * próximo da câmera (em vez de flutuar no meio do alcance), o que dá o efeito
 * de peixes cruzando o primeiro plano. As camadas média e de fundo ocupam o
 * restante do volume sem sobreposição.
 */
export function schoolDepthBand(depthMin: number, depthMax: number, layer: number): [number, number] {
  const span = depthMax - depthMin;
  const cuts = [0, 0.16, 0.46, 1] as const;
  const index = layer % 3;
  const start = depthMin + span * cuts[index];
  const end = depthMin + span * cuts[index + 1];
  const inset = (end - start) * 0.08;
  return [start + inset, end - inset];
}
