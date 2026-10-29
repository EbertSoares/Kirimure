import { useEffect, useState } from 'react';

/**
 * Contador de FPS de alta precisão para a cena 3D do Kirimurê.
 * Mede a taxa real de quadros renderizados pela GPU e pelo Babylon runtime.
 */
export function FpsCounter() {
  const [fps, setFps] = useState<number>(60);

  useEffect(() => {
    let animId: number;
    let frames = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      frames += 1;
      const elapsed = now - lastTime;

      // Amostra a cada 500ms para estabilidade e precisão instantânea
      if (elapsed >= 500) {
        const calculatedFps = Math.round((frames * 1000) / elapsed);
        const runtime = typeof window !== 'undefined'
          ? (window as unknown as { __kirimureRuntime?: { getFps?: () => number } }).__kirimureRuntime
          : null;
        const engineFps = runtime?.getFps ? runtime.getFps() : 0;

        const effectiveFps = engineFps > 0 ? engineFps : calculatedFps;
        setFps(Math.min(120, Math.max(1, effectiveFps)));

        frames = 0;
        lastTime = now;
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const toneClass = fps >= 50 ? 'is-smooth' : fps >= 30 ? 'is-moderate' : 'is-slow';

  return (
    <div
      className={`fps-counter-badge ${toneClass}`}
      title="Taxa de quadros por segundo da cena 3D (FPS em tempo real)"
      aria-label={`${fps} quadros por segundo`}
    >
      <span className="fps-counter-dot" aria-hidden="true" />
      <span className="fps-counter-value">{fps}</span>
      <span className="fps-counter-unit">FPS</span>
    </div>
  );
}
