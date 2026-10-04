'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { BUILT_FOR, type AudiencePage } from '@/data/built-for';
import { FEATURES } from '@/data/features';
import { cn } from '@/lib/utils';
import { I, Icon } from './icons';
import { HeaderSearch } from './header-search';
import { useLeadCta } from './lead-cta-context';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore — shared marketing primitives  ·  "Aurora Glass"
   The icon set, buttons, eyebrow, theme toggle, aurora backdrop and the
   nav / footer chrome that every marketing surface (homepage, pricing, …)
   reuses so the design stays identical across pages. The homepage and the
   pricing page both compose these — change the chrome once, here.
   ──────────────────────────────────────────────────────────────────────── */

// `I` (icon path dictionary) and `Icon` (renderer) now live in `./icons` so plain
// data modules can use them without importing this client chrome. Re-exported
// here to keep existing `import { I, Icon } from './marketing-ui'` call sites working.
export { I, Icon };

type BtnVariant = 'primary' | 'white' | 'glass' | 'glassGradient' | 'onBlue' | 'glassOnBlue';
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
  disabled = false,
  ripple = false,
  rippleColor = '#1A7FD6',
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
  /**
   * Disable the button (only used when rendering a <button>) — the lead forms set
   * it while a submission is in flight so an impatient second click can't send a
   * duplicate.
   */
  disabled?: boolean;
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
      'bg-[linear-gradient(135deg,#22B8E6,#2557EB)] text-white hover:brightness-110 active:brightness-95 shadow-[0_8px_30px_-6px_rgba(26,127,214,0.7)] focus-visible:ring-brand-500/40',
    white: 'bg-fg text-surface hover:opacity-90 active:opacity-80 focus-visible:ring-overlay/40',
    // For a deep brand-blue surface (the light-theme homepage hero).
    onBlue:
      'bg-white text-brand-900 hover:bg-white/90 active:bg-white/80 shadow-[0_8px_30px_-8px_rgba(2,11,46,0.6)] focus-visible:ring-white/40',
    glassOnBlue:
      'bg-white/10 text-white border border-white/25 backdrop-blur hover:bg-white/20 active:bg-white/25 focus-visible:ring-white/30',
    glass:
      'bg-overlay/[0.07] text-fg border border-overlay/15 backdrop-blur hover:bg-overlay/[0.13] active:bg-overlay/[0.18] focus-visible:ring-overlay/30',
    // Glass at rest, but morphs into the primary gradient on hover.
    glassGradient:
      'bg-overlay/[0.07] text-fg border border-overlay/15 backdrop-blur hover:bg-[linear-gradient(135deg,#22B8E6,#2557EB)] hover:text-white hover:border-transparent hover:shadow-[0_8px_30px_-6px_rgba(26,127,214,0.7)] active:brightness-95 focus-visible:ring-brand-500/40',
  };
  const className = `relative inline-flex items-center justify-center font-semibold rounded-btn transition-all outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${ripple ? 'overflow-hidden' : ''} ${full ? 'w-full' : ''} ${sizes[size]} ${vs[v]}`;
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
    <button
      type={type}
      disabled={disabled}
      className={className}
      style={style}
      onClick={handleClick}
    >
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
 * FormaCore wordmark lockup. The `public/FormaCore-light.webp` (dark wordmark) and
 * `public/FormaCore-dark.webp` (light wordmark) variants are both rendered and toggled
 * by the `.dark` class via CSS, so the right one shows before first paint with
 * no JS / hydration flash. Pass a height utility (`h-8`, `h-10`, …); width is
 * derived from the 1024×500 intrinsic ratio. The WebP files are 600px wide, enough
 * for the tallest use (`h-20`) on a 3x screen and about a fifth of the PNG's bytes;
 * the PNGs stay in `public/` for anything that links to them directly.
 */
export const Logo = ({
  className = 'h-10',
  whiteInk = false,
}: {
  className?: string;
  /** Always the light (white-inked) wordmark, for a bar over a dark hero. */
  whiteInk?: boolean;
}) =>
  whiteInk ? (
    <img
      src="/FormaCore-dark.webp"
      alt="FormaCore"
      width={1024}
      height={500}
      className={`${className} w-auto`}
    />
  ) : (
    <>
      <img
        src="/FormaCore-light.webp"
        alt="FormaCore"
        width={1024}
        height={500}
        className={`${className} w-auto dark:hidden`}
      />
      <img
        src="/FormaCore-dark.webp"
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
 *
 * The link stays in place whether or not prices are published — `/pricing` shows
 * the plans either way, with the figures replaced by a quote request while
 * `SHOW_PUBLIC_PRICING` is off.
 */
const NAV_ITEMS = ['Core', 'Features', 'Built For', 'Pricing', 'Resources'] as const;
type NavItem = (typeof NAV_ITEMS)[number];

/**
 * Nav items that open a dropdown: features and audiences. `base` is where each
 * entry links to; without it the entries are a plain list (the feature pages
 * are not written yet, so Features lists the modules without linking).
 */
const DROPDOWNS: Partial<Record<NavItem, { base?: string; items: AudiencePage[] }>> = {
  Features: { items: FEATURES },
  'Built For': { base: '/built-for', items: BUILT_FOR },
};

// Mobile bottom dock: one row, fixed to the bottom of the viewport below `lg`
// (where the top nav takes over). The header scrolls away, so the dock carries
// the way back to the menu plus the two calls to action. A single row keeps it
// to about 70px, so it does not sit over a fifth of a phone screen.
export const MobileDock = ({ onMenu }: { onMenu: () => void }) => {
  const openLead = useLeadCta();
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
      <div className="mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-overlay/10 bg-surface/85 p-2 shadow-[0_10px_40px_-8px_rgba(8,9,16,0.35)] backdrop-blur-xl backdrop-saturate-150">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open menu"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-fg transition hover:bg-overlay/[0.07]"
        >
          <Icon d={I.menu} c="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <Btn v="primary" size="md" full icon={I.arrow} onClick={() => openLead('demo')}>
            Book a demo
          </Btn>
        </div>
        <button
          type="button"
          onClick={() => openLead('call')}
          aria-label="Request a call"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-overlay/15 bg-overlay/[0.07] text-fg transition hover:bg-overlay/[0.13]"
        >
          <Icon d={I.handset} c="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

/**
 * Desktop dropdown nav item ("Features", "Built For"): a glass panel of its
 * pages, each linking to its own page. The nav owns which one is open, so at
 * most one is ever open: hover or a click opens it; leaving, Escape or a click
 * elsewhere closes it. (It used to be pure CSS hover +
 * focus-within, which left a clicked menu open after the pointer moved on to
 * the next one, so two showed at once.) The `pt-2` on the panel keeps the hover
 * bridge intact so the menu doesn't vanish as the pointer crosses the gap.
 */
const DropdownNavItem = ({
  label,
  base,
  items,
  className,
  open,
  onOpenChange,
}: {
  label: string;
  base?: string;
  items: AudiencePage[];
  className: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <div
    className="relative"
    onMouseEnter={() => onOpenChange(true)}
    onMouseLeave={() => onOpenChange(false)}
    onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) onOpenChange(false);
    }}
    onKeyDown={(e) => {
      if (e.key === 'Escape') onOpenChange(false);
    }}
  >
    <button
      type="button"
      className={className}
      aria-haspopup="true"
      aria-expanded={open}
      // Opens only: on desktop the pointer has usually opened it already, and a
      // click there must not snap it shut. It closes on leave, Escape or a click
      // outside the nav.
      onClick={() => onOpenChange(true)}
    >
      {label}
      <Icon
        d={I.chevron}
        c={`ml-0.5 h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      />
    </button>
    <div
      className={`absolute left-0 top-full z-40 pt-2 transition-all duration-200 ease-out ${
        open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'
      }`}
    >
      <div className="nav-panel text-fg w-[500px] rounded-2xl border border-overlay/10 bg-surface/95 p-2 shadow-[0_24px_70px_-24px_rgba(8,9,16,0.5)] backdrop-blur-xl backdrop-saturate-150">
        <div className="grid grid-cols-2 gap-0.5">
          {items.map((a) => {
            const inner = (
              <>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-btn bg-gradient-to-br from-brand-400/20 to-iris-600/15 ring-1 ring-inset ring-brand-500/15">
                  <Icon d={a.icon} c="h-4 w-4 text-brand-600 dark:text-brand-300" />
                </span>
                <span className="font-medium">{a.navLabel}</span>
              </>
            );
            const cls = 'flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-strong';
            return base ? (
              <Link
                key={a.slug}
                href={`${base}/${a.slug}`}
                className={`${cls} transition hover:bg-overlay/[0.06] hover:text-fg`}
              >
                {inner}
              </Link>
            ) : (
              <div key={a.slug} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
        {base && (
          <Link
            href={base}
            className="mt-1 flex items-center justify-between rounded-xl border-t border-overlay/10 px-3 pb-1.5 pt-3 text-sm font-semibold text-brand-700 transition hover:text-brand-600 dark:text-brand-300 dark:hover:text-brand-200"
          >
            See all {label.toLowerCase() === 'built for' ? 'business types' : label.toLowerCase()}
            <Icon d={I.arrow} c="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  </div>
);

export const MarketingNav = ({
  active,
  overlay = false,
  forceDark = false,
}: {
  active?: NavItem;
  overlay?: boolean;
  /**
   * Render the bar with the dark-theme tokens in either theme, for an overlay
   * that sits on a dark hero (the homepage's deep-blue light hero): white type
   * and the white-inked logo. Only the bar: its drop-down panels and the mobile
   * drawer keep the page theme (`.nav-on-dark` in globals.css).
   */
  forceDark?: boolean;
}) => {
  const [menu, setMenu] = useState(false);
  const openLead = useLeadCta();
  // Mobile drawer: which dropdown's sub-list is expanded, if any.
  const [openGroup, setOpenGroup] = useState<NavItem | null>(null);
  // Desktop: which dropdown is open. One state, so opening one closes the other.
  const [openDropdown, setOpenDropdown] = useState<NavItem | null>(null);

  // Close the open dropdown on a click anywhere outside the nav.
  useEffect(() => {
    if (!openDropdown) return;
    const onPointer = (e: PointerEvent): void => {
      if (!(e.target as Element | null)?.closest?.('[data-nav-dropdowns]')) setOpenDropdown(null);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [openDropdown]);

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
        className={cn(
          overlay
            ? // Glass overlay: sits on top of the hero so the section shows through
              // the frosted bar instead of reading as a separate solid strip.
              'absolute inset-x-0 top-0 z-30 bg-surface/5 backdrop-blur-md backdrop-saturate-150 border-b border-overlay/5'
            : 'relative z-30',
          forceDark && 'nav-on-dark text-fg',
        )}
      >
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10">
          <div className="flex items-center gap-3 h-24">
            <Link href="/" className="flex items-center shrink-0" aria-label="FormaCore home">
              <Logo className="h-20" whiteInk={forceDark} />
            </Link>
            <nav data-nav-dropdowns className="hidden lg:flex items-center gap-1 ml-6">
              {NAV_ITEMS.map((n) => {
                const group = DROPDOWNS[n];
                return group ? (
                  <DropdownNavItem
                    key={n}
                    label={n}
                    base={group.base}
                    items={group.items}
                    className={desktopClass(n)}
                    open={openDropdown === n}
                    onOpenChange={(next) =>
                      setOpenDropdown((cur) => (next ? n : cur === n ? null : cur))
                    }
                  />
                ) : (
                  renderItem(n, desktopClass(n))
                );
              })}
            </nav>
            <div className="ml-auto hidden sm:flex items-center gap-2">
              <HeaderSearch />
              <AnimatedThemeToggler />
              <Btn v="primary" size="md" icon={I.arrow} onClick={() => openLead('demo')}>
                Book a demo
              </Btn>
              <button
                type="button"
                onClick={() => setMenu((value) => !value)}
                aria-label={menu ? 'Close menu' : 'Open menu'}
                className="lg:hidden w-10 h-10 grid place-items-center rounded-btn text-fg hover:bg-overlay/5"
              >
                <Icon d={menu ? I.x : I.menu} c="w-6 h-6" />
              </button>
            </div>
            <div className="ml-auto flex items-center gap-1 sm:hidden">
              <AnimatedThemeToggler />
              <button
                type="button"
                onClick={() => setMenu((value) => !value)}
                aria-label={menu ? 'Close menu' : 'Open menu'}
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
        className={`lg:hidden fixed inset-0 z-50 ${menu ? '' : 'pointer-events-none'}`}
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
              {NAV_ITEMS.map((n) => {
                const group = DROPDOWNS[n];
                if (!group) return <li key={n}>{renderDrawerItem(n)}</li>;
                const open = openGroup === n;
                return (
                  <li key={n}>
                    <button
                      type="button"
                      onClick={() => setOpenGroup(open ? null : n)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between py-1 text-2xl font-semibold uppercase tracking-tight text-strong transition-colors hover:text-fg"
                    >
                      {n}
                      <Icon
                        d={I.chevron}
                        c={`h-5 w-5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                    <ul
                      className={`overflow-hidden border-l border-overlay/15 pl-4 transition-all duration-300 ${
                        open ? 'mt-3 max-h-[32rem] opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      {group.items.map((a) => (
                        <li key={a.slug}>
                          {group.base ? (
                            <Link
                              href={`${group.base}/${a.slug}`}
                              onClick={() => setMenu(false)}
                              className="block py-1.5 text-base font-medium text-strong transition-colors hover:text-fg"
                            >
                              {a.navLabel}
                            </Link>
                          ) : (
                            <span className="block py-1.5 text-base font-medium text-strong">
                              {a.navLabel}
                            </span>
                          )}
                        </li>
                      ))}
                      {group.base && (
                        <li>
                          <Link
                            href={group.base}
                            onClick={() => setMenu(false)}
                            className="block py-1.5 text-base font-semibold text-brand-700 transition-colors hover:text-brand-600 dark:text-brand-300"
                          >
                            See all
                          </Link>
                        </li>
                      )}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="px-6 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            <div className="flex flex-col gap-2">
              <Btn
                v="primary"
                size="md"
                full
                icon={I.arrow}
                onClick={() => {
                  setMenu(false);
                  openLead('demo');
                }}
              >
                Book a demo
              </Btn>
              <Btn
                v="glass"
                size="md"
                full
                icon={I.handset}
                onClick={() => {
                  setMenu(false);
                  openLead('call');
                }}
              >
                Request a call
              </Btn>
            </div>
          </div>
        </div>
      </div>

      <MobileDock onMenu={() => setMenu(true)} />
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
        <Link href="/" className="-my-3 inline-block py-3 hover:text-muted">
          Core
        </Link>
        <Link href="/pricing" className="-my-3 inline-block py-3 hover:text-muted">
          Pricing
        </Link>
      </div>
    </div>
  </footer>
);
