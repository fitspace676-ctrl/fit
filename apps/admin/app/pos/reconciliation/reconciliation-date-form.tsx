'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * The business-day picker for the reconciliation report. The selected `date` is the
 * single source of truth the server page reads from the URL, so changing it just
 * pushes `?date=` and lets the page re-fetch. Navigation runs in a transition so
 * the control stays responsive while the server re-renders. `max` pins the picker
 * to today — there are no future takings to reconcile.
 */
export function ReconciliationDateForm({ date }: { date: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function commit(value: string): void {
    if (!value) {
      return;
    }
    startTransition(() => router.replace(`${pathname}?date=${encodeURIComponent(value)}`));
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex items-end gap-3">
      <div className="sm:w-52">
        <label
          htmlFor="reconciliation-date"
          className="mb-1 block text-xs font-medium text-ink-500 dark:text-ink-400"
        >
          Business day
        </label>
        <input
          id="reconciliation-date"
          type="date"
          value={date}
          max={today}
          onChange={(event) => commit(event.target.value)}
          className="h-11 w-full rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
        />
      </div>
      {isPending ? <span className="pb-2 text-xs text-ink-400">Loading…</span> : null}
    </div>
  );
}
