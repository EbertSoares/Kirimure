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
  | 'location'
  | 'check';

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
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></>,
    check: <path d="m6 12 4 4 8-9"/>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}
