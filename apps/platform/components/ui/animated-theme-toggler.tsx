'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animated light/dark switch. Flips the `.dark` class the inline head script
 * manages and persists the choice to `localStorage.theme` — same mechanism as
 * the rest of the marketing site, just wrapped in the View Transitions API so
 * the new theme is revealed with a clip-path shape expanding from the button
 * (or the viewport centre with `fromCenter`).
 *
 * Falls back to an instant flip when the browser lacks `startViewTransition`
 * or the user prefers reduced motion.
 */
export type ThemeTogglerVariant =
  | 'circle'
  | 'square'
  | 'rectangle'
  | 'triangle'
  | 'diamond'
  | 'hexagon'
  | 'star';

// Unit polygons in a [-1, 1] box, multiplied by the animated scale and offset
// to the reveal origin. `circle` is handled separately with `clip-path: circle()`.
const STAR: [number, number][] = Array.from({ length: 10 }, (_, i) => {
  const angle = (-90 + i * 36) * (Math.PI / 180);
  const r = i % 2 === 0 ? 1 : 0.45;
  return [r * Math.cos(angle), r * Math.sin(angle)];
});

const UNIT_SHAPES: Record<Exclude<ThemeTogglerVariant, 'circle'>, [number, number][]> = {
  square: [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ],
  rectangle: [
    [-1.6, -1],
    [1.6, -1],
    [1.6, 1],
    [-1.6, 1],
  ],
  diamond: [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ],
  triangle: [
    [0, -1],
    [1, 1],
    [-1, 1],
  ],
  hexagon: [
    [1, 0],
    [0.5, 0.866],
    [-0.5, 0.866],
    [-1, 0],
    [-0.5, -0.866],
    [0.5, -0.866],
  ],
  star: STAR,
};

// How far the shape must grow (× distance to the farthest corner) to fully
// cover the viewport. Pointy/concave shapes need a generous overshoot.
const COVER_FACTOR: Record<ThemeTogglerVariant, number> = {
  circle: 1,
  square: 1,
  rectangle: 1,
  diamond: 1.5,
  hexagon: 1.2,
  triangle: 2.5,
  star: 3,
};

function clipPathAt(variant: ThemeTogglerVariant, cx: number, cy: number, scale: number): string {
  if (variant === 'circle') {
    return `circle(${Math.max(scale, 0)}px at ${cx}px ${cy}px)`;
  }
  const points = UNIT_SHAPES[variant]
    .map(([ux, uy]) => `${(cx + ux * scale).toFixed(1)}px ${(cy + uy * scale).toFixed(1)}px`)
    .join(', ');
  return `polygon(${points})`;
}

const SunIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export interface AnimatedThemeTogglerProps {
  /** Clip-path shape of the reveal. Defaults to `circle`. */
  variant?: ThemeTogglerVariant;
  /** Reveal duration in ms. Defaults to 700. */
  duration?: number;
  /** Expand from the viewport centre instead of the button. */
  fromCenter?: boolean;
  className?: string;
}

export const AnimatedThemeToggler = ({
  variant = 'circle',
  duration = 700,
  fromCenter = false,
  className = '',
}: AnimatedThemeTogglerProps) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const applyTheme = (next: boolean): void => {
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // Ignore storage failures (private mode); the class still flips.
    }
    setDark(next);
  };

  const toggle = async (): Promise<void> => {
    const next = !dark;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || typeof document.startViewTransition !== 'function') {
      applyTheme(next);
      return;
    }

    // On phones the full-page snapshot is captured at 2–3× DPR and a `polygon`
    // clip-path is costly to composite each frame (WebGL canvas, backdrop-blur,
    // large images all land in the snapshot). Fall back to the cheaper `circle`
    // reveal and a shorter duration so the transition stays smooth.
    const isMobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
    const effVariant: ThemeTogglerVariant = isMobile ? 'circle' : variant;
    const effDuration = isMobile ? Math.min(duration, 450) : duration;

    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    if (!fromCenter && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
    }

    const transition = document.startViewTransition(() => applyTheme(next));
    await transition.ready;

    const farthest = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(window.innerWidth - cx, cy),
      Math.hypot(cx, window.innerHeight - cy),
      Math.hypot(window.innerWidth - cx, window.innerHeight - cy),
    );
    const end = farthest * COVER_FACTOR[effVariant];

    document.documentElement.animate(
      {
        clipPath: [clipPathAt(effVariant, cx, cy, 0), clipPathAt(effVariant, cx, cy, end)],
      },
      {
        duration: effDuration,
        easing: 'ease-in-out',
        pseudoElement: '::view-transition-new(root)',
      },
    );
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => void toggle()}
      aria-label="Toggle dark mode"
      className={`w-10 h-10 grid place-items-center rounded-btn text-strong hover:text-fg hover:bg-overlay/5 transition ${className}`}
    >
      {mounted && !dark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
};

export default AnimatedThemeToggler;
