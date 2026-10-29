import { describe, expect, it } from 'vitest';
import { computeBackdropFitting, REFERENCE_ASPECT } from './babylon/runtime';

function assertNoEdgeStretching(aspect: number) {
  const fitting = computeBackdropFitting(aspect);
  const eps = 1e-9;

  // Garante enquadramento "cover" puro: coordenadas UV jamais extrapolam [0, 1],
  // eliminando qualquer estiramento (clamping) nas bordas laterais, superior ou inferior.
  expect(fitting.uScale).toBeGreaterThan(0);
  expect(fitting.uScale).toBeLessThanOrEqual(1 + eps);
  expect(fitting.uOffset).toBeGreaterThanOrEqual(-eps);
  expect(fitting.uOffset + fitting.uScale).toBeLessThanOrEqual(1 + eps);

  expect(fitting.vScale).toBeGreaterThan(0);
  expect(fitting.vScale).toBeLessThanOrEqual(1 + eps);
  expect(fitting.vOffset).toBeGreaterThanOrEqual(-eps);
  expect(fitting.vOffset + fitting.vScale).toBeLessThanOrEqual(1 + eps);

  return fitting;
}

describe('Enquadramento responsivo sem bordas esticadas (BackdropFitting cover)', () => {
  describe('Telas Desktop e Widescreen (aspect >= REFERENCE_ASPECT)', () => {
    it('preenche 100% da largura sem esticar as bordas laterais em monitores largos (~2.18)', () => {
      const aspect = 2.18;
      const fitting = assertNoEdgeStretching(aspect);

      expect(fitting.uScale).toBe(1.0);
      expect(fitting.uOffset).toBe(0.0);
      expect(fitting.vScale).toBeCloseTo(REFERENCE_ASPECT / aspect, 6);

      // As bordas esquerda (u=0) e direita (u=1) da arte coincidem exatamente com as bordas da tela
      expect(fitting.artToScreen(0.0, 0.5).screenX).toBe(0.0);
      expect(fitting.artToScreen(1.0, 0.5).screenX).toBe(1.0);

      // Consistência inversa exata entre artToScreen e texV WebGL no topo (screenY=0) e base (screenY=1)
      const topArtV = 1 - (fitting.vOffset + fitting.vScale);
      const bottomArtV = 1 - fitting.vOffset;
      expect(fitting.artToScreen(0.5, topArtV).screenY).toBeCloseTo(0.0, 6);
      expect(fitting.artToScreen(0.5, bottomArtV).screenY).toBeCloseTo(1.0, 6);
    });

    it('casamento exato 1:1 na proporção de referência 1672:941', () => {
      const fitting = assertNoEdgeStretching(REFERENCE_ASPECT);
      expect(fitting.uScale).toBe(1.0);
      expect(fitting.uOffset).toBe(0.0);
      expect(fitting.vScale).toBe(1.0);
      expect(fitting.vOffset).toBe(0.0);
      expect(fitting.meshScaleX).toBe(1.0);
      expect(fitting.meshScaleY).toBe(1.0);

      const center = fitting.artToScreen(0.5, 0.5);
      expect(center.screenX).toBe(0.5);
      expect(center.screenY).toBe(0.5);
    });
  });

  describe('Telas 16:10, Projetores 4:3, Tablets e Celulares (aspect < REFERENCE_ASPECT)', () => {
    it('preenche 100% da altura sem esticar topo, base ou laterais em proporções intermediárias (1.32)', () => {
      const fitting = assertNoEdgeStretching(1.32);
      expect(fitting.vScale).toBe(1.0);
      expect(fitting.vOffset).toBe(0.0);
      expect(fitting.artToScreen(0.5, 0.0).screenY).toBe(0.0);
      expect(fitting.artToScreen(0.5, 1.0).screenY).toBe(1.0);
      expect(fitting.artToScreen(0.5, 0.5).screenX).toBeCloseTo(0.5, 6);
    });

    it('enquadra sem estiramento vertical no céu ou na areia em celulares portrait (0.93 e 0.52)', () => {
      for (const aspect of [0.93, 0.52]) {
        const fitting = assertNoEdgeStretching(aspect);
        expect(fitting.vScale).toBe(1.0);
        expect(fitting.vOffset).toBe(0.0);

        const center = fitting.artToScreen(0.5, 0.5);
        expect(center.screenX).toBeCloseTo(0.5, 6);
        expect(center.screenY).toBe(0.5);
      }
    });
  });
});
