// @fit/admin — order-screen glyphs from the Planflow "formacore" orders artboard.
//
// The shared `components/ui` icon set doesn't carry the orders page's glyphs
// (receipt box, POS register, globe, truck, …), so they live here, scoped to the
// order surfaces, rendered with the same 24×24 stroke-grid contract as `Icon`.

import type { SVGProps } from 'react';

/** The 24×24 stroke path data, keyed by name (Planflow orders artboard). */
export const ORDER_GLYPHS = {
  box: 'M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1Z M9 7h6 M9 11h6',
  dollar: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  truck:
    'M1 3h13v11H1z M14 7h4l3 3v4h-7 M5.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3 M17.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  undo: 'M3 7v6h6 M3 13a9 9 0 1 0 3-7.7L3 8',
  printer:
    'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M3 12h18 M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z',
  pos: 'M3 6h18M3 6l1.5 12.5a2 2 0 0 0 2 1.5h11a2 2 0 0 0 2-1.5L21 6M9 10v6M15 10v6',
  bag: 'M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8ZM9 8V6a3 3 0 0 1 6 0v2',
  dots: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
} as const;

export type OrderGlyphName = keyof typeof ORDER_GLYPHS;

export interface OrderGlyphProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: OrderGlyphName;
  /** Tailwind size/colour classes; defaults to `h-5 w-5`. */
  className?: string;
  /** Stroke width; the design's default is 2.1. */
  sw?: number;
}

/** Render one glyph from {@link ORDER_GLYPHS} as a stroke-based 24×24 SVG. */
export function OrderGlyph({ name, className = 'h-5 w-5', sw = 2.1, ...rest }: OrderGlyphProps) {
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
      <path d={ORDER_GLYPHS[name]} />
    </svg>
  );
}
