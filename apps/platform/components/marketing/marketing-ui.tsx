'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore — shared marketing primitives  ·  "Aurora Glass"
   The icon set, buttons, eyebrow, theme toggle, aurora backdrop and the
   nav / footer chrome that every marketing surface (homepage, pricing, …)
   reuses so the design stays identical across pages. The homepage and the
   pricing page both compose these — change the chrome once, here.
   ──────────────────────────────────────────────────────────────────────── */

/** Where every "start / trial" button sends the visitor. */
export const SIGNUP_HREF = '/register-gym';
/** Secondary "Book a demo" / "Talk to sales" destination. */
export const DEMO_HREF = 'mailto:hello@formacore.io';

export const I = {
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M20 6 9 17l-5-5',
  members:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  calendar:
    'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  qr: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 4h3m-3 3h7v-7h-4v4Z',
  pos: 'M3 6h18M3 6l1.5 12.5a2 2 0 0 0 2 1.5h11a2 2 0 0 0 2-1.5L21 6M9 10v6M15 10v6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18h2',
  flame: 'M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3 0 1 1 2 2 2 0-3 2-5 2-8Z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 7v5l3 2',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  globe:
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  x: 'M6 6l12 12M18 6 6 18',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2ZM8 11V7a4 4 0 0 1 8 0v4',
  plug: 'M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v5',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  layers: 'M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5',
  card: 'M2 7h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Zm0 4h20M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2',
  ticket:
    'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8ZM13 6v12',
  store: 'M3 9 4.5 4h15L21 9M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M3 9h18M9 20v-5h6v5',
  grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  box: 'M21 8 12 3 3 8m18 0-9 5-9-5m18 0v8l-9 5-9-5V8m9 5v8',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
  star: 'M12 2l2.9 6.1 6.6.9-4.8 4.7 1.2 6.6L12 17.6 6.1 20.3l1.2-6.6L2.5 9l6.6-.9L12 2Z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  minus: 'M5 12h14',
  chevron: 'M6 9l6 6 6-6',
} satisfies Record<string, string>;

export const Icon = ({ d, c = 'w-5 h-5', sw = 2 }: { d: string; c?: string; sw?: number }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={c}
  >
    {d.split(' M').map((seg, i) => (
      <path key={i} d={i === 0 ? seg : 'M' + seg} />
    ))}
  </svg>
);

type BtnVariant = 'primary' | 'white' | 'glass';
type BtnSize = 'sm' | 'md' | 'lg';

export const Btn = ({
  children,
  v = 'primary',
  size = 'md',
  icon,
  full,
  href,
  onClick,
  type = 'button',
  ripple = false,
  rippleColor = '#6257E3',
}: {
  children: ReactNode;
  v?: BtnVariant;
  size?: BtnSize;
  icon?: string;
  full?: boolean;
  href?: string;
  /** Click handler. Renders a <button> when no `href` is given. */
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void;
  /** Native button type (only used when rendering a <button>). */
  type?: 'button' | 'submit' | 'reset';
  /** Spawn a Material-style ripple from the click point. */
  ripple?: boolean;
  /** Ripple fill colour (defaults to brand-500). */
  rippleColor?: string;
}) => {
  const sizes: Record<BtnSize, string> = {
    sm: 'h-9 px-3.5 text-sm gap-1.5',
    md: 'h-11 px-5 text-sm gap-2',
    lg: 'px-7 text-[15px] gap-2',
  };
  const vs: Record<BtnVariant, string> = {
    primary:
      'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white hover:brightness-110 active:brightness-95 shadow-[0_8px_30px_-6px_rgba(124,58,237,0.7)] focus-visible:ring-brand-500/40',
    white: 'bg-fg text-surface hover:opacity-90 active:opacity-80 focus-visible:ring-overlay/40',
    glass:
      'bg-overlay/[0.07] text-fg border border-overlay/15 backdrop-blur hover:bg-overlay/[0.13] active:bg-overlay/[0.18] focus-visible:ring-overlay/30',
  };
  const className = `relative inline-flex items-center justify-center font-semibold rounded-btn transition-all outline-none focus-visible:ring-4 ${ripple ? 'overflow-hidden' : ''} ${full ? 'w-full' : ''} ${sizes[size]} ${vs[v]}`;
  const style: CSSProperties | undefined = size === 'lg' ? { height: '3.25rem' } : undefined;

  const [ripples, setRipples] = useState<{ x: number; y: number; size: number; key: number }[]>([]);
  const rippleId = useRef(0);
  const spawnRipple = (e: ReactMouseEvent<HTMLElement>): void => {
    if (!ripple) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const diameter = Math.max(rect.width, rect.height);
    const next = {
      x: e.clientX - rect.left - diameter / 2,
      y: e.clientY - rect.top - diameter / 2,
      size: diameter,
      key: rippleId.current++,
    };
    setRipples((prev) => [...prev, next]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.key !== next.key));
    }, 600);
  };
  const handleClick = (e: ReactMouseEvent<HTMLElement>): void => {
    spawnRipple(e);
    onClick?.(e);
  };

  const inner = (
    <>
      {icon && <Icon d={icon} c="w-[18px] h-[18px]" sw={2} />}
      {children}
      {ripple && (
        <span className="pointer-events-none absolute inset-0">
          {ripples.map((r) => (
            <span
              key={r.key}
              className="absolute rounded-full"
              style={{
                left: r.x,
                top: r.y,
                width: r.size,
                height: r.size,
                backgroundColor: rippleColor,
                transform: 'scale(0)',
                opacity: 0.5,
                animation: 'btn-ripple 600ms ease-out forwards',
              }}
            />
          ))}
        </span>
      )}
    </>
  );

  if (href?.startsWith('/')) {
    return (
      <Link href={href} className={className} style={style} onClick={handleClick}>
        {inner}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={className} style={style} onClick={handleClick}>
        {inner}
      </a>
    );
  }
  return (
    <button type={type} className={className} style={style} onClick={handleClick}>
      {inner}
    </button>
  );
};

export const Eyebrow = ({ children, icon = I.spark }: { children: ReactNode; icon?: string }) => (
  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-overlay/[0.06] border border-overlay/10 text-[11px] font-mono uppercase tracking-[0.22em] text-muted">
    <Icon d={icon} c="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" sw={2} />
    {children}
  </span>
);

/**
 * Light/dark switch. Reads the current theme from the `.dark` class the inline
 * head script already set (so there's no flash), and on click flips the class
 * and persists the choice. Renders a stable icon until mounted to avoid a
 * hydration mismatch.
 */
export const ThemeToggle = ({ className = '' }: { className?: string }) => {
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = (): void => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      try {
        localStorage.setItem('theme', next ? 'dark' : 'light');
      } catch {
        // Ignore storage failures (private mode); the class still flips.
      }
      return next;
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className={`w-10 h-10 grid place-items-center rounded-btn text-strong hover:text-fg hover:bg-overlay/5 transition ${className}`}
    >
      <Icon d={mounted && !dark ? I.moon : I.sun} c="w-5 h-5" />
    </button>
  );
};

/**
 * FormaCore wordmark lockup. The `public/logolight.png` (dark wordmark) and
 * `public/logodark.png` (light wordmark) variants are both rendered and toggled
 * by the `.dark` class via CSS, so the right one shows before first paint with
 * no JS / hydration flash. Pass a height utility (`h-8`, `h-10`, …); width is
 * derived from the 1024×500 intrinsic ratio.
 */
export const Logo = ({ className = 'h-10' }: { className?: string }) => (
  <>
    <img
      src="/logolight.png"
      alt="FormaCore"
      width={1024}
      height={500}
      className={`${className} w-auto dark:hidden`}
    />
    <img
      src="/logodark.png"
      alt="FormaCore"
      width={1024}
      height={500}
      className={`${className} w-auto hidden dark:block`}
    />
  </>
);

/** The shared "Aurora Glass" backdrop — three blurred colour fields behind every page. */
export const Aurora = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden">
    <div className="absolute -top-48 -left-24 w-[680px] h-[680px] rounded-full bg-brand-600/[0.22] blur-[150px]" />
    <div className="absolute -top-24 right-0 w-[560px] h-[560px] rounded-full bg-iris-500/20 blur-[160px]" />
    <div className="absolute top-[50%] -left-40 w-[560px] h-[560px] rounded-full bg-accent-600/[0.16] blur-[160px]" />
  </div>
);

/**
 * Top-level marketing nav items. "Pricing" routes to its own page; the rest are
 * in-page anchors on the homepage that stay inert on other surfaces, faithful to
 * the design. `active` highlights the item for the current page.
 */
const NAV_ITEMS = ['Core', 'For whom', 'Pricing', 'Resources'] as const;
type NavItem = (typeof NAV_ITEMS)[number];

// Mobile bottom dock — navigation icons + CTAs, fixed to the bottom of the
// viewport on small screens (hidden from `lg` up, where the top nav shows).
const DOCK_NAV: { label: NavItem; icon: string; href: string }[] = [
  { label: 'Core', icon: I.layers, href: '#' },
  { label: 'For whom', icon: I.members, href: '#' },
  { label: 'Pricing', icon: I.card, href: '/pricing' },
  { label: 'Resources', icon: I.box, href: '#' },
];

export const MobileDock = ({ active }: { active?: NavItem }) => (
  <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.625rem)] lg:hidden">
    <div className="mx-auto max-w-md rounded-2xl border border-overlay/10 bg-surface/85 p-2 shadow-[0_10px_40px_-8px_rgba(8,9,16,0.35)] backdrop-blur-xl backdrop-saturate-150">
      <nav className="flex items-stretch gap-1">
        {DOCK_NAV.map((it) => {
          const cls = `flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-semibold transition ${
            it.label === active ? 'text-fg bg-overlay/[0.07]' : 'text-muted hover:text-fg'
          }`;
          return it.href.startsWith('/') ? (
            <Link key={it.label} href={it.href} className={cls}>
              <Icon d={it.icon} c="w-5 h-5" />
              {it.label}
            </Link>
          ) : (
            <a key={it.label} href={it.href} onClick={(e) => e.preventDefault()} className={cls}>
              <Icon d={it.icon} c="w-5 h-5" />
              {it.label}
            </a>
          );
        })}
      </nav>
      <div className="mt-1.5 flex gap-2">
        <Btn v="primary" size="md" full icon={I.arrow} href={SIGNUP_HREF}>
          Start free
        </Btn>
        <Btn v="glass" size="md" href={DEMO_HREF}>
          Demo
        </Btn>
      </div>
    </div>
  </div>
);

export const MarketingNav = ({
  active,
  overlay = false,
}: {
  active?: NavItem;
  overlay?: boolean;
}) => {
  const [menu, setMenu] = useState(false);

  // Lock background scroll while the mobile drawer is open.
  useEffect(() => {
    if (!menu) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menu]);

  const desktopClass = (n: NavItem): string =>
    `px-3.5 h-9 inline-flex items-center rounded-btn text-sm font-semibold transition ${n === active ? 'text-fg bg-overlay/[0.07]' : 'text-muted hover:text-fg hover:bg-overlay/5'}`;

  const renderItem = (n: NavItem, className: string): ReactNode =>
    n === 'Pricing' ? (
      <Link key={n} href="/pricing" className={className}>
        {n}
      </Link>
    ) : (
      <a key={n} href="#" onClick={(e) => e.preventDefault()} className={className}>
        {n}
      </a>
    );

  // Mobile drawer links carry the animated underline (wipes in from the left on
  // hover / press), with the active item highlighted.
  const drawerLinkCls = (n: NavItem): string =>
    `relative inline-flex w-fit items-center py-1 text-2xl font-semibold uppercase tracking-tight transition-colors after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:origin-bottom-right after:scale-x-0 after:bg-fg after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.65,0.05,0.36,1)] hover:after:origin-bottom-left hover:after:scale-x-100 ${n === active ? 'text-fg' : 'text-strong hover:text-fg'}`;

  const renderDrawerItem = (n: NavItem): ReactNode =>
    n === 'Pricing' ? (
      <Link key={n} href="/pricing" className={drawerLinkCls(n)} onClick={() => setMenu(false)}>
        {n}
      </Link>
    ) : (
      <a
        key={n}
        href="#"
        onClick={(e) => {
          e.preventDefault();
          setMenu(false);
        }}
        className={drawerLinkCls(n)}
      >
        {n}
      </a>
    );

  return (
    <>
      <header
        className={
          overlay
            ? // Glass overlay: sits on top of the hero so the section shows through
              // the frosted bar instead of reading as a separate solid strip.
              'absolute inset-x-0 top-0 z-30 bg-surface/5 backdrop-blur-md backdrop-saturate-150 border-b border-overlay/5'
            : 'relative z-30'
        }
      >
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10">
          <div className="flex items-center gap-3 h-24">
            <Link href="/" className="flex items-center shrink-0" aria-label="FormaCore home">
              <Logo className="h-20" />
            </Link>
            <nav className="hidden lg:flex items-center gap-1 ml-6">
              {NAV_ITEMS.map((n) => renderItem(n, desktopClass(n)))}
            </nav>
            <div className="ml-auto hidden sm:flex items-center gap-2">
              <AnimatedThemeToggler variant="square" />
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="px-3.5 h-10 inline-flex items-center rounded-btn text-sm font-semibold text-strong hover:text-fg hover:bg-overlay/5 transition"
              >
                Sign in
              </a>
              <Btn v="white" size="md" icon={I.arrow} href={SIGNUP_HREF}>
                Start free
              </Btn>
            </div>
            <div className="ml-auto flex items-center gap-1 sm:hidden">
              <AnimatedThemeToggler variant="square" />
              <button
                type="button"
                onClick={() => setMenu((value) => !value)}
                className="w-10 h-10 grid place-items-center rounded-btn text-fg hover:bg-overlay/5"
              >
                <Icon d={menu ? I.x : I.menu} c="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* mobile bottom-sheet drawer — slides up from the bottom with a grabber */}
      <div
        className={`sm:hidden fixed inset-0 z-50 ${menu ? '' : 'pointer-events-none'}`}
        aria-hidden={!menu}
      >
        {/* backdrop */}
        <div
          onClick={() => setMenu(false)}
          className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${menu ? 'opacity-100' : 'opacity-0'}`}
        />
        {/* sheet */}
        <div
          role="dialog"
          aria-modal="true"
          className={`absolute inset-x-0 bottom-0 rounded-t-[1.75rem] border-t border-overlay/15 bg-surface/95 backdrop-blur-xl shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.55)] transition-transform duration-300 ease-out ${menu ? 'translate-y-0' : 'translate-y-full'}`}
        >
          {/* grabber */}
          <div className="flex justify-center pt-3">
            <span className="h-1.5 w-12 rounded-full bg-overlay/25" />
          </div>
          <div className="flex items-center justify-between px-6 pt-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              Menu
            </span>
            <button
              type="button"
              onClick={() => setMenu(false)}
              aria-label="Close menu"
              className="w-9 h-9 grid place-items-center rounded-btn text-fg hover:bg-overlay/5"
            >
              <Icon d={I.x} c="w-5 h-5" />
            </button>
          </div>
          <nav className="px-6 pt-4">
            <ul className="space-y-4">
              {NAV_ITEMS.map((n) => (
                <li key={n}>{renderDrawerItem(n)}</li>
              ))}
            </ul>
          </nav>
          <div className="px-6 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            <Btn v="primary" size="md" full icon={I.arrow} href={SIGNUP_HREF}>
              Start free
            </Btn>
          </div>
        </div>
      </div>

      <MobileDock active={active} />
    </>
  );
};

export const MarketingFooter = () => (
  <footer className="relative z-10 border-t border-overlay/10">
    <div className="max-w-[1180px] mx-auto px-6 lg:px-10 pt-10 pb-44 lg:pb-10 flex flex-col sm:flex-row items-center justify-between gap-4">
      <Link href="/" className="flex items-center" aria-label="FormaCore home">
        <Logo className="h-16" />
      </Link>
      <span className="font-mono text-xs text-subtle">
        © 2026 FormaCore · Tbilisi, Georgia · ₾ GEL
      </span>
      <div className="flex items-center gap-5 text-xs text-subtle">
        <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-muted">
          Core
        </a>
        <Link href="/pricing" className="hover:text-muted">
          Pricing
        </Link>
        <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-muted">
          Privacy
        </a>
      </div>
    </div>
  </footer>
);
