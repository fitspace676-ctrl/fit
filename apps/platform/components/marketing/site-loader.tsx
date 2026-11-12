'use client';

import { useId, useLayoutEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

/**
 * FormaCore splash: the F mark assembles from its four parts, then the
 * wordmark rises in beneath it, holds, and the overlay lifts away to reveal
 * the page. Chosen from three directions by a judged design round.
 *
 * Timeline (ms from first paint), kept short so the page's own content (the
 * hero, and with it the Largest Contentful Paint) is not held back:
 *   0-220     the F mark assembles from its two vector halves: the upper
 *             piece glides in from the right, the lower from the left, 50ms
 *             apart, on an ease-out with no overshoot.
 *   280-420   a thin light glint sweeps across the assembled mark.
 *   290-430   the mark settles to its lockup size.
 *   310-430   the brand wordmark rises in from a mask.
 *   490-610   the logo lifts and fades; the overlay is clipped away upward,
 *             led by a 1px brand-gradient edge with a soft shadow under it.
 *
 * It plays on the homepage only; every other page opens straight away.
 * Pure CSS and vector shapes (no raster mark to decode), so it plays from
 * first paint, before hydration. Only transform,
 * opacity and clip-path animate. It plays once per browser session: the head
 * script in `app/layout.tsx` tags <html> with `fcl-seen` on later page loads,
 * which hides it before it paints. With prefers-reduced-motion the finished
 * lockup shows still, then fades.
 */

const TOTAL_MS = 620;
const REDUCED_MS = 400;

/** Long, soft ease-out (expo-like): fast start, no overshoot, no bounce. */
const GLIDE = 'cubic-bezier(.16,1,.3,1)';

/**
 * The F mark from the supplied art, traced as two polygons in a 791 × 742 box:
 * the upper piece (top bar and stem) and the lower piece (middle bar and tail).
 */
const F_TOP = '207,0 791,0 653,185 314,185 237,297 0,299';
const F_BOTTOM = '237,297 717,297 592,455 387,455 187,742 72,538';

const CSS = `
.fcl { clip-path: inset(0 0 0 0); animation: fcl-lift 112ms cubic-bezier(.76,0,.24,1) 498ms both, fcl-gone 1ms linear 612ms both; }
.fcl-stack { animation: fcl-stack-out 84ms cubic-bezier(.5,0,.75,0) 490ms both; }
.fcl-mark { animation: fcl-settle 140ms cubic-bezier(.65,0,.35,1) 290ms both; }
.fcl-p { animation: fcl-in 220ms ${GLIDE} both; will-change: transform, opacity; }
.fcl-top    { --fx: 180px;  --fy: -40px; animation-delay: 0ms; }
.fcl-bottom { --fx: -180px; --fy: 40px;  animation-delay: 50ms; }
.fcl-shine { animation: fcl-shine 140ms cubic-bezier(.4,0,.2,1) 280ms both; }
.fcl-word { animation: fcl-rise 120ms ${GLIDE} 310ms both; }
/* Wordmark line from the supplied 989 × 288 full logo. */
.fcl-word span { display: block; width: 200px; height: 35px; background-repeat: no-repeat; background-size: 300px auto; background-position: -100px -27px; }
html.fcl-seen .fcl, html.fcl-seen .fcl-edge { display: none; }
.fcl-edge { animation: fcl-edge 112ms cubic-bezier(.76,0,.24,1) 498ms both, fcl-gone 1ms linear 612ms both; }
.fcl-edge::before {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
  background: linear-gradient(90deg, transparent, #2f7896 25%, #286982 50%, #1f4a72 75%, transparent);
}
.fcl-edge::after {
  content: ""; position: absolute; left: 0; right: 0; top: 100%; height: 56px;
  background: linear-gradient(to bottom, rgba(31,74,114,.07), rgba(31,74,114,0));
}
.dark .fcl-edge::after { background: linear-gradient(to bottom, rgba(0,0,0,.45), rgba(0,0,0,0)); }

@keyframes fcl-in {
  0%   { transform: translate(var(--fx), var(--fy)); opacity: 0; }
  45%  { opacity: 1; }
  100% { transform: translate(0, 0); opacity: 1; }
}
@keyframes fcl-settle { from { transform: translateY(29px) scale(1.16); } to { transform: translateY(0) scale(1); } }
@keyframes fcl-shine { from { transform: translateX(-160px); } to { transform: translateX(1100px); } }
@keyframes fcl-rise { from { transform: translateY(110%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes fcl-stack-out { to { transform: translateY(-44px); opacity: 0; } }
@keyframes fcl-lift { to { clip-path: inset(0 0 100% 0); } }
@keyframes fcl-edge {
  0%   { transform: translateY(0); opacity: 0; }
  10%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { transform: translateY(-100%); opacity: 0; }
}
@keyframes fcl-fade { to { opacity: 0; } }
/* Safety net: whatever happens to the exit animation or to hydration, the
   overlay stops covering and catching the page at the end of the timeline. */
@keyframes fcl-gone { to { opacity: 0; transform: translateY(-200vh); } }
.fcl, .fcl-edge { animation-fill-mode: both; }
/* Phones: leave on opacity alone. A clip-path animation runs on the main
   thread, and a phone still busy rendering the page can stall it mid-way,
   leaving the overlay over the landing. Opacity runs on the compositor. */
@media (max-width: 767px) {
  .fcl { animation: fcl-fade 76ms ease-out 498ms both, fcl-gone 1ms linear 576ms both; }
  .fcl-edge { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .fcl-stack, .fcl-mark, .fcl-p, .fcl-shine, .fcl-word { animation: none; }
  .fcl-shine, .fcl-edge { display: none; }
  .fcl { animation: fcl-fade 120ms linear 200ms both, fcl-gone 1ms linear 330ms both; }
}
`;

export function SiteLoader() {
  const t = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  const home = pathname === '/' || pathname === `/${locale}`;
  const [done, setDone] = useState(false);
  // Per-instance SVG ids, so the gradient and clip never collide with others.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (name: string): string => `fcl-${name}-${uid}`;

  // Layout effect, so a remount never paints a frame of the splash. Switching
  // language swaps the [locale] root layout, which remounts this component and
  // rewrites <html>'s class (dropping `fcl-seen`): an already-seen session
  // restores the class and skips the splash.
  useLayoutEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem('fcl-seen') === '1';
    } catch {
      // Storage blocked: treat as unseen.
    }
    if (seen) {
      document.documentElement.classList.add('fcl-seen');
      setDone(true);
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      sessionStorage.setItem('fcl-seen', '1');
    } catch {
      // Storage blocked (private mode): the splash just plays again next time.
    }
    const t = window.setTimeout(() => setDone(true), reduce ? REDUCED_MS : TOTAL_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (done || !home) return null;

  return (
    <>
      <style>{CSS}</style>
      <div
        role="status"
        aria-label={t('loader')}
        className="fcl pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-[#102B43] text-white"
      >
        <div className="fcl-stack flex flex-col items-center gap-5">
          <svg
            className="fcl-mark block h-[93px] w-[99px] overflow-visible"
            viewBox="0 0 791 742"
            aria-hidden="true"
          >
            <defs>
              <clipPath id={id('clip')}>
                <polygon points={F_TOP} />
                <polygon points={F_BOTTOM} />
              </clipPath>
              <linearGradient id={id('shine')}>
                <stop offset="0" stopColor="#fff" stopOpacity="0" />
                <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon className="fcl-p fcl-top" points={F_TOP} fill="currentColor" />
            <polygon className="fcl-p fcl-bottom" points={F_BOTTOM} fill="currentColor" />
            <g clipPath={`url(#${id('clip')})`}>
              <polygon
                className="fcl-shine"
                fill={`url(#${id('shine')})`}
                points="0,0 120,0 -330,742 -450,742"
              />
            </g>
          </svg>

          <div aria-hidden="true" className="overflow-hidden py-1">
            <div className="fcl-word">
              <span className="bg-[url(/logo-dark.webp)]" />
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="fcl-edge pointer-events-none fixed inset-0 z-[101]" />
    </>
  );
}
