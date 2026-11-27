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
  // Each gap is its own item with a warning mark, so a list of them scans as
  // separate things to fix rather than one paragraph.
  rows: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.625rem',
    paddingBlock: '0.625rem',
    paddingInline: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-background-muted)',
    fontSize: '0.8125rem',
    lineHeight: 1.4,
  },
  mark: {
    flexShrink: 0,
    width: '0.5rem',
    height: '0.5rem',
    marginTop: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--alert-ink)',
  },
  rowName: { color: 'var(--color-text-primary)' },
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
        <CardTitle icon="alert">{t('gaps.title')}</CardTitle>
        <p {...stylex.props(styles.caption)}>{t('gaps.caption')}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState>{t('gaps.none')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.rows)}>
          {rows.map((row) => (
            <li key={row.key} {...stylex.props(styles.row)}>
              <span aria-hidden {...stylex.props(styles.mark)} />
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
