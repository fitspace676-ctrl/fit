import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { TrainerScheduleEntry } from '@fit/types';
import { formatTime, groupByDay } from '@/src/components/classes/date-utils';
import { Icon } from '@/src/components/ui';

// Astryx migration (T11.13): the schedule is rebuilt on the Astryx `Card` over
// the Fit brand theme, with the day sections and rows authored in compiled
// StyleX (`var(--color-*)`) — no Tailwind utilities and no formacore
// Aurora-glass primitives. Behaviour is unchanged: grouping reuses the classes
// calendar's pure date helpers so the index and the detail page format times
// identically.

const styles = stylex.create({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  heading: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  empty: {
    margin: 0,
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '1.5rem',
    paddingBlock: '2.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  groups: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  groupCard: {
    padding: 0,
    overflow: 'hidden',
  },
  dayHead: {
    margin: 0,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  time: {
    display: 'flex',
    width: '6rem',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.375rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  timeIcon: {
    height: '0.875rem',
    width: '0.875rem',
    flexShrink: 0,
    color: 'var(--color-text-disabled)',
  },
  timeText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  body: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  location: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

export interface TrainerScheduleProps {
  schedule: TrainerScheduleEntry[];
}

/**
 * The upcoming sessions on a trainer's detail page, grouped into day sections
 * (reusing the classes calendar's pure date helpers so the index and the detail
 * page format times identically). Each row shows the time range, the class
 * title, and the location. Renders a friendly empty state when the trainer has
 * nothing booked — a normal result, not an error. Stateless; the page supplies
 * the (already ordered) entries.
 */
export function TrainerSchedule({ schedule }: TrainerScheduleProps) {
  const t = useTranslations('trainers');
  const locale = useLocale();

  if (schedule.length === 0) {
    return (
      <section aria-labelledby="trainer-schedule-heading" {...stylex.props(styles.section)}>
        <h2 id="trainer-schedule-heading" {...stylex.props(styles.heading)}>
          {t('detail.schedule.title')}
        </h2>
        <p {...stylex.props(styles.empty)}>{t('detail.schedule.empty')}</p>
      </section>
    );
  }

  const groups = groupByDay(schedule);

  return (
    <section aria-labelledby="trainer-schedule-heading" {...stylex.props(styles.section)}>
      <h2 id="trainer-schedule-heading" {...stylex.props(styles.heading)}>
        {t('detail.schedule.title')}
      </h2>

      <div {...stylex.props(styles.groups)}>
        {groups.map((group) => (
          <Card key={group.key} variant="default" padding={0} xstyle={styles.groupCard}>
            <p {...stylex.props(styles.dayHead)}>
              {group.date.toLocaleDateString(locale, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </p>
            <ul {...stylex.props(styles.list)}>
              {group.items.map((entry, index) => (
                <li key={entry.id} {...stylex.props(styles.row, index === 0 && styles.rowFirst)}>
                  <span {...stylex.props(styles.time)}>
                    <Icon name="clock" {...stylex.props(styles.timeIcon)} sw={2} />
                    <span {...stylex.props(styles.timeText)}>
                      {formatTime(entry.startsAt, locale)}–{formatTime(entry.endsAt, locale)}
                    </span>
                  </span>
                  <span {...stylex.props(styles.body)}>
                    <span {...stylex.props(styles.title)}>{entry.title}</span>
                    {entry.locationName && (
                      <span {...stylex.props(styles.location)}>{entry.locationName}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}
