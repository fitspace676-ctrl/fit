import { useLocale, useTranslations } from 'next-intl';
import type { TrainerScheduleEntry } from '@fit/types';
import { formatTime, groupByDay } from '@/src/components/classes/date-utils';

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
        <h2 id="trainer-schedule-heading" className="text-lg font-semibold text-slate-900">
          {t('detail.schedule.title')}
        </h2>
        <p className="rounded-card border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center text-sm text-slate-500">
          {t('detail.schedule.empty')}
        </p>
      </section>
    );
  }

  const groups = groupByDay(schedule);

  return (
    <section aria-labelledby="trainer-schedule-heading" className="flex flex-col gap-3">
      <h2 id="trainer-schedule-heading" className="text-lg font-semibold text-slate-900">
        {t('detail.schedule.title')}
      </h2>

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.key} className="overflow-hidden rounded-card border border-slate-200">
            <p className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
              {group.date.toLocaleDateString(locale, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </p>
            <ul className="divide-y divide-slate-100">
              {group.items.map((entry) => (
                <li key={entry.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="w-24 shrink-0 text-sm font-medium tabular-nums text-slate-700">
                    {formatTime(entry.startsAt, locale)}–{formatTime(entry.endsAt, locale)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {entry.title}
                    </span>
                    {entry.locationName && (
                      <span className="block truncate text-xs text-slate-500">
                        {entry.locationName}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
