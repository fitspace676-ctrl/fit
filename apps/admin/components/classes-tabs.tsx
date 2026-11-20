'use client';

// @fit/admin — the Classes hub's sub-navigation (Class Types · Schedule · PT
// Calendar), consolidating scheduling under a single hub. Rendered at the top of
// each hub tab's index page; drill-down routes (class detail, new/edit)
// intentionally omit it.

import { useTranslations } from 'next-intl';
import { Permission } from '@fit/types';
import { consoleCan } from '@/lib/console-permissions';
import { useConsolePermissions } from './console-permissions';
import { HubTabs, type HubTab } from './hub-tabs';

export function ClassesTabs() {
  const t = useTranslations('admin.classesTabs');
  const permissions = useConsolePermissions();
  const items: HubTab[] = [
    { href: '/classes', label: t('types'), icon: 'dumbbell', exact: true },
    { href: '/classes/schedule', label: t('schedule'), icon: 'calendar' },
    ...(consoleCan(permissions, Permission.ClassWrite)
      ? [{ href: '/classes/rules', label: t('rules'), icon: 'shield' as const }] : []),
    ...(consoleCan(permissions, Permission.ClassAttendance)
      ? [{ href: '/classes/blocked', label: t('blocked'), icon: 'lock' as const }] : []),
    { href: '/classes/pt-calendar', label: t('ptCalendar'), icon: 'calendarPlus' },
  ];
  return <HubTabs items={items} ariaLabel={t('ariaLabel')} />;
}
