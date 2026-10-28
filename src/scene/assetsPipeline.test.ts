import { describe, expect, it } from 'vitest';
import manifest from '../assets/scene/manifest.json';

describe('pipeline e manifesto de assets da cena marinha', () => {
  it('possui manifesto de integridade de assets gerado com formato válido', () => {
    expect(manifest).toHaveProperty('generatedAt');
    expect(Array.isArray(manifest.assets)).toBe(true);
    expect(manifest.assets.length).toBeGreaterThanOrEqual(10);

    const names = manifest.assets.map((a: { name: string }) => a.name);
    expect(names).toContain('reef-rocks-sand.png');
    expect(names).toContain('fish-blue-tang-healthy.png');
    expect(names).toContain('coral-brain-healthy.png');
  });

  it('todos os assets derivados descritos no manifesto possuem metadados consistentes', () => {
    for (const asset of manifest.assets) {
      expect(typeof asset.name).toBe('string');
      expect(asset.name.endsWith('.png')).toBe(true);
      expect(typeof asset.sizeBytes).toBe('number');
      expect(asset.sizeBytes).toBeGreaterThan(0);
      expect(typeof asset.modifiedAt).toBe('string');
      expect(new Date(asset.modifiedAt).getTime()).toBeGreaterThan(0);
    }
  });
});
