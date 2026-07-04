'use client';

// @fit/admin — the Activity screen's filter bar (T3.9).
//
// A row of kind chips (All + one per event kind) and a from/to calendar-day
// range. Each control writes its state to the URL search params — the single
// source of truth the server page reads — resetting to page 1 on any change so
// the pager never lands past the end of a freshly-narrowed result set.
// Navigation runs in a transition so the controls stay responsive while the
// server re-renders.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ACTIVITY_EVENT_TYPES, type ActivityEventType } from '@fit/types';
import { useTranslations } from 'next-intl';
import { Btn } from '@/components/ui';

/** Shared date-field styling, matching the audit-log filter bar. */
const FIELD_CLASS =
  'h-11 w-full rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white';

/** Filter label styling. */
const FILTER_LABEL_CLASS =
  'mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400';

export function ActivityFilters({
  type,
  from,
  to,
}: {
  type: ActivityEventType | '';
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const t = useTranslations('admin.activity');

  /** Push a single param change to the URL, always resetting to page 1. */
  function commit(key: string, value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  const chips: Array<{ value: ActivityEventType | ''; label: string }> = [
    { value: '', label: t('filters.all') },
    ...ACTIVITY_EVENT_TYPES.map((kind) => ({ value: kind, label: t(`types.${kind}`) })),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Kind chips. */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {chips.map((chip) => {
          const active = type === chip.value;
          return (
            <button
              key={chip.value || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => commit('type', chip.value)}
              className={[
                'h-9 shrink-0 rounded-pill px-3.5 text-xs font-semibold ring-1 ring-inset transition',
                active
                  ? 'bg-brand-500/10 text-brand-600 ring-brand-500/60 dark:text-brand-300'
                  : 'bg-ink-50 text-ink-600 ring-ink-200 hover:bg-ink-100 dark:bg-white/[0.03] dark:text-ink-300 dark:ring-white/10 dark:hover:bg-white/[0.06]',
              ].join(' ')}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Date range. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-44">
          <label htmlFor="activity-from" className={FILTER_LABEL_CLASS}>
            {t('filters.from')}
          </label>
          <input
            id="activity-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => commit('from', event.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        <div className="sm:w-44">
          <label htmlFor="activity-to" className={FILTER_LABEL_CLASS}>
            {t('filters.to')}
          </label>
          <input
            id="activity-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => commit('to', event.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        {type || from || to ? (
          <Btn
            v="outline"
            size="md"
            onClick={() => startTransition(() => router.replace(pathname))}
            className="self-start sm:self-auto"
          >
            {t('filters.clear')}
          </Btn>
        ) : null}
      </div>
    </div>
  );
}
