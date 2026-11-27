'use client';

import { useGymTimeZone } from '@/components/gym-timezone';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@fit/ui-kit';
import * as stylex from '@stylexjs/stylex';
import type { DashboardOverviewResponse } from '@fit/types';
import { EmptyState, formatTime } from './format';
import { CardTitle } from '../card-title';

const styles = stylex.create({
  cardWide: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  fillOk: { color: 'var(--color-text-accent)' },
  // Nobody booked yet is not news; it should not wear the accent.
  fillNone: { color: 'var(--color-text-secondary)' },
  fillWarn: { color: 'var(--color-warning)' },
  fillFull: { color: 'var(--color-error)' },
  scheduleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    paddingInline: '0.75rem',
    paddingBlock: '0.625rem',
  },
  scheduleAccent: {
    height: '2rem',
    width: '0.25rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  scheduleTime: {
    width: '3.5rem',
    flexShrink: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  scheduleMain: {
    minWidth: 0,
    flex: 1,
  },
  scheduleTitle: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  scheduleSub: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  scheduleRight: {
    flexShrink: 0,
    textAlign: 'right',
  },
  scheduleCount: {
    display: 'block',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  // How full the class is, as a bar the eye can compare down the list.
  fillTrack: {
    display: 'block',
    width: '4.5rem',
    height: '0.25rem',
    marginTop: '0.375rem',
    marginInlineStart: 'auto',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  fillBar: {
    display: 'block',
    height: '100%',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'currentColor',
  },
  scheduleFill: {
    display: 'block',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    fontVariantNumeric: 'tabular-nums',
  },
});

/* -------------------------------------------------------------------------- */
/*  Today's schedule                                                          */
/* -------------------------------------------------------------------------- */

export function ScheduleCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();
  const timeZone = useGymTimeZone();
  const rows = data.todaysSchedule;

  return (
    <Card padding="none" xstyle={styles.cardWide}>
      <CardTitle icon="calendar" spaced>
        {t('schedule.title')}
      </CardTitle>
      {rows.length === 0 ? (
        <EmptyState>{t('schedule.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {rows.map((row, i) => {
            const fill = row.capacity > 0 ? Math.round((row.booked / row.capacity) * 100) : 0;
            const fillTone =
              fill > 85
                ? styles.fillFull
                : fill > 60
                  ? styles.fillWarn
                  : fill === 0
                    ? styles.fillNone
                    : styles.fillOk;
            return (
              <li key={`${row.startsAt}-${i}`} {...stylex.props(styles.scheduleRow)}>
                <span
                  {...stylex.props(styles.scheduleAccent)}
                  style={{ backgroundColor: row.color ?? 'var(--color-accent)' }}
                />
                <span {...stylex.props(styles.scheduleTime)}>
                  {formatTime(locale, row.startsAt, timeZone)}
                </span>
                <span {...stylex.props(styles.scheduleMain)}>
                  <span {...stylex.props(styles.scheduleTitle)}>{row.title}</span>
                  <span {...stylex.props(styles.scheduleSub)}>
                    {row.trainerName ?? t('schedule.unassigned')}
                  </span>
                </span>
                <span {...stylex.props(styles.scheduleRight)}>
                  <span {...stylex.props(styles.scheduleCount)}>
                    {row.booked}/{row.capacity}
                  </span>
                  <span {...stylex.props(styles.fillTrack, fillTone)} aria-hidden>
                    <span
                      {...stylex.props(styles.fillBar)}
                      data-grow="x"
                      style={{ width: `${fill}%` }}
                    />
                  </span>
                  <span {...stylex.props(styles.scheduleFill, fillTone)}>
                    {t('schedule.full', { fill })}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
