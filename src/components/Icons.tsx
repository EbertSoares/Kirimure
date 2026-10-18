import type { SVGProps } from 'react';

type IconName =
  | 'waves'
  | 'leaf'
  | 'bottle'
  | 'drop'
  | 'temperature'
  | 'flask'
  | 'fish'
  | 'coral'
  | 'info'
  | 'reset'
  | 'play'
  | 'pause'
  | 'clock'
  | 'location'
  | 'check'
  | 'sewage'
  | 'sediment'
  | 'hook'
  | 'shield'
  | 'chart'
  | 'target'
  | 'web';

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };

  const paths: Record<IconName, React.ReactNode> = {
    waves: <><path d="M2 7c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><path d="M2 12c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><path d="M2 17c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/></>,
    leaf: <><path d="M20 4C12 4 5 7 4 15c5 2 12-1 16-11Z"/><path d="M4 20c2-6 7-9 12-12"/></>,
    bottle: <><path d="M9 3h6"/><path d="M10 3v4l-2 2v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2-2V3"/><path d="M8 12h8"/><path d="M8 16h8"/></>,
    drop: <path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z"/>,
    temperature: <><path d="M14 14.8V5a4 4 0 0 0-8 0v9.8a6 6 0 1 0 8 0Z"/><path d="M10 8v9"/></>,
    flask: <><path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/></>,
    fish: <><path d="M4 12c3-5 9-6 14-2l4-3v10l-4-3c-5 4-11 3-14-2Z"/><circle cx="14" cy="11" r=".7" fill="currentColor" stroke="none"/></>,
    coral: <><path d="M12 21V8"/><path d="M12 12 8 8V5"/><path d="M12 15l5-5V6"/><path d="M8 21v-5l-3-3V9"/><path d="M17 21v-4l3-3v-3"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7h.01"/></>,
    reset: <><path d="M20 7v5h-5"/><path d="M19 12a8 8 0 1 0-2.3 5.7"/></>,
    play: <path d="m9 6 8 6-8 6V6Z" fill="currentColor"/>,
    pause: <><path d="M8 6v12"/><path d="M16 6v12"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></>,
    check: <path d="m6 12 4 4 8-9"/>,
    sewage: <><path d="M3 13h7a4 4 0 0 0 4-4V6"/><path d="M3 9h4"/><path d="M19 10s2 2.4 2 4a2 2 0 1 1-4 0c0-1.6 2-4 2-4Z"/><path d="M12 20h8"/><path d="M16 16l4 4"/><path d="M20 16l-4 4"/></>,
    sediment: <><path d="M3 7c3-1.6 6 1.6 9 0s6 1.6 9 0"/><path d="M3 12c3-1.6 6 1.6 9 0s6 1.6 9 0"/><path d="M3 17c3-1.6 6 1.6 9 0s6 1.6 9 0"/><circle cx="7" cy="9.6" r=".8" fill="currentColor" stroke="none"/><circle cx="15" cy="14.6" r=".8" fill="currentColor" stroke="none"/></>,
    hook: <><path d="M12 3v9"/><path d="M12 12a4 4 0 0 0 8 0"/><path d="M18 9v3"/><path d="M6 3h12"/></>,
    shield: <><path d="M12 21s7-3.2 7-9V5.5L12 3 5 5.5V12c0 5.8 7 9 7 9Z"/><path d="m9 12 2 2 4-4.5"/></>,
    chart: <><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M3 20h18"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/></>,
    web: <><circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M10.6 7.2 6.4 15.8"/><path d="M13.4 7.2 17.6 15.8"/><path d="M7.4 18h9.2"/></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}
