// @fit/admin — members-only glyphs.
//
// Stroke paths the Planflow "formacore" members screens use that aren't part of
// the shared `components/ui` icon dictionary (which is outside this feature's
// edit surface). Same 24×24 stroke grid and rendering contract as `Icon`, so the
// two sets are visually indistinguishable.

import type { SVGProps } from 'react';

/** The 24×24 stroke path data, keyed by name (from the Planflow reference). */
const GLYPHS = {
  pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
  mail: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM3.5 7.5 12 13l8.5-5.5',
  phone:
    'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  dots: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  freeze:
    'M12 2v20M4.9 7l14.2 10M19.1 7 4.9 17M12 2 9.5 4.5M12 2l2.5 2.5M4.9 7l.2 3.4M19.1 17l-.2-3.4M19.1 7l-3.3.8M4.9 17l3.3-.8M12 22l-2.5-2.5M12 22l2.5-2.5',
  gift: 'M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8M3 7h18v4H3zM12 21V7M12 7H8a2 2 0 1 1 2-3c1.5 0 2 3 2 3ZM12 7h4a2 2 0 1 0-2-3c-1.5 0-2 3-2 3Z',
} as const;

export type GlyphName = keyof typeof GLYPHS;

export interface GlyphProps extends SVGProps<SVGSVGElement> {
  name: GlyphName;
  /** Tailwind size/colour classes; defaults to `h-4 w-4`. */
  className?: string;
  /** Stroke width; the design's default is 2. */
  sw?: number;
}

/** Render one members-screen glyph as a stroke-based 24×24 SVG. */
export function Glyph({ name, className = 'h-4 w-4', sw = 2, ...rest }: GlyphProps) {
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
      <path d={GLYPHS[name]} />
    </svg>
  );
}
