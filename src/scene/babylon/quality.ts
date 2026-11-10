/**
 * Perfis de qualidade do diorama 3D do Kirimurê.
 *
 * O objetivo é rodar o mais leve possível em QUALQUER dispositivo — de um
 * celular de entrada a um desktop com GPU dedicada — sem degradar a leitura
 * visual: a superfície oceânica continua espectral, as ondas continuam
 * arredondadas e a óptica continua física. O que muda entre perfis é a
 * densidade de amostragem (malha, FFT, RTTs, física), nunca a linguagem visual.
 */

import type { FishSpeciesId } from '../../simulation/types';

type SceneQualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface SceneQualityProfile {
  level: SceneQualityLevel;
  label: string;
  /** População visual por espécie (sardinha/xira/cioba ficam para o futuro). */
  fishPopulation: Record<FishSpeciesId, number>;
  /** Multiplicador visual do comprimento dos peixes (1 = escala real do diorama). */
  fishScale: number;
  /** Fração de rochas, corais e seixos mantida no layout (1 = composição completa). */
  reefDensity: number;
  /** Organiza o recife em faixas laterais simétricas, com menos variação aleatória. */
  reefGardenLayout: boolean;
  maxMicroplastics: number;
  maxBubbles: number;
  maxOilSlicks: number;
  maxSewagePlumes: number;
  maxMarineSnow: number;
  /** Divisões do plano d'água em X e Z. */
  waterSegmentsX: number;
  waterSegmentsZ: number;
  /** Resolução por cascata da FFT espectral (N x N, potência de dois). */
  fftSize: number;
  /** Número de cascatas espectrais incomensuráveis. */
  fftCascades: number;
  /** Taxa de integração física do solver 6-DOF (Hz). */
  physicsHz: number;
  /** Lado das RTTs de reflexão/refração do WaterMaterial. */
  waterRenderTargetSize: number;
  hdr: boolean;
  bloom: boolean;
  fxaa: boolean;
  glow: boolean;
  /** Nível de hardware scaling do Babylon (1 = resolução nativa). */
  hardwareScaling: number;
  /** Resolução do mapa de sombras direcionais do sol (potência de dois). */
  shadowMapSize: number;
  /** Frequência de atualização de cores de coral e cáusticas (Hz). */
  slowUpdateHz: number;
}

export function detectSceneQualityProfile(): SceneQualityProfile {
  if (typeof window === 'undefined') {
    return ultraProfile();
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const coarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const mobileUa =
    typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const isMobile = (coarsePointer && (mobileUa || width < 1024)) || width < 640;
  const concurrency =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  const memory =
    typeof navigator !== 'undefined'
      ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4)
      : 4;
  const dpr = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1;

  if (isMobile) {
    // Celulares de entrada: prioriza fluidez absoluta, mas com leitura visual
    // ampliada dos peixes e um recife mais limpo e organizado.
    if (width < 600 || height < 500 || concurrency <= 4 || memory <= 3) {
      return mobileProfile('low');
    }
    return mobileProfile('medium');
  }

  // Desktop/notebook: pontuação conservadora de capacidade.
  let score = 0;
  if (concurrency >= 8) score += 2;
  else if (concurrency >= 4) score += 1;
  if (memory >= 8) score += 2;
  else if (memory >= 4) score += 1;
  if (width >= 1366) score += 2;
  else if (width >= 1024) score += 1;
  // Telas 4K/retina em GPUs integradas: reduz a carga de fillrate.
  if (dpr >= 2 && width >= 1280) score -= 1;

  if (score >= 5) return ultraProfile();
  if (score >= 3) return highProfile();
  if (score >= 1) return mediumProfile();
  return lowProfile();
}

export function ultraProfile(): SceneQualityProfile {
  return {
    level: 'ultra',
    label: 'EXPERIMENTAL ULTRA — MAXIMUM FIDELITY',
    fishPopulation: { 'blue-tang': 54, 'sergeant-major': 88, parrotfish: 18 },
    fishScale: 1,
    reefDensity: 1,
    reefGardenLayout: false,
    maxMicroplastics: 220,
    maxBubbles: 96,
    maxOilSlicks: 12,
    maxSewagePlumes: 8,
    maxMarineSnow: 140,
    waterSegmentsX: 224,
    waterSegmentsZ: 160,
    fftSize: 64,
    fftCascades: 3,
    physicsHz: 120,
    waterRenderTargetSize: 1024,
    hdr: true,
    bloom: true,
    fxaa: true,
    glow: true,
    hardwareScaling: 1,
    shadowMapSize: 2048,
    slowUpdateHz: 6,
  };
}

export function highProfile(): SceneQualityProfile {
  return {
    level: 'high',
    label: 'HIGH FIDELITY',
    fishPopulation: { 'blue-tang': 44, 'sergeant-major': 72, parrotfish: 14 },
    fishScale: 1,
    reefDensity: 1,
    reefGardenLayout: false,
    maxMicroplastics: 180,
    maxBubbles: 76,
    maxOilSlicks: 10,
    maxSewagePlumes: 6,
    maxMarineSnow: 108,
    waterSegmentsX: 176,
    waterSegmentsZ: 120,
    fftSize: 64,
    fftCascades: 3,
    physicsHz: 100,
    waterRenderTargetSize: 512,
    hdr: true,
    bloom: true,
    fxaa: true,
    glow: true,
    hardwareScaling: 1,
    shadowMapSize: 1024,
    slowUpdateHz: 4,
  };
}

export function mediumProfile(): SceneQualityProfile {
  return {
    level: 'medium',
    label: 'MEDIUM',
    fishPopulation: { 'blue-tang': 32, 'sergeant-major': 50, parrotfish: 10 },
    fishScale: 1,
    reefDensity: 1,
    reefGardenLayout: false,
    maxMicroplastics: 100,
    maxBubbles: 48,
    maxOilSlicks: 6,
    maxSewagePlumes: 4,
    maxMarineSnow: 60,
    waterSegmentsX: 128,
    waterSegmentsZ: 88,
    fftSize: 64,
    fftCascades: 3,
    physicsHz: 80,
    waterRenderTargetSize: 256,
    hdr: true,
    bloom: false,
    fxaa: true,
    glow: false,
    hardwareScaling: 1.05,
    shadowMapSize: 1024,
    slowUpdateHz: 3,
  };
}

/**
 * Perfil de celular: mantém a mesma linguagem visual do diorama, mas amplia os
 * peixes (leitura em tela pequena) e reduz a densidade do recife para abrir
 * espaço visual. O layout em faixas simétricas evita a sensação de bagunça.
 */
export function mobileProfile(level: 'low' | 'medium'): SceneQualityProfile {
  const base = level === 'low' ? lowProfile() : mediumProfile();
  const compact = level === 'low';
  return {
    ...base,
    label: compact ? 'MOBILE COMPACTO' : 'MOBILE EQUILIBRADO',
    fishScale: compact ? 1.6 : 1.45,
    reefDensity: compact ? 0.45 : 0.55,
    reefGardenLayout: true,
  };
}

export function lowProfile(): SceneQualityProfile {
  return {
    level: 'low',
    label: 'LOW',
    fishPopulation: { 'blue-tang': 20, 'sergeant-major': 32, parrotfish: 7 },
    fishScale: 1,
    reefDensity: 1,
    reefGardenLayout: false,
    maxMicroplastics: 48,
    maxBubbles: 24,
    maxOilSlicks: 3,
    maxSewagePlumes: 2,
    maxMarineSnow: 28,
    waterSegmentsX: 96,
    waterSegmentsZ: 64,
    fftSize: 32,
    fftCascades: 2,
    physicsHz: 60,
    waterRenderTargetSize: 128,
    hdr: true,
    bloom: false,
    fxaa: true,
    glow: false,
    hardwareScaling: 1.15,
    shadowMapSize: 512,
    slowUpdateHz: 2.5,
  };
}
