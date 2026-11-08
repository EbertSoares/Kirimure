import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../components/Icons';
import { ITEM_DEFINITIONS, PARAMETERS, type MassLoadId } from '../simulation/config';
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
  icon: IconName;
  label: string;
  detail: string;
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
      icon: 'drop',
      label: 'Óleo',
      detail: `${formatMass(launchedKg)} na superfície`,
    });
  }

  if (Math.abs(next.sewage - prev.sewage) > 1e-6 && isFactorActive('sewage', next.sewage)) {
    const launchedKg = controls?.sewage ?? launchedMassFromTarget('sewage', next.sewage);
    notices.push({
      id: `sewage-${Date.now()}`,
      tone: 'sewage',
      icon: 'sewage',
      label: 'Esgoto',
      detail: `Descarga de ${formatMass(launchedKg)} (DBO)`,
    });
  }

  if (Math.abs(next.microplastics - prev.microplastics) > 1e-6 && isFactorActive('microplastics', next.microplastics)) {
    const concentration = Math.round(controls?.microplastics ?? next.microplastics);
    notices.push({
      id: `microplastics-${Date.now()}`,
      tone: 'microplastics',
      icon: 'bottle',
      label: 'Microplásticos',
      detail: `${concentration.toLocaleString('pt-BR')} part./m³`,
    });
  }

  if (Math.abs(next.turbidity - prev.turbidity) > 1e-6 && isFactorActive('turbidity', next.turbidity)) {
    notices.push({
      id: `turbidity-${Date.now()}`,
      tone: 'turbidity',
      icon: 'sediment',
      label: 'Turbidez',
      detail: `Sedimentos em ${Math.round(next.turbidity)}%`,
    });
  }

  if (Math.abs(next.fishing - prev.fishing) > 1e-6 && isFactorActive('fishing', next.fishing)) {
    notices.push({
      id: `fishing-${Date.now()}`,
      tone: 'fishing',
      icon: 'hook',
      label: 'Pesca',
      detail: `Pressão em ${Math.round(next.fishing)}%`,
    });
  }

  if (Math.abs(next.recovery - prev.recovery) > 1e-6 && isFactorActive('recovery', next.recovery)) {
    notices.push({
      id: `recovery-${Date.now()}`,
      tone: 'recovery',
      icon: 'shield',
      label: 'Conservação',
      detail: `Manejo em ${Math.round(next.recovery)}%`,
    });
  }

  if (Math.abs(next.temperature - prev.temperature) > 0.05) {
    const tempStr = next.temperature.toFixed(1).replace('.0', '').replace('.', ',');
    notices.push({
      id: `temperature-${Date.now()}`,
      tone: 'temperature',
      icon: 'temperature',
      label: 'Temperatura',
      detail: `Água ajustada para ${tempStr} °C`,
    });
  }

  if (Math.abs(next.ph - prev.ph) > 1e-6 && isFactorActive('ph', next.ph)) {
    const phStr = next.ph.toFixed(2).replace('.', ',');
    notices.push({
      id: `ph-${Date.now()}`,
      tone: 'ph',
      icon: 'flask',
      label: 'pH',
      detail: `Água ajustada para ${phStr}`,
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
  const [noticeVersion, setNoticeVersion] = useState(0);
  const isResettingRef = useRef(false);
  const lastResetTimeRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
    runtimeRef.current?.updateState(state);
  }, [state]);

  // Restaura fauna e exibe notificação limpa de retorno ao estado inicial
  useEffect(() => {
    if (resetToken && resetToken > 0) {
      isResettingRef.current = true;
      lastResetTimeRef.current = Date.now();
      runtimeRef.current?.resetReefLife();
      prevTargetsRef.current = { ...stateRef.current.targets };

      const noticeId = `reset-${Date.now()}`;
      const timer = window.setTimeout(() => {
        setNotices([
          {
            id: noticeId,
            tone: 'recovery',
            icon: 'reset',
            label: 'Ambiente restaurado',
            detail: 'Voltou ao estado inicial',
          },
        ]);
        setNoticeVersion((v) => v + 1);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [resetToken]);

  // Auto-dismissal garantido: qualquer badge na tela desaparece automaticamente em ~2,7 segundos
  useEffect(() => {
    if (noticeVersion === 0) return undefined;

    const fadeTimer = window.setTimeout(() => {
      setNotices((current) => current.map((item) => ({ ...item, leaving: true })));
    }, 2400);

    const removeTimer = window.setTimeout(() => {
      setNotices([]);
    }, 2700);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [noticeVersion]);

  // Exibe notificação discreta e estabilizada (debounce de 260 ms) ao ajustar parâmetros
  useEffect(() => {
    if (isResettingRef.current || Date.now() - lastResetTimeRef.current < 500) {
      isResettingRef.current = false;
      prevTargetsRef.current = { ...state.targets };
      return undefined;
    }

    const next = state.targets;
    const controls = state.controls;
    const settleTimer = window.setTimeout(() => {
      if (isResettingRef.current || Date.now() - lastResetTimeRef.current < 600) {
        isResettingRef.current = false;
        prevTargetsRef.current = { ...next };
        return;
      }

      const prev = prevTargetsRef.current;
      prevTargetsRef.current = { ...next };

      const added = buildChangedFactorNotices(prev, next, controls);
      if (added.length === 0) return;

      setNotices((current) => {
        const tonesAdded = new Set(added.map((item) => item.tone));
        const kept = current.filter((item) => !tonesAdded.has(item.tone));
        return [...kept, ...added];
      });
      setNoticeVersion((v) => v + 1);
    }, 260);

    return () => {
      window.clearTimeout(settleTimer);
    };
  }, [state.controls, state.targets]);

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
        <div className="factor-notices" aria-live="polite" aria-label="Avisos de alterações">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className={`factor-notice-pill tone-${notice.tone} ${notice.leaving ? 'leaving' : ''}`}
            >
              <Icon name={notice.icon} className="factor-notice-svg" />
              <span className="factor-notice-label">{notice.label}</span>
              <span className="factor-notice-dot" aria-hidden="true">·</span>
              <span className="factor-notice-detail">{notice.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
