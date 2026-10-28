/**
 * Perfis de qualidade gráfica e adaptação de dispositivo para o Kirimurê.
 *
 * Permite que a cena 3D funcione com fluidez em dispositivos móveis,
 * notebooks escolares e estações de trabalho de alto desempenho,
 * adequando o número de instâncias de malhas esqueléticas, partículas e resoluções.
 */

export type SceneQualityLevel = 'low' | 'medium' | 'high';

export interface SceneQualityProfile {
  level: SceneQualityLevel;
  /** Número máximo de instâncias de peixes 3D com esqueleto/rigging (pale-bleak). */
  maxRiggedFishes: number;
  /** Teto de partículas de microplásticos simuladas individualmente. */
  maxMicroplastics: number;
  /** Teto de bolhas de aeração ativas. */
  maxBubbles: number;
  /** Resolução vertical da textura de branqueamento dos corais. */
  coralTextureHeight: number;
  coralTextureWidth: number;
}

export function detectSceneQualityProfile(): SceneQualityProfile {
  if (typeof window === 'undefined') {
    return {
      level: 'high',
      maxRiggedFishes: 10,
      maxMicroplastics: 195,
      maxBubbles: 82,
      coralTextureWidth: 1024,
      coralTextureHeight: 576,
    };
  }

  const width = window.innerWidth;
  const isMobile =
    width < 768 ||
    (typeof navigator !== 'undefined' &&
      /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  const concurrency =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;

  if (isMobile && width < 640) {
    return {
      level: 'low',
      maxRiggedFishes: 4,
      maxMicroplastics: 65,
      maxBubbles: 36,
      coralTextureWidth: 512,
      coralTextureHeight: 288,
    };
  }

  if (isMobile || concurrency <= 4 || width < 1024) {
    return {
      level: 'medium',
      maxRiggedFishes: 7,
      maxMicroplastics: 115,
      maxBubbles: 56,
      coralTextureWidth: 768,
      coralTextureHeight: 432,
    };
  }

  return {
    level: 'high',
    maxRiggedFishes: 10,
    maxMicroplastics: 195,
    maxBubbles: 82,
    coralTextureWidth: 1024,
    coralTextureHeight: 576,
  };
}
