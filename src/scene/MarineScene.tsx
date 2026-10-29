import { useEffect, useRef, useState } from 'react';
import { BASELINE, ITEM_DEFINITIONS, PARAMETERS, type MassLoadId } from '../simulation/config';
import { isFactorActive } from '../simulation/model';
import type { Environment, SimulationState } from '../simulation/types';
import { BabylonOceanRuntime } from './babylon/runtime';

interface MarineSceneProps {
  state: SimulationState;
  resetToken?: number;
}

type SceneStatus = 'loading' | 'ready' | 'error';

interface ActiveFactorNotice {
  id: string;
  tone: 'oil' | 'sewage' | 'microplastics' | 'temperature' | 'ph' | 'turbidity' | 'fishing' | 'recovery';
  label: string;
  text: string;
  leaving?: boolean;
}

function launchedMassFromTarget(id: MassLoadId, targetKg: number): number {
  if (targetKg <= 0) return 0;
  const rawKg = targetKg / PARAMETERS.transport.centralRetention;
  const options = ITEM_DEFINITIONS[id].massOptionsKg;
  if (options && options.length > 0) {
    let closest = options[0];
    let minDiff = Math.abs(rawKg - closest);
    for (const option of options) {
      const diff = Math.abs(rawKg - option);
      if (diff < minDiff) {
        minDiff = diff;
        closest = option;
      }
    }
    if (minDiff / Math.max(1, closest) < 0.05) {
      return closest;
    }
  }
  return Math.round(rawKg);
}

function formatMass(kilograms: number) {
  if (kilograms >= 1000) {
    const tonnes = kilograms / 1000;
    return `${tonnes.toLocaleString('pt-BR', { maximumFractionDigits: tonnes >= 10 ? 0 : 1 })} t`;
  }
  return `${kilograms.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg`;
}

function buildChangedFactorNotices(prev: Environment, next: Environment, controls?: Environment): ActiveFactorNotice[] {
  const notices: ActiveFactorNotice[] = [];

  if (Math.abs(next.oil - prev.oil) > 1e-6 && isFactorActive('oil', next.oil)) {
    const launchedKg = controls?.oil ?? launchedMassFromTarget('oil', next.oil);
    notices.push({
      id: `oil-${Date.now()}`,
      tone: 'oil',
      label: 'Óleo',
      text: `Barco derramou ${formatMass(launchedKg)} de óleo na superfície`,
    });
  }

  if (Math.abs(next.sewage - prev.sewage) > 1e-6 && isFactorActive('sewage', next.sewage)) {
    const launchedKg = controls?.sewage ?? launchedMassFromTarget('sewage', next.sewage);
    notices.push({
      id: `sewage-${Date.now()}`,
      tone: 'sewage',
      label: 'Esgoto',
      text: `Descarga de ${formatMass(launchedKg)} de esgoto orgânico (DBO)`,
    });
  }

  if (Math.abs(next.microplastics - prev.microplastics) > 1e-6 && isFactorActive('microplastics', next.microplastics)) {
    const concentration = Math.round(controls?.microplastics ?? next.microplastics);
    notices.push({
      id: `microplastics-${Date.now()}`,
      tone: 'microplastics',
      label: 'Microplásticos',
      text: `Concentração ajustada para ${concentration.toLocaleString('pt-BR')} part./m³`,
    });
  }

  if (Math.abs(next.turbidity - prev.turbidity) > 1e-6 && isFactorActive('turbidity', next.turbidity)) {
    notices.push({
      id: `turbidity-${Date.now()}`,
      tone: 'turbidity',
      label: 'Turbidez',
      text: `Sedimentos em suspensão: índice em ${Math.round(next.turbidity)}%`,
    });
  }

  if (Math.abs(next.fishing - prev.fishing) > 1e-6 && isFactorActive('fishing', next.fishing)) {
    notices.push({
      id: `fishing-${Date.now()}`,
      tone: 'fishing',
      label: 'Pesca',
      text: `Pressão pesqueira ajustada para ${Math.round(next.fishing)}%`,
    });
  }

  if (Math.abs(next.recovery - prev.recovery) > 1e-6 && isFactorActive('recovery', next.recovery)) {
    notices.push({
      id: `recovery-${Date.now()}`,
      tone: 'recovery',
      label: 'Recuperação',
      text: `Proteção e manejo ecológico em ${Math.round(next.recovery)}%`,
    });
  }

  if (Math.abs(next.temperature - prev.temperature) > 1e-6 && isFactorActive('temperature', next.temperature)) {
    const tempStr = next.temperature.toFixed(1).replace('.0', '').replace('.', ',');
    const warming = next.temperature > BASELINE.temperature;
    notices.push({
      id: `temperature-${Date.now()}`,
      tone: 'temperature',
      label: 'Temperatura',
      text: warming
        ? `Anomalia térmica: água aquecida a ${tempStr}°C`
        : `Água resfriada para ${tempStr}°C`,
    });
  }

  if (Math.abs(next.ph - prev.ph) > 1e-6 && isFactorActive('ph', next.ph)) {
    const phStr = next.ph.toFixed(2).replace('.', ',');
    const acidic = next.ph < BASELINE.ph;
    notices.push({
      id: `ph-${Date.now()}`,
      tone: 'ph',
      label: 'pH',
      text: acidic
        ? `Acidificação costeira: pH reduzido para ${phStr}`
        : `Alcalinidade elevada: pH em ${phStr}`,
    });
  }

  return notices;
}

export function MarineScene({ state, resetToken }: MarineSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<BabylonOceanRuntime | null>(null);
  const stateRef = useRef(state);
  const prevTargetsRef = useRef<Environment>({ ...state.targets });
  const [status, setStatus] = useState<SceneStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [notices, setNotices] = useState<ActiveFactorNotice[]>([]);

  stateRef.current = state;

  useEffect(() => {
    runtimeRef.current?.updateState(state);
  }, [state]);

  // Restaura imediatamente os peixes e a fauna quando o usuário clica em Reiniciar
  useEffect(() => {
    if (resetToken && resetToken > 0) {
      runtimeRef.current?.resetReefLife();
    }
  }, [resetToken]);

  // Exibe notificação discreta e estabilizada (debounce de 380 ms) ao ajustar parâmetros
  useEffect(() => {
    const next = state.targets;
    const anyActive = (Object.keys(BASELINE) as Array<keyof Environment>)
      .some((key) => isFactorActive(key, next[key]));
    if (!anyActive) {
      prevTargetsRef.current = { ...next };
      setNotices([]);
      return undefined;
    }

    let fadeTimer = 0;
    let removeTimer = 0;
    const settleTimer = window.setTimeout(() => {
      const prev = prevTargetsRef.current;
      prevTargetsRef.current = { ...next };

      const added = buildChangedFactorNotices(prev, next, state.controls);
      if (added.length === 0) return;

      setNotices((current) => {
        const tonesAdded = new Set(added.map((item) => item.tone));
        const kept = current.filter((item) => !tonesAdded.has(item.tone));
        return [...kept, ...added];
      });

      const addedIds = new Set(added.map((item) => item.id));
      fadeTimer = window.setTimeout(() => {
        setNotices((current) => current.map((item) => (
          addedIds.has(item.id) ? { ...item, leaving: true } : item
        )));
      }, 3000);

      removeTimer = window.setTimeout(() => {
        setNotices((current) => current.filter((item) => !addedIds.has(item.id)));
      }, 3500);
    }, 380);

    return () => {
      window.clearTimeout(settleTimer);
      if (fadeTimer) window.clearTimeout(fadeTimer);
      if (removeTimer) window.clearTimeout(removeTimer);
    };
  }, [
    state.targets.temperature,
    state.targets.ph,
    state.targets.turbidity,
    state.targets.microplastics,
    state.targets.oil,
    state.targets.sewage,
    state.targets.fishing,
    state.targets.recovery,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    setStatus('loading');

    // O StrictMode do React executa o efeito duas vezes em desenvolvimento.
    // Quando os dois probes criam um WebGPUEngine no mesmo canvas, o contexto
    // pode continuar ligado ao device descartado do primeiro probe. No Safari/
    // WebKit isso invalida as texturas de profundidade e o canvas não desenha a
    // cena (ficando apenas a imagem de fundo CSS). Adiar a criação por um tick
    // permite que o primeiro cleanup cancele antes de um device ser criado.
    const startTimer = window.setTimeout(() => {
      if (cancelled) return;

      BabylonOceanRuntime.create(canvas, stateRef.current)
        .then((runtime) => {
          if (cancelled) {
            runtime.dispose();
            return;
          }
          runtimeRef.current = runtime;
          if (typeof window !== 'undefined') {
            (window as unknown as { __kirimureRuntime?: BabylonOceanRuntime }).__kirimureRuntime = runtime;
          }
          runtime.updateState(stateRef.current);
          canvas.parentElement?.setAttribute('data-renderer', runtime.backend);
          canvas.parentElement?.setAttribute('data-buoyancy', 'multipoint');
          canvas.parentElement?.setAttribute('data-wave-model', 'shared-gerstner');
          observer = new ResizeObserver(() => runtime.resize());
          observer.observe(canvas);
          setStatus('ready');
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          console.error(error);
          setErrorMessage(error instanceof Error ? error.message : 'Não foi possível iniciar a cena 3D.');
          setStatus('error');
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      observer?.disconnect();
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __kirimureRuntime?: BabylonOceanRuntime }).__kirimureRuntime;
      }
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  return (
    <div className="marine-canvas" data-scene="babylon-ocean">
      <canvas ref={canvasRef} aria-label="Cena oceânica 3D da Baía de Todos-os-Santos" />
      {status !== 'ready' && (
        <div className={`scene-loading ${status}`} role="status">
          <span className="scene-loading-dot" aria-hidden="true" />
          {status === 'error' ? errorMessage : 'Carregando…'}
        </div>
      )}
      {status === 'ready' && notices.length > 0 && (
        <div className="factor-notices" aria-live="polite" aria-label="Avisos de mudanças aplicadas">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className={`factor-notice-pill tone-${notice.tone} ${notice.leaving ? 'leaving' : ''}`}
            >
              <i className="factor-notice-dot" aria-hidden="true" />
              <small>{notice.label}</small>
              <strong>{notice.text}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
