import { describe, expect, it } from 'vitest';
import { DioramaFrame, resolveCameraProfile } from './framing';

const MOBILE_VIEWPORTS: ReadonlyArray<readonly [number, number]> = [
  [360, 640],
  [390, 844],
  [768, 1024],
  [1024, 768],
];

function seabed(): number {
  return -8.6;
}

describe('DioramaFrame', () => {
  it('escolhe perfil mobile por proporção ou ponteiro coarse', () => {
    expect(resolveCameraProfile(16 / 9).id).toBe('desktop');
    expect(resolveCameraProfile(16 / 9, true).id).toBe('mobile');
    expect(resolveCameraProfile(360 / 640).id).toBe('mobile');
    expect(resolveCameraProfile(844 / 390).id).toBe('desktop');
  });

  it('coloca o horizonte na fração configurada sem inclinar a câmera', () => {
    const desktop = new DioramaFrame(resolveCameraProfile(16 / 9), 16 / 9);
    const mobile = new DioramaFrame(resolveCameraProfile(360 / 640, true), 360 / 640);

    expect(desktop.horizonScreenY).toBeCloseTo(0.27, 5);
    expect(mobile.horizonScreenY).toBeCloseTo(0.25, 5);
    expect(desktop.shift).toBeCloseTo(1 - 2 * 0.27, 5);
    expect(mobile.shift).toBeCloseTo(1 - 2 * 0.25, 5);
  });

  it('faz ida e volta entre tela normalizada e mundo', () => {
    const frame = new DioramaFrame(resolveCameraProfile(16 / 9), 16 / 9);
    const point = frame.project(0.37, 0.62, 0.55);
    const screen = frame.projectWorld(point.x, point.y, point.z);

    expect(screen).not.toBeNull();
    expect(screen?.u).toBeCloseTo(0.37, 6);
    expect(screen?.v).toBeCloseTo(0.62, 6);
    expect(screen?.depth).toBeCloseTo(0.55, 6);
  });

  it('mantém peixes e corais dentro do quadro mobile em todas as proporções', () => {
    for (const [width, height] of MOBILE_VIEWPORTS) {
      const aspect = width / height;
      const frame = new DioramaFrame(resolveCameraProfile(aspect, true), aspect);
      const margin = frame.profile.marginX;

      for (let index = 0; index <= 20; index += 1) {
        const u = margin + (1 - margin * 2) * (index / 20);
        for (const elevation of [0, 0.18, 0.5, 0.8, 1]) {
          const point = frame.fishToWorld(u, elevation, 0.35, seabed);
          const screen = frame.projectWorld(point.x, point.y, point.z);
          expect(screen).not.toBeNull();
          expect(screen?.u).toBeGreaterThanOrEqual(0);
          expect(screen?.u).toBeLessThanOrEqual(1);
          expect(screen?.v).toBeGreaterThanOrEqual(0);
          expect(screen?.v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('reduz a largura visível no mobile para o mesmo campo de visão', () => {
    const desktop = new DioramaFrame(resolveCameraProfile(16 / 9), 16 / 9);
    const mobile = new DioramaFrame(resolveCameraProfile(360 / 640, true), 360 / 640);

    expect(mobile.halfWidthAtDepth(0.6)).toBeLessThan(desktop.halfWidthAtDepth(0.6));
    expect(mobile.fishToWorld(0.5, 0.5, 0.5, seabed).x).toBeCloseTo(0, 6);
  });

  it('mantém a superfície abaixo do horizonte em profundidades finitas', () => {
    const frame = new DioramaFrame(resolveCameraProfile(16 / 9), 16 / 9);
    expect(frame.surfaceScreenYAtDepth(frame.profile.fishDepthMin)).toBeGreaterThan(frame.horizonScreenY);
    expect(frame.seabedScreenYAtDepth(0.7, -8.6)).toBeGreaterThan(frame.surfaceScreenYAtDepth(0.7));
  });
});
