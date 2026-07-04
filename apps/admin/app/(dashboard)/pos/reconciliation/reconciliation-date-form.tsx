'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Field, Input } from '@/components/ui';

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
      <Field label="Business day" htmlFor="reconciliation-date" className="sm:w-52">
        <Input
          id="reconciliation-date"
          type="date"
          value={date}
          max={today}
          onChange={(event) => commit(event.target.value)}
        />
      </Field>
      {isPending ? <span className="pb-3 text-xs text-ink-400">Loading…</span> : null}
    </div>
  );
}
