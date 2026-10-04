import { cn } from '@/lib/utils';

/**
 * Deep brand-blue aurora light bands for a section backdrop, after the
 * Aceternity / Inspira UI "Aurora Background". Pure CSS (`.aurora-bg-layer` in
 * globals.css), so it needs no animation library and renders on the server.
 * Drop it as the first child of a `relative isolate` section; it fills the
 * section and sits behind the content.
 */
export function AuroraBackground({
  radialGradient = true,
  tone = 'page',
  fade = true,
  className,
}: {
  /** Fade the bands out from the top-right corner, as in the original. */
  radialGradient?: boolean;
  /**
   * `page` breaks the bands up with stripes of the page colour (light bands on
   * the canvas); `deep` fills the section with saturated brand blue for white
   * type on top, right up to the top edge (under an overlay nav), fading out
   * before the section's bottom edge so it meets the page without a seam.
   */
  tone?: 'page' | 'deep';
  /** `deep` only: fade out at the bottom edge. Off for a self-contained card. */
  fade?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden', className)}
    >
      <div
        className={cn(
          'aurora-bg-layer absolute -inset-[12px] overflow-hidden',
          tone === 'deep' && 'aurora-deep',
          tone === 'deep' &&
            fade &&
            '[mask-image:linear-gradient(to_bottom,black_0,black_calc(100%-14rem),rgba(0,0,0,0.55)_calc(100%-8rem),rgba(0,0,0,0.18)_calc(100%-4rem),transparent_calc(100%-1rem))]',
          tone === 'page' && 'opacity-80',
          tone === 'page' &&
            radialGradient &&
            '[mask-image:radial-gradient(ellipse_at_100%_0%,black_25%,transparent_80%)]',
        )}
      />
    </div>
  );
}
