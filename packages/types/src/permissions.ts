// @fit/types — the role/permission authorization matrix.
//
// The single source of truth shared by the API (the `@RequirePermissions`
// decorator + global PermissionsGuard) and the web/admin clients
// (`usePermissions()`). Keeping it here — not in the API — is what lets the
// server and the UIs agree on exactly what each role can do without one drifting
// from the other.
//
// Roles are referenced by name (string) rather than importing the Prisma `Role`
// enum: this package is consumed by the browser bundles too, which must not pull
// in `@fit/db` (the Prisma client). The role *names* are the stable contract.
//
// The matrix follows the roles policy written on 2026-09-01 (see
// docs/superpowers/plans/2026-09-01-roles-permissions-matrix.md):
//
//   OWNER         full system access and control
//   MANAGER       full operational management; no gym settings, no roles &
//                 permissions, no ownership, no FormaCore subscription
//   RECEPTIONIST  front desk: members, memberships, POS (no refunds), bookings,
//                 check-ins, PT bookings; no inventory changes, no reports
//   TRAINER       training-focused: own classes / PT sessions, workout plans,
//                 member training profiles; no POS, no products, no money
//   MEMBER        self-service only
//
// Two things the matrix deliberately does NOT express, because they are data
// scoping rather than capabilities and are enforced (or will be) elsewhere:
//   • "assigned locations" — a MANAGER / RECEPTIONIST / TRAINER acts within the
//     locations on their `GymMember.assignedLocationIds`;
//   • "own" resources — a TRAINER manages their *own* classes and PT sessions.
//     The `*ManageOwn` permissions name that intent; the handlers that honour
//     them are the ownership-aware ones (until then a trainer is denied, which
//     is the fail-closed side).

/** The gym-scoped role names a permission grant is keyed by (SUPER_ADMIN holds all). */
type GymScopedRoleName = 'OWNER' | 'MANAGER' | 'RECEPTIONIST' | 'TRAINER' | 'MEMBER';

/**
 * Fine-grained, gym-scoped capabilities. A role is the coarse identity a caller
 * carries; a {@link Permission} is the specific action a handler gates on.
 * Authorize on a capability (`@RequirePermissions(...)`) rather than a role
 * whenever it cuts across roles — adding a role later then only means editing
 * {@link ROLE_PERMISSIONS}, not every handler.
 *
 * Naming is `resource:action`. Extend it alongside {@link ROLE_PERMISSIONS} as
 * features arrive.
 */
export enum Permission {
  // -- Gym & locations -------------------------------------------------------
  /** Read or change gym-level settings and configuration. */
  GymManage = 'gym:manage',
  /** Manage the gym's own FormaCore subscription / plan and platform billing. */
  GymSubscriptionManage = 'gym-subscription:manage',
  /** View the gym's locations (branches) and their hours/amenities. */
  LocationRead = 'location:read',
  /** Edit a location's operational information (hours, contact, amenities, photos). */
  LocationWrite = 'location:write',
  /** Add locations, deactivate/reactivate them, and change location settings. */
  LocationManage = 'location:manage',

  // -- Staff, schedules, roles ----------------------------------------------
  /** View the staff roster and staff profiles. */
  StaffRead = 'staff:read',
  /** Invite, add, edit, deactivate, or remove staff; staff notes and tasks. */
  StaffManage = 'staff:manage',
  /** Change a staff member's role (OWNER accounts are reserved to owners). */
  StaffAssignRole = 'staff:assign-role',
  /** Assign staff to locations. */
  StaffAssignLocation = 'staff:assign-location',
  /** View staff working schedules, time off, and who is working now. */
  StaffScheduleRead = 'staff-schedule:read',
  /** Edit staff working schedules and decide time-off requests. */
  StaffScheduleManage = 'staff-schedule:manage',
  /** View the roles & permissions matrix. */
  RolesRead = 'roles:read',
  /** Manage roles & permissions (reserved for when custom roles arrive). */
  RolesManage = 'roles:manage',

  // -- Members & memberships -------------------------------------------------
  /** View the gym's member roster and member details. */
  MemberRead = 'member:read',
  /** Create, update, or remove members. */
  MemberWrite = 'member:write',
  /** Manage a member's membership: freeze and resume. */
  MembershipManage = 'membership:manage',
  /** Sell (enrol) a membership to a member. */
  MembershipSell = 'membership:sell',
  /** Renew a member's membership. */
  MembershipRenew = 'membership:renew',
  /** Cancel a member's membership. */
  MembershipCancel = 'membership:cancel',
  /** View a member's payments, invoices, and credit packs. */
  MemberPaymentRead = 'member-payment:read',
  /** View member check-ins (today's list, stats, eligibility). */
  MemberCheckinRead = 'member-checkin:read',

  // -- Trainers ----------------------------------------------------------------
  /** View the gym's trainer roster and trainer profiles. */
  TrainerRead = 'trainer:read',
  /** Create, update, deactivate, or remove trainer profiles. */
  TrainerWrite = 'trainer:write',
  /** Edit trainer working schedules / availability. */
  TrainerScheduleManage = 'trainer-schedule:manage',

  // -- POS & sales -------------------------------------------------------------
  /** Open the point of sale and ring up a cart. */
  PosAccess = 'pos:access',
  /** Record a sale and take payment. */
  PaymentProcess = 'payment:process',
  /** Refund an order. */
  PaymentRefund = 'payment:refund',
  /** Apply a discount / promo code to a sale. */
  DiscountApply = 'discount:apply',
  /** View orders and transactions. */
  TransactionRead = 'transaction:read',
  /** View sales history and the cash reconciliation. */
  SalesHistoryRead = 'sales-history:read',

  // -- Products & inventory ----------------------------------------------------
  /** View the gym's retail products, their gallery, and variants. */
  ProductRead = 'product:read',
  /** Create, update, deactivate, or remove products and services. */
  ProductWrite = 'product:write',
  /** Change a product's price or cost. */
  ProductPricing = 'product:pricing',
  /** View stock levels and the low-stock list. */
  InventoryRead = 'inventory:read',
  /** Adjust stock counts (receive, adjust, write off). */
  InventoryAdjust = 'inventory:adjust',
  /** Perform a stocktake (recount). */
  StocktakePerform = 'stocktake:perform',
  /** View the stock movement history. */
  StockMovementRead = 'stock-movement:read',

  // -- Plans & packages --------------------------------------------------------
  /** View the gym's personal-training package plans. */
  PackageRead = 'package:read',
  /** Create, update, deactivate, or remove personal-training package plans. */
  PackageWrite = 'package:write',
  /** View a member's PT packages / credit packs and the credit-pack catalogue. */
  PtPackageRead = 'pt-package:read',
  /** Sell (grant) a PT package / credit pack to a member. */
  PtPackageSell = 'pt-package:sell',

  // -- Classes & bookings ------------------------------------------------------
  /** View the gym's classes, templates, schedules, and calendar. */
  ClassRead = 'class:read',
  /** Create, update, pause, cancel, or remove classes and templates. */
  ClassWrite = 'class:write',
  /** Manage one's own classes only (trainer). */
  ClassManageOwn = 'class:manage-own',
  /** Book members into classes and cancel their bookings. */
  BookingManage = 'booking:manage',
  /** Mark class attendance (check-in, no-show). */
  ClassAttendance = 'class:attendance',
  /** Manage class waitlists (promote, remove). */
  ClassWaitlist = 'class:waitlist',
  /** Book, waitlist, or cancel oneself for a scheduled class occurrence. */
  ClassBook = 'class:book',

  // -- PT & training -------------------------------------------------------------
  /** View PT / service sessions and the PT calendar. */
  PtSessionRead = 'pt-session:read',
  /** Create, reschedule, cancel, or complete PT sessions. */
  PtSessionManage = 'pt-session:manage',
  /** Manage one's own PT sessions only (trainer). */
  PtSessionManageOwn = 'pt-session:manage-own',
  /** View workout plans and assignments. */
  WorkoutRead = 'workout:read',
  /** Create or assign workout plans. */
  WorkoutWrite = 'workout:write',

  // -- Revenue & billing -----------------------------------------------------------
  /** View revenue: totals, outstanding, recurring, and projected. */
  RevenueRead = 'revenue:read',
  /** View invoices, membership plans, and payment history. */
  BillingRead = 'billing:read',
  /** Manage invoices, membership plans, and payment settings. */
  BillingManage = 'billing:manage',

  // -- Reports, marketing, automation, loyalty, audit ------------------------------
  /** View analytics and reports. */
  ReportView = 'report:view',
  /** Export reports. */
  ReportExport = 'report:export',
  /** View marketing campaigns, promo codes, segments, and templates. */
  MarketingRead = 'marketing:read',
  /** Create, update, send, or remove marketing campaigns, promos, and pushes. */
  MarketingManage = 'marketing:manage',
  /** View automation rules and their run history. */
  AutomationRead = 'automation:read',
  /** Create, update, toggle, or remove automation rules. */
  AutomationManage = 'automation:manage',
  /** View the loyalty program config, points ledger, rewards, and redemptions. */
  LoyaltyRead = 'loyalty:read',
  /** Configure the loyalty program and manage rewards and redemptions. */
  LoyaltyManage = 'loyalty:manage',
  /** Moderate reviews — list all (incl. hidden) and hide/unhide abusive ones. */
  ReviewModerate = 'review:moderate',
  /** View the gym's audit log of privileged actions. */
  AuditRead = 'audit:read',

  // -- Member self-service ---------------------------------------------------------
  /** Post a rating + review for a class one attended. */
  ReviewWrite = 'review:write',
  /** Freeze / pause and resume one's own membership subscription. */
  SubscriptionManage = 'subscription:manage',
  /** Buy class-credit packs and view one's own remaining credits. */
  CreditPackManage = 'credit-pack:manage',

  // -- Account (held by every signed-in user, see ACCOUNT_PERMISSIONS) -------------
  /** Read and edit one's own profile. */
  ProfileManage = 'profile:manage',
  /** Register or remove one's own device for push notifications; read one's inbox. */
  NotificationManage = 'notification:manage',
}

/**
 * Capabilities that belong to the *account*, not to a gym role: every signed-in
 * user holds them whatever their role. They are kept out of
 * {@link ROLE_PERMISSIONS} on purpose — a roles matrix that listed "edit own
 * profile" under Receptionist would be describing the user, not the job.
 */
export const ACCOUNT_PERMISSIONS: readonly Permission[] = [
  Permission.ProfileManage,
  Permission.NotificationManage,
];

/** Everything a member does for themselves — never a staff capability. */
const MEMBER_SELF_SERVICE: readonly Permission[] = [
  Permission.WorkoutRead,
  Permission.ClassBook,
  Permission.ReviewWrite,
  Permission.SubscriptionManage,
  Permission.CreditPackManage,
];

/** The permissions a MANAGER does *not* hold — ownership and system-level control. */
const OWNER_ONLY: readonly Permission[] = [
  Permission.GymManage,
  Permission.GymSubscriptionManage,
  Permission.LocationManage,
  Permission.RolesManage,
];

const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

const without = (
  source: readonly Permission[],
  ...excluded: readonly (readonly Permission[])[]
): Permission[] => {
  const drop = new Set(excluded.flat());
  return source.filter((permission) => !drop.has(permission));
};

/**
 * Maps each gym-scoped role to the {@link Permission}s it grants.
 *
 * `OWNER` is "full system access" and so holds every permission, including the
 * member self-service ones (an owner who trains at their own gym books classes
 * like anyone else). `MANAGER` is the owner minus {@link OWNER_ONLY} and minus
 * member self-service. `RECEPTIONIST` and `TRAINER` are stated explicitly — an
 * unusual grant (or a deliberate absence) should stay readable at a glance.
 *
 * Account capabilities ({@link ACCOUNT_PERMISSIONS}) are implied for every role
 * by {@link roleHasPermission} and are not listed here.
 *
 * `SUPER_ADMIN` is intentionally absent: it is platform-wide rather than
 * gym-scoped and holds *every* permission unconditionally. The `satisfies`
 * clause keeps the map exhaustive over the gym-scoped roles at compile time.
 */
export const ROLE_PERMISSIONS = {
  OWNER: without(ALL_PERMISSIONS, ACCOUNT_PERMISSIONS),
  MANAGER: without(ALL_PERMISSIONS, ACCOUNT_PERMISSIONS, OWNER_ONLY, MEMBER_SELF_SERVICE, [
    // A manager holds the full versions of these; the "own" variants are the
    // trainer's narrower grant and would be redundant here.
    Permission.ClassManageOwn,
    Permission.PtSessionManageOwn,
  ]),
  RECEPTIONIST: [
    // Members & memberships
    Permission.MemberRead,
    Permission.MemberWrite,
    Permission.MembershipManage,
    Permission.MembershipSell,
    Permission.MembershipRenew,
    Permission.MembershipCancel,
    Permission.MemberPaymentRead,
    Permission.MemberCheckinRead,
    // POS & sales — no refunds: those need a manager or owner
    Permission.PosAccess,
    Permission.PaymentProcess,
    Permission.DiscountApply,
    Permission.TransactionRead,
    Permission.SalesHistoryRead,
    // Products — sell and see stock, never change it or its cost
    Permission.ProductRead,
    Permission.InventoryRead,
    // Plans & packages — needed to sell them
    Permission.PackageRead,
    Permission.BillingRead,
    Permission.PtPackageRead,
    Permission.PtPackageSell,
    // Classes & bookings
    Permission.ClassRead,
    Permission.BookingManage,
    Permission.ClassAttendance,
    Permission.ClassWaitlist,
    // PT — book, reschedule, cancel; never a trainer's working schedule
    Permission.PtSessionRead,
    Permission.PtSessionManage,
    // Trainers & staff — availability and schedules, read only
    Permission.TrainerRead,
    Permission.StaffScheduleRead,
    Permission.LocationRead,
    // Front-desk staff redeem loyalty points, but never configure the program.
    Permission.LoyaltyRead,
  ],
  TRAINER: [
    // Members — training profiles only; no memberships, no money
    Permission.MemberRead,
    // Classes — everyone's calendar, own classes to manage
    Permission.ClassRead,
    Permission.ClassManageOwn,
    // PT — everyone's calendar, own sessions to manage
    Permission.PtSessionRead,
    Permission.PtSessionManageOwn,
    // Schedules — own and other trainers', read only
    Permission.TrainerRead,
    Permission.StaffScheduleRead,
    Permission.LocationRead,
    // Workout plans
    Permission.WorkoutRead,
    Permission.WorkoutWrite,
  ],
  MEMBER: [...MEMBER_SELF_SERVICE],
} satisfies Record<GymScopedRoleName, readonly Permission[]>;

/**
 * Whether `role` (a role *name*) is granted `permission`. `SUPER_ADMIN` always
 * passes — it is the platform-wide role and is never tenant-scoped. Every known
 * role holds the {@link ACCOUNT_PERMISSIONS}. An unknown role name grants nothing
 * (fail closed). This is the one place permission resolution lives, so the
 * server guard and every client check stay in agreement.
 */
export function roleHasPermission(role: string, permission: Permission): boolean {
  if (role === 'SUPER_ADMIN') {
    return true;
  }
  const grants = (ROLE_PERMISSIONS as Record<string, readonly Permission[]>)[role];
  if (!grants) {
    return false;
  }
  return grants.includes(permission) || ACCOUNT_PERMISSIONS.includes(permission);
}
