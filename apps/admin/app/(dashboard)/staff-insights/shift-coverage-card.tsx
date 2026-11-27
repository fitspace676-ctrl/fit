'use client';

// The standing weekly rota: scheduled hours per weekday, and how many staff are
// on each.
//
// SCHEDULED, never worked — nothing in the schema records whether a shift was
// kept, and the title says the word it can defend. Nor is this window-scoped: a
// recurring rota carries no dates, so it reads the same whatever the chart above
// is showing, and the caption says that too.
//
// Approved leave is NOT subtracted. A date-ranged absence taken out of a dateless
// weekly pattern would produce a number that is neither the rota nor the reality;
// the gaps card reports it beside this instead.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useTranslations } from 'next-intl';
import type { ShiftCoverageDay } from '@fit/types';
import { EmptyState } from '../overview/format';
import { CardTitle } from '../card-title';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', padding: '1.25rem' },
  head: { marginBottom: '1rem' },
  caption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  rows: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    columnGap: '0.75rem',
    rowGap: '0.3125rem',
    alignItems: 'baseline',
  },
  rowName: {
    overflow: 'hidden',
    fontSize: '0.8125rem',
    color: 'var(--color-text-primary)',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowValue: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  track: {
    display: 'flex',
    gap: '2px',
    gridColumn: '1 / -1',
    height: '0.4375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    overflow: 'hidden',
  },
  fill: {
    display: 'block',
    height: '100%',
  },
  rowMeta: {
    gridColumn: '1 / -1',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  hours: {
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--chart-series-1)',
  },
});

/** Row order, Monday first — the same order `ShiftSlot.dayOfWeek` numbers them. */
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function ShiftCoverageCard({ days }: { days: ShiftCoverageDay[] }) {
  const t = useTranslations('admin.dashboard.staff');
  const label = (dayOfWeek: number): string =>
    t(`coverage.weekday.${WEEKDAY_KEYS[dayOfWeek] ?? 'mon'}`);
  const most = Math.max(1, ...days.map((day) => day.hours));
  const covered = days.some((day) => day.hours > 0);

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <CardTitle icon="clock">{t('coverage.title')}</CardTitle>
        <p {...stylex.props(styles.caption)}>{t('coverage.caption')}</p>
      </div>

      {!covered ? (
        <EmptyState>{t('coverage.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.rows)}>
          {days.map((day) => (
            <li key={day.dayOfWeek} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.rowName)}>{label(day.dayOfWeek)}</span>
              <span {...stylex.props(styles.rowValue)}>{day.hours}h</span>
              <span aria-hidden {...stylex.props(styles.track)}>
                {day.hours > 0 ? (
                  <span
                    {...stylex.props(styles.fill, styles.hours)}
                    data-grow="x"
                    style={{ width: `${(day.hours / most) * 100}%` }}
                  />
                ) : null}
              </span>
              {day.staffCount > 0 ? (
                <span {...stylex.props(styles.rowMeta)}>
                  {t('coverage.row', { staff: day.staffCount })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
