import * as stylex from '@stylexjs/stylex';
import { ButtonLink, Card } from '@/src/components/ui/kit';
import { useTranslations } from 'next-intl';
import { Icon } from '@/src/components/ui';

// Astryx migration (T11), now on the portal kit: rebuilt on the kit's `Card` / `Button` over the
// Fit brand theme, layout authored in compiled StyleX (`var(--color-*)`) — no
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
  action: {
    marginTop: '0.25rem',
  },
});

/**
 * Shown on the class detail page when the id resolves to no occurrence for the
 * active gym — an unknown / cross-tenant id, or a transient load failure. Offers
 * a one-tap route back to the schedule rather than a dead end. Purely
 * presentational.
 */
export function ClassNotFound() {
  const t = useTranslations('classes');

  return (
    <Card padding="none" xstyle={styles.card}>
      <span aria-hidden {...stylex.props(styles.badge)}>
        <Icon name="search" {...stylex.props(styles.badgeIcon)} sw={2} />
      </span>
      <p {...stylex.props(styles.title)}>{t('detail.notFound.title')}</p>
      <p {...stylex.props(styles.subtitle)}>{t('detail.notFound.subtitle')}</p>
      <ButtonLink
        href="/member/classes"
        variant="secondary"
        size="inline"
        label={t('detail.notFound.action')}
        xstyle={styles.action}
      />
    </Card>
  );
}
