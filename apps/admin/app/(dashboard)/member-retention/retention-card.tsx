'use client';

// The rolling retention rate, with its own 30 / 60 / 90-day control.
//
// This control is CARD-LOCAL, unlike the tab-wide granularity: it changes what
// this one line means and nothing else on the tab reads it. The caption names the
// active window so the number is never ambiguous.
//
// A `null` bucket must reach `AreaChart` as `null`. Mapping it to 0 would draw a
// collapse to zero retention where the truth is that there was nobody to retain —
// a gym's first weeks would look like a catastrophe. The note under the chart
// says what a gap means, because an unexplained break reads as a rendering bug.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import type { RetentionPoint, RetentionWindow } from '@fit/types';
import { AreaChart, type AreaPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';

/** The windows the control offers, ascending. */
const WINDOWS = ['30', '60', '90'] as const satisfies readonly RetentionWindow[];

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', padding: '1.25rem' },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
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
  axisRow: {
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  note: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.6875rem',
    color: 'var(--color-text-disabled)',
  },
});

export function RetentionCard({
  points,
  window,
  onSelectWindow,
  disabled,
}: {
  points: RetentionPoint[];
  window: RetentionWindow;
  onSelectWindow: (next: RetentionWindow) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.members');
  const locale = useLocale();

  // `null` passes straight through — see this file's header.
  const data: AreaPoint[] = points.map((point) => ({ label: point.label, value: point.value }));
  const measured = points.filter((point) => point.value !== null);
  const hasData = measured.length > 0;
  const hasGap = measured.length !== points.length;
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('retention.title')}</h2>
          <p {...stylex.props(styles.caption)}>{t('retention.caption', { days: window })}</p>
        </div>
        <SegmentedControl
          value={window}
          onChange={(next) => onSelectWindow(next as RetentionWindow)}
          label={t('retention.windowLabel')}
          size="sm"
          isDisabled={disabled}
        >
          {WINDOWS.map((value) => (
            <SegmentedControlItem
              key={value}
              value={value}
              label={t(`retention.window.${value}`)}
            />
          ))}
        </SegmentedControl>
      </div>

      {hasData ? (
        <>
          <AreaChart data={data} ariaLabel={t('retention.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          {hasGap ? <p {...stylex.props(styles.note)}>{t('retention.gapNote')}</p> : null}
        </>
      ) : (
        <EmptyState>{t('retention.empty')}</EmptyState>
      )}
    </Card>
  );
}
