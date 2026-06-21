'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Scroll-linked 3D reveal — the Inspira/Aceternity "Container Scroll" effect,
 * reimplemented in React without a motion library. As the tall container passes
 * through the viewport, the card flattens (rotateX 20°→0°) and settles to scale,
 * while the title drifts up. Progress is derived from the container's position
 * via a rAF-throttled scroll listener.
 */
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export interface ContainerScrollProps {
  titleComponent: ReactNode;
  children: ReactNode;
}

export const ContainerScroll = ({ titleComponent, children }: ContainerScrollProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = (): void => setIsMobile(window.innerWidth <= 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let raf = 0;
    const update = (): void => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the container's top enters the bottom of the viewport,
      // 1 when the container has fully scrolled past the top.
      setProgress(clamp((vh - rect.top) / (rect.height + vh), 0, 1));
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const rotate = lerp(20, 0, progress);
  const scale = isMobile ? lerp(0.7, 0.9, progress) : lerp(1.05, 1, progress);
  const translateY = lerp(0, -100, progress);

  return (
    <div
      ref={ref}
      className="relative flex h-[44rem] items-start justify-center p-2 pb-10 md:h-[66rem] md:p-10 md:pb-28"
    >
      <div className="relative w-full pt-8 md:pt-16" style={{ perspective: '1000px' }}>
        <div
          style={{ transform: `translateY(${translateY}px)` }}
          className="mx-auto max-w-5xl text-center"
        >
          {titleComponent}
        </div>
        <div
          style={{
            transform: `rotateX(${rotate}deg) scale(${scale})`,
            boxShadow: '0 24px 60px -24px rgba(8, 9, 16, 0.4)',
          }}
          className="mx-auto -mt-12 h-[30rem] w-full max-w-5xl rounded-[30px] border-4 border-[#6C6C6C] bg-[#222222] p-2 shadow-2xl md:h-[40rem] md:p-6"
        >
          <div className="h-full w-full overflow-hidden rounded-2xl bg-zinc-900 md:rounded-2xl md:p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContainerScroll;
