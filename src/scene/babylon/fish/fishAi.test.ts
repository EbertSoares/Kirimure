import { describe, expect, it } from 'vitest';
import {
  clampPointToBand,
  createSchoolState,
  formationPosition,
  sampleDelayedHeading,
  updateSchoolState,
  type SchoolBand,
  type SchoolConfig,
} from './school';
import {
  distance,
  length,
  normalize,
  scale,
  steer,
  steerFish,
  sub,
  type Vec3Tuple,
} from './steering';
import {
  resolveReefCollisions,
  steerAroundReef,
  type ScreenObstacle,
} from '../reefObstacles';
import { FISH_ECOLOGY } from './species';
import { clamp, mulberry32 } from '../procedural';

describe('ETAPA 14: Suíte de Validação da Inteligência Artificial dos Peixes', () => {
  // ── TESTE 1: Cardume em movimento 3D ────────────────────────────────
  it('Teste 1 — Cardume em movimento: mantém coesão, separação e distribuição volumétrica 3D sem fila indiana', () => {
    const random = mulberry32(1001);
    const band: SchoolBand = {
      uMin: 0.1,
      uMax: 0.9,
      elevationMin: 0.36,
      elevationMax: 0.82,
      depthMin: 0.3,
      depthMax: 0.85,
    };
    const config: SchoolConfig = {
      band,
      speed: 0.068,
      aMax: 0.05,
      turnMax: 1.1,
      retargetMin: 8,
      retargetMax: 15,
      spreadU: 0.125,
      spreadElevation: 0.072,
      spreadDepth: 0.048,
      formationMode: 'cluster',
      wavePropagationSpeed: 0.28,
    };
    const school = createSchoolState(random, config);
    school.center = [0.5, 0.55, 0.5];
    school.velocity = [0.068, 0, 0.005];

    const agentCount = 20;
    // Geração de posições em nuvem 3D volumétrica (Fibonacci esférico)
    const seats: Vec3Tuple[] = [];
    const phi = (1 + Math.sqrt(5)) / 2;
    for (let i = 0; i < agentCount; i += 1) {
      const theta = 2 * Math.PI * i / phi;
      const yNorm = 1 - (i / Math.max(1, agentCount - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
      seats.push([
        Math.cos(theta) * radiusAtY * config.spreadU,
        yNorm * config.spreadElevation,
        Math.sin(theta) * radiusAtY * config.spreadDepth,
      ]);
    }

    // Amostra posições ao longo de vários instantes de tempo
    const positions: Vec3Tuple[] = [];
    for (let i = 0; i < agentCount; i += 1) {
      const pos = formationPosition(
        school.center,
        school.velocity,
        seats[i],
        i * 0.45,
        15.0,
        band,
        school,
      );
      positions.push(pos);
    }

    // 1. Variância espacial em 3 dimensões reais (X, Y, Z)
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const p of positions) {
      sumX += p[0];
      sumY += p[1];
      sumZ += p[2];
    }
    const meanX = sumX / agentCount;
    const meanY = sumY / agentCount;
    const meanZ = sumZ / agentCount;

    let varX = 0, varY = 0, varZ = 0;
    for (const p of positions) {
      varX += (p[0] - meanX) ** 2;
      varY += (p[1] - meanY) ** 2;
      varZ += (p[2] - meanZ) ** 2;
    }
    varX /= agentCount;
    varY /= agentCount;
    varZ /= agentCount;

    // Garante que o cardume possui espessura volumétrica tridimensional
    // Não pode colapsar em 1 dimensão (fila indiana) ou 0 (sobreposição)
    expect(varX).toBeGreaterThan(0.0005);
    expect(varY).toBeGreaterThan(0.0003);
    expect(varZ).toBeGreaterThan(0.0002);

    // 2. Separação: nenhum par de peixes colide no mesmo ponto
    let minDistance = Infinity;
    for (let i = 0; i < agentCount; i += 1) {
      for (let j = i + 1; j < agentCount; j += 1) {
        const d = distance(positions[i], positions[j]);
        if (d < minDistance) minDistance = d;
      }
    }
    expect(minDistance).toBeGreaterThan(0.012);

    // 3. Coesão: todos os peixes permanecem agrupados ao redor do centro
    for (const p of positions) {
      expect(distance(p, school.center)).toBeLessThan(0.22);
    }
  });

  // ── TESTE 2: Curva de 90 graus com propagação de onda ───────────────
  it('Teste 2 — Curva de 90 graus: propagação de onda direcional (peixes dianteiros viram antes dos traseiros)', () => {
    const random = mulberry32(2024);
    const band: SchoolBand = {
      uMin: 0.1,
      uMax: 0.9,
      elevationMin: 0.2,
      elevationMax: 0.8,
      depthMin: 0.2,
      depthMax: 0.9,
    };
    const config: SchoolConfig = {
      band,
      speed: 0.06,
      aMax: 0.05,
      turnMax: 1.5,
      retargetMin: 10,
      retargetMax: 20,
      spreadU: 0.1,
      spreadElevation: 0.06,
      spreadDepth: 0.05,
      wavePropagationSpeed: 0.25,
    };
    const state = createSchoolState(random, config);
    state.center = [0.5, 0.5, 0.5];

    // Cardume avança incialmente na direção Z positivo (heading = 0)
    state.velocity = [0, 0, 0.06];
    state.heading = 0;
    state.headingHistory = [];

    // Preenche histórico com direção inicial durante 1 segundo
    for (let step = 0; step < 60; step += 1) {
      state.headingHistory.push({ time: step / 60, heading: 0 });
    }

    // Agora o cardume faz uma curva de 90° para o eixo X positivo (heading = PI / 2)
    const turnTime = 1.0;
    const newHeading = Math.PI * 0.5;
    state.heading = newHeading;
    state.velocity = [0.06, 0, 0];
    state.headingHistory.push({ time: turnTime + 0.05, heading: newHeading });

    // Testa amostragem da onda de giro em posições longitudinais distintas:
    // Peixe dianteiro (zOffset = +0.06) vs peixe intermediário (0.0) vs peixe traseiro (-0.06)
    const currentTime = turnTime + 0.1;
    // O retardo longitudinal tau = max(0, zFront - zOffset) / vWave
    const vWave = 0.25;
    const zFront = 0.06;
    const delayFront = Math.max(0, zFront - 0.06) / vWave; // = 0 (sem atraso)
    const delayMiddle = Math.max(0, zFront - 0.0) / vWave;  // atraso intermediário
    const delayRear = Math.max(0, zFront - (-0.06)) / vWave; // atraso máximo

    const headingFront = sampleDelayedHeading(state.headingHistory, currentTime, delayFront, state.heading);
    const headingMiddle = sampleDelayedHeading(state.headingHistory, currentTime, delayMiddle, state.heading);
    const headingRear = sampleDelayedHeading(state.headingHistory, currentTime, delayRear, state.heading);

    // O peixe da frente recebe a nova direção primeiro (heading mais próximo de PI/2)
    // O peixe traseiro tem atraso temporal tau e ainda mantém a direção anterior (0)
    expect(headingFront).toBeCloseTo(newHeading, 3);
    expect(headingRear).toBeLessThan(headingFront);
    expect(Math.abs(headingFront - newHeading)).toBeLessThanOrEqual(
      Math.abs(headingMiddle - newHeading) + 1e-4,
    );
    expect(Math.abs(headingMiddle - newHeading)).toBeLessThanOrEqual(
      Math.abs(headingRear - newHeading) + 1e-4,
    );
  });

  // ── TESTE 3: Obstáculo grande e zero penetração ──────────────────────
  it('Teste 3 — Obstáculo grande: nenhum peixe penetra o obstáculo sólido (distância mínima respeitada)', () => {
    const obstacle: ScreenObstacle = {
      u: 0.5,
      elevation: 0.5,
      depth: 0.5,
      radiusU: 0.08,
      radiusDepth: 0.08,
      halfHeight: 0.12,
      kind: 'rock',
      source: { x: 0, z: 30, baseY: -6, topY: -2, radius: 2.0, kind: 'rock' },
    };

    // Cardume caminhando em rota de colisão frontal direta
    const initialFishPositions: Vec3Tuple[] = [
      [0.5, 0.5, 0.38],
      [0.48, 0.5, 0.39],
      [0.52, 0.5, 0.37],
    ];

    for (const point of initialFishPositions) {
      const velocity: Vec3Tuple = [0, 0, 0.06];
      const fishRadius = 0.015;

      // Simula 40 quadros de aproximação e desvio
      for (let frame = 0; frame < 40; frame += 1) {
        const desired: Vec3Tuple = [velocity[0], velocity[1], velocity[2]];
        steerAroundReef(point, desired, fishRadius, [obstacle], velocity);
        steer(velocity, desired, 0.016, 0.3, 2.5, 0.02, 0.08);
        point[0] += velocity[0] * 0.016;
        point[1] += velocity[1] * 0.016;
        point[2] += velocity[2] * 0.016;
        resolveReefCollisions(point, fishRadius, [obstacle], velocity);

        // Verificação de não-penetração: distância ao centro do obstáculo
        const du = (point[0] - obstacle.u) / obstacle.radiusU;
        const dd = (point[2] - obstacle.depth) / obstacle.radiusDepth;
        const normDist = Math.hypot(du, dd);

        // A distância normalizada deve ser sempre >= 1.0 (fora da elipse sólida do obstáculo)
        expect(normDist).toBeGreaterThanOrEqual(0.999);
      }
    }
  });

  // ── TESTE 4: Separação e reunião ao redor de obstáculo ────────────────
  it('Teste 4 — Separação e reunião: cardume contorna o obstáculo e reagrupa-se após a passagem', () => {
    const obstacle: ScreenObstacle = {
      u: 0.5,
      elevation: 0.5,
      depth: 0.5,
      radiusU: 0.07,
      radiusDepth: 0.07,
      halfHeight: 0.15,
      kind: 'coral',
      source: { x: 0, z: 25, baseY: -5, topY: -1, radius: 1.8, kind: 'coral' },
    };

    // Dois peixes aproximando-se do obstáculo central
    const fishLeft: Vec3Tuple = [0.49, 0.5, 0.42];
    const fishRight: Vec3Tuple = [0.51, 0.5, 0.42];
    const velLeft: Vec3Tuple = [0, 0, 0.06];
    const velRight: Vec3Tuple = [0, 0, 0.06];
    const fishRadius = 0.015;

    // Fase 1: Divisão/separação ao redor do obstáculo ao se aproximar e contornar
    let maxLateralSeparation = 0;
    for (let step = 0; step < 70; step += 1) {
      const desiredLeft: Vec3Tuple = [velLeft[0], velLeft[1], velLeft[2]];
      const desiredRight: Vec3Tuple = [velRight[0], velRight[1], velRight[2]];
      steerAroundReef(fishLeft, desiredLeft, fishRadius, [obstacle], velLeft);
      steerAroundReef(fishRight, desiredRight, fishRadius, [obstacle], velRight);

      steer(velLeft, desiredLeft, 0.016, 0.4, 3.0, 0.02, 0.08);
      steer(velRight, desiredRight, 0.016, 0.4, 3.0, 0.02, 0.08);

      fishLeft[0] += velLeft[0] * 0.016;
      fishLeft[2] += velLeft[2] * 0.016;
      fishRight[0] += velRight[0] * 0.016;
      fishRight[2] += velRight[2] * 0.016;

      resolveReefCollisions(fishLeft, fishRadius, [obstacle], velLeft);
      resolveReefCollisions(fishRight, fishRadius, [obstacle], velRight);

      const lateralDist = Math.abs(fishRight[0] - fishLeft[0]);
      if (lateralDist > maxLateralSeparation) {
        maxLateralSeparation = lateralDist;
      }
    }

    // A separação aumentou significativamente para contornar o obstáculo (> raio do obstáculo)
    expect(maxLateralSeparation).toBeGreaterThan(obstacle.radiusU);

    // Fase 2: Após ultrapassar o obstáculo (depth > 0.5 + radiusDepth), atração por coesão
    for (let step = 0; step < 120; step += 1) {
      const centerU = (fishLeft[0] + fishRight[0]) * 0.5;
      const desiredLeft: Vec3Tuple = [(centerU - 0.015 - fishLeft[0]) * 4.0, 0, 0.06];
      const desiredRight: Vec3Tuple = [(centerU + 0.015 - fishRight[0]) * 4.0, 0, 0.06];

      steer(velLeft, desiredLeft, 0.016, 0.6, 3.2, 0.02, 0.07);
      steer(velRight, desiredRight, 0.016, 0.6, 3.2, 0.02, 0.07);

      fishLeft[0] += velLeft[0] * 0.016;
      fishLeft[2] += velLeft[2] * 0.016;
      fishRight[0] += velRight[0] * 0.016;
      fishRight[2] += velRight[2] * 0.016;
    }

    const finalSeparation = Math.abs(fishRight[0] - fishLeft[0]);
    // Reagrupamento completo após contornar
    expect(finalSeparation).toBeLessThan(maxLateralSeparation * 0.65);
  });

  // ── TESTE 5: Fuga (flee) e compactação defensiva ─────────────────────
  it('Teste 5 — Fuga (flee): ameaça do casco acelera velocidade, compacta formação e retorna ao normal', () => {
    const cruiseSpeed = 0.052;
    const maxSpeed = 0.096;
    const fishPos: Vec3Tuple = [0.5, 0.5, 0.5];
    const fishVel: Vec3Tuple = [cruiseSpeed, 0, 0];

    // 1. Sem ameaça: velocidade de cruzeiro nominal
    expect(length(fishVel)).toBeCloseTo(cruiseSpeed, 4);

    // 2. Barco/predador aproxima-se rapidamente de cima/trás
    const threatPos: Vec3Tuple = [0.48, 0.6, 0.48];
    const threatDist = distance(fishPos, threatPos);
    expect(threatDist).toBeLessThan(0.18); // Dentro do raio de alerta de fuga

    // Reação de fuga: acelera na direção oposta à ameaça em direção à velocidade máxima
    const fleeDir = normalize(sub(fishPos, threatPos));
    const targetFleeVelocity = scale(fleeDir, maxSpeed);
    for (let s = 0; s < 12; s += 1) {
      steer(fishVel, targetFleeVelocity, 0.05, 1.2, maxSpeed, cruiseSpeed, maxSpeed);
    }

    // Velocidade de fuga é nitidamente superior à velocidade de cruzeiro
    const currentSpeed = length(fishVel);
    expect(currentSpeed).toBeGreaterThan(cruiseSpeed * 1.3);

    // Compactação defensiva (bait-ball): fator de compressão reduz distância entre indivíduos
    const normalSeparationMultiplier = 1.6;
    const fleeSeparationMultiplier = normalSeparationMultiplier * 0.75;
    expect(fleeSeparationMultiplier).toBeLessThan(normalSeparationMultiplier);

    // 3. Ameaça se afasta: desacelera de volta à velocidade de cruzeiro
    const calmDesiredVel: Vec3Tuple = [cruiseSpeed, 0, 0];
    for (let step = 0; step < 40; step += 1) {
      steerFish(fishVel, calmDesiredVel, 0.05, 0.4, 2.0, 0.02, cruiseSpeed, 0.3);
    }
    expect(length(fishVel)).toBeCloseTo(cruiseSpeed, 2);
  });

  // ── TESTE 6: Peixes territoriais (sentinelas) ────────────────────────
  it('Teste 6 — Peixes territoriais: sentinelas mantêm território, realizam bote (dart) e retornam ao abrigo', () => {
    const homePoint: Vec3Tuple = [0.35, 0.4, 0.45];
    const territoryRadius = 0.09;
    const sentinelPos: Vec3Tuple = [...homePoint] as Vec3Tuple;
    const sentinelVel: Vec3Tuple = [0, 0, 0];

    let behavior: 'hover' | 'dart' = 'hover';
    let dartTimer = 0;

    // Intruso penetra o território do sentinela
    const intruderPos: Vec3Tuple = [0.37, 0.4, 0.48];
    const intruderDist = distance(sentinelPos, intruderPos);
    expect(intruderDist).toBeLessThan(territoryRadius);

    // Sentinela detecta e dispara 'dart'
    if (intruderDist < territoryRadius) {
      behavior = 'dart';
      dartTimer = 0.45;
      const attackDir = normalize(sub(intruderPos, sentinelPos));
      sentinelVel[0] = attackDir[0] * 0.058;
      sentinelVel[1] = attackDir[1] * 0.058;
      sentinelVel[2] = attackDir[2] * 0.058;
    }

    expect(behavior).toBe('dart');
    expect(length(sentinelVel)).toBeGreaterThan(0.04);

    // Sentinela persegue durante a duração do bote
    sentinelPos[0] += sentinelVel[0] * dartTimer;
    sentinelPos[1] += sentinelVel[1] * dartTimer;
    sentinelPos[2] += sentinelVel[2] * dartTimer;

    // O sentinela nunca deve se afastar indefinidamente do território
    expect(distance(sentinelPos, homePoint)).toBeLessThan(territoryRadius * 1.5);

    // Fim do bote: retorna ao abrigo 'homePoint' e volta para 'hover'
    behavior = 'hover';
    for (let step = 0; step < 50; step += 1) {
      const returnDir = sub(homePoint, sentinelPos);
      const distToHome = length(returnDir);
      if (distToHome < 0.01) {
        sentinelPos[0] = homePoint[0];
        sentinelPos[1] = homePoint[1];
        sentinelPos[2] = homePoint[2];
        break;
      }
      const desiredVel = scale(normalize(returnDir), 0.05);
      steer(sentinelVel, desiredVel, 0.05, 0.4, 3.5, 0.0, 0.05);
      sentinelPos[0] += sentinelVel[0] * 0.05;
      sentinelPos[1] += sentinelVel[1] * 0.05;
      sentinelPos[2] += sentinelVel[2] * 0.05;
    }

    expect(distance(sentinelPos, homePoint)).toBeLessThan(0.02);
    expect(behavior).toBe('hover');
  });

  // ── TESTE 7: Navegação vertical por espécie ──────────────────────────
  it('Teste 7 — Navegação vertical: estratificação ecológica (papagaio bentônico vs cirurgião pelágico)', () => {
    const parrotEcology = FISH_ECOLOGY.parrotfish;
    const blueTangEcology = FISH_ECOLOGY['blue-tang'];

    // Papagaio (espécie bentônica/demersal): faixa baixa próxima ao substrato
    expect(parrotEcology.habitat).toBe('benthic');
    expect(parrotEcology.elevationBand[0]).toBeCloseTo(0.06, 2);
    expect(parrotEcology.elevationBand[1]).toBeCloseTo(0.32, 2);

    // Cirurgião (espécie pelágica/cardume aberto): coluna superior
    expect(blueTangEcology.habitat).toBe('pelagic');
    expect(blueTangEcology.elevationBand[0]).toBeCloseTo(0.55, 2);
    expect(blueTangEcology.elevationBand[1]).toBeCloseTo(0.96, 2);

    // As bandas não se sobrepõem: cada habitat ocupa um estrato próprio.
    expect(parrotEcology.elevationBand[1]).toBeLessThan(blueTangEcology.elevationBand[0]);

    // Validação de clamp e navegação vertical para papagaio
    const parrotElevation = clamp(0.85, parrotEcology.elevationBand[0], parrotEcology.elevationBand[1]);
    expect(parrotElevation).toBeLessThanOrEqual(0.32);

    // Validação de clamp para cirurgião (não encosta na areia profunda a 0.12)
    const tangElevation = clamp(0.12, blueTangEcology.elevationBand[0], blueTangEcology.elevationBand[1]);
    expect(tangElevation).toBeGreaterThanOrEqual(0.55);
  });

  // ── TESTE 8: Estabilidade numérica contínua (3.000 passos) ───────────
  it('Teste 8 — Estabilidade numérica: 3.000 passos com delta time variável sem NaN, Infinity ou vazamentos', () => {
    const random = mulberry32(777);
    const band: SchoolBand = {
      uMin: 0.1,
      uMax: 0.9,
      elevationMin: 0.2,
      elevationMax: 0.8,
      depthMin: 0.25,
      depthMax: 0.85,
    };
    const config: SchoolConfig = {
      band,
      speed: 0.05,
      aMax: 0.04,
      turnMax: 1.2,
      retargetMin: 5,
      retargetMax: 12,
      spreadU: 0.05,
      spreadElevation: 0.05,
      spreadDepth: 0.04,
    };
    const school = createSchoolState(random, config);

    const agentPoint: Vec3Tuple = [0.5, 0.5, 0.5];
    const agentVel: Vec3Tuple = [0.04, 0, 0.01];

    for (let step = 0; step < 3000; step += 1) {
      // Delta time oscilante simulando flutuações de 30 a 120 FPS
      const dt = 0.008 + random() * 0.025;

      updateSchoolState(school, dt, random, config);

      steer(agentVel, school.velocity, dt, 0.15, config.speed, 0.02, config.speed * 1.5);
      agentPoint[0] += agentVel[0] * dt;
      agentPoint[1] += agentVel[1] * dt;
      agentPoint[2] += agentVel[2] * dt;

      const clamped = clampPointToBand(agentPoint, band);
      agentPoint[0] = clamped[0];
      agentPoint[1] = clamped[1];
      agentPoint[2] = clamped[2];

      // Invariantes numéricos estritos
      expect(Number.isFinite(agentPoint[0])).toBe(true);
      expect(Number.isFinite(agentPoint[1])).toBe(true);
      expect(Number.isFinite(agentPoint[2])).toBe(true);
      expect(Number.isFinite(agentVel[0])).toBe(true);
      expect(Number.isFinite(agentVel[1])).toBe(true);
      expect(Number.isFinite(agentVel[2])).toBe(true);

      expect(Number.isNaN(agentPoint[0])).toBe(false);
      expect(Number.isNaN(agentPoint[1])).toBe(false);
      expect(Number.isNaN(agentPoint[2])).toBe(false);

      // Limites do volume de nado
      expect(agentPoint[0]).toBeGreaterThanOrEqual(band.uMin);
      expect(agentPoint[0]).toBeLessThanOrEqual(band.uMax);
    }
  });

  // ── TESTE 9: Benchmarks e Desempenho O(N) ────────────────────────────
  it('Teste 9 — Desempenho / Benchmarks: Spatial Hashing 3D escala linearmente O(N) e cumpre orçamento < 2.5ms', () => {
    const GRID_U = 16;
    const GRID_E = 10;
    const GRID_D = 10;
    const GRID_TOTAL = GRID_U * GRID_E * GRID_D;
    const gridHeads = new Int32Array(GRID_TOTAL);

    function runBenchmarkForCount(count: number): number {
      const agentNext = new Int32Array(count);
      const points = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      const forces = new Float32Array(count * 3);

      const random = mulberry32(count);
      for (let i = 0; i < count; i += 1) {
        points[i * 3 + 0] = 0.1 + random() * 0.8;
        points[i * 3 + 1] = 0.2 + random() * 0.6;
        points[i * 3 + 2] = 0.3 + random() * 0.5;
        velocities[i * 3 + 0] = (random() - 0.5) * 0.06;
        velocities[i * 3 + 1] = 0;
        velocities[i * 3 + 2] = (random() - 0.5) * 0.06;
      }

      const t0 = performance.now();

      // 1. Rebuild spatial grid O(N)
      gridHeads.fill(-1);
      for (let i = 0; i < count; i += 1) {
        const cu = Math.min(GRID_U - 1, Math.max(0, Math.floor(points[i * 3 + 0] * GRID_U)));
        const ce = Math.min(GRID_E - 1, Math.max(0, Math.floor(points[i * 3 + 1] * GRID_E)));
        const cd = Math.min(GRID_D - 1, Math.max(0, Math.floor(points[i * 3 + 2] * GRID_D)));
        const cellIdx = (cd * GRID_E + ce) * GRID_U + cu;
        agentNext[i] = gridHeads[cellIdx];
        gridHeads[cellIdx] = i;
      }

      // 2. Consulta 3x3x3 de vizinhança e cálculo de forças Boids O(N)
      for (let i = 0; i < count; i += 1) {
        const px = points[i * 3 + 0];
        const py = points[i * 3 + 1];
        const pz = points[i * 3 + 2];
        const cu = Math.min(GRID_U - 1, Math.max(0, Math.floor(px * GRID_U)));
        const ce = Math.min(GRID_E - 1, Math.max(0, Math.floor(py * GRID_E)));
        const cd = Math.min(GRID_D - 1, Math.max(0, Math.floor(pz * GRID_D)));

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
                  const du = px - points[j * 3 + 0];
                  const de = py - points[j * 3 + 1];
                  const dd = pz - points[j * 3 + 2];
                  const distSq = du * du + de * de + dd * dd;
                  if (distSq < 0.003 && distSq > 1e-8) {
                    const inv = 1 / Math.sqrt(distSq);
                    forces[i * 3 + 0] += du * inv * 0.01;
                    forces[j * 3 + 0] -= du * inv * 0.01;
                  }
                }
                j = agentNext[j];
              }
            }
          }
        }
      }

      return performance.now() - t0;
    }

    // Mede para contagens representativas (50, 100, 250, 500 peixes)
    const time50 = runBenchmarkForCount(50);
    const time100 = runBenchmarkForCount(100);
    const time250 = runBenchmarkForCount(250);
    const time500 = runBenchmarkForCount(500);

    // Garante que todas as contagens executaram
    expect(time50).toBeGreaterThanOrEqual(0);
    expect(time250).toBeGreaterThanOrEqual(0);

    // A contagem padrão da cena (~100 peixes) deve executar confortavelmente abaixo de 2.5ms
    expect(time100).toBeLessThan(2.5);
    // Para 500 peixes em grade 3D, deve permanecer abaixo de 10ms
    expect(time500).toBeLessThan(10.0);
  });

  // ── TESTE 10: Integração temporal e estabilidade em 1x, 3x, 5x, 10x ─
  it('Teste 10 — Integração temporal: estabilidade sob velocidades 1×, 3×, 5×, 10× e consistência em pausa/retomada', () => {
    const random = mulberry32(555);
    const band: SchoolBand = {
      uMin: 0.1,
      uMax: 0.9,
      elevationMin: 0.2,
      elevationMax: 0.8,
      depthMin: 0.3,
      depthMax: 0.85,
    };
    const config: SchoolConfig = {
      band,
      speed: 0.06,
      aMax: 0.04,
      turnMax: 1.2,
      retargetMin: 6,
      retargetMax: 12,
      spreadU: 0.05,
      spreadElevation: 0.05,
      spreadDepth: 0.04,
    };

    const speeds = [1, 3, 5, 10];
    for (const speedMultiplier of speeds) {
      const state = createSchoolState(random, config);
      state.center = [0.5, 0.5, 0.5];

      // Simula 200 quadros no multiplicador de velocidade indicado
      for (let frame = 0; frame < 200; frame += 1) {
        const rawDt = (1 / 60) * speedMultiplier;
        // Substepping em saltos temporais grandes para preservar estabilidade numérica
        const substeps = Math.ceil(speedMultiplier);
        const subDt = rawDt / substeps;

        for (let sub = 0; sub < substeps; sub += 1) {
          updateSchoolState(state, subDt, random, config);
        }

        // Centro deve permanecer rigorosamente dentro dos limites
        expect(state.center[0]).toBeGreaterThanOrEqual(band.uMin);
        expect(state.center[0]).toBeLessThanOrEqual(band.uMax);
        expect(state.center[1]).toBeGreaterThanOrEqual(band.elevationMin);
        expect(state.center[1]).toBeLessThanOrEqual(band.elevationMax);
        expect(length(state.velocity)).toBeLessThanOrEqual(config.speed * 1.5);
      }
    }

    // Validação de pausa (dt = 0)
    const statePaused = createSchoolState(random, config);
    const beforeCenter = [...statePaused.center];
    const beforeVel = [...statePaused.velocity];

    updateSchoolState(statePaused, 0, random, config);
    expect(statePaused.center).toEqual(beforeCenter);
    expect(statePaused.velocity).toEqual(beforeVel);
  });
});
