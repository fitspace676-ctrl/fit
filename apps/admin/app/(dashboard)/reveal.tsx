'use client';

import type { CSSProperties, ReactNode } from 'react';

/**
 * One beat of the dashboard's entrance wave (see `[data-reveal]` in
 * `globals.css`): fades and rises into place after `delay` ms. The wrapper is
 * plain block flow, so it adds no layout of its own.
 */
export function Reveal({ delay, children }: { delay: number; children: ReactNode }) {
  return (
    <div data-reveal style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}
