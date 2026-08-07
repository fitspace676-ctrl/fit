'use client';

// Takings by channel × method.
//
// Channel comes from `Payment.provider` — the till stamps `"pos"`, the online
// wizard and shop stamp a gateway key — so "POS vs online" is a real distinction
// here, not an inference from the settlement method. `CARD` occurs in both
// channels, which is exactly why the two axes are shown together rather than
// collapsed into one.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { SalesMethodSlice } from '@fit/types';
import { BarChart, type BarDatum } from '../charts';

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
  share: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

export function PaymentMethodCard({
  slices,
  money,
}: {
  slices: SalesMethodSlice[];
  money: Intl.NumberFormat;
}) {
  const t = useTranslations('admin.dashboard.sales');

  const data: BarDatum[] = slices.map((slice) => ({
    label: t('method.row', {
      channel: t(`method.channel.${slice.channel}`),
      name: t(`method.name.${slice.method}`),
    }),
    // Money is carried in MINOR units; the bars plot major units.
    value: slice.value / 100,
  }));

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const pos = slices
    .filter((slice) => slice.channel === 'pos')
    .reduce((sum, slice) => sum + slice.value, 0);
  // An all-zero window would divide by zero; the share line is simply omitted,
  // because "POS 0% · Online 0%" states a split that does not exist.
  const posShare = total === 0 ? null : Math.round((pos / total) * 100);

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h2 {...stylex.props(styles.title)}>{t('method.title')}</h2>
      {posShare !== null ? (
        <p {...stylex.props(styles.share)}>
          {t('method.share', { pos: posShare, online: 100 - posShare })}
        </p>
      ) : null}
      <BarChart
        data={data}
        formatValue={(value) => money.format(value)}
        emptyLabel={t('method.empty')}
      />
    </Card>
  );
}
