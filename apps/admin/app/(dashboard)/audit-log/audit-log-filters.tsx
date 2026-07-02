'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ACTION_OPTIONS } from './audit-actions';

/** Filter-chip styling per the reference: a soft pill at rest, brand-tinted when active. */
const CHIP_BASE =
  'h-9 shrink-0 rounded-pill px-3.5 text-xs font-semibold ring-1 ring-inset transition';
const CHIP_ACTIVE = 'bg-brand-500/10 text-brand-600 ring-brand-500/60 dark:text-brand-300';
const CHIP_IDLE =
  'bg-ink-50 text-ink-600 ring-ink-200 hover:bg-ink-100 dark:bg-white/[0.03] dark:text-ink-300 dark:ring-white/10 dark:hover:bg-white/[0.06]';

/** Compact date fields, styled to sit inside the chip row. */
const DATE_CLASS =
  'h-9 rounded-pill bg-ink-50 px-3.5 text-xs font-semibold text-ink-600 ring-1 ring-inset ring-ink-200 focus:outline-none focus:ring-brand-500/60 dark:bg-white/[0.03] dark:text-ink-300 dark:ring-white/10 dark:[color-scheme:dark]';

/**
 * The audit-log filter bar, laid out as the reference's chip row: an "All" chip
 * plus one chip per known action, with the `from`/`to` date range tucked at the
 * right end. Each control writes its state to the URL search params (the single
 * source of truth the server page reads), resetting to page 1 on any change so
 * the pager never lands past the end of a freshly-narrowed result set.
 * Navigation runs in a transition so the controls stay responsive while the
 * server re-renders.
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
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        aria-pressed={action === ''}
        onClick={() => commit('action', '')}
        className={`${CHIP_BASE} ${action === '' ? CHIP_ACTIVE : CHIP_IDLE}`}
      >
        All
      </button>
      {ACTION_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={action === option.value}
          onClick={() => commit('action', option.value)}
          className={`${CHIP_BASE} ${action === option.value ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          {option.label}
        </button>
      ))}

      {/* Date range, right-aligned on wide screens. */}
      <div className="ml-auto flex items-center gap-1.5">
        <input
          id="audit-from"
          aria-label="From date"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => commit('from', event.target.value)}
          className={DATE_CLASS}
        />
        <span aria-hidden className="text-xs text-ink-400 dark:text-ink-500">
          –
        </span>
        <input
          id="audit-to"
          aria-label="To date"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => commit('to', event.target.value)}
          className={DATE_CLASS}
        />
        {action || from || to ? (
          <button
            type="button"
            onClick={() => startTransition(() => router.replace(pathname))}
            className="h-9 rounded-pill px-3 text-xs font-semibold text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
