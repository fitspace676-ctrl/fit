'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Scroll-reveal wrapper — fades + slides its children up the first time they
 * enter the viewport. Dependency-free (IntersectionObserver, matching the rest
 * of `components/ui`), one-shot (disconnects after revealing), and respectful of
 * `prefers-reduced-motion` (shows instantly, no transform). Pass `delay` to
 * stagger siblings for a progressive, modern cascade.
 */
export const Reveal = ({
  children,
  className,
  /** Stagger delay in ms before this element animates in. */
  delay = 0,
  /** Travel distance utility while hidden (Tailwind translate class). */
  from = 'translate-y-8',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  from?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion: reveal immediately, skip the transform entirely.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      // Trigger a touch before the element is fully in view so it eases in
      // while still rising into the viewport.
      { threshold: 0.15, rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
      className={cn(
        'transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity,transform] motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : cn(from, 'opacity-0'),
        className,
      )}
    >
      {children}
    </div>
  );
};

export default Reveal;
