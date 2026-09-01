import { Permission, type StaffRole, type StaffStatus } from '@fit/types';
import type { BadgeTone, DotTone } from '@fit/ui-kit';

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
 * Badge tone per role — all neutral, on purpose.
 *
 * This used to be four separate hues (violet OWNER, blue MANAGER, teal
 * RECEPTIONIST, orange TRAINER) so "a mixed roster tells you who is who without
 * reading the label". Two things ended that.
 *
 * The first is that it had already stopped working: FormaCore flattens every
 * categorical hue onto the ink ramp, so all four chips rendered as the same
 * grey while this file still claimed four colours. The comment described a
 * screen nobody could see any more.
 *
 * The second is that the promise was never sound. A role is not a state — there
 * are four of them, they are not ordered, and the only thing that reliably
 * distinguishes them is the WORD. Colour-coded roles are unreadable to a
 * colour-blind viewer and silent to a screen reader, so the label had to carry
 * it regardless; the hue was decoration that looked like information.
 *
 * The direction spends its one chromatic voice on the lime, and the status
 * column beside this one is what genuinely needs a signal.
 */
export const ROLE_TONES: Record<StaffRole, BadgeTone> = {
  OWNER: 'neutral',
  MANAGER: 'neutral',
  RECEPTIONIST: 'neutral',
  TRAINER: 'neutral',
};

/**
 * Badge tone per lifecycle status — the direction's three signals.
 *
 * This is where a signal belongs: three states, ordered, and each one changes
 * what a staff member can do. Active is the lime, invited is ink (waiting, not
 * wrong), suspended is the one red.
 */
export const STATUS_TONES: Record<StaffStatus, BadgeTone> = {
  ACTIVE: 'positive',
  INVITED: 'pending',
  SUSPENDED: 'danger',
};

/** Dot tone per status, shown inside the status badge. */
export const STATUS_DOT: Record<StaffStatus, DotTone> = {
  ACTIVE: 'positive',
  INVITED: 'pending',
  SUSPENDED: 'danger',
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
  [Permission.GymSubscriptionManage]: 'gymSubscriptionManage',
  [Permission.LocationManage]: 'locationManage',
  [Permission.StaffRead]: 'staffRead',
  [Permission.StaffAssignRole]: 'staffAssignRole',
  [Permission.StaffAssignLocation]: 'staffAssignLocation',
  [Permission.StaffScheduleRead]: 'staffScheduleRead',
  [Permission.StaffScheduleManage]: 'staffScheduleManage',
  [Permission.RolesRead]: 'rolesRead',
  [Permission.RolesManage]: 'rolesManage',
  [Permission.MembershipManage]: 'membershipManage',
  [Permission.MembershipSell]: 'membershipSell',
  [Permission.MembershipRenew]: 'membershipRenew',
  [Permission.MembershipCancel]: 'membershipCancel',
  [Permission.MemberPaymentRead]: 'memberPaymentRead',
  [Permission.MemberCheckinRead]: 'memberCheckinRead',
  [Permission.TrainerScheduleManage]: 'trainerScheduleManage',
  [Permission.PosAccess]: 'posAccess',
  [Permission.PaymentProcess]: 'paymentProcess',
  [Permission.PaymentRefund]: 'paymentRefund',
  [Permission.DiscountApply]: 'discountApply',
  [Permission.TransactionRead]: 'transactionRead',
  [Permission.SalesHistoryRead]: 'salesHistoryRead',
  [Permission.ProductPricing]: 'productPricing',
  [Permission.InventoryRead]: 'inventoryRead',
  [Permission.InventoryAdjust]: 'inventoryAdjust',
  [Permission.StocktakePerform]: 'stocktakePerform',
  [Permission.StockMovementRead]: 'stockMovementRead',
  [Permission.PtPackageRead]: 'ptPackageRead',
  [Permission.PtPackageSell]: 'ptPackageSell',
  [Permission.ClassManageOwn]: 'classManageOwn',
  [Permission.BookingManage]: 'bookingManage',
  [Permission.ClassAttendance]: 'classAttendance',
  [Permission.ClassWaitlist]: 'classWaitlist',
  [Permission.PtSessionRead]: 'ptSessionRead',
  [Permission.PtSessionManage]: 'ptSessionManage',
  [Permission.PtSessionManageOwn]: 'ptSessionManageOwn',
  [Permission.RevenueRead]: 'revenueRead',
  [Permission.ReportExport]: 'reportExport',
};

/** Render initials for the avatar placeholder from a display name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}
