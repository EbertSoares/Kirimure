import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'map'
  | 'arrowLeft'
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
  | 'web'
  | 'sliders'
  | 'undo'
  | 'chevronDown'
  | 'close'
  | 'alert';

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };

  const paths: Record<IconName, ReactNode> = {
    map: (
      <>
        <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
        <path d="M15 5.764v15" />
        <path d="M9 3.236v15" />
      </>
    ),
    arrowLeft: (
      <>
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </>
    ),
    waves: (
      <>
        <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      </>
    ),
    leaf: (
      <>
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
      </>
    ),
    bottle: (
      <>
        <path d="M9 3h6" />
        <path d="M10 3v4l-2 2v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2-2V3" />
        <path d="M8 13h8" />
      </>
    ),
    drop: (
      <>
        <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
        <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
      </>
    ),
    temperature: (
      <>
        <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
        <path d="M12 9v7" />
      </>
    ),
    flask: (
      <>
        <path d="M10 2v6.292a7 7 0 1 0 4 0V2" />
        <path d="M5 15h14" />
        <path d="M8.5 2h7" />
      </>
    ),
    fish: (
      <>
        <path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z" />
        <path d="M18 12v.5" />
        <path d="M16 17.93a9.77 9.77 0 0 1 0-11.86" />
        <path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33" />
      </>
    ),
    coral: (
      <>
        <path d="M12 21V8" />
        <path d="M12 12 8 8V5" />
        <path d="M12 15l5-5V6" />
        <path d="M8 21v-5l-3-3V9" />
        <path d="M17 21v-4l3-3v-3" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </>
    ),
    reset: (
      <>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </>
    ),
    play: <polygon points="6 3 20 12 6 21 6 3" />,
    pause: (
      <>
        <rect x="14" y="4" width="4" height="16" rx="1" />
        <rect x="6" y="4" width="4" height="16" rx="1" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    location: (
      <>
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    sewage: (
      <>
        <path d="M3 12h7a4 4 0 0 0 4-4V5" />
        <path d="M3 8h4" />
        <path d="M18 11s2.5 2.7 2.5 4.5a2.5 2.5 0 0 1-5 0c0-1.8 2.5-4.5 2.5-4.5Z" />
        <path d="M6 19h8" />
      </>
    ),
    sediment: (
      <>
        <path d="M3 7c3-1.6 6 1.6 9 0s6 1.6 9 0" />
        <path d="M3 12c3-1.6 6 1.6 9 0s6 1.6 9 0" />
        <path d="M3 17c3-1.6 6 1.6 9 0s6 1.6 9 0" />
      </>
    ),
    hook: (
      <>
        <path d="M12 3v10a4 4 0 0 0 8 0v-2" />
        <path d="m20 11-2 2" />
        <circle cx="12" cy="3" r="1" />
      </>
    ),
    shield: (
      <>
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    chart: (
      <>
        <path d="M12 16v5" />
        <path d="M16 14v7" />
        <path d="M20 10v11" />
        <path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15" />
        <path d="M4 18v3" />
        <path d="M8 14v7" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.4" />
        <path d="M12 2v3" />
        <path d="M12 19v3" />
        <path d="M2 12h3" />
        <path d="M19 12h3" />
      </>
    ),
    web: (
      <>
        <circle cx="12" cy="5" r="2.4" />
        <circle cx="5" cy="18" r="2.4" />
        <circle cx="19" cy="18" r="2.4" />
        <path d="M10.6 7.2 6.4 15.8" />
        <path d="M13.4 7.2 17.6 15.8" />
        <path d="M7.4 18h9.2" />
      </>
    ),
    sliders: (
      <>
        <line x1="21" x2="14" y1="4" y2="4" />
        <line x1="10" x2="3" y1="4" y2="4" />
        <line x1="21" x2="12" y1="12" y2="12" />
        <line x1="8" x2="3" y1="12" y2="12" />
        <line x1="21" x2="16" y1="20" y2="20" />
        <line x1="12" x2="3" y1="20" y2="20" />
        <line x1="14" x2="14" y1="2" y2="6" />
        <line x1="8" x2="8" y1="10" y2="14" />
        <line x1="16" x2="16" y1="18" y2="22" />
      </>
    ),
    undo: (
      <>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
      </>
    ),
    chevronDown: <path d="m6 9 6 6 6-6" />,
    close: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
    alert: (
      <>
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}
