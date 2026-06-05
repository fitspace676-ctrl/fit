'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ClassInstanceCard } from '@fit/types';
import { formatTime, groupByDay } from './date-utils';

export interface ClassListViewProps {
  instances: ClassInstanceCard[];
  /** Called with a class id when its row is clicked. */
  onClassClick: (id: string) => void;
}

/**
 * List view: the week's classes grouped into collapsible day sections (native
 * `<details>`, open by default), each row showing time, title, trainer,
 * location, and remaining spots. Stateless — grouping is derived from the
 * `instances` the parent supplies.
 */
export function ClassListView({ instances, onClassClick }: ClassListViewProps) {
  const t = useTranslations('classes');
  const locale = useLocale();
  const groups = useMemo(() => groupByDay(instances), [instances]);

  return (
    <section aria-label={t('listView.label')} className="flex flex-col gap-3">
      {groups.map((group) => (
        <details
          key={group.key}
          open
          className="overflow-hidden rounded-card border border-slate-200"
        >
          <summary className="cursor-pointer list-none bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
            {group.date.toLocaleDateString(locale, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
            <span className="ml-2 font-normal text-slate-400">
              {t('listView.count', { count: group.items.length })}
            </span>
          </summary>

          <ul className="divide-y divide-slate-100">
            {group.items.map((instance) => {
              const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
              return (
                <li key={instance.id}>
                  <button
                    type="button"
                    onClick={() => onClassClick(instance.id)}
                    className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  >
                    <span
                      aria-hidden
                      className="h-9 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: instance.color }}
                    />
                    <span className="w-24 shrink-0 text-sm font-medium tabular-nums text-slate-700">
                      {formatTime(instance.startsAt, locale)}–{formatTime(instance.endsAt, locale)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {instance.title}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {[instance.trainerName, instance.locationName].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        spotsLeft === 0
                          ? 'bg-red-50 text-red-600'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {spotsLeft === 0 ? t('card.full') : t('card.spotsLeft', { count: spotsLeft })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </section>
  );
}
