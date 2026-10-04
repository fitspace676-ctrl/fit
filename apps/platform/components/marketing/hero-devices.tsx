'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

/**
 * The hero's product showcase: a laptop running the staff console and a phone
 * running the member portal, standing side by side. Each screen is a real
 * screen recording of the app (`public/hero/*.mp4`, captured from a seeded
 * demo gym), in the variant that matches the page theme.
 *
 * The landing renders one hero per theme and hides the other with `dark:`
 * classes, so each instance is told which theme it belongs to. Both copies keep
 * their `<video>` mounted and only the active theme's plays (the hidden one
 * loads metadata only), so switching themes resumes a ready element instead of
 * mounting and loading a new one. Visitors who prefer reduced motion get the
 * posters instead.
 *
 * The entrance animation plays on load and again on every theme switch: a
 * `display: none` section restarts its CSS animations when it is shown. That
 * replay is smooth only because the videos above stay mounted.
 */

function subscribeToThemeClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

/** The theme the `.dark` class on `<html>` currently names, or null before hydration. */
export function useActiveTheme(): Theme | null {
  return useSyncExternalStore(
    subscribeToThemeClass,
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
    () => null,
  );
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

function Screen({
  name,
  theme,
  play,
  still,
}: {
  name: 'admin' | 'member';
  theme: Theme;
  play: boolean;
  still: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const src = `/hero/${name}-${theme}`;
  const className = 'absolute inset-0 h-full w-full object-cover object-top';

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (play) void video.play().catch(() => {});
    else video.pause();
  }, [play]);

  if (still) return <img src={`${src}.webp`} alt="" draggable={false} className={className} />;
  return (
    <video
      ref={ref}
      className={className}
      src={`${src}.mp4`}
      poster={`${src}.webp`}
      muted
      loop
      playsInline
      preload={play ? 'auto' : 'metadata'}
      aria-hidden
    />
  );
}

export function HeroDevices({ theme }: { theme: Theme }) {
  const active = useActiveTheme();
  const reducedMotion = usePrefersReducedMotion();
  const play = active === theme && !reducedMotion;

  return (
    <div
      role="img"
      aria-label="The FormaCore staff console on a laptop and the member portal on a phone"
      className="relative select-none pb-[3%]"
    >
      {/* laptop: the staff console. It rises in and its lid opens. */}
      <div className="relative ml-[13%] w-[87%] motion-safe:animate-[hero-laptop-in_0.9s_cubic-bezier(0.22,1,0.36,1)_0.1s_both]">
        <div className="relative origin-bottom rounded-[2.4%/3.6%] motion-safe:animate-[hero-lid-open_1.2s_cubic-bezier(0.22,1,0.36,1)_0.25s_both] bg-gradient-to-b from-[#2b2e34] to-[#0f1114] p-[1.4%] shadow-[0_30px_60px_-20px_rgba(2,10,40,0.55)] ring-1 ring-inset ring-white/15">
          <div className="absolute left-1/2 top-0 z-10 h-[2.6%] w-[15%] -translate-x-1/2 rounded-b-[8px] bg-[#0f1114]" />
          <div className="relative aspect-[16/10] overflow-hidden rounded-[1.2%/1.9%] bg-black">
            <Screen name="admin" theme={theme} play={play} still={reducedMotion} />
          </div>
        </div>
        <div className="h-[0.9%] min-h-[4px] w-full bg-gradient-to-b from-[#3a3e45] to-[#8a9099]" />
        <div className="relative -mx-[7%] h-[2.6%] min-h-[10px] rounded-b-[18px] rounded-t-[2px] bg-gradient-to-b from-[#eceef1] via-[#c9ced6] to-[#9aa1ab] shadow-[0_24px_30px_-12px_rgba(2,10,40,0.5)]">
          <div className="absolute left-1/2 top-0 h-[45%] w-[15%] -translate-x-1/2 rounded-b-[8px] bg-gradient-to-b from-[#b9bfc8] to-[#d7dbe1]" />
        </div>
      </div>

      {/* phone: the member portal, standing in front of the laptop's left edge.
          It slides up once the lid is open. */}
      <div className="absolute bottom-0 left-0 z-10 w-[19%] motion-safe:animate-[hero-phone-in_0.9s_cubic-bezier(0.34,1.4,0.64,1)_1s_both]">
        <div className="relative rounded-[17%/8%] bg-gradient-to-br from-[#3a3f47] via-[#15171b] to-[#2c3037] p-[3.4%] shadow-[0_30px_50px_-14px_rgba(2,10,40,0.6),-18px_10px_40px_-10px_rgba(2,10,40,0.35)] ring-1 ring-inset ring-white/20">
          {/* The recording is the bare 390x844 viewport, so a status bar in the
              portal's own page colour sits above it rather than over its header. */}
          <div
            className={`relative flex aspect-[390/891] flex-col overflow-hidden rounded-[14%/6.5%] ${
              theme === 'dark' ? 'bg-[#131311] text-white' : 'bg-[#eeeeec] text-[#0f1b2d]'
            }`}
          >
            <div className="relative h-[5.3%] shrink-0">
              <span className="absolute left-[11%] top-1/2 -translate-y-1/2 text-[clamp(5px,0.55vw,9px)] font-semibold">
                9:41
              </span>
              <div className="absolute left-1/2 top-[22%] h-[62%] w-[30%] -translate-x-1/2 rounded-full bg-black" />
              <div className="absolute right-[9%] top-1/2 flex h-[34%] -translate-y-1/2 items-end gap-[2px]">
                {[40, 60, 80, 100].map((h) => (
                  <span
                    key={h}
                    className="w-[2px] rounded-[1px] bg-current"
                    style={{ height: `${h}%` }}
                  />
                ))}
                <span className="ml-[3px] h-full w-[12px] rounded-[2px] border border-current/50 p-[1px]">
                  <span className="block h-full w-3/4 rounded-[1px] bg-current" />
                </span>
              </div>
            </div>
            <div className="relative flex-1">
              <Screen name="member" theme={theme} play={play} still={reducedMotion} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
