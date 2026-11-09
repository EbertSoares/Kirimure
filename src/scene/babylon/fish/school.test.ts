import { describe, expect, it } from 'vitest';
import {
  clampPointToBand,
  createSchoolState,
  formationPosition,
  repelSchools,
  schoolDepthBand,
  updateSchoolState,
  type SchoolBand,
  type SchoolConfig,
} from './school';
import {
  nearestReefShelter,
  reefInteractionTarget,
  resolveReefCollisions,
  type ScreenObstacle,
} from '../reefObstacles';
import { mulberry32 } from '../procedural';

const BAND: SchoolBand = {
  uMin: 0.08,
  uMax: 0.92,
  elevationMin: 0.2,
  elevationMax: 0.8,
  depthMin: 0.3,
  depthMax: 0.88,
};

const CONFIG: SchoolConfig = {
  band: BAND,
  speed: 0.05,
  aMax: 0.03,
  turnMax: 1.1,
  retargetMin: 7,
  retargetMax: 15,
  spreadU: 0.04,
  spreadElevation: 0.06,
  spreadDepth: 0.03,
};

function inside(point: [number, number, number], band: SchoolBand): boolean {
  return (
    point[0] >= band.uMin - 1e-9 &&
    point[0] <= band.uMax + 1e-9 &&
    point[1] >= band.elevationMin - 1e-9 &&
    point[1] <= band.elevationMax + 1e-9 &&
    point[2] >= band.depthMin - 1e-9 &&
    point[2] <= band.depthMax + 1e-9
  );
}

describe('cardume normalizado', () => {
  it('limita qualquer ponto à faixa segura', () => {
    expect(clampPointToBand([-1, 2, 9], BAND)).toEqual([BAND.uMin, BAND.elevationMax, BAND.depthMax]);
  });

  it('mantém o centro dentro da faixa durante muitos quadros', () => {
    const random = mulberry32(1234);
    const state = createSchoolState(random, CONFIG);

    for (let frame = 0; frame < 4000; frame += 1) {
      updateSchoolState(state, 1 / 60, random, CONFIG);
      expect(inside(state.center, BAND)).toBe(true);
    }
  });

  it('sorteia novos alvos depois do intervalo de retarget', () => {
    const random = mulberry32(99);
    const state = createSchoolState(random, CONFIG);
    const original = [...state.target] as [number, number, number];
    for (let frame = 0; frame < 60 * 20; frame += 1) {
      updateSchoolState(state, 1 / 60, random, CONFIG);
    }
    expect(state.target).not.toEqual(original);
  });

  it('mantém todos os assentos da formação na faixa, mesmo em curvas', () => {
    const random = mulberry32(7);
    const state = createSchoolState(random, CONFIG);
    state.center = [0.5, 0.5, 0.5];
    const velocity: [number, number, number] = [0.05, 0, -0.02];
    const offsets: Array<[number, number, number]> = [
      [0.16, 0.14, 0.08],
      [-0.16, -0.14, -0.08],
      [0.16, -0.14, 0.08],
    ];

    for (let index = 0; index < offsets.length; index += 1) {
      const point = formationPosition(state.center, velocity, offsets[index], index, 12.4, BAND);
      expect(inside(point, BAND)).toBe(true);
    }
  });

  it('separa camadas de profundidade sem sobreposição', () => {
    const first = schoolDepthBand(0.3, 0.9, 0);
    const second = schoolDepthBand(0.3, 0.9, 1);
    const third = schoolDepthBand(0.3, 0.9, 2);

    expect(first[1]).toBeLessThanOrEqual(second[0]);
    expect(second[1]).toBeLessThanOrEqual(third[0]);
    expect(third[1]).toBeLessThanOrEqual(0.9);
  });

  it('afasta cardumes distintos com repelSchools e suporta órbita circular (mill)', () => {
    const random = mulberry32(42);
    const schoolA = { state: createSchoolState(random, CONFIG), config: CONFIG, depthLayer: 0 };
    const schoolB = { state: createSchoolState(random, CONFIG), config: CONFIG, depthLayer: 0 };
    schoolA.state.center = [0.5, 0.5, 0.5];
    schoolB.state.center = [0.52, 0.5, 0.5];

    const initialDist = Math.hypot(
      schoolA.state.center[0] - schoolB.state.center[0],
      schoolA.state.center[2] - schoolB.state.center[2],
    );
    repelSchools([schoolA, schoolB], 1 / 30);
    const afterDist = Math.hypot(
      schoolA.state.center[0] - schoolB.state.center[0],
      schoolA.state.center[2] - schoolB.state.center[2],
    );
    expect(afterDist).toBeGreaterThan(initialDist);

    schoolA.state.mode = 'mill';
    schoolA.state.millDirection = 1;
    const posT0 = formationPosition(
      schoolA.state.center,
      schoolA.state.velocity,
      [0.05, 0.02, 0.04],
      0.5,
      0,
      BAND,
      schoolA.state,
    );
    const posT1 = formationPosition(
      schoolA.state.center,
      schoolA.state.velocity,
      [0.05, 0.02, 0.04],
      0.5,
      1.2,
      BAND,
      schoolA.state,
    );
    expect(inside(posT0, BAND)).toBe(true);
    expect(inside(posT1, BAND)).toBe(true);
    expect(posT0).not.toEqual(posT1);
  });

  it('desliza tangencialmente ao redor de rochas sem inverter velocidade e encontra abrigos acessíveis', () => {
    const obstacle: ScreenObstacle = {
      u: 0.5,
      depth: 0.5,
      elevation: 0.35,
      halfHeight: 0.14,
      radiusU: 0.08,
      radiusDepth: 0.06,
      kind: 'coral',
      source: { x: 0, z: 30, baseY: -6, topY: -4, radius: 1.5, kind: 'coral' },
    };
    const point: [number, number, number] = [0.5, 0.35, 0.46];
    const velocity: [number, number, number] = [0.01, 0, 0.05];
    const corrected = resolveReefCollisions(point, 0.02, [obstacle], velocity);
    expect(corrected).toBe(true);
    // O peixe desliza lateralmente em vez de inverter para trás no eixo de avanço
    expect(Math.hypot(velocity[0], velocity[2])).toBeGreaterThan(0.01);

    const shelter = nearestReefShelter([0.42, 0.36, 0.44], [obstacle], 8, 0.02);
    expect(shelter).toBe(obstacle);
    const hideTarget = reefInteractionTarget(obstacle, 'hide', [0.42, 0.36, 0.44]);
    expect(hideTarget[2]).toBeLessThan(obstacle.depth + obstacle.radiusDepth * 0.8);
  });
});
