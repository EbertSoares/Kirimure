interface AlphaLayer {
  alpha: number;
}

interface FishAppearance {
  root: AlphaLayer;
  healthy: AlphaLayer;
  stressed: AlphaLayer;
  dead: AlphaLayer;
  threshold: number;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function updateFishState(fish: FishAppearance, health: number) {
  const weakStart = fish.threshold + 15;
  const stressAmount = clamp((weakStart - health) / 15);
  const deathAmount = clamp((fish.threshold - health) / 18);
  // Uma camada de base permanece opaca enquanto a próxima entra por cima.
  // Reduzir os dois alphas ao mesmo tempo deixa a água aparecer no corpo.
  fish.healthy.alpha = stressAmount < 1 ? 1 : 0;
  fish.stressed.alpha = deathAmount < 1 ? stressAmount : 0;
  fish.dead.alpha = deathAmount;
  fish.root.alpha = health <= Math.max(0, fish.threshold - 30)
    ? clamp(health / Math.max(1, fish.threshold - 30))
    : 1;
}
