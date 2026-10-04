'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { TOUR_SCENES, type TourScene } from '@/data/product-tour';
import { cn } from '@/lib/utils';
import { useActiveTheme, usePrefersReducedMotion } from './hero-devices';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore - product tour
   One deep-blue card: a recording of the product in the middle (the console in
   a browser window, the portal on a phone), the scene's title and copy under
   it, and pill tabs along the bottom. The active pill fills a ring as its clip
   plays and the tour moves on when the clip ends.

   Cheap by construction: no clip is fetched until the card is close to the
   viewport, only the active scene holds a <video> (the rest show posters), and
   the clip pauses while the card is off screen. With reduced motion every
   scene is its poster and the tabs only change on a click.
   ──────────────────────────────────────────────────────────────────────── */

const RING = 2 * Math.PI * 9;

/**
 * Light and dark poster, swapped by the `.dark` class so the first paint is right.
 * Lazy, so neither loads until the tour nears the viewport, and the hidden theme's
 * (`display: none`) is not fetched at all.
 */
function Poster({ clip, className }: { clip: string; className: string }) {
  return (
    <>
      <img
        src={`/tour/${clip}-light.jpg`}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        className={cn(className, 'dark:hidden')}
      />
      <img
        src={`/tour/${clip}-dark.jpg`}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        className={cn(className, 'hidden dark:block')}
      />
    </>
  );
}

function Clip({
  scene,
  playing,
  onProgress,
  onEnded,
  videoRef,
}: {
  scene: TourScene;
  playing: boolean;
  onProgress: (fraction: number) => void;
  onEnded: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const theme = useActiveTheme();
  const media = 'absolute inset-0 h-full w-full object-cover object-top';
  if (!playing || !theme) return <Poster clip={scene.clip} className={media} />;
  const src = `/tour/${scene.clip}-${theme}`;
  return (
    <video
      key={src}
      ref={videoRef}
      className={media}
      poster={`${src}.jpg`}
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-hidden
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (v.duration) onProgress(v.currentTime / v.duration);
      }}
      onEnded={onEnded}
    >
      <source src={`${src}.webm`} type="video/webm" />
      <source src={`${src}.mp4`} type="video/mp4" />
    </video>
  );
}

function BrowserFrame({ scene, children }: { scene: TourScene; children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full overflow-hidden rounded-xl bg-[#0b1630] shadow-[0_40px_90px_-30px_rgba(2,11,46,0.85)] ring-1 ring-white/20">
      <div className="flex h-9 items-center gap-3 border-b border-white/10 bg-white/[0.08] px-4 backdrop-blur">
        {/* macOS traffic lights: close, minimise, zoom */}
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57] ring-1 ring-inset ring-black/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E] ring-1 ring-inset ring-black/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840] ring-1 ring-inset ring-black/15" />
        </span>
        <span className="mx-auto truncate rounded-md bg-white/10 px-3 py-0.5 font-mono text-[11px] text-white/70">
          {scene.url}
        </span>
        <span className="w-10" />
      </div>
      <div className="relative aspect-[16/10]">{children}</div>
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto h-full">
      <div className="relative h-full rounded-[13%/6%] bg-gradient-to-br from-[#3a3f47] via-[#15171b] to-[#2c3037] p-[2.5%] shadow-[0_40px_90px_-30px_rgba(2,11,46,0.85)] ring-1 ring-inset ring-white/20">
        <div className="relative aspect-[390/844] h-full overflow-hidden rounded-[11%/5%] bg-black">
          {children}
          <span className="absolute left-1/2 top-[1.2%] h-[3%] w-[30%] -translate-x-1/2 rounded-full bg-black" />
        </div>
      </div>
    </div>
  );
}

export function ProductTour() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabListRef = useRef<HTMLDivElement>(null);

  // Fetch clips only once the card is close, play only while it is on screen.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      setInView(true);
      return;
    }
    const nearby = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), {
      rootMargin: '400px 0px',
    });
    const visible = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting)), {
      threshold: 0.25,
    });
    nearby.observe(el);
    visible.observe(el);
    return () => {
      nearby.disconnect();
      visible.disconnect();
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // `play()` returns a promise in current browsers but not in every engine.
    if (inView) void Promise.resolve(v.play()).catch(() => {});
    else v.pause();
  }, [inView, active]);

  // On phones the tabs are one row that scrolls sideways and the last ones sit
  // off screen. Each time the tour moves on, slide that row (never the page) so
  // the active tab is centred and the next one peeks in, which shows there is
  // more to come. Where the row wraps instead (sm and up) there is nothing to do.
  useEffect(() => {
    const row = tabListRef.current;
    const tab = tabRefs.current[active];
    if (!row || !tab || row.scrollWidth <= row.clientWidth + 1) return;
    const rowBox = row.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    const left = row.scrollLeft + tabBox.left - rowBox.left - (row.clientWidth - tabBox.width) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [active, reducedMotion]);

  const select = useCallback((index: number) => {
    setActive((index + TOUR_SCENES.length) % TOUR_SCENES.length);
    setProgress(0);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (active + step + TOUR_SCENES.length) % TOUR_SCENES.length;
    select(next);
    tabRefs.current[next]?.focus();
  };

  const playing = near && !reducedMotion;
  const scene = TOUR_SCENES[active]!;

  return (
    <section
      ref={sectionRef}
      aria-label="Product tour"
      className="relative z-10 mx-auto max-w-[1400px] px-3 pb-24 sm:px-6"
    >
      <div className="relative isolate overflow-hidden rounded-[2rem] px-5 pb-8 pt-8 text-white sm:px-10 sm:pt-12 lg:px-16">
        <AuroraBackground tone="deep" fade={false} />

        {/* the product, one stage per scene. The stage is the browser window's
            size (a 36px bar over a 16:10 screen), so the card keeps one height
            whichever scene is showing and the copy always sits below it. */}
        <div className="relative mx-auto max-w-[1040px]">
          <div aria-hidden className="invisible">
            <div className="h-9" />
            <div className="aspect-[16/10]" />
          </div>
          {TOUR_SCENES.map((s, i) => {
            const shown = i === active;
            const clip = (
              <Clip
                scene={s}
                playing={playing && shown}
                onProgress={setProgress}
                onEnded={() => select(active + 1)}
                videoRef={videoRef}
              />
            );
            return (
              <div
                key={s.id}
                id={`tour-panel-${s.id}`}
                role="tabpanel"
                aria-labelledby={`tour-tab-${s.id}`}
                hidden={!shown}
                className={cn(
                  'absolute inset-0 items-start justify-center',
                  shown
                    ? 'flex motion-safe:animate-[tour-in_0.6s_cubic-bezier(0.22,1,0.36,1)_both]'
                    : 'hidden',
                )}
              >
                {s.frame === 'browser' ? (
                  <BrowserFrame scene={s}>{clip}</BrowserFrame>
                ) : (
                  <PhoneFrame>{clip}</PhoneFrame>
                )}
              </div>
            );
          })}
        </div>

        {/* the scene's words */}
        <div className="mt-8 grid gap-4 md:grid-cols-2 md:gap-10">
          <h3 className="font-display text-3xl font-black leading-[1.05] tracking-tight sm:text-4xl">
            {scene.title}
          </h3>
          <p className="text-base leading-relaxed text-white/80 sm:text-lg">{scene.body}</p>
        </div>

        {/* the tabs */}
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="Product tour"
          onKeyDown={onKeyDown}
          className="-mx-5 mt-8 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {TOUR_SCENES.map((s, i) => {
            const selected = i === active;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`tour-tab-${s.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`tour-panel-${s.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(i)}
                className={cn(
                  'inline-flex h-12 shrink-0 items-center gap-2.5 rounded-pill px-5 text-sm font-semibold outline-none transition focus-visible:ring-4 focus-visible:ring-white/40',
                  selected
                    ? 'bg-white text-brand-900 shadow-[0_10px_30px_-10px_rgba(2,11,46,0.7)]'
                    : 'bg-white/[0.08] text-white/85 ring-1 ring-inset ring-white/25 hover:bg-white/15',
                )}
              >
                {selected && (
                  <svg viewBox="0 0 24 24" className="-ml-1 h-5 w-5 -rotate-90" aria-hidden>
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      strokeWidth="3"
                      className="stroke-brand-100"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      strokeWidth="3"
                      strokeLinecap="round"
                      className="stroke-brand-600"
                      strokeDasharray={RING}
                      strokeDashoffset={RING * (1 - (playing ? progress : 1))}
                    />
                  </svg>
                )}
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
