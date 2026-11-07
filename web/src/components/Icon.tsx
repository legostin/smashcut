const P: Record<string, string> = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  skipBack: 'M6 5h2v14H6zM20 5v14L9 12z',
  stepBack: 'M18 5v14L8 12zM6 5h2v14H6z',
  stepFwd: 'M6 5v14l10-7zM16 5h2v14h-2z',
  comment: 'M4 4h16v12H8l-4 4z',
  send: 'M3 20l18-8L3 4v6l12 2-12 2z',
  plus: 'M11 5h2v14h-2zM5 11h14v2H5z',
  film: 'M4 4h16v16H4zM7 4v16M17 4v16M4 8h3M4 12h3M4 16h3M17 8h3M17 12h3M17 16h3',
  music: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  folder: 'M3 6h7l2 2h9v11H3z',
  gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  download: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 6.6C3.8 8.4 2 12 2 12s4 6 10 6c1.6 0 3-.4 4.3-1',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l6 6M22 9l-6 6',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  check: 'M4 12l5 5L20 6',
  x: 'M6 6l12 12M18 6L6 18',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  scissors: 'M6 6a2.5 2.5 0 1 0 0 .1M6 18a2.5 2.5 0 1 0 0 .1M8 7.5L20 18M8 16.5L20 6',
  magnet: 'M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z',
  stop: 'M6 6h12v12H6z',
  bot: 'M5 8h14v11H5zM12 4v4M9 13h.01M15 13h.01M9 16h6',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  copy: 'M8 8h12v12H8zM4 4h12v2H6v10H4z',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  wand: 'M4 20L16 8M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
};
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const filled = ['play', 'pause', 'skipBack', 'stepBack', 'stepFwd', 'send', 'plus', 'sparkle', 'stop'].includes(name);
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name] || P.sparkle} />
    </svg>
  );
}
