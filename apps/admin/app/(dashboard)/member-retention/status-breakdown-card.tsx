'use client';

// The membership base split by billing state.
//
// All six states, not the four a dashboard obviously needs: `past-due` is a
// failed charge staff can still act on before it becomes a cancellation, and
// `canceled` (they left) is a different fact from `expired` (the billing ran out).
// A retention surface that merged those two would hide the distinction it exists
// to show.
//
// The service already emits the slices in lifecycle order and drops states nobody
// is in, so this card neither sorts nor pads.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import type { MembershipStatusSlice } from '@fit/types';
import { BarChart, type BarDatum } from '../charts';
import { createNumberFormat } from '@fit/i18n';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
});

export function StatusBreakdownCard({ slices }: { slices: MembershipStatusSlice[] }) {
  // The VIEWER's locale, not a fixed one: `en` groups as `12,345` and `ka` as
  // `12 345`, and formatting in `defaultLocale` put two different conventions on
  // one page for anyone not reading in Georgian.
  const count = createNumberFormat(useLocale());
  const t = useTranslations('admin.dashboard.members');

  const data: BarDatum[] = slices.map((slice) => ({
    label: t(`status.name.${slice.status}`),
    value: slice.count,
  }));

  return (
    <Card padding="none" xstyle={styles.card}>
      <h2 {...stylex.props(styles.title)}>{t('status.title')}</h2>
      <BarChart
        data={data}
        formatValue={(value) => count.format(value)}
        emptyLabel={t('status.empty')}
      />
    </Card>
  );
}
