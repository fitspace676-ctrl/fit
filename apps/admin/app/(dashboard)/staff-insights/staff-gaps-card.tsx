'use client';

// What this tab cannot count, in one place.
//
// Every figure above has an exclusion behind it — a trainer with no availability,
// a class with no trainer, a shift that does not move forward, leave that cannot
// be subtracted from a dateless rota. Scattering those as five small caveats would
// let each one be missed; gathering them here makes the tab's blind spots a thing
// the owner can act on rather than a footnote.
//
// A zero row is omitted rather than shown at zero: this card is a to-do list, and
// a satisfied line is not one.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useTranslations } from 'next-intl';
import type { StaffGaps } from '@fit/types';
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
  rows: { display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.75rem' },
  row: { display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.75rem' },
  rowName: { color: 'var(--color-text-primary)' },
  rowMeta: { fontFamily: 'var(--font-family-code)', color: 'var(--color-text-secondary)' },
});

/** The counts, in the order they are worth acting on. */
const ROWS = [
  { key: 'noAvailability', pick: (gaps: StaffGaps) => gaps.trainersWithoutAvailability },
  { key: 'noTrainer', pick: (gaps: StaffGaps) => gaps.classesWithoutTrainer },
  { key: 'noShifts', pick: (gaps: StaffGaps) => gaps.staffWithoutShifts },
  { key: 'invalidShifts', pick: (gaps: StaffGaps) => gaps.invalidShiftSlots },
  { key: 'leave', pick: (gaps: StaffGaps) => gaps.leaveStaffDays },
] as const;

export function StaffGapsCard({ gaps }: { gaps: StaffGaps }) {
  const t = useTranslations('admin.dashboard.staff');
  const rows = ROWS.map((row) => ({ key: row.key, count: row.pick(gaps) })).filter(
    (row) => row.count > 0,
  );

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('gaps.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('gaps.caption')}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState>{t('gaps.none')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.rows)}>
          {rows.map((row) => (
            <li key={row.key} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.rowName)}>
                {t(`gaps.${row.key}`, { count: row.count })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
