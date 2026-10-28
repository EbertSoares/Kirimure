import { describe, expect, it } from 'vitest';
import { updateFishState } from './fishAppearance';

function createFish(threshold = 60) {
  return {
    root: { alpha: 1 },
    healthy: { alpha: 1 },
    stressed: { alpha: 0 },
    dead: { alpha: 0 },
    threshold,
  };
}

// Opacidade de um ponto do corpo coberto pelas três artes, compostas em
// source-over. Somar os alphas não representa o resultado visto na tela.
function bodyOpacity(fish: ReturnType<typeof createFish>) {
  return fish.root.alpha * (1 - (1 - fish.healthy.alpha) * (1 - fish.stressed.alpha) * (1 - fish.dead.alpha));
}

describe('aparência dos peixes', () => {
  it('mantém o corpo opaco em toda a transição de saudável para estressado', () => {
    for (let index = 0; index < 18; index += 1) {
      const fish = createFish(5 + ((index * 37) % 91));
      for (let health = fish.threshold; health <= 100; health += 0.5) {
        updateFishState(fish, health);
        expect(bodyOpacity(fish), `peixe ${index}, saúde ${health}`).toBeCloseTo(1);
        expect(fish.dead.alpha).toBe(0);
      }
    }
  });

  it('não desaparece depois de muitos quadros com a mesma saúde', () => {
    const fish = createFish(90);
    for (let frame = 0; frame < 3600; frame += 1) {
      updateFishState(fish, 97.5);
      expect(bodyOpacity(fish)).toBeCloseTo(1);
    }
  });

  it('só desvanece após a morte e volta a ficar opaco quando a saúde se recupera', () => {
    const fish = createFish(60);
    updateFishState(fish, 15);
    expect(bodyOpacity(fish)).toBeGreaterThan(0);
    expect(bodyOpacity(fish)).toBeLessThan(1);
    updateFishState(fish, 0);
    expect(bodyOpacity(fish)).toBe(0);
    updateFishState(fish, 100);
    expect(bodyOpacity(fish)).toBe(1);
    expect(fish.dead.alpha).toBe(0);
  });

  it('mantém os alphas limitados durante o ciclo completo de mortalidade', () => {
    const fish = createFish(60);
    for (let health = 100; health >= 0; health -= 1) {
      updateFishState(fish, health);
      for (const layer of [fish.root, fish.healthy, fish.stressed, fish.dead]) {
        expect(layer.alpha).toBeGreaterThanOrEqual(0);
        expect(layer.alpha).toBeLessThanOrEqual(1);
      }
    }
  });
});
