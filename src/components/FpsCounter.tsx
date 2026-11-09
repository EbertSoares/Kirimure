import { useEffect, useState } from 'react';
import type {
  OceanPerformanceTelemetry,
  SceneDebugVisualizationMode,
} from '../scene/babylon/runtime';

interface RuntimeWindowHandle {
  __kirimureRuntime?: {
    getFps?: () => number;
    getDiagnostics?: () => OceanPerformanceTelemetry;
    setDebugMode?: (mode: SceneDebugVisualizationMode) => void;
    backend?: string;
  };
}

const DEBUG_MODES: ReadonlyArray<{ id: SceneDebugVisualizationMode; label: string }> = [
  { id: 'none', label: 'Normal' },
  { id: 'wireframe', label: 'Malha' },
  { id: 'normals', label: 'Normais' },
  { id: 'height', label: 'Altura FFT' },
  { id: 'foam', label: 'Espuma' },
  { id: 'buoyancy', label: '6-DOF' },
];

/**
 * Contador de FPS de alta precisão e painel de Diagnóstico Técnico (Seção 13)
 * para a cena 3D do Kirimurê (clique no badge ou pressione Alt+D para expandir).
 */
export function FpsCounter() {
  const [fps, setFps] = useState<number>(60);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<OceanPerformanceTelemetry | null>(null);
  const [backend, setBackend] = useState<string>('webgpu');
  const [activeDebug, setActiveDebug] = useState<SceneDebugVisualizationMode>('none');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && (event.key === 'd' || event.key === 'D')) {
        event.preventDefault();
        setExpanded((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let animId: number;
    let frames = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      frames += 1;
      const elapsed = now - lastTime;

      if (elapsed >= 500) {
        const calculatedFps = Math.round((frames * 1000) / elapsed);
        const runtime =
          typeof window !== 'undefined'
            ? (window as unknown as RuntimeWindowHandle).__kirimureRuntime
            : null;
        const engineFps = runtime?.getFps ? runtime.getFps() : 0;
        const effectiveFps = engineFps > 0 ? engineFps : calculatedFps;
        setFps(Math.max(1, effectiveFps));

        if (runtime?.getDiagnostics) {
          setTelemetry({ ...runtime.getDiagnostics() });
        }
        if (runtime?.backend) {
          setBackend(runtime.backend);
        }

        frames = 0;
        lastTime = now;
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleSelectDebug = (mode: SceneDebugVisualizationMode) => {
    setActiveDebug(mode);
    const runtime =
      typeof window !== 'undefined'
        ? (window as unknown as RuntimeWindowHandle).__kirimureRuntime
        : null;
    runtime?.setDebugMode?.(mode);
  };

  const toneClass = fps >= 50 ? 'is-smooth' : fps >= 30 ? 'is-moderate' : 'is-slow';

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <div
        className={`fps-counter fps-counter-badge ${toneClass}`}
        title="Taxa de quadros por segundo da cena 3D (clique ou Alt+D para telemetria técnica)"
        aria-label={`${fps} quadros por segundo`}
        onClick={() => {
          const runtime =
            typeof window !== 'undefined'
              ? (window as unknown as RuntimeWindowHandle).__kirimureRuntime
              : null;
          if (runtime?.getDiagnostics) {
            setTelemetry({ ...runtime.getDiagnostics() });
          }
          if (runtime?.backend) {
            setBackend(runtime.backend);
          }
          setExpanded((prev) => !prev);
        }}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <span className="fps-counter-dot" aria-hidden="true" />
        <span className="fps-counter-value">{fps}</span>
        <span className="fps-counter-unit">FPS</span>
      </div>

      {expanded && telemetry && (
        <div
          className="ocean-diagnostics-popover"
          role="region"
          aria-label="Diagnóstico técnico de renderização e física"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '276px',
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(11, 18, 28, 0.88)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(125, 211, 252, 0.22)',
            color: '#e2e8f0',
            fontSize: '11px',
            lineHeight: 1.45,
            zIndex: 90,
            boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ fontWeight: 700, color: '#7dd3fc', marginBottom: '4px', fontSize: '10.5px', letterSpacing: '0.04em' }}>
            {telemetry.qualityLabel}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '2px', columnGap: '8px', opacity: 0.92 }}>
            <span>Backend / FFT:</span>
            <strong>{backend.toUpperCase()} · {telemetry.fftResolution}</strong>
            <span>Frame / Oceano:</span>
            <strong>{telemetry.frameTimeMs.toFixed(1)} ms / {telemetry.oceanSimTimeMs.toFixed(2)} ms</strong>
            <span>Física 6-DOF / IA:</span>
            <strong>{telemetry.boatPhysicsTimeMs.toFixed(2)} ms / {telemetry.fishAiTimeMs.toFixed(2)} ms</strong>
            <span>Barco (Pitch / Roll):</span>
            <strong>{telemetry.boatPitchDeg.toFixed(1)}° / {telemetry.boatRollDeg.toFixed(1)}°</strong>
            <span>Malhas / Triângulos:</span>
            <strong>{telemetry.activeMeshes} / {(telemetry.totalTriangles / 1000).toFixed(1)}k</strong>
          </div>
          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {DEBUG_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSelectDebug(m.id)}
                style={{
                  padding: '2px 6px',
                  fontSize: '10px',
                  borderRadius: '6px',
                  border: activeDebug === m.id ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.14)',
                  background: activeDebug === m.id ? 'rgba(56, 189, 248, 0.24)' : 'rgba(255,255,255,0.06)',
                  color: '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
