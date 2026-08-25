'use client';

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { createDateTimeFormat } from '@fit/i18n';
import type { ServiceSchedule } from '@fit/types';
import { upcomingOccurrences } from './schedule-occurrences';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    paddingTop: '1rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  caption: {
    margin: 0,
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  repeats: { margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th: {
    paddingBlock: '0.5rem',
    paddingInline: '0.5rem',
    textAlign: 'left',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  td: {
    paddingBlock: '0.5rem',
    paddingInline: '0.5rem',
    color: 'var(--color-text-primary)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  time: { fontFamily: 'var(--font-family-code)', fontVariantNumeric: 'tabular-nums' },
  empty: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
});

export interface ServiceScheduleTableProps {
  schedule: ServiceSchedule | null;
  locale: string;
  /** The gym's current calendar day (`YYYY-MM-DD`). */
  today: string;
}

/**
 * When a service runs: the repeat rule in words plus a table of the next dates
 * (up to four weeks ahead). A service with no schedule — a personal-training
 * service whose trainer books sessions individually — says so instead.
 */
export function ServiceScheduleTable({ schedule, locale, today }: ServiceScheduleTableProps) {
  const t = useTranslations('services.schedule');

  if (schedule === null) {
    return (
      <div {...stylex.props(styles.root)}>
        <p {...stylex.props(styles.caption)}>{t('title')}</p>
        <p {...stylex.props(styles.empty)}>{t('byAppointment')}</p>
      </div>
    );
  }

  const dayFormat = createDateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const dateFormat = createDateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const repeats =
    schedule.freq === 'WEEKLY'
      ? t('weekly', { days: schedule.weekdays.map((day) => t(`weekday.${day}`)).join(', ') })
      : schedule.freq === 'DAILY'
        ? t('daily')
        : t('once', { date: dateFormat.format(asDate(schedule.startDate)) });
  const until = schedule.until
    ? t('until', { date: dateFormat.format(asDate(schedule.until)) })
    : null;
  const rows = upcomingOccurrences(schedule, today);

  return (
    <div {...stylex.props(styles.root)}>
      <p {...stylex.props(styles.caption)}>{t('title')}</p>
      <p {...stylex.props(styles.repeats)}>
        {repeats} · {schedule.startTime}
        {until ? ` · ${until}` : ''}
      </p>
      {rows.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{t('noUpcoming')}</p>
      ) : (
        <div {...stylex.props(styles.tableWrap)}>
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr>
                <th scope="col" {...stylex.props(styles.th)}>
                  {t('columns.day')}
                </th>
                <th scope="col" {...stylex.props(styles.th)}>
                  {t('columns.time')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <td {...stylex.props(styles.td)}>{dayFormat.format(asDate(row.date))}</td>
                  <td {...stylex.props(styles.td, styles.time)}>{row.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
