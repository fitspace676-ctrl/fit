'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { OrderChannel } from '@fit/types';

/** Channel options offered by the filter. */
const CHANNEL_OPTIONS: ReadonlyArray<{ value: OrderChannel; label: string }> = [
  { value: 'POS', label: 'POS' },
  { value: 'ONLINE', label: 'Online' },
];

/** Debounce (ms) before a keystroke in the member box updates the URL. */
const SEARCH_DEBOUNCE_MS = 250;

const styles = stylex.create({
  row: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 1024px)': 'row',
    },
    flexWrap: {
      default: 'nowrap',
      '@media (min-width: 1024px)': 'wrap',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 1024px)': 'flex-end',
    },
    gap: '0.75rem',
  },
  channelField: {
    width: {
      default: '100%',
      '@media (min-width: 1024px)': '10rem',
    },
  },
  memberField: {
    flexGrow: 1,
    minWidth: {
      default: null,
      '@media (min-width: 1024px)': '12rem',
    },
  },
  dateField: {
    width: {
      default: '100%',
      '@media (min-width: 1024px)': '10rem',
    },
  },
  label: {
    marginBottom: '0.25rem',
    display: 'block',
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
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
});

/**
 * The orders roster filter bar (T7.9, restyled T4.3, rebuilt on brand-tokened
 * StyleX in T11.22): a channel select, a debounced member-id box, and a
 * `from`/`to` date range. Status is filtered by the segmented pill tabs above
 * (see {@link OrdersStatusTabs}), not here. Each control writes its state to the
 * URL search params (the single source of truth the server page reads), resetting
 * to page 1 on any change. Navigation runs in a transition so the inputs stay
 * responsive.
 */
export function OrdersFilters({
  channel,
  memberId,
  from,
  to,
}: {
  channel: string;
  memberId: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [memberValue, setMemberValue] = useState(memberId);

  useEffect(() => setMemberValue(memberId), [memberId]);

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onMemberChange(value: string): void {
    setMemberValue(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => commit('memberId', value.trim()), SEARCH_DEBOUNCE_MS);
  }

  return (
    <div {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.channelField)}>
        <label htmlFor="order-channel" {...stylex.props(styles.label)}>
          Channel
        </label>
        <select
          id="order-channel"
          value={channel}
          onChange={(event) => commit('channel', event.target.value)}
          {...stylex.props(styles.input)}
        >
          <option value="">All channels</option>
          {CHANNEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div {...stylex.props(styles.memberField)}>
        <label htmlFor="order-member" {...stylex.props(styles.label)}>
          Member ID
        </label>
        <input
          id="order-member"
          type="search"
          value={memberValue}
          onChange={(event) => onMemberChange(event.target.value)}
          placeholder="Filter by member id…"
          {...stylex.props(styles.input)}
        />
      </div>

      <div {...stylex.props(styles.dateField)}>
        <label htmlFor="order-from" {...stylex.props(styles.label)}>
          From
        </label>
        <input
          id="order-from"
          type="date"
          value={from}
          onChange={(event) => commit('from', event.target.value)}
          {...stylex.props(styles.input)}
        />
      </div>

      <div {...stylex.props(styles.dateField)}>
        <label htmlFor="order-to" {...stylex.props(styles.label)}>
          To
        </label>
        <input
          id="order-to"
          type="date"
          value={to}
          onChange={(event) => commit('to', event.target.value)}
          {...stylex.props(styles.input)}
        />
      </div>
    </div>
  );
}
