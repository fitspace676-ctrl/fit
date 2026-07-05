import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';

// Astryx migration (T11.13): rebuilt on the Astryx `Button` over the Fit brand
// theme, layout authored in compiled StyleX (`var(--color-*)`) — no Tailwind
// utilities and no formacore Aurora-glass primitives.

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '1.5rem',
    paddingBlock: '4rem',
    textAlign: 'center',
  },
  badge: {
    display: 'grid',
    placeItems: 'center',
    height: '3.5rem',
    width: '3.5rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  badgeIcon: {
    height: '1.75rem',
    width: '1.75rem',
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
 * Shown on the trainer detail page when the id resolves to no trainer for the
 * active gym — an unknown / cross-tenant id, or (until the trainer model lands)
 * any id, since the roster is still empty. Offers a one-tap route back to the
 * index rather than a dead end. Purely presentational.
 */
export function TrainerNotFound() {
  const t = useTranslations('trainers');

  return (
    <div {...stylex.props(styles.root)}>
      <span aria-hidden {...stylex.props(styles.badge)}>
        <Icon name="search" {...stylex.props(styles.badgeIcon)} sw={2} />
      </span>
      <p {...stylex.props(styles.title)}>{t('detail.notFound.title')}</p>
      <p {...stylex.props(styles.subtitle)}>{t('detail.notFound.subtitle')}</p>
      <Button
        as={Link}
        href="/trainers"
        variant="secondary"
        size="sm"
        label={t('detail.notFound.action')}
        xstyle={styles.action}
      />
    </div>
  );
}
