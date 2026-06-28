'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Animated stacked tabs — the Inspira/Aceternity "Animated Tabs" effect,
 * reimplemented in React without a motion library (the rest of this app's
 * `components/ui` follows the same no-dependency rule, see `container-scroll`).
 *
 * The active panel sits on top; the others fan out behind it as a depth stack
 * and lift slightly on hover. Switching tabs restacks the cards with a CSS
 * transition. The tab bar carries a sliding pill that measures the active
 * button so it tracks any label width.
 *
 * The chrome (bar + pill) uses semantic tokens so it reads in light and dark;
 * panel styling is entirely up to the consumer via the `children` render-prop,
 * mirroring the original component's content slot.
 */
export type AnimatedTab = { title: string; value: string };

export function AnimatedTabs<T extends AnimatedTab>({
  tabs,
  children,
  className,
  tabBarClassName,
  /** Height of the card stack. Tall enough for rich panels by default. */
  panelClassName = 'h-[40rem] md:h-[34rem]',
  /** When set, auto-advances to the next tab every N ms (paused on hover). */
  autoAdvanceMs,
}: {
  tabs: T[];
  /** Renders one panel; `active` is true for the front-most card. */
  children: (tab: T, active: boolean) => ReactNode;
  className?: string;
  tabBarClassName?: string;
  panelClassName?: string;
  autoAdvanceMs?: number;
}) {
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);

  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Track the full box (incl. top/height) so the pill follows the active tab
  // onto whichever row it wraps to on narrow screens.
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });

  const measure = (): void => {
    const el = btnRefs.current[active];
    if (el)
      setPill({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
  };
  useLayoutEffect(measure, [active, tabs.length]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);

  const n = tabs.length;

  // Carousel auto-advance. Keyed on `active`, so every switch (manual click
  // included) restarts the 6s clock; pauses while the user hovers the stack.
  useEffect(() => {
    if (!autoAdvanceMs || hovering || n < 2) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % n), autoAdvanceMs);
    return () => window.clearTimeout(id);
  }, [active, hovering, autoAdvanceMs, n]);

  return (
    <div className={className}>
      {/* tab bar with sliding active pill */}
      <div
        role="tablist"
        aria-label="Audience selector"
        className={cn(
          'relative mx-auto flex w-full max-w-fit flex-wrap items-center justify-center gap-1 rounded-3xl border border-overlay/10 bg-overlay/[0.04] p-1 backdrop-blur-xl',
          tabBarClassName,
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-pill bg-gradient-to-r from-brand-600 to-iris-600 shadow-[0_6px_20px_-6px_rgba(124,58,237,0.7)] transition-all duration-300 ease-out"
          style={{ left: pill.left, top: pill.top, width: pill.width, height: pill.height }}
        />
        {tabs.map((t, i) => (
          <button
            key={t.value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn(
              'relative z-10 shrink-0 whitespace-nowrap rounded-pill px-2.5 py-1.5 text-[13px] font-semibold transition-colors',
              i === active ? 'text-white' : 'text-muted hover:text-fg',
            )}
          >
            {t.title}
          </button>
        ))}
      </div>

      {/* stacked card panels — real 3D depth: cards recede along Z and tilt back,
          so switching flies the chosen card forward through the perspective. */}
      <div
        className={cn('relative mt-8 w-full [perspective:1600px]', panelClassName)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {tabs.map((t, i) => {
          // Position in the stack: 0 = front (active), 1, 2 … fan out behind.
          const pos = (i - active + n) % n;
          const isActive = pos === 0;
          const visible = pos < 3;
          return (
            <div
              key={t.value}
              role="tabpanel"
              aria-hidden={!isActive}
              className="absolute inset-0 origin-top transition-[transform,opacity] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform [transform-style:preserve-3d]"
              style={{
                transform: `translate3d(0, ${pos * (hovering ? 44 : 20)}px, ${-pos * 110}px) rotateX(${pos * 3}deg)`,
                opacity: visible ? 1 - pos * 0.25 : 0,
                zIndex: n - pos,
                pointerEvents: isActive ? 'auto' : 'none',
              }}
            >
              {/* The active card dips-and-settles (deck bounce); remounting via a
                  per-activation key replays the animation on every switch. */}
              <div
                key={isActive ? `pop-${active}` : 'rest'}
                className={cn('h-full w-full', isActive && 'tab-card-pop')}
              >
                {children(t, isActive)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
