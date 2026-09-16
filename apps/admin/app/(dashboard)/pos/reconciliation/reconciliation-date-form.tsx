'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.75rem',
  },
  field: {
    width: {
      default: 'auto',
      '@media (min-width: 640px)': '13rem',
    },
  },
  label: {
    display: 'block',
    marginBottom: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  input: {
    height: '2.75rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    paddingBlock: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    boxShadow: {
      default: 'none',
      ':focus': '0 0 0 4px color-mix(in srgb, var(--color-accent) 20%, transparent)',
    },
  },
  pending: {
    paddingBottom: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The business-day picker for the reconciliation report. The selected `date` is the
 * single source of truth the server page reads from the URL, so changing it just
 * pushes `?date=` and lets the page re-fetch. Navigation runs in a transition so
 * the control stays responsive while the server re-renders. `max` pins the picker
 * to today — there are no future takings to reconcile.
 *
 * The date is rewritten *into* the existing query rather than replacing it: the
 * branch this report is scoped to can also be pinned on the URL (`?locationId=`,
 * written by the top-bar switcher and carried by shared links), and rebuilding the
 * query from scratch would drop it — silently re-scoping the count to whatever the
 * cookie says the moment someone changed the day.
 */
export function ReconciliationDateForm({ date }: { date: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function commit(value: string): void {
    if (!value) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', value);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.field)}>
        <label htmlFor="reconciliation-date" {...stylex.props(styles.label)}>
          Business day
        </label>
        <input
          id="reconciliation-date"
          type="date"
          value={date}
          max={today}
          onChange={(event) => commit(event.target.value)}
          {...stylex.props(styles.input)}
        />
      </div>
      {isPending ? <span {...stylex.props(styles.pending)}>Loading…</span> : null}
    </div>
  );
}
