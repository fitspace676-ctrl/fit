'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Intensity = 'sm' | 'md' | 'lg';

const blurMap: Record<Intensity, string> = {
  sm: 'backdrop-blur-md',
  md: 'backdrop-blur-xl',
  lg: 'backdrop-blur-2xl',
};

// Violet-tinted depth shadow (#7C3AED) — reads on both light and dark.
const shadowMap: Record<Intensity, string> = {
  sm: 'shadow-[0_6px_22px_-14px_rgba(124,58,237,0.22)]',
  md: 'shadow-[0_14px_40px_-24px_rgba(124,58,237,0.28)]',
  lg: 'shadow-[0_24px_60px_-34px_rgba(124,58,237,0.3)]',
};

// Diagonal sheen strength, keyed off `glowIntensity`. Violet tint in light mode,
// white in dark.
const sheenMap: Record<Intensity, string> = {
  sm: 'from-violet-300/20 dark:from-white/[0.06]',
  md: 'from-violet-300/30 dark:from-white/[0.12]',
  lg: 'from-violet-200/40 dark:from-white/[0.18]',
};

export interface LiquidGlassCardProps {
  children: ReactNode;
  className?: string;
  glowIntensity?: Intensity;
  shadowIntensity?: Intensity;
  blurIntensity?: Intensity;
  borderRadius?: string;
  draggable?: boolean;
  style?: CSSProperties;
}

/**
 * Liquid-glass card — a translucent frosted surface with a specular top edge,
 * a diagonal sheen, and an inset hairline, over a backdrop blur. Meant to sit
 * on a dark surface with something colorful behind it so the blur reads.
 *
 * Dependency-free (no SVG displacement filter, no motion lib) so it renders
 * consistently across browsers; the white-based translucency is tuned for the
 * platform's dark sections.
 */
export function LiquidGlassCard({
  children,
  className,
  glowIntensity = 'md',
  shadowIntensity = 'md',
  blurIntensity = 'md',
  borderRadius = '1.5rem',
  draggable,
  style,
}: LiquidGlassCardProps) {
  return (
    <div
      draggable={draggable}
      className={cn(
        'relative overflow-hidden border border-violet-400/20 bg-violet-400/[0.05] dark:border-white/15 dark:bg-white/[0.06]',
        blurMap[blurIntensity],
        shadowMap[shadowIntensity],
        className,
      )}
      style={{ borderRadius, ...style }}
    >
      {/* specular top edge */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent dark:via-white/50" />
      {/* diagonal sheen */}
      <span
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent',
          sheenMap[glowIntensity],
        )}
      />
      {/* inset hairline */}
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-violet-400/25 dark:ring-white/10" />
      <div className="relative">{children}</div>
    </div>
  );
}

export default LiquidGlassCard;
