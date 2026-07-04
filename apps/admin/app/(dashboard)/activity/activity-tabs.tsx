'use client';

// @fit/admin — the Activity area's tab bar (T3.10).
//
// Folds the audit-log viewer into the Activity screen: two tabs — the live event
// "Feed" and the privileged-action "Audit log" — rendered with the shared
// formacore `Tabs` primitive. The active tab lives in the `?tab=` search param so
// the server page stays the single source of truth; switching tabs replaces the
// URL with only the new `tab` (dropping the other tab's filters + pager, whose
// param names differ), navigating in a transition so the bar stays responsive.

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Tabs } from '@/components/ui';
import { ACTIVITY_TABS, type ActivityTab } from './tabs';

export function ActivityTabs({ active }: { active: ActivityTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const t = useTranslations('admin.activity');

  const items = ACTIVITY_TABS.map((tab) => ({
    value: tab,
    label: t(`tabs.${tab}`),
    icon: tab === 'audit' ? ('shield' as const) : ('bolt' as const),
  }));

  function select(next: string): void {
    // Start each tab clean — the two tabs filter on disjoint params (`type` vs
    // `action`) and keep independent pagers, so carrying one tab's query into the
    // other only confuses the reader. `feed` is the default and needs no param.
    const href = next === 'feed' ? pathname : `${pathname}?tab=${next}`;
    startTransition(() => router.replace(href));
  }

  return <Tabs items={items} value={active} onValueChange={select} aria-label={t('tabs.label')} />;
}
