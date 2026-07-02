// @fit/admin — local stroke glyphs for the staff screen.
//
// The Planflow reference uses a handful of icons (shield, pulse, mail, key, the
// row-menu dots) that aren't in the shared `components/ui` icon set; they're kept
// local to this route so the shared set stays untouched. Same 24×24 stroke grid
// and defaults as the shared `Icon`.

import type { SVGProps } from 'react';

/** The 24×24 stroke path data, keyed by name (multi-subpath strings are fine). */
export const STAFF_GLYPHS = {
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  pulse: 'M3 12h4l2 7 4-16 2 9h6',
  mail: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM3 7l9 6 9-6',
  key: 'M15 7a4 4 0 1 1-5.9 3.5L3 16.6V21h4v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7Z',
  dots: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
} as const;

export type StaffGlyphName = keyof typeof STAFF_GLYPHS;

export interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: StaffGlyphName;
  /** Tailwind size/colour classes; defaults to `h-5 w-5`. */
  className?: string;
  /** Stroke width; the design's default is 2.1. */
  sw?: number;
}

/** Render one glyph from {@link STAFF_GLYPHS} as a stroke-based 24×24 SVG. */
export function Glyph({ name, className = 'h-5 w-5', sw = 2.1, ...rest }: GlyphProps) {
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
      <path d={STAFF_GLYPHS[name]} />
    </svg>
  );
}
