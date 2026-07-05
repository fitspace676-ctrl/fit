import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Icon } from '@/src/components/ui';

// Astryx migration (T11.13): the empty state is authored in compiled StyleX over
// the Fit brand tokens — no Tailwind utilities and no formacore Aurora-glass
// primitives.

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
});

/**
 * Empty state shown when the active gym has no trainers (or there is no tenant
 * in scope). Purely presentational — the parent decides when to render it.
 */
export function EmptyTrainers() {
  const t = useTranslations('trainers');

  return (
    <div {...stylex.props(styles.root)}>
      <span aria-hidden {...stylex.props(styles.badge)}>
        <Icon name="dumbbell" {...stylex.props(styles.badgeIcon)} sw={2} />
      </span>
      <p {...stylex.props(styles.title)}>{t('empty.title')}</p>
      <p {...stylex.props(styles.subtitle)}>{t('empty.subtitle')}</p>
    </div>
  );
}
