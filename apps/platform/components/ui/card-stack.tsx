'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Scroll-driven card stack, after the Inspira UI "Card Stack". Each card sticks
 * under the nav as it reaches the top, the next one slides up over it, and the
 * cards already in the stack shrink a little per card above them, so the pile
 * reads as depth.
 *
 * The sticking is plain CSS (`position: sticky`, each card a few pixels lower
 * than the last so their top edges peek out). The shrink is one scroll
 * listener, throttled to a frame, writing `transform` straight onto the cards:
 * no React re-render and nothing the compositor has to repaint. With reduced
 * motion the cards still stack, just without the shrink.
 */
export function CardStack<T>({
  items,
  getKey,
  children,
  scaleMultiplier = 0.03,
  top = '6.5rem',
  offset = 16,
  cardClassName,
}: {
  items: readonly T[];
  getKey: (item: T) => string;
  children: (item: T, index: number) => ReactNode;
  /** How much smaller each card gets per card stacked on top of it. */
  scaleMultiplier?: number;
  /** Where the first card sticks, below the nav. */
  top?: string;
  /** How far each later card sticks below the one before it, in px. */
  offset?: number;
  /** Height and other sizing for every card. */
  cardClassName?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const count = items.length;
    let frame = 0;

    const update = (): void => {
      frame = 0;
      const rect = list.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const progress = travel > 0 ? Math.min(Math.max(-rect.top / travel, 0), 1) : 0;

      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        // Card `index` starts shrinking once the stack has scrolled to it, and
        // ends one step smaller for every card that lands on top of it.
        const start = index / count;
        const t = start >= 1 ? 0 : Math.min(Math.max((progress - start) / (1 - start), 0), 1);
        const scale = 1 - t * (count - 1 - index) * scaleMultiplier;
        card.style.transform = `scale(${scale})`;
      });
    };

    const onScroll = (): void => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [items.length, scaleMultiplier]);

  return (
    <div ref={listRef} className="relative">
      {items.map((item, index) => (
        <div
          key={getKey(item)}
          className="sticky pb-6"
          style={{ top: `calc(${top} + ${index * offset}px)` }}
        >
          <div
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            className={cn('origin-top will-change-transform', cardClassName)}
          >
            {children(item, index)}
          </div>
        </div>
      ))}
    </div>
  );
}
