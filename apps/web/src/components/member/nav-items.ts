import type { IconName } from '@/src/components/ui';

/** A member-portal navigation destination. */
export interface NavItem {
  /** i18n key under `member.nav`. */
  key: 'home' | 'classes' | 'bookings' | 'trainer' | 'services' | 'shop' | 'membership';
  /** Locale-less href (the i18n `Link` adds the prefix). */
  href: string;
  icon: IconName;
}

/** The primary nav, shared by the desktop bar, the mobile drawer, and the tab bar. */
export const NAV_ITEMS: NavItem[] = [
  { key: 'home', href: '/member/home', icon: 'home' },
  { key: 'classes', href: '/member/classes', icon: 'calendar' },
  { key: 'bookings', href: '/member/account/bookings', icon: 'clock' },
  { key: 'trainer', href: '/member/trainers', icon: 'dumbbell' },
  { key: 'services', href: '/member/services', icon: 'spark' },
  { key: 'shop', href: '/member/shop', icon: 'bag' },
  { key: 'membership', href: '/member/account/membership', icon: 'ticket' },
];

/**
 * Is `href` the active nav target for the current locale-less `pathname`?
 * `/member/home` matches exactly; the rest match their subtree (so `/member/classes/42` still
 * lights up Classes).
 */
export function isActive(pathname: string, href: string): boolean {
  if (href === '/member/home') {
    return pathname === '/member/home';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
