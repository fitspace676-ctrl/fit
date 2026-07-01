import { useLocale, useTranslations } from 'next-intl';
import type { TrainerScheduleEntry } from '@fit/types';
import { formatTime, groupByDay } from '@/src/components/classes/date-utils';
import { Card, Icon } from '@/src/components/ui';

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
      <section aria-labelledby="trainer-schedule-heading" className="flex flex-col gap-3">
        <h2
          id="trainer-schedule-heading"
          className="font-display text-lg font-extrabold tracking-tight text-ink-900 dark:text-white"
        >
          {t('detail.schedule.title')}
        </h2>
        <p className="rounded-card border border-dashed border-ink-200 bg-ink-50 px-6 py-10 text-center text-sm text-ink-500 dark:border-white/10 dark:bg-white/5 dark:text-ink-400">
          {t('detail.schedule.empty')}
        </p>
      </section>
    );
  }

  const groups = groupByDay(schedule);

  return (
    <section aria-labelledby="trainer-schedule-heading" className="flex flex-col gap-3">
      <h2
        id="trainer-schedule-heading"
        className="font-display text-lg font-extrabold tracking-tight text-ink-900 dark:text-white"
      >
        {t('detail.schedule.title')}
      </h2>

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <Card key={group.key} glow className="overflow-hidden">
            <p className="border-b border-ink-200 bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-900 dark:border-white/10 dark:bg-white/5 dark:text-white">
              {group.date.toLocaleDateString(locale, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </p>
            <ul className="divide-y divide-ink-100 dark:divide-white/5">
              {group.items.map((entry) => (
                <li key={entry.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="flex w-24 shrink-0 items-center gap-1.5 font-mono text-sm font-medium tabular-nums text-ink-700 dark:text-ink-200">
                    <Icon name="clock" className="h-3.5 w-3.5 shrink-0 text-ink-400" sw={2} />
                    <span className="truncate">
                      {formatTime(entry.startsAt, locale)}–{formatTime(entry.endsAt, locale)}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900 dark:text-white">
                      {entry.title}
                    </span>
                    {entry.locationName && (
                      <span className="block truncate text-xs text-ink-500 dark:text-ink-400">
                        {entry.locationName}
                      </span>
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
