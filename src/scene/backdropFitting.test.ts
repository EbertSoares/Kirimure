import { describe, expect, it } from 'vitest';
import { computeBackdropFitting, REFERENCE_ASPECT } from './babylon/runtime';

describe('Enquadramento responsivo do cenário marítimo (BackdropFitting)', () => {
  describe('Telas Desktop e Widescreen (aspect >= REFERENCE_ASPECT)', () => {
    it('mantém 100% da altura da arte sem nenhum corte vertical no topo ou na base', () => {
      // 1920x1080 com painel lateral (~2.18)
      const aspect = 2.18;
      const fitting = computeBackdropFitting(aspect);

      expect(fitting.vScale).toBe(1.0);
      expect(fitting.vOffset).toBe(0.0);
      expect(fitting.meshScaleY).toBe(1.0);

      // Topo do artwork (nuvens, céu e barco em v=0) deve ficar perfeitamente no topo da tela (screenY=0)
      const topEdge = fitting.artToScreen(0.5, 0.0);
      expect(topEdge.screenY).toBe(0.0);

      // Base do artwork (leito de areia e corais de fundo em v=1) deve ficar perfeitamente na base da tela (screenY=1)
      const bottomEdge = fitting.artToScreen(0.5, 1.0);
      expect(bottomEdge.screenY).toBe(1.0);

      // As extremidades do artwork 16:9 (esquerda em u=0 e direita em u=1) devem ficar centralizadas dentro da tela
      const leftEdge = fitting.artToScreen(0.0, 0.5);
      const rightEdge = fitting.artToScreen(1.0, 0.5);
      expect(leftEdge.screenX).toBeGreaterThan(0.0);
      expect(rightEdge.screenX).toBeLessThan(1.0);
      expect(leftEdge.screenX).toBeCloseTo(1 - rightEdge.screenX, 5);
    });

    it('casamento exato 1:1 na proporção de referência 1672:941', () => {
      const fitting = computeBackdropFitting(REFERENCE_ASPECT);
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

  describe('Telas Celular e Portrait (aspect < REFERENCE_ASPECT)', () => {
    it('mantém 100% da largura da arte sem nenhum corte horizontal nas colônias de corais', () => {
      // Celular em modo retrato (~0.93)
      const aspect = 0.93;
      const fitting = computeBackdropFitting(aspect);

      expect(fitting.uScale).toBe(1.0);
      expect(fitting.uOffset).toBe(0.0);

      // Extrema esquerda (corais ramificados da esquerda em u=0) deve tocar a borda esquerda da tela (screenX=0)
      const leftEdge = fitting.artToScreen(0.0, 0.5);
      expect(leftEdge.screenX).toBe(0.0);

      // Extrema direita (corais roxos da direita em u=1) deve tocar a borda direita da tela (screenX=1)
      const rightEdge = fitting.artToScreen(1.0, 0.5);
      expect(rightEdge.screenX).toBe(1.0);

      // O centro do ecossistema deve permanecer perfeitamente centralizado na vertical
      const center = fitting.artToScreen(0.5, 0.5);
      expect(center.screenX).toBe(0.5);
      expect(center.screenY).toBe(0.5);

      // O barco e o recife 16:9 devem ficar centralizados na vertical dentro da tela do celular
      const topArt = fitting.artToScreen(0.5, 0.0);
      const bottomArt = fitting.artToScreen(0.5, 1.0);
      expect(topArt.screenY).toBeGreaterThan(0.0);
      expect(bottomArt.screenY).toBeLessThan(1.0);
      expect(topArt.screenY).toBeCloseTo(1 - bottomArt.screenY, 5);
    });

    it('enquadra corretamente em celulares compridos / ultrawide vertical (aspect ~0.52)', () => {
      const aspect = 0.52;
      const fitting = computeBackdropFitting(aspect);

      expect(fitting.uScale).toBe(1.0);
      expect(fitting.uOffset).toBe(0.0);
      expect(fitting.vScale).toBeGreaterThan(1.0);

      const left = fitting.artToScreen(0.0, 0.5);
      const right = fitting.artToScreen(1.0, 0.5);
      expect(left.screenX).toBe(0.0);
      expect(right.screenX).toBe(1.0);
    });
  });
});
