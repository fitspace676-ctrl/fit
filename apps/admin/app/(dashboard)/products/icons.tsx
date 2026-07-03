// @fit/admin — shop-screen glyphs from the Planflow "formacore" shop artboard.
//
// The shared `components/ui` icon set doesn't carry the shop page's glyphs
// (trend line, parcel box, warning triangle, sort arrows), so they live here,
// scoped to the product surfaces, rendered with the same 24×24 stroke-grid
// contract as `Icon`.

import type { SVGProps } from 'react';

/** The 24×24 stroke path data, keyed by name (Planflow shop artboard). */
export const SHOP_GLYPHS = {
  trend: 'M3 17l6-6 4 4 7-7M21 8v5h-5',
  box: 'M12 2 3 7v10l9 5 9-5V7l-9-5Z M3 7l9 5 9-5 M12 12v10',
  warn: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  sort: 'M3 7h12M3 12h9M3 17h6M17 17V7M17 7l-3 3M17 7l3 3',
} as const;

export type ShopGlyphName = keyof typeof SHOP_GLYPHS;

export interface ShopGlyphProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: ShopGlyphName;
  /** Tailwind size/colour classes; defaults to `h-5 w-5`. */
  className?: string;
  /** Stroke width; the design's default is 2.1. */
  sw?: number;
}

/** Render one glyph from {@link SHOP_GLYPHS} as a stroke-based 24×24 SVG. */
export function ShopGlyph({ name, className = 'h-5 w-5', sw = 2.1, ...rest }: ShopGlyphProps) {
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
      <path d={SHOP_GLYPHS[name]} />
    </svg>
  );
}
