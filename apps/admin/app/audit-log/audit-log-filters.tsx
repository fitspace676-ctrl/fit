'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ACTION_OPTIONS } from './audit-actions';

/**
 * The audit-log filter bar: an action select and a `from`/`to` date range. Each
 * control writes its state to the URL search params (the single source of truth
 * the server page reads), resetting to page 1 on any change so the pager never
 * lands past the end of a freshly-narrowed result set. Navigation runs in a
 * transition so the controls stay responsive while the server re-renders.
 */
export function AuditLogFilters({
  action,
  from,
  to,
}: {
  action: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="sm:w-64">
        <label htmlFor="audit-action" className="mb-1 block text-xs font-medium text-slate-500">
          Action
        </label>
        <select
          id="audit-action"
          value={action}
          onChange={(event) => commit('action', event.target.value)}
          className="w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">All actions</option>
          {ACTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:w-44">
        <label htmlFor="audit-from" className="mb-1 block text-xs font-medium text-slate-500">
          From
        </label>
        <input
          id="audit-from"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => commit('from', event.target.value)}
          className="w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>

      <div className="sm:w-44">
        <label htmlFor="audit-to" className="mb-1 block text-xs font-medium text-slate-500">
          To
        </label>
        <input
          id="audit-to"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => commit('to', event.target.value)}
          className="w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>

      {action || from || to ? (
        <button
          type="button"
          onClick={() => startTransition(() => router.replace(pathname))}
          className="self-start rounded-card border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 sm:self-auto"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
