'use client';

import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';

/**
 * A number that counts up to its value on mount.
 *
 * The dashboard's three stat tiles are the only thing in the portal that
 * animates on arrival, and they earn it: the direction treats a big cropped mono
 * numeral as its signature graphic, and the count is what makes the reader look
 * at the number rather than past it.
 *
 * It honours `prefers-reduced-motion` — a reader who has asked for less motion
 * gets the final value immediately instead of three counters spinning at once.
 * The query is read inside the effect rather than through a
 * `useSyncExternalStore` subscription because the preference only has to be
 * right at mount: the tween is over in a second, and someone flipping the OS
 * setting mid-animation is not a case worth the subscription.
 *
 * This is the last piece of the old `data-viz` module. Its siblings there
 * (`Donut`, `Occupancy`, `Switch`) went with the migration — the first was never
 * mounted, and the other two are now `Meter` and `Switch` in this kit. It moved
 * here, and traded its `className` for `xstyle`, which is what took the member
 * portal's last Tailwind-authored component off Tailwind.
 */

const styles = stylex.create({
  base: {
    fontVariantNumeric: 'tabular-nums',
  },
});

export interface CountUpProps {
  to: number;
  /** Tween length in milliseconds. @default 1000 */
  dur?: number;
  /** Rendered immediately after the number — a unit, a `/3` denominator. */
  suffix?: string;
  xstyle?: StyleXStyles;
}

export function CountUp({ to, dur = 1000, suffix = '', xstyle }: CountUpProps) {
  const [value, setValue] = useState(0);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    // `matchMedia` is absent in a non-DOM environment; treat that as "no
    // preference" rather than throwing during a server or test render.
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setValue(to);
      return;
    }

    let start: number | null = null;
    const tick = (ts: number): void => {
      if (start === null) start = ts;
      const progress = Math.min(1, (ts - start) / dur);
      // Cubic ease-out: fast off the mark, settling onto the final value.
      setValue(Math.round(to * (1 - (1 - progress) ** 3)));
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [to, dur]);

  return (
    <span {...stylex.props(styles.base, xstyle)}>
      {value}
      {suffix}
    </span>
  );
}
