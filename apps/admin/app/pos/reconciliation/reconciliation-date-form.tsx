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
          className="mb-1 block text-xs font-medium text-slate-500"
        >
          Business day
        </label>
        <input
          id="reconciliation-date"
          type="date"
          value={date}
          max={today}
          onChange={(event) => commit(event.target.value)}
          className="w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>
      {isPending ? <span className="pb-2 text-xs text-slate-400">Loading…</span> : null}
    </div>
  );
}
