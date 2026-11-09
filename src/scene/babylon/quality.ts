/**
 * Perfis de qualidade do diorama 3D do Kirimurê.
 *
 * Inclui o perfil `ultra` ("EXPERIMENTAL ULTRA — MAXIMUM FIDELITY") como padrão
 * em desktops para priorizar qualidade visual e física máxima (síntese espectral
 * FFT multicascata, malha oceânica adaptativa de alta densidade com ondas 100%
 * arredondadas, óptica Beer-Lambert + GGX e solver hidrodinâmico 6-DOF).
 */

import type { FishSpeciesId } from '../../simulation/types';

export type SceneQualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface SceneQualityProfile {
  level: SceneQualityLevel;
  label: string;
  /** População visual por espécie (sardinha/xira/cioba ficam para o futuro). */
  fishPopulation: Record<FishSpeciesId, number>;
  maxMicroplastics: number;
  maxBubbles: number;
  maxOilSlicks: number;
  maxSewagePlumes: number;
  maxMarineSnow: number;
  /** Divisões do plano d'água em X e Z (alta densidade para eliminar facetas triangulares). */
  waterSegmentsX: number;
  waterSegmentsZ: number;
  /** Resolução por cascata da FFT espectral (N x N). */
  fftSize: number;
  /** Número de cascatas espectrais incomensuráveis. */
  fftCascades: number;
  /** Substeps físicos por quadro para o solver 6-DOF de Arquimedes. */
  physicsSubsteps: number;
  /** Lado das RTTs de reflexão/refração do WaterMaterial. */
  waterRenderTargetSize: number;
  hdr: boolean;
  bloom: boolean;
  fxaa: boolean;
  glow: boolean;
  /** Nível de hardware scaling do Babylon (1 = resolução nativa). */
  hardwareScaling: number;
  /** Frequência de atualização de cores de coral e cáusticas (Hz). */
  slowUpdateHz: number;
}

export function detectSceneQualityProfile(): SceneQualityProfile {
  if (typeof window === 'undefined') {
    return ultraProfile();
  }

  const width = window.innerWidth;
  const isMobile =
    width < 768 ||
    (typeof navigator !== 'undefined' &&
      (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
        (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)));
  const concurrency =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 8;
  const memory =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
      : 8;

  if (isMobile && width < 640) {
    return {
      ...lowProfile(),
      hardwareScaling: 1.1,
    };
  }

  if (isMobile) {
    return mediumProfile();
  }

  if (concurrency <= 4 && memory <= 4 && width < 1024) {
    return highProfile();
  }

  return ultraProfile();
}

export function ultraProfile(): SceneQualityProfile {
  return {
    level: 'ultra',
    label: 'EXPERIMENTAL ULTRA — MAXIMUM FIDELITY',
    fishPopulation: { 'blue-tang': 54, 'sergeant-major': 88, parrotfish: 18 },
    maxMicroplastics: 220,
    maxBubbles: 96,
    maxOilSlicks: 12,
    maxSewagePlumes: 8,
    maxMarineSnow: 140,
    waterSegmentsX: 224,
    waterSegmentsZ: 160,
    fftSize: 64,
    fftCascades: 3,
    physicsSubsteps: 6,
    waterRenderTargetSize: 1024,
    hdr: true,
    bloom: true,
    fxaa: true,
    glow: true,
    hardwareScaling: 1,
    slowUpdateHz: 6,
  };
}

export function highProfile(): SceneQualityProfile {
  return {
    level: 'high',
    label: 'HIGH FIDELITY',
    fishPopulation: { 'blue-tang': 45, 'sergeant-major': 76, parrotfish: 15 },
    maxMicroplastics: 195,
    maxBubbles: 82,
    maxOilSlicks: 11,
    maxSewagePlumes: 7,
    maxMarineSnow: 120,
    waterSegmentsX: 176,
    waterSegmentsZ: 128,
    fftSize: 64,
    fftCascades: 3,
    physicsSubsteps: 4,
    waterRenderTargetSize: 512,
    hdr: true,
    bloom: true,
    fxaa: true,
    glow: true,
    hardwareScaling: 1,
    slowUpdateHz: 4,
  };
}

export function mediumProfile(): SceneQualityProfile {
  return {
    level: 'medium',
    label: 'MEDIUM',
    fishPopulation: { 'blue-tang': 36, 'sergeant-major': 56, parrotfish: 12 },
    maxMicroplastics: 115,
    maxBubbles: 56,
    maxOilSlicks: 7,
    maxSewagePlumes: 5,
    maxMarineSnow: 72,
    waterSegmentsX: 128,
    waterSegmentsZ: 96,
    fftSize: 64,
    fftCascades: 3,
    physicsSubsteps: 4,
    waterRenderTargetSize: 256,
    hdr: true,
    bloom: true,
    fxaa: true,
    glow: false,
    hardwareScaling: 1.05,
    slowUpdateHz: 3,
  };
}

export function lowProfile(): SceneQualityProfile {
  return {
    level: 'low',
    label: 'LOW',
    fishPopulation: { 'blue-tang': 24, 'sergeant-major': 40, parrotfish: 9 },
    maxMicroplastics: 64,
    maxBubbles: 32,
    maxOilSlicks: 4,
    maxSewagePlumes: 3,
    maxMarineSnow: 36,
    waterSegmentsX: 96,
    waterSegmentsZ: 72,
    fftSize: 32,
    fftCascades: 2,
    physicsSubsteps: 3,
    waterRenderTargetSize: 128,
    hdr: true,
    bloom: false,
    fxaa: true,
    glow: false,
    hardwareScaling: 1.15,
    slowUpdateHz: 2.5,
  };
}
