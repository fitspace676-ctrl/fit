import * as stylex from '@stylexjs/stylex';
import { Card, EmptyState } from '@/src/components/ui/kit';
import { useTranslations } from 'next-intl';
import { Icon } from '@/src/components/ui';

// Astryx migration (T11), now on the portal kit: rebuilt on the kit's `Card` over the Fit brand
// theme, with the layout authored in compiled StyleX (`var(--color-*)`) — no
// Tailwind utilities, no formacore Aurora-glass primitives.
//
// It was a private centred stack — an icon in a 48px muted disc over a heading
// over a body line — which is precisely `EmptyState`, drawn at a slightly
// different type ramp and icon size than the four other empty states in the
// portal. It is the kit's now, so "nothing here" looks the same everywhere.

const styles = stylex.create({
  icon: {
    height: '2.25rem',
    width: '2.25rem',
    color: 'var(--color-text-secondary)',
  },
  // The week grid is tall; an empty state that keeps some of its footprint
  // stops the page from collapsing as you step between a full week and a bare
  // one.
  state: {
    paddingBlock: '4rem',
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
    <Card>
      <EmptyState
        icon={<Icon name="calendar" {...stylex.props(styles.icon)} sw={2} />}
        title={t('empty.title')}
        body={t('empty.subtitle')}
        xstyle={styles.state}
      />
    </Card>
  );
}
