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
import type { MembershipStatus, MembershipStatusSlice } from '@fit/types';
import { createNumberFormat } from '@fit/i18n';
import { EmptyState } from '../overview/format';
import { CardTitle } from '../card-title';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem' },
  caption: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  // Everyone at once, as one bar: how much of the base is in good standing.
  split: {
    display: 'flex',
    gap: '2px',
    height: '0.75rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '0.625rem minmax(0, 1fr) auto auto',
    alignItems: 'center',
    columnGap: '0.625rem',
  },
  dot: {
    width: '0.625rem',
    height: '0.625rem',
    borderRadius: '3px',
  },
  name: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  count: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  share: {
    minWidth: '2.75rem',
    textAlign: 'end',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  // A status is a state, read in the brand's own terms: blue for members in
  // good standing (deep for active, lighter for trial and paused), red only for
  // money owed, and greys for those who have left.
  good: { backgroundColor: 'var(--chart-series-1)' },
  trying: { backgroundColor: 'var(--chart-series-2)' },
  paused: { backgroundColor: 'light-dark(#c7e2f6, #153e58)' },
  owing: { backgroundColor: 'var(--alert-ink)' },
  lost: { backgroundColor: 'light-dark(#6c6c68, #8f8f8b)' },
  ended: { backgroundColor: 'light-dark(#babab7, #53534f)' },
});

const STATUS_TONE: Record<
  MembershipStatus,
  'good' | 'trying' | 'paused' | 'owing' | 'lost' | 'ended'
> = {
  active: 'good',
  trial: 'trying',
  upcoming: 'trying',
  frozen: 'paused',
  'past-due': 'owing',
  suspended: 'owing',
  canceled: 'lost',
  expired: 'ended',
};

export function StatusBreakdownCard({ slices }: { slices: MembershipStatusSlice[] }) {
  // The VIEWER's locale, not a fixed one: `en` groups as `12,345` and `ka` as
  // `12 345`, and formatting in `defaultLocale` put two different conventions on
  // one page for anyone not reading in Georgian.
  const count = createNumberFormat(useLocale());
  const t = useTranslations('admin.dashboard.members');

  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const rows = [...slices].filter((slice) => slice.count > 0).sort((a, b) => b.count - a.count);
  const pct = (value: number) => (total === 0 ? 0 : Math.round((value / total) * 100));

  return (
    <Card padding="none" xstyle={styles.card}>
      <div>
        <CardTitle icon="grid">{t('status.title')}</CardTitle>
        {/* People, not subscription rows: the rows add up to this, and "active"
            is the strip's active figure. */}
        {total > 0 ? (
          <p {...stylex.props(styles.caption)}>
            {t('status.caption', { total: count.format(total) })}
          </p>
        ) : null}
      </div>
      {total === 0 ? (
        <EmptyState>{t('status.empty')}</EmptyState>
      ) : (
        <>
          <div
            role="img"
            aria-label={rows
              .map((slice) => `${t(`status.name.${slice.status}`)} ${pct(slice.count)}%`)
              .join(', ')}
            {...stylex.props(styles.split)}
          >
            {rows.map((slice) => (
              <span
                key={slice.status}
                {...stylex.props(styles[STATUS_TONE[slice.status]])}
                data-grow="x"
                style={{ width: `${(slice.count / total) * 100}%` }}
              />
            ))}
          </div>
          <ul {...stylex.props(styles.list)}>
            {rows.map((slice) => (
              <li key={slice.status} {...stylex.props(styles.row)}>
                <span
                  aria-hidden
                  {...stylex.props(styles.dot, styles[STATUS_TONE[slice.status]])}
                />
                <span {...stylex.props(styles.name)}>{t(`status.name.${slice.status}`)}</span>
                <span {...stylex.props(styles.count)}>{count.format(slice.count)}</span>
                <span {...stylex.props(styles.share)}>{pct(slice.count)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
