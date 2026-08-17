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
import { BarChart, type BarDatum } from '../charts';

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
  rows: { display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.75rem' },
  row: { display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.75rem' },
  rowName: { color: 'var(--color-text-primary)' },
  rowMeta: { fontFamily: 'var(--font-family-code)', color: 'var(--color-text-secondary)' },
});

/** Row order, Monday first — the same order `ShiftSlot.dayOfWeek` numbers them. */
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function ShiftCoverageCard({ days }: { days: ShiftCoverageDay[] }) {
  const t = useTranslations('admin.dashboard.staff');
  const label = (dayOfWeek: number): string =>
    t(`coverage.weekday.${WEEKDAY_KEYS[dayOfWeek] ?? 'mon'}`);
  const data: BarDatum[] = days.map((day) => ({
    label: label(day.dayOfWeek),
    value: day.hours,
  }));

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('coverage.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('coverage.caption')}</p>
      </div>

      <BarChart data={data} formatValue={(value) => `${value}h`} emptyLabel={t('coverage.empty')} />

      <ul {...stylex.props(styles.rows)}>
        {days
          .filter((day) => day.staffCount > 0)
          .map((day) => (
            <li key={day.dayOfWeek} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.rowName)}>{label(day.dayOfWeek)}</span>
              <span {...stylex.props(styles.rowMeta)}>
                {t('coverage.row', { staff: day.staffCount })}
              </span>
            </li>
          ))}
      </ul>
    </Card>
  );
}
