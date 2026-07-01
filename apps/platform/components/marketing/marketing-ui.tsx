'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { BUILT_FOR } from '@/data/built-for';
import { I, Icon } from './icons';
import { HeaderSearch } from './header-search';

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

// `I` (icon path dictionary) and `Icon` (renderer) now live in `./icons` so plain
// data modules can use them without importing this client chrome. Re-exported
// here to keep existing `import { I, Icon } from './marketing-ui'` call sites working.
export { I, Icon };

type BtnVariant = 'primary' | 'white' | 'glass' | 'glassGradient';
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
    // Glass at rest, but morphs into the primary gradient on hover.
    glassGradient:
      'bg-overlay/[0.07] text-fg border border-overlay/15 backdrop-blur hover:bg-[linear-gradient(135deg,#7C3AED,#EC4899)] hover:text-white hover:border-transparent hover:shadow-[0_8px_30px_-6px_rgba(124,58,237,0.7)] active:brightness-95 focus-visible:ring-brand-500/40',
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
const NAV_ITEMS = ['Core', 'Built For', 'Pricing', 'Resources'] as const;
type NavItem = (typeof NAV_ITEMS)[number];

// Mobile bottom dock — navigation icons + CTAs, fixed to the bottom of the
// viewport on small screens (hidden from `lg` up, where the top nav shows).
const DOCK_NAV: { label: NavItem; icon: string; href: string }[] = [
  { label: 'Core', icon: I.layers, href: '/' },
  { label: 'Built For', icon: I.members, href: '#' },
  { label: 'Pricing', icon: I.card, href: '/pricing' },
  { label: 'Resources', icon: I.box, href: '#' },
];

export const MobileDock = ({ active }: { active?: NavItem }) => {
  // Hidden at the top of the page; slides up once the header has scrolled away.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const header = document.querySelector('header');
    const threshold = header ? header.offsetHeight : 96;
    const onScroll = (): void => setShown(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.625rem)] transition-all duration-500 ease-out lg:hidden ${
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-[120%] opacity-0'
      }`}
    >
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
};

/**
 * Desktop "Built For" nav item — the label links to the /built-for hub, and
 * hovering (or keyboard-focusing) reveals a glass dropdown of every audience,
 * each linking to its dedicated /built-for/<slug> page. Pure CSS visibility via
 * `group-hover` / `group-focus-within`; the `pt-2` on the panel keeps the hover
 * bridge intact so the menu doesn't vanish as the pointer crosses the gap.
 */
const BuiltForNavItem = ({ className }: { className: string }) => (
  <div className="group relative">
    <button type="button" className={className} aria-haspopup="true">
      Built For
      <Icon
        d={I.chevron}
        c="ml-0.5 h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180"
      />
    </button>
    <div className="invisible absolute left-0 top-full z-40 -translate-y-1 pt-2 opacity-0 transition-all duration-200 ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
      <div className="w-[460px] rounded-2xl border border-overlay/10 bg-surface/95 p-2 shadow-[0_24px_70px_-24px_rgba(8,9,16,0.5)] backdrop-blur-xl backdrop-saturate-150">
        <div className="grid grid-cols-2 gap-0.5">
          {BUILT_FOR.map((a) => (
            <Link
              key={a.slug}
              href={`/built-for/${a.slug}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-strong transition hover:bg-overlay/[0.06] hover:text-fg"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-btn bg-gradient-to-br from-brand-400/20 to-iris-600/15 ring-1 ring-inset ring-brand-500/15">
                {a.iconImage ? (
                  // Raster icon tinted to the brand colour via a mask so it
                  // matches the stroke icons instead of showing its own colours.
                  <span
                    aria-hidden
                    className="h-4 w-4 bg-brand-600 dark:bg-brand-300"
                    style={{
                      maskImage: `url(${a.iconImage})`,
                      WebkitMaskImage: `url(${a.iconImage})`,
                      maskSize: 'contain',
                      WebkitMaskSize: 'contain',
                      maskRepeat: 'no-repeat',
                      WebkitMaskRepeat: 'no-repeat',
                      maskPosition: 'center',
                      WebkitMaskPosition: 'center',
                    }}
                  />
                ) : (
                  <Icon d={a.icon} c="h-4 w-4 text-brand-600 dark:text-brand-300" />
                )}
              </span>
              <span className="font-medium">{a.navLabel}</span>
            </Link>
          ))}
        </div>
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
  // Mobile drawer: whether the "Built For" audience sub-list is expanded.
  const [builtForOpen, setBuiltForOpen] = useState(false);

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

  // Where each nav item routes. "Core" → homepage, "Pricing" → /pricing; the
  // rest are inert in-page anchors (faithful to the design).
  const navHref = (n: NavItem): string => (n === 'Core' ? '/' : n === 'Pricing' ? '/pricing' : '#');

  const renderItem = (n: NavItem, className: string): ReactNode => {
    const href = navHref(n);
    return href.startsWith('/') ? (
      <Link key={n} href={href} className={className}>
        {n}
      </Link>
    ) : (
      <a key={n} href="#" onClick={(e) => e.preventDefault()} className={className}>
        {n}
      </a>
    );
  };

  // Mobile drawer links carry the animated underline (wipes in from the left on
  // hover / press), with the active item highlighted.
  const drawerLinkCls = (n: NavItem): string =>
    `relative inline-flex w-fit items-center py-1 text-2xl font-semibold uppercase tracking-tight transition-colors after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:origin-bottom-right after:scale-x-0 after:bg-fg after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.65,0.05,0.36,1)] hover:after:origin-bottom-left hover:after:scale-x-100 ${n === active ? 'text-fg' : 'text-strong hover:text-fg'}`;

  const renderDrawerItem = (n: NavItem): ReactNode => {
    const href = navHref(n);
    return href.startsWith('/') ? (
      <Link key={n} href={href} className={drawerLinkCls(n)} onClick={() => setMenu(false)}>
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
  };

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
              {NAV_ITEMS.map((n) =>
                n === 'Built For' ? (
                  <BuiltForNavItem key={n} className={desktopClass(n)} />
                ) : (
                  renderItem(n, desktopClass(n))
                ),
              )}
            </nav>
            <div className="ml-auto hidden sm:flex items-center gap-2">
              <HeaderSearch />
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
              {NAV_ITEMS.map((n) =>
                n === 'Built For' ? (
                  <li key={n}>
                    <button
                      type="button"
                      onClick={() => setBuiltForOpen((v) => !v)}
                      aria-expanded={builtForOpen}
                      className="flex w-full items-center justify-between py-1 text-2xl font-semibold uppercase tracking-tight text-strong transition-colors hover:text-fg"
                    >
                      {n}
                      <Icon
                        d={I.chevron}
                        c={`h-5 w-5 transition-transform duration-200 ${builtForOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    <ul
                      className={`overflow-hidden border-l border-overlay/15 pl-4 transition-all duration-300 ${
                        builtForOpen ? 'mt-3 max-h-[32rem] opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      {BUILT_FOR.map((a) => (
                        <li key={a.slug}>
                          <Link
                            href={`/built-for/${a.slug}`}
                            onClick={() => setMenu(false)}
                            className="block py-1.5 text-base font-medium text-strong transition-colors hover:text-fg"
                          >
                            {a.navLabel}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : (
                  <li key={n}>{renderDrawerItem(n)}</li>
                ),
              )}
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
      <span className="font-mono text-xs text-subtle">© 2026 FormaCore · Tbilisi, Georgia</span>
      <div className="flex items-center gap-5 text-xs text-subtle">
        <Link href="/" className="hover:text-muted">
          Core
        </Link>
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
