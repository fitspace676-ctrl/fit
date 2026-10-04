'use client';

import { useEffect, useId, useState } from 'react';

/**
 * FormaCore splash: the F mark assembles from its four parts, then the
 * wordmark rises in beneath it, holds, and the overlay lifts away to reveal
 * the page. Chosen from three directions by a judged design round.
 *
 * Timeline (ms from first paint):
 *   0-600     blank canvas, so the build is never under way before the
 *             first frames reach the screen on a slow load.
 *   600-1810  the F mark assembles (top bar, upper stem, middle bar, tail),
 *             each part sliding in along its own axis with a light spring,
 *             120ms apart. The mark is centred and 16% larger while it builds.
 *   1600-2160 a thin light glint sweeps across the assembled mark.
 *   1650-2190 the mark settles to its lockup size.
 *   1730-2190 the brand wordmark rises in from a mask.
 *   2190-2410 the full lockup holds.
 *   2410-3010 the logo lifts and fades; the overlay is clipped away upward,
 *             led by a 1px brand-gradient edge with a soft shadow under it.
 *
 * Pure CSS, so it plays from first paint, before hydration. Only transform,
 * opacity and clip-path animate. It plays once per browser session: the head
 * script in `app/layout.tsx` tags <html> with `fcl-seen` on later page loads,
 * which hides it before it paints. With prefers-reduced-motion the finished
 * lockup shows still, then fades.
 */

const TOTAL_MS = 3050;
const REDUCED_MS = 1000;

const SPRING =
  'linear(0, 0.167, 0.34, 0.504, 0.649, 0.77, 0.867, 0.939, 0.991, 1.025, 1.044, 1.054, 1.056, 1.052, 1.046, 1.038, 1.03, 1.023, 1.016, 1.011, 1.006, 1.003, 1, 0.999, 0.998, 0.998, 0.997, 0.998, 0.998, 0.998, 0.999, 0.999, 1)';

const CSS = `
.fcl { clip-path: inset(0 0 0 0); animation: fcl-lift 560ms cubic-bezier(.76,0,.24,1) 2450ms both; }
.fcl-stack { animation: fcl-stack-out 420ms cubic-bezier(.5,0,.75,0) 2410ms both; }
.fcl-mark { animation: fcl-settle 540ms cubic-bezier(.7,0,.2,1) 1650ms both; }
.fcl-p { animation: fcl-in 850ms both; animation-timing-function: cubic-bezier(.2,1.25,.4,1); animation-timing-function: ${SPRING}; }
.fcl-top  { --fx: 76px;  --fy: 0px;   animation-delay: 600ms; }
.fcl-stem { --fx: 40px;  --fy: -70px; animation-delay: 720ms; }
.fcl-mid  { --fx: -84px; --fy: 0px;   animation-delay: 840ms; }
.fcl-tail { --fx: -40px; --fy: 70px;  animation-delay: 960ms; }
.fcl-shine { animation: fcl-shine 560ms cubic-bezier(.4,0,.2,1) 1600ms both; }
.fcl-word { animation: fcl-rise 460ms cubic-bezier(.2,.8,.2,1) 1730ms both; }
/* The "FormaCore" line of the brand lockup PNG (x 339-999, y 195-306 of 1024x500). */
.fcl-word span { display: block; width: 200px; height: 34px; background-repeat: no-repeat; background-size: 310px auto; background-position: -103px -59px; }
html.fcl-seen .fcl, html.fcl-seen .fcl-edge { display: none; }
.fcl-edge { animation: fcl-edge 560ms cubic-bezier(.76,0,.24,1) 2450ms both; }
.fcl-edge::before {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
  background: linear-gradient(90deg, transparent, #22B8E6 25%, #1A7FD6 50%, #2557EB 75%, transparent);
}
.fcl-edge::after {
  content: ""; position: absolute; left: 0; right: 0; top: 100%; height: 56px;
  background: linear-gradient(to bottom, rgba(12,31,69,.07), rgba(12,31,69,0));
}
.dark .fcl-edge::after { background: linear-gradient(to bottom, rgba(0,0,0,.45), rgba(0,0,0,0)); }

@keyframes fcl-in {
  0%   { transform: translate(var(--fx), var(--fy)); opacity: 0; }
  30%  { opacity: 1; }
  100% { transform: translate(0, 0); opacity: 1; }
}
@keyframes fcl-settle { from { transform: translateY(29px) scale(1.16); } to { transform: translateY(0) scale(1); } }
@keyframes fcl-shine { from { transform: translateX(-40px); } to { transform: translateX(330px); } }
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
@media (prefers-reduced-motion: reduce) {
  .fcl-stack, .fcl-mark, .fcl-p, .fcl-shine, .fcl-word { animation: none; }
  .fcl-shine, .fcl-edge { display: none; }
  .fcl { animation: fcl-fade 240ms linear 700ms both; }
}
`;

// Geometry traced from the 256px FormaCore icon (user units).
const TOP = '79.5,15 229.5,15 199.6,67 49.6,67';
const STEM = '52.5,62 110.4,62 85.65,105 27.75,105'; // tucks 5u under the top bar so no seam shows
const MID = '88,105 211,105 181.1,157 58.1,157';
const TAIL = '59.8,154 127.1,154 80,240.5 46.5,178.5'; // tucks 3u under the middle bar

export function SiteLoader() {
  const [done, setDone] = useState(false);
  // Per-instance SVG ids, so the gradients and clip never collide with others.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (name: string): string => `fcl-${name}-${uid}`;

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      sessionStorage.setItem('fcl-seen', '1');
    } catch {
      // Storage blocked (private mode): the splash just plays again next time.
    }
    const t = window.setTimeout(() => setDone(true), reduce ? REDUCED_MS : TOTAL_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (done) return null;

  return (
    <>
      <style>{CSS}</style>
      <div
        role="status"
        aria-label="Loading FormaCore"
        className="fcl pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-[#F7F8FB] text-[#0C1F45] dark:bg-[#070810] dark:text-white"
      >
        <div className="fcl-stack flex flex-col items-center gap-5">
          <svg
            className="fcl-mark block h-[97px] w-[88px] overflow-visible"
            viewBox="22 10 214 236"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id={id('g-top')}
                gradientUnits="userSpaceOnUse"
                x1="30"
                y1="105"
                x2="229"
                y2="15"
              >
                <stop offset="0" stopColor="#1BB8E0" />
                <stop offset=".5" stopColor="#278CFF" />
                <stop offset="1" stopColor="#244CEF" />
              </linearGradient>
              <linearGradient
                id={id('g-mid')}
                gradientUnits="userSpaceOnUse"
                x1="58"
                y1="157"
                x2="211"
                y2="105"
              >
                <stop offset="0" stopColor="#31C0E8" />
                <stop offset=".45" stopColor="#2AA6F2" />
                <stop offset="1" stopColor="#2678F4" />
              </linearGradient>
              <linearGradient
                id={id('g-tail')}
                gradientUnits="userSpaceOnUse"
                x1="52"
                y1="160"
                x2="96"
                y2="238"
              >
                <stop offset="0" stopColor="#2784F1" />
                <stop offset="1" stopColor="#2350E8" />
              </linearGradient>
              <linearGradient id={id('g-shine')} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#fff" stopOpacity="0" />
                <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <clipPath id={id('clip')}>
                <polygon points={TOP} />
                <polygon points={STEM} />
                <polygon points={MID} />
                <polygon points={TAIL} />
              </clipPath>
            </defs>
            {/* Painted back to front so the tucked overlaps hide under the next part. */}
            <polygon className="fcl-p fcl-tail" fill={`url(#${id('g-tail')})`} points={TAIL} />
            <polygon className="fcl-p fcl-mid" fill={`url(#${id('g-mid')})`} points={MID} />
            <polygon className="fcl-p fcl-stem" fill={`url(#${id('g-top')})`} points={STEM} />
            <polygon className="fcl-p fcl-top" fill={`url(#${id('g-top')})`} points={TOP} />
            <g clipPath={`url(#${id('clip')})`}>
              <polygon
                className="fcl-shine"
                fill={`url(#${id('g-shine')})`}
                points="0,0 38,0 -112,262 -150,262"
              />
            </g>
          </svg>

          <div aria-hidden="true" className="overflow-hidden py-1">
            <div className="fcl-word">
              <span className="bg-[url(/FormaCore-light.png)] dark:bg-[url(/FormaCore-dark.png)]" />
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="fcl-edge pointer-events-none fixed inset-0 z-[101]" />
    </>
  );
}
