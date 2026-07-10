'use client';

// @fit/admin — the Classes hub's sub-navigation (Class Types · Schedule · PT
// Calendar · Bookings), consolidating scheduling under a single hub to mirror the
// reference admin. Rendered at the top of each hub tab's index page; drill-down
// routes (class detail, new/edit) intentionally omit it.

import { useTranslations } from 'next-intl';
import { HubTabs, type HubTab } from './hub-tabs';

export function ClassesTabs() {
  const t = useTranslations('admin.classesTabs');
  const items: HubTab[] = [
    { href: '/classes', label: t('types'), icon: 'dumbbell', exact: true },
    { href: '/classes/schedule', label: t('schedule'), icon: 'calendar' },
    { href: '/classes/pt-calendar', label: t('ptCalendar'), icon: 'calendarPlus' },
    { href: '/classes/bookings', label: t('bookings'), icon: 'ticket' },
  ];
  return <HubTabs items={items} ariaLabel={t('ariaLabel')} />;
}
