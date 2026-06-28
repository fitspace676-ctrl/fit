import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Animated conic-gradient border — a dependency-free port of the Aceternity
 * "AI gradient animation card". A registered `--border-angle` custom property
 * (see `app/globals.css`) lets a plain CSS keyframe spin the conic-gradient, so
 * no motion library is needed. The corner radius is inherited from `className`
 * (set a `rounded-*` there); a 1px outer padding turns the gradient into a
 * border, and an optional masked inner glow spills colour in from the edges.
 */
export const GradientBorder = ({
  children,
  className,
  glow = true,
}: {
  children: ReactNode;
  className?: string;
  /** Render the blurred inner edge-glow. */
  glow?: boolean;
}) => (
  <div className={cn('relative p-px', className)}>
    {/* the spinning gradient ring */}
    <div className="gradient-border-track pointer-events-none absolute inset-0 rounded-[inherit]" />
    {/* content, clipped to the radius so the ring reads as a 1px border.
        h-full so an opaque child fills any stretched height (e.g. equal-height
        grid rows) and the gradient never shows through empty space below. */}
    <div className="relative h-full overflow-hidden rounded-[inherit]">
      <div className="relative z-0 h-full">{children}</div>
      {glow && (
        <div className="gradient-border-track gradient-border-glow-mask pointer-events-none absolute inset-[-40%] z-10 opacity-50 blur-2xl" />
      )}
    </div>
  </div>
);

export default GradientBorder;
