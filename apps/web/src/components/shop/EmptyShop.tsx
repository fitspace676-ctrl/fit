import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Icon } from '@/src/components/ui';

// Astryx migration (T11.15): the shop's empty state is rebuilt on the Astryx
// `EmptyState` over the Fit brand theme tokens — no Tailwind utilities.

const styles = stylex.create({
  icon: {
    height: '2.25rem',
    width: '2.25rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * Empty state shown when the active gym has no products (or there is no tenant
 * in scope). Purely presentational — the parent decides when to render it.
 */
export function EmptyShop() {
  const t = useTranslations('shop');

  return (
    <EmptyState
      icon={<Icon name="bag" {...stylex.props(styles.icon)} sw={1.9} />}
      title={t('browse.empty.title')}
      description={t('browse.empty.subtitle')}
    />
  );
}
