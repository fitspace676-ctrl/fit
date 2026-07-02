// @fit/admin — POS-only icon glyphs.
//
// The Planflow POS artboard uses a handful of glyphs (tender methods, member
// attach, discount) that the shared `components/ui/icon.tsx` dictionary doesn't
// carry. They live here — same 24×24 stroke grid, same rendering contract — so
// the POS screen can match the design without touching the shared set.

import type { SVGProps } from 'react';

/** The 24×24 stroke path data, keyed by name (multi-subpath strings allowed). */
export const POS_ICONS = {
  userPlus:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6',
  cash: 'M2 6h20v12H2zM12 12a2.5 2.5 0 1 1-.01 0M6 9v6M18 9v6',
  wallet:
    'M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2ZM16 13h.01',
  percent:
    'M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM3.5 6.5 12 13l8.5-6.5',
} as const;

export type PosIconName = keyof typeof POS_ICONS;

export interface PosIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: PosIconName;
  /** Tailwind size/colour classes; defaults to `h-5 w-5`. */
  className?: string;
  /** Stroke width; the design's default is 2.1. */
  sw?: number;
}

/** Render one POS glyph from {@link POS_ICONS} as a stroke-based 24×24 SVG. */
export function PosIcon({ name, className = 'h-5 w-5', sw = 2.1, ...rest }: PosIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...rest}
    >
      <path d={POS_ICONS[name]} />
    </svg>
  );
}
