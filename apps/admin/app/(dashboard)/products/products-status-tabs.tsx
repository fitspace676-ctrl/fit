'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ProductStatus } from '@fit/types';
import { FilterChips, type FilterChip } from '@/components/ui';

/** The tabs, in roster-priority order. `''` is the "All" tab that clears the filter. */
const TABS: ReadonlyArray<{ value: ProductStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

/**
 * The product catalog's segmented status tabs (T4.5), rebuilt on the shared Astryx
 * {@link FilterChips} strip (T11.22): a pill row that maps to the `status` URL param
 * the server page reads. "All" clears the filter; each other tab pins a
 * {@link ProductStatus}. Every change resets to page 1 and runs in a transition so
 * the pills stay responsive. Mirrors the members roster's status tabs so the two
 * rosters read the same.
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

  const chips: FilterChip[] = TABS.map((tab) => ({ label: tab.label, value: tab.value }));

  return (
    <FilterChips
      chips={chips}
      active={status}
      onSelect={select}
      ariaLabel="Filter products by status"
    />
  );
}
