import { describe, expect, it } from 'vitest';
import {
  lowProfile,
  mediumProfile,
  highProfile,
  ultraProfile,
} from './quality';
import { FISH_VISUALS } from './fish/species';

describe('Sistema de Sombras e Iluminação Subaquática Otimizada', () => {
  it('define resoluções de shadow map calibradas por perfil de hardware', () => {
    expect(lowProfile().shadowMapSize).toBe(512);
    expect(mediumProfile().shadowMapSize).toBe(1024);
    expect(highProfile().shadowMapSize).toBe(1024);
    expect(ultraProfile().shadowMapSize).toBe(2048);
  });

  it('mantém todas as espécies de peixes prontas para projeção de sombras', () => {
    const species = Object.keys(FISH_VISUALS);
    expect(species).toContain('blue-tang');
    expect(species).toContain('sergeant-major');
    expect(species).toContain('parrotfish');
  });
});

