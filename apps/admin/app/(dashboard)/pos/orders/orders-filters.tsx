'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: '0.75rem',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  label: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  control: {
    height: '2.5rem',
    minWidth: '10rem',
    boxSizing: 'border-box',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.875rem',
  },
  reset: {
    height: '2.5rem',
    paddingInline: '1rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
});

/**
 * The sales log's filter bar. Every control writes straight to the URL, so a
 * filtered view is a link a manager can bookmark or paste to someone else — and
 * the server component above re-runs the query rather than the page holding a
 * second copy of the state.
 */
export function OrdersFilters({
  channel,
  status,
  from,
  to,
}: {
  channel: string;
  status: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  /** Write one filter to the URL, always returning to the first page. */
  function commit(key: string, value: string): void {
    const next = new URLSearchParams(params.toString());
    if (value === '') next.delete(key);
    else next.set(key, value);
    next.delete('page');
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  return (
    <div {...stylex.props(styles.bar)}>
      <div {...stylex.props(styles.field)}>
        <label htmlFor="orders-channel" {...stylex.props(styles.label)}>
          Channel
        </label>
        <select
          id="orders-channel"
          value={channel}
          onChange={(e) => commit('channel', e.target.value)}
          {...stylex.props(styles.control)}
        >
          <option value="POS">Till (POS)</option>
          <option value="ONLINE">Online shop</option>
          <option value="ALL">Both</option>
        </select>
      </div>

      <div {...stylex.props(styles.field)}>
        <label htmlFor="orders-status" {...stylex.props(styles.label)}>
          Status
        </label>
        <select
          id="orders-status"
          value={status}
          onChange={(e) => commit('status', e.target.value)}
          {...stylex.props(styles.control)}
        >
          <option value="">Any</option>
          <option value="PAID">Paid</option>
          <option value="PENDING">Pending</option>
          <option value="REFUNDED">Refunded</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div {...stylex.props(styles.field)}>
        <label htmlFor="orders-from" {...stylex.props(styles.label)}>
          From
        </label>
        <input
          id="orders-from"
          type="date"
          value={from}
          onChange={(e) => commit('from', e.target.value)}
          {...stylex.props(styles.control)}
        />
      </div>

      <div {...stylex.props(styles.field)}>
        <label htmlFor="orders-to" {...stylex.props(styles.label)}>
          To
        </label>
        <input
          id="orders-to"
          type="date"
          value={to}
          onChange={(e) => commit('to', e.target.value)}
          {...stylex.props(styles.control)}
        />
      </div>

      <button
        type="button"
        onClick={() => startTransition(() => router.replace(pathname))}
        {...stylex.props(styles.reset)}
      >
        Reset
      </button>
    </div>
  );
}
