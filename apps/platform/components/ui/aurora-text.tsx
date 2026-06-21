'use client';

import { memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Animated gradient text. The gradient flows across the glyphs via a looping
 * `background-position` shift (see the `aurora` keyframes in globals.css). The
 * real text is rendered visibly-hidden for screen readers; the animated copy is
 * `aria-hidden`. Colours default to the marketing brand ramp but can be
 * overridden per usage (e.g. lighter values for the dark hero).
 *
 * Respects `prefers-reduced-motion` — the flow is paused for those users.
 */
export interface AuroraTextProps {
  children: ReactNode;
  className?: string;
  /** Gradient stops, in order. The first colour is repeated at the end so the loop is seamless. */
  colors?: string[];
  /** Animation speed multiplier (1 = ~10s loop). */
  speed?: number;
}

export const AuroraText = memo(function AuroraText({
  children,
  className = '',
  colors = ['#5044D2', '#7A5AF8', '#2342EB'],
  speed = 1,
}: AuroraTextProps) {
  const style: CSSProperties = {
    backgroundImage: `linear-gradient(135deg, ${colors.join(', ')}, ${colors[0]})`,
    backgroundSize: '200% auto',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    animation: `aurora ${10 / speed}s ease-in-out infinite`,
  };

  return (
    <span className={`relative inline-block ${className}`}>
      <span className="sr-only">{children}</span>
      <span aria-hidden className="aurora-text relative" style={style}>
        {children}
      </span>
    </span>
  );
});

export default AuroraText;
