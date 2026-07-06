'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminOrderStatus } from '@fit/types';
import { FilterChips, type FilterChip } from '@/components/ui';

/** The tabs, in lifecycle order. `''` is the "All" tab that clears the filter. */
const TABS: ReadonlyArray<{ value: AdminOrderStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
];

/**
 * The orders roster's segmented status tabs (T4.3), rebuilt on the Astryx
 * {@link FilterChips} kit (T11.22): a pill row that maps to the `status` URL
 * param the server page reads. "All" clears the filter; each other tab pins an
 * {@link AdminOrderStatus}. Every change resets to page 1 and runs in a
 * transition so the pills stay responsive.
 */
export function OrdersStatusTabs({ status }: { status: string }) {
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

  const chips: FilterChip[] = TABS.map((tab) => ({ label: tab.label, value: tab.value }));

  return (
    <FilterChips
      chips={chips}
      active={status}
      onSelect={select}
      ariaLabel="Filter orders by status"
    />
  );
}
