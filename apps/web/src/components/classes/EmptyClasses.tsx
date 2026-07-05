import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/src/components/ui';

// Astryx migration (T11.12): rebuilt on the Astryx `Card` over the Fit brand
// theme, with the layout authored in compiled StyleX (`var(--color-*)`) — no
// Tailwind utilities, no formacore Aurora-glass primitives.

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    paddingBlock: '4rem',
    paddingInline: '1.5rem',
    textAlign: 'center',
  },
  badge: {
    display: 'grid',
    placeItems: 'center',
    height: '3rem',
    width: '3rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-accent)',
  },
  badgeIcon: {
    height: '1.5rem',
    width: '1.5rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '24rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * Empty state shown when the selected week (or the active gym) has no classes to
 * display. Purely presentational — the parent decides when to render it (the API
 * returned zero instances, or there is no tenant in scope).
 */
export function EmptyClasses() {
  const t = useTranslations('classes');

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <span aria-hidden {...stylex.props(styles.badge)}>
        <Icon name="calendar" {...stylex.props(styles.badgeIcon)} sw={2} />
      </span>
      <p {...stylex.props(styles.title)}>{t('empty.title')}</p>
      <p {...stylex.props(styles.subtitle)}>{t('empty.subtitle')}</p>
    </Card>
  );
}
