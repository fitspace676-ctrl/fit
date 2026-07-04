'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ProductStatus } from '@fit/types';

/** The tabs, in roster-priority order. `''` is the "All" tab that clears the filter. */
const TABS: ReadonlyArray<{ value: ProductStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

/** The engine gradient the active tab wears, shared across the formacore screens. */
const ACTIVE_TAB =
  'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white ring-transparent shadow-[0_6px_18px_-8px_rgba(124,58,237,0.8)]';
const IDLE_TAB =
  'bg-ink-50 text-ink-600 ring-ink-200 hover:bg-ink-100 dark:bg-white/[0.03] dark:text-ink-300 dark:ring-white/10 dark:hover:bg-white/[0.06]';

/**
 * The product catalog's segmented status tabs (T4.5), matching the formacore shop
 * artboard: a pill row that maps to the `status` URL param the server page reads.
 * "All" clears the filter; each other tab pins a {@link ProductStatus}. Every change
 * resets to page 1 and runs in a transition so the pills stay responsive. Mirrors
 * the orders roster's status tabs so the two rosters read the same.
 */
export function ProductsStatusTabs({ status }: { status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function select(value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('status', value);
    } else {
      params.delete('status');
    }
    params.delete('page');
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <div
      role="tablist"
      aria-label="Filter products by status"
      className="flex flex-wrap items-center gap-1.5"
    >
      {TABS.map((tab) => {
        const active = tab.value === status || (tab.value === '' && status === '');
        return (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => select(tab.value)}
            className={`h-9 rounded-pill px-3.5 text-xs font-semibold ring-1 ring-inset transition ${
              active ? ACTIVE_TAB : IDLE_TAB
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
