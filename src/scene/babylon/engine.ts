import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';

export type RendererBackend = 'webgpu' | 'webgl2';

export interface OceanEngine {
  engine: AbstractEngine;
  backend: RendererBackend;
}

/**
 * Creates the best available Babylon engine without making WebGPU a runtime
 * requirement. A rejected adapter/device request is treated exactly like an
 * unsupported browser and falls back to WebGL2.
 */
export async function createOceanEngine(canvas: HTMLCanvasElement): Promise<OceanEngine> {
  try {
    if ('gpu' in navigator && await WebGPUEngine.IsSupportedAsync) {
      const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent || '');
      const engine = new WebGPUEngine(canvas, {
        antialias: true,
        adaptToDeviceRatio: true,
        enableAllFeatures: true,
        ...(isWindows ? {} : { powerPreference: 'high-performance' }),
      });
      await engine.initAsync();
      const maxDprWebGPU = typeof window !== 'undefined' && window.innerWidth <= 800 ? 1.4 : 1.75;
      const dprWebGPU = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      engine.setHardwareScalingLevel(1 / Math.min(dprWebGPU, maxDprWebGPU));
      return { engine, backend: 'webgpu' };
    }
  } catch (error) {
    console.warn('WebGPU indisponível; usando WebGL2.', error);
  }

  const engine = new Engine(canvas, true, {
    antialias: true,
    audioEngine: false,
    doNotHandleContextLost: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
    stencil: true,
  }, true);

  if (engine.webGLVersion < 2) {
    engine.dispose();
    throw new Error('Esta visualização requer WebGPU ou WebGL2.');
  }

  // Capping inteligente de DPR para hardware escolar e mobile:
  // Em telas densas (DPR 2.5x a 3x), limita a ~1.4x no mobile para poupar 78% do fillrate da GPU sem perda perceptível
  const maxDpr = typeof window !== 'undefined' && window.innerWidth <= 800 ? 1.4 : 1.75;
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  engine.setHardwareScalingLevel(1 / Math.min(dpr, maxDpr));

  return { engine, backend: 'webgl2' };
}
