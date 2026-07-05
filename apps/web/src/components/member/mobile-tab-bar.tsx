'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Link, usePathname } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { NAV_ITEMS, isActive } from './nav-items';

// Astryx migration (T11.10): the fixed mobile bottom tab bar, rebuilt in
// compiled StyleX on the Fit theme tokens (no Tailwind). It is the primary
// navigation below `md`, where the `TopNav` desktop nav is hidden; from `md` up
// it hides and the desktop nav leads. The active tab reads `--color-text-accent`
// so it tracks the brand in both light and dark.
const styles = stylex.create({
  bar: {
    position: 'fixed',
    insetInline: 0,
    bottom: 0,
    zIndex: 30,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    backgroundColor: 'color-mix(in srgb, var(--color-background-surface) 90%, transparent)',
    backdropFilter: 'saturate(1.4) blur(16px)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    display: {
      default: 'block',
      '@media (min-width: 768px)': 'none',
    },
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    marginInline: 'auto',
    maxWidth: '28rem',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'space-around',
    paddingInline: '0.5rem',
  },
  item: {
    flex: 1,
  },
  link: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    paddingBlock: '0.625rem',
    fontSize: '0.625rem',
    fontWeight: 600,
    textDecoration: 'none',
    transitionProperty: 'color',
    transitionDuration: '150ms',
  },
  linkIdle: {
    color: 'var(--color-text-secondary)',
  },
  linkActive: {
    color: 'var(--color-text-accent)',
  },
});

/** The fixed bottom tab bar shown on mobile (hidden from `md` up). */
export function MobileTabBar() {
  const t = useTranslations('member.nav');
  const tShell = useTranslations('member.shell');
  const pathname = usePathname();

  return (
    <nav {...stylex.props(styles.bar)} aria-label={tShell('primaryNav')}>
      <ul {...stylex.props(styles.list)}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.key} {...stylex.props(styles.item)}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                {...stylex.props(styles.link, active ? styles.linkActive : styles.linkIdle)}
              >
                <Icon name={item.icon} />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
