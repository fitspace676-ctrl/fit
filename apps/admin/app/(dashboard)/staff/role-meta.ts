import { Permission, type StaffRole, type StaffStatus } from '@fit/types';
import type { Tone } from '@/components/ui';

/**
 * Shared presentation metadata for the staff console (T2.10) — the role/status
 * tones and dot colours the roster, invite modal and row menu all key off, plus
 * the i18n key each `Permission` maps to. Kept in one place so the table, the
 * console shell and the invite modal can never drift on how a role is coloured.
 */

/** Assignable staff roles, high-to-low privilege — the roster filter + row menu order. */
export const STAFF_ROLES: readonly StaffRole[] = ['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER'];

/** Roles offered in the invite modal (default `MANAGER`), least-to-most sensitive last. */
export const INVITE_ROLES: readonly StaffRole[] = ['MANAGER', 'RECEPTIONIST', 'TRAINER', 'OWNER'];

/**
 * Badge tone per role — one clearly separate hue each, so a mixed roster tells
 * you who is who without reading the label.
 *
 * The four hues are deliberately the non-status ones: `success` / `warning` /
 * `danger` are spoken for by the status column sitting right next to the role
 * chip in the same row (green Active, amber Invited, red Suspended), so a green
 * role badge would read as a second status. `brand` / `accent` / `iris` all
 * collapse onto the same purple chip in the Fit theme, so only one of them can
 * be spent here — it goes to OWNER, the brand-tier role.
 */
export const ROLE_TONES: Record<StaffRole, Tone> = {
  OWNER: 'iris', // violet
  MANAGER: 'info', // blue
  RECEPTIONIST: 'teal',
  TRAINER: 'flame', // orange
};

/**
 * Dot background class per role — the swatch shown in the invite role selector.
 * The 400 stop of the ramp behind each {@link ROLE_TONES} hue, so the dot in the
 * selector and the badge it produces are recognisably the same colour.
 */
export const ROLE_DOT: Record<StaffRole, string> = {
  OWNER: 'bg-iris-400',
  MANAGER: 'bg-info-400',
  RECEPTIONIST: 'bg-teal-400',
  TRAINER: 'bg-flame-400',
};

/**
 * Avatar tint per role — the same categorical ramp the role badge is painted
 * from, as the `[background, text]` token pair. The initials bubble is the first
 * thing the eye lands on in a roster row, so colouring it by role makes the row
 * identifiable before the role column is read at all. Light/dark is handled by
 * the theme: these are `light-dark()` tokens, not fixed hexes.
 */
export const ROLE_AVATAR: Record<StaffRole, readonly [bg: string, fg: string]> = {
  OWNER: ['var(--color-background-purple)', 'var(--color-text-purple)'],
  MANAGER: ['var(--color-background-blue)', 'var(--color-text-blue)'],
  RECEPTIONIST: ['var(--color-background-teal)', 'var(--color-text-teal)'],
  TRAINER: ['var(--color-background-orange)', 'var(--color-text-orange)'],
};

/** Badge tone per lifecycle status — green active, amber invited, red suspended. */
export const STATUS_TONES: Record<StaffStatus, Tone> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  SUSPENDED: 'danger',
};

/** Dot background class per status, shown inside the status badge. */
export const STATUS_DOT: Record<StaffStatus, string> = {
  ACTIVE: 'bg-success-400',
  INVITED: 'bg-warning-400',
  SUSPENDED: 'bg-danger-400',
};

/**
 * The i18n leaf key (under `admin.staff.permissions`) for each capability, so the
 * downgrade-confirmation modal can spell out what a re-role gives up in the
 * viewer's language. Keyed by the `Permission` enum value.
 */
export const PERMISSION_KEYS: Record<Permission, string> = {
  [Permission.GymManage]: 'gymManage',
  [Permission.StaffManage]: 'staffManage',
  [Permission.MemberRead]: 'memberRead',
  [Permission.MemberWrite]: 'memberWrite',
  [Permission.TrainerRead]: 'trainerRead',
  [Permission.TrainerWrite]: 'trainerWrite',
  [Permission.LocationRead]: 'locationRead',
  [Permission.LocationWrite]: 'locationWrite',
  [Permission.ProductRead]: 'productRead',
  [Permission.ProductWrite]: 'productWrite',
  [Permission.PackageRead]: 'packageRead',
  [Permission.PackageWrite]: 'packageWrite',
  [Permission.ClassRead]: 'classRead',
  [Permission.ClassWrite]: 'classWrite',
  [Permission.ClassBook]: 'classBook',
  [Permission.ReviewWrite]: 'reviewWrite',
  [Permission.ReviewModerate]: 'reviewModerate',
  [Permission.NotificationManage]: 'notificationManage',
  [Permission.BillingRead]: 'billingRead',
  [Permission.BillingManage]: 'billingManage',
  [Permission.SubscriptionManage]: 'subscriptionManage',
  [Permission.CreditPackManage]: 'creditPackManage',
  [Permission.WorkoutRead]: 'workoutRead',
  [Permission.WorkoutWrite]: 'workoutWrite',
  [Permission.ReportView]: 'reportView',
  [Permission.AutomationRead]: 'automationRead',
  [Permission.AutomationManage]: 'automationManage',
  [Permission.MarketingRead]: 'marketingRead',
  [Permission.MarketingManage]: 'marketingManage',
  [Permission.LoyaltyRead]: 'loyaltyRead',
  [Permission.LoyaltyManage]: 'loyaltyManage',
  [Permission.AuditRead]: 'auditRead',
  [Permission.ProfileManage]: 'profileManage',
};

/** Render initials for the avatar placeholder from a display name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}
