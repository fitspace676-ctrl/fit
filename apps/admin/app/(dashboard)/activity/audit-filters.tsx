'use client';

// @fit/admin — the Activity area's audit tab filter bar (T3.10, was T4.9).
//
// An action select and a `from`/`to` calendar-day range, matching the activity
// feed's own filter bar. Each control writes its state to the URL search params
// (the single source of truth the server page reads), resetting to page 1 on any
// change so the pager never lands past the end of a freshly-narrowed result set,
// and preserving the `?tab=audit` param (it is not one of the keys it touches).
// Navigation runs in a transition so the controls stay responsive while the
// server re-renders.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Btn } from '@/components/ui';
import { ACTION_OPTIONS } from './audit-actions';

/** Shared field styling, matching the activity feed's date fields. */
const FIELD_CLASS =
  'h-11 w-full rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white';

/** Filter label styling. */
const FILTER_LABEL_CLASS =
  'mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400';

export function AuditFilters({ action, from, to }: { action: string; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const t = useTranslations('admin.activity.audit');

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

  /** Clear every filter but keep the audit tab active. */
  function clear(): void {
    startTransition(() => router.replace(`${pathname}?tab=audit`));
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="sm:w-64">
        <label htmlFor="audit-action" className={FILTER_LABEL_CLASS}>
          {t('filters.action')}
        </label>
        <select
          id="audit-action"
          value={action}
          onChange={(event) => commit('action', event.target.value)}
          className={FIELD_CLASS}
        >
          <option value="">{t('filters.all')}</option>
          {ACTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(`actions.${option.labelKey}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:w-44">
        <label htmlFor="audit-from" className={FILTER_LABEL_CLASS}>
          {t('filters.from')}
        </label>
        <input
          id="audit-from"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => commit('from', event.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      <div className="sm:w-44">
        <label htmlFor="audit-to" className={FILTER_LABEL_CLASS}>
          {t('filters.to')}
        </label>
        <input
          id="audit-to"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => commit('to', event.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      {action || from || to ? (
        <Btn v="outline" size="md" onClick={clear} className="self-start sm:self-auto">
          {t('filters.clear')}
        </Btn>
      ) : null}
    </div>
  );
}
