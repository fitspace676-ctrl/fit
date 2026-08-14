'use client';

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { NAV_ITEMS, isActive } from './nav-items';

// FormaCore redesign (T11.10) — the mobile tab bar in StyleX.
//
// The moodboard names this the ONE permanently elevated element in the product:
// everything else sits flat on the canvas, and the bar floats because it has to
// stay legible over whatever scrolls beneath it. It is opaque rather than the
// old `bg-white/90 + backdrop-blur-xl` — the direction has no glass, and a
// translucent bar over the charcoal canvas reads as a smear rather than a layer.
//
// The active tab is the lime, matching the desktop nav pill: one visual answer
// to "where am I", whichever width you are at.

const styles = stylex.create({
  bar: {
    position: 'fixed',
    insetInline: 0,
    bottom: 0,
    zIndex: 30,
    display: {
      default: 'block',
      '@media (min-width: 1024px)': 'none',
    },
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    boxShadow: 'var(--shadow-high)',
    // Clear the home indicator on iOS rather than sitting under it.
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  },
  list: {
    marginInline: 'auto',
    display: 'flex',
    maxWidth: '28rem',
    alignItems: 'stretch',
    justifyContent: 'space-around',
    listStyle: 'none',
    margin: 0,
    paddingTop: '0.375rem',
    paddingBottom: '0.5rem',
    paddingInline: '0.5rem',
    gap: '0.125rem',
  },
  item: {
    display: 'flex',
    minWidth: 0,
    flex: 1,
  },
  // 9px labels are deliberate, not a typo: six Georgian nav words have to fit a
  // 390px bar without truncating, and the icon above carries the recognition.
  link: {
    display: 'flex',
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.25rem',
    borderRadius: 'var(--radius-inner)',
    paddingBlock: '0.5rem',
    paddingInline: '0.125rem',
    fontSize: '0.5625rem',
    fontWeight: 600,
    lineHeight: 1.2,
    textAlign: 'center',
    textDecoration: 'none',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  label: {
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  idle: {
    color: 'var(--color-text-secondary)',
  },
  active: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  icon: {
    height: '1.1875rem',
    width: '1.1875rem',
    flexShrink: 0,
  },
});

/** The fixed bottom tab bar shown on mobile (hidden from `lg` up). */
export function MobileTabBar() {
  const t = useTranslations('member.nav');
  const pathname = usePathname();

  return (
    <nav {...stylex.props(styles.bar)}>
      <ul {...stylex.props(styles.list)}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.key} {...stylex.props(styles.item)}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                {...stylex.props(styles.link, active ? styles.active : styles.idle)}
              >
                <Icon name={item.icon} sw={2.1} {...stylex.props(styles.icon)} />
                <span {...stylex.props(styles.label)}>{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
