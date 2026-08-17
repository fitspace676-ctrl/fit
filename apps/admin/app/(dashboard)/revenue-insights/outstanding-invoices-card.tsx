'use client';

// What is owed, gym-wide.
//
// NOT scoped to the tab's window, and the caption says so: a debt does not stop
// being owed because the chart is showing last week. This is the one card here
// whose numbers do not move when the granularity does.
//
// Overdue and failed are reported separately because they need different
// responses — an overdue invoice is chased, a failed charge is retried — and they
// deliberately OVERLAP: a failed charge can also be past its due date. Neither
// line claims to partition the total, which is why neither is rendered as a share
// of it.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useTranslations } from 'next-intl';
import type { NumberFormatter } from '@fit/i18n';
import type { OutstandingInvoices } from '@fit/types';
import { EmptyState } from '../overview/format';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', padding: '1.25rem' },
  head: { marginBottom: '1rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
  caption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  total: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  count: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  lines: { display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.75rem' },
  overdue: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-error)',
  },
  failed: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

export function OutstandingInvoicesCard({
  outstanding,
  money,
}: {
  outstanding: OutstandingInvoices;
  money: NumberFormatter;
}) {
  const t = useTranslations('admin.dashboard.revenue');

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('outstanding.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('outstanding.caption')}</p>
      </div>

      {outstanding.count === 0 ? (
        <EmptyState>{t('outstanding.empty')}</EmptyState>
      ) : (
        <>
          <span {...stylex.props(styles.total)}>{money.format(outstanding.total / 100)}</span>
          <span {...stylex.props(styles.count)}>
            {t('outstanding.count', { count: outstanding.count })}
          </span>
          <div {...stylex.props(styles.lines)}>
            {outstanding.overdueCount > 0 ? (
              <span {...stylex.props(styles.overdue)}>
                {t('outstanding.overdue', {
                  count: outstanding.overdueCount,
                  total: money.format(outstanding.overdueTotal / 100),
                })}
              </span>
            ) : null}
            {outstanding.failedCount > 0 ? (
              <span {...stylex.props(styles.failed)}>
                {t('outstanding.failed', {
                  count: outstanding.failedCount,
                  total: money.format(outstanding.failedTotal / 100),
                })}
              </span>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}
