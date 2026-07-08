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

/** Badge tone per role, matching the formacore staff artboard's role palette. */
export const ROLE_TONES: Record<StaffRole, Tone> = {
  OWNER: 'iris',
  MANAGER: 'brand',
  RECEPTIONIST: 'success',
  TRAINER: 'accent',
};

/** Dot background class per role — the swatch shown in the invite role selector. */
export const ROLE_DOT: Record<StaffRole, string> = {
  OWNER: 'bg-iris-400',
  MANAGER: 'bg-brand-400',
  RECEPTIONIST: 'bg-success-400',
  TRAINER: 'bg-accent-400',
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
  [Permission.CrmRead]: 'crmRead',
  [Permission.CrmManage]: 'crmManage',
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
