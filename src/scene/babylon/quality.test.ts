import { describe, expect, it } from 'vitest';
import { lowProfile, mediumProfile, mobileProfile } from './quality';

describe('Perfil visual do diorama no celular', () => {
  it('amplia os peixes e reduz a densidade do recife em telas pequenas', () => {
    const compact = mobileProfile('low');
    const balanced = mobileProfile('medium');

    for (const profile of [compact, balanced]) {
      expect(profile.fishScale).toBeGreaterThan(1);
      expect(profile.reefDensity).toBeLessThan(1);
      expect(profile.reefGardenLayout).toBe(true);
    }

    expect(compact.fishScale).toBeGreaterThan(balanced.fishScale);
    expect(compact.reefDensity).toBeLessThan(balanced.reefDensity);
  });

  it('mantém a composição natural completa no desktop', () => {
    for (const profile of [lowProfile(), mediumProfile()]) {
      expect(profile.fishScale).toBe(1);
      expect(profile.reefDensity).toBe(1);
      expect(profile.reefGardenLayout).toBe(false);
    }
  });

  it('preserva a população de peixes ao ampliar a escala visual', () => {
    expect(mobileProfile('low').fishPopulation).toEqual(lowProfile().fishPopulation);
    expect(mobileProfile('medium').fishPopulation).toEqual(mediumProfile().fishPopulation);
  });
});
