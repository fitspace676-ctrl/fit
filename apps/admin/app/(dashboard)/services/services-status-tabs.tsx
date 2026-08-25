'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FilterChips, type FilterChip } from '@fit/ui-kit';

/** The tabs, in roster-priority order. No "All" — the API defaults to ACTIVE. */
const TABS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ARCHIVED', label: 'Archived' },
];

/**
 * The services catalogue's segmented status tabs: a pill row that maps to the
 * `status` URL param the server page reads. Each tab pins a `ServiceStatus`;
 * every change resets to page 1 and runs in a transition so the pills stay
 * responsive. Mirrors the shop catalog's status tabs.
 */
export function ServicesStatusTabs({ status }: { status: string }) {
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
      label="Filter services by status"
    />
  );
}
