'use client';

// Takings by channel × method.
//
// Channel comes from `Payment.provider` — the till stamps `"pos"`, the online
// wizard and shop stamp a gateway key — so "POS vs online" is a real distinction
// here, not an inference from the settlement method. `CARD` occurs in both
// channels, which is exactly why the two axes are shown together rather than
// collapsed into one.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useTranslations } from 'next-intl';
import type { NumberFormatter } from '@fit/i18n';
import type { SalesChannel, SalesMethodSlice } from '@fit/types';
import { EmptyState } from '../overview/format';
import { CardTitle } from '../card-title';

const CHANNELS = ['pos', 'online'] as const satisfies readonly SalesChannel[];

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem' },
  // The channel split as one bar: the question the card is asked first.
  split: {
    display: 'flex',
    gap: '2px',
    height: '0.75rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
  },
  segment: {
    height: '100%',
  },
  pos: { backgroundColor: 'var(--chart-series-1)' },
  online: { backgroundColor: 'var(--chart-series-2)' },
  groups: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  groupHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  dot: {
    width: '0.625rem',
    height: '0.625rem',
    flexShrink: 0,
    borderRadius: '3px',
  },
  groupTotal: {
    marginInlineStart: 'auto',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  groupShare: {
    minWidth: '2.75rem',
    textAlign: 'end',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    paddingInlineStart: '1.125rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    rowGap: '0.25rem',
    columnGap: '0.75rem',
    alignItems: 'baseline',
  },
  name: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  value: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  track: {
    display: 'block',
    gridColumn: '1 / -1',
    height: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    overflow: 'hidden',
  },
  fill: {
    display: 'block',
    height: '100%',
    borderRadius: 'var(--radius-full)',
  },
});

export function PaymentMethodCard({
  slices,
  money,
}: {
  slices: SalesMethodSlice[];
  money: NumberFormatter;
}) {
  const t = useTranslations('admin.dashboard.sales');

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const pct = (value: number) => (total === 0 ? 0 : Math.round((value / total) * 100));
  const groups = CHANNELS.map((channel) => {
    const rows = slices.filter((slice) => slice.channel === channel);
    return { channel, rows, sum: rows.reduce((acc, slice) => acc + slice.value, 0) };
  }).filter((group) => group.rows.length > 0);

  return (
    <Card padding="none" xstyle={styles.card}>
      <CardTitle icon="card">{t('method.title')}</CardTitle>
      {total === 0 ? (
        <EmptyState>{t('method.empty')}</EmptyState>
      ) : (
        <>
          <div
            role="img"
            aria-label={groups
              .map((group) => `${t(`method.channel.${group.channel}`)} ${pct(group.sum)}%`)
              .join(', ')}
            {...stylex.props(styles.split)}
          >
            {groups.map((group) => (
              <span
                key={group.channel}
                {...stylex.props(styles.segment, styles[group.channel])}
                data-grow="x"
                style={{ width: `${(group.sum / total) * 100}%` }}
              />
            ))}
          </div>

          <div {...stylex.props(styles.groups)}>
            {groups.map((group) => (
              <div key={group.channel} {...stylex.props(styles.group)}>
                <div {...stylex.props(styles.groupHead)}>
                  <span aria-hidden {...stylex.props(styles.dot, styles[group.channel])} />
                  {t(`method.channel.${group.channel}`)}
                  {/* Money is carried in MINOR units; the card shows major units. */}
                  <span {...stylex.props(styles.groupTotal)}>{money.format(group.sum / 100)}</span>
                  <span {...stylex.props(styles.groupShare)}>{pct(group.sum)}%</span>
                </div>
                <ul {...stylex.props(styles.list)}>
                  {group.rows.map((slice) => (
                    <li key={slice.method} {...stylex.props(styles.row)}>
                      <span {...stylex.props(styles.name)}>{t(`method.name.${slice.method}`)}</span>
                      <span {...stylex.props(styles.value)}>
                        {money.format(slice.value / 100)} · {pct(slice.value)}%
                      </span>
                      <span aria-hidden {...stylex.props(styles.track)}>
                        <span
                          {...stylex.props(styles.fill, styles[group.channel])}
                          data-grow="x"
                          style={{ width: `${Math.max(2, (slice.value / total) * 100)}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
