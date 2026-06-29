import type { IconName } from '@/src/components/ui';

/** A member-portal navigation destination. */
export interface NavItem {
  /** i18n key under `member.nav`. */
  key: 'home' | 'classes' | 'bookings' | 'trainer' | 'shop' | 'membership';
  /** Locale-less href (the i18n `Link` adds the prefix). */
  href: string;
  icon: IconName;
}

/** The primary nav, shared by the desktop bar, the mobile drawer, and the tab bar. */
export const NAV_ITEMS: NavItem[] = [
  { key: 'home', href: '/home', icon: 'home' },
  { key: 'classes', href: '/classes', icon: 'calendar' },
  { key: 'bookings', href: '/account/bookings', icon: 'clock' },
  { key: 'trainer', href: '/trainers', icon: 'dumbbell' },
  { key: 'shop', href: '/shop', icon: 'bag' },
  { key: 'membership', href: '/account/membership', icon: 'ticket' },
];

/**
 * Is `href` the active nav target for the current locale-less `pathname`?
 * `/home` matches exactly; the rest match their subtree (so `/classes/42` still
 * lights up Classes).
 */
export function isActive(pathname: string, href: string): boolean {
  if (href === '/home') {
    return pathname === '/home';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
