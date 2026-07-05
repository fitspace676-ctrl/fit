'use client';

// Client island for the primitives demo (T11.3): drives the shared `Tabs`
// controlled, so the board shows real panel switching (and the WAI-ARIA
// roving-tabindex keyboard behaviour) rather than a static header.

import { useState } from 'react';
import { Tabs, type TabItem } from '@fit/ui-web';

const ITEMS: TabItem[] = [
  { value: 'overview', label: 'Overview', icon: 'grid' },
  { value: 'activity', label: 'Activity', icon: 'bolt' },
  { value: 'billing', label: 'Billing', icon: 'card' },
];

const PANELS: Record<string, string> = {
  overview: 'A summary of the account — the landing panel.',
  activity: 'Recent check-ins, bookings and orders.',
  billing: 'Invoices, plans and payment methods.',
};

export function PrimitivesTabs() {
  const [value, setValue] = useState('overview');
  return (
    <div className="flex flex-col gap-3">
      <Tabs items={ITEMS} value={value} onValueChange={setValue} aria-label="Demo sections" />
      <p className="text-sm text-ink-600 dark:text-ink-300">{PANELS[value]}</p>
    </div>
  );
}
