'use client';

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { focus } from '@/src/components/ui/kit';
import { NAV_ITEMS, isActive } from './nav-items';
import { NotificationBell } from './notification-bell';

// The portal's primary navigation: a floating capsule pinned to the foot of the
// screen, at EVERY width.
//
// This is the direction's own instruction rather than a layout preference. The
// moodboard names exactly one permanently elevated element in the product — the
// floating nav — and gives it a capsule silhouette. Everything else sits flat on
// the canvas, which is why `--shadow-high` appears here and almost nowhere else.
//
// It replaced a split arrangement: a centred nav inside the desktop header plus a
// separate full-width tab bar under `lg`. Two navigations meant two sets of
// states to keep in step and two answers to "where am I" depending on how wide
// the window happened to be. One capsule is the same object at 390px and at
// 1400px — only the labels drop away on the narrowest screens, where six
// Georgian words cannot fit and the icons carry recognition on their own.
//
// The capsule is the product's ONE glass surface. The direction bans
// glassmorphism everywhere else, and this is the element that earns the
// exception: it is the only thing that permanently sits over content, and opaque
// it simply deleted a strip of the page. Translucent with a real backdrop blur,
// what is underneath stays readable as context while the capsule keeps a defined
// edge of its own.

const styles = stylex.create({
  // The rail spans the viewport so the capsule can centre in it, but it must not
  // swallow clicks on the content it floats over — only the capsule takes them.
  rail: {
    position: 'fixed',
    insetInline: 0,
    bottom: 0,
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    pointerEvents: 'none',
    paddingInline: '1rem',
    // Sit above the iOS home indicator rather than under it.
    paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
  },
  capsule: {
    pointerEvents: 'auto',
    display: 'flex',
    maxWidth: '100%',
    alignItems: 'center',
    gap: '0.25rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-glass-border)',
    backgroundColor: 'var(--fc-glass)',
    // The one glass surface in the product. It earns the exception by being the
    // only element that permanently covers content: opaque, the capsule punched
    // a hole through whatever it floated over. `saturate` keeps the lime blocks
    // underneath from going grey as they pass behind it.
    backdropFilter: 'blur(20px) saturate(1.6)',
    padding: '0.375rem',
    boxShadow: 'var(--shadow-high)',
  },
  item: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    borderRadius: 'var(--radius-full)',
    // Icon-only on the narrowest screens: a circle, so the capsule keeps its
    // shape rather than becoming a row of squashed pills.
    paddingInline: {
      default: '0.875rem',
      '@media (min-width: 640px)': '1rem',
    },
    fontSize: '0.875rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  idle: {
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
  },
  active: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  icon: {
    height: '1.125rem',
    width: '1.125rem',
    flexShrink: 0,
  },
  bellSlot: {
    pointerEvents: 'auto',
    flexShrink: 0,
  },
  // Below `sm` the six Georgian labels cannot fit; the icons carry it, and the
  // label stays in the accessible name rather than disappearing entirely.
  label: {
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'inline',
    },
  },
});

/** The floating primary navigation, shown at every width. */
export function BottomNav() {
  const t = useTranslations('member.nav');
  const tShell = useTranslations('member.shell');
  const pathname = usePathname();

  return (
    <div {...stylex.props(styles.rail)}>
      {/* The landmark names the WHOLE navigation, not its first item. It was
          labelled `nav.home`, so a screen reader announced a six-item region as
          "Home navigation" — and then read "Home" again as the first link
          inside it. */}
      <nav {...stylex.props(styles.capsule)} aria-label={tShell('primaryNav')}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-label={t(item.key)}
              aria-current={active ? 'page' : undefined}
              {...stylex.props(styles.item, active ? styles.active : styles.idle, focus.ring)}
            >
              <Icon name={item.icon} sw={2.1} {...stylex.props(styles.icon)} />
              <span {...stylex.props(styles.label)}>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Its own capsule, not a seventh item in the nav: navigation answers
          "where do I go", the bell answers "what happened while I was away".
          Same material, deliberately separate objects. */}
      <div {...stylex.props(styles.bellSlot)}>
        <NotificationBell />
      </div>
    </div>
  );
}
