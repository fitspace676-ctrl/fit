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

/** The gym-scoped role names a permission grant is keyed by (SUPER_ADMIN holds all). */
export type GymScopedRoleName = 'OWNER' | 'MANAGER' | 'RECEPTIONIST' | 'TRAINER' | 'MEMBER';

/**
 * Fine-grained, gym-scoped capabilities. A role is the coarse identity a caller
 * carries; a {@link Permission} is the specific action a handler gates on.
 * Authorize on a capability (`@RequirePermissions(...)`) rather than a role
 * whenever it cuts across roles — adding a role later then only means editing
 * {@link ROLE_PERMISSIONS}, not every handler.
 *
 * Naming is `resource:action`. The set is deliberately small and grounded in the
 * roles that exist today; extend it alongside {@link ROLE_PERMISSIONS} as
 * features arrive.
 */
export enum Permission {
  /** Read or change gym-level settings and configuration. */
  GymManage = 'gym:manage',
  /** Invite, remove, or re-role staff within the gym. */
  StaffManage = 'staff:manage',
  /** View the gym's member roster and member details. */
  MemberRead = 'member:read',
  /** Create, update, or remove members. */
  MemberWrite = 'member:write',
  /** View the gym's trainer roster and trainer profiles. */
  TrainerRead = 'trainer:read',
  /** Create, update, deactivate, or remove trainer profiles. */
  TrainerWrite = 'trainer:write',
  /** View the gym's locations (branches) and their hours/amenities. */
  LocationRead = 'location:read',
  /** Create, update, deactivate, or remove locations. */
  LocationWrite = 'location:write',
  /** View the gym's retail products, their gallery, and variants. */
  ProductRead = 'product:read',
  /** Create, update, deactivate, or remove products. */
  ProductWrite = 'product:write',
  /** View the gym's personal-training package plans. */
  PackageRead = 'package:read',
  /** Create, update, deactivate, or remove personal-training package plans. */
  PackageWrite = 'package:write',
  /** View the gym's recurring class templates and their schedules. */
  ClassRead = 'class:read',
  /** Create, update, pause, or remove recurring class templates. */
  ClassWrite = 'class:write',
  /** Book, waitlist, or cancel oneself for a scheduled class occurrence. */
  ClassBook = 'class:book',
  /** Post a rating + review for a class one attended (member self-service). */
  ReviewWrite = 'review:write',
  /** Register or remove one's own device for push notifications (self-service). */
  NotificationManage = 'notification:manage',
  /** Moderate reviews — list all (incl. hidden) and hide/unhide abusive ones. */
  ReviewModerate = 'review:moderate',
  /** View billing, invoices, and payment history. */
  BillingRead = 'billing:read',
  /** Manage subscriptions, plans, and payment settings. */
  BillingManage = 'billing:manage',
  /** Freeze / pause and resume one's own membership subscription (member self-service). */
  SubscriptionManage = 'subscription:manage',
  /** Buy class-credit packs and view one's own remaining credits (member self-service). */
  CreditPackManage = 'credit-pack:manage',
  /** View workout plans and assignments. */
  WorkoutRead = 'workout:read',
  /** Create or assign workout plans. */
  WorkoutWrite = 'workout:write',
  /** View analytics and reports. */
  ReportView = 'report:view',
  /** View automation rules and their run history. */
  AutomationRead = 'automation:read',
  /** Create, update, toggle, or remove automation rules. */
  AutomationManage = 'automation:manage',
  /** View marketing campaigns, promo codes, segments, and templates. */
  MarketingRead = 'marketing:read',
  /** Create, update, send, or remove marketing campaigns and promo codes. */
  MarketingManage = 'marketing:manage',
  /** View the loyalty program config, points ledger, rewards, and redemptions. */
  LoyaltyRead = 'loyalty:read',
  /** Configure the loyalty program and manage rewards and redemptions. */
  LoyaltyManage = 'loyalty:manage',
  /** View the gym's audit log of privileged actions. */
  AuditRead = 'audit:read',
  /** Read and edit one's own profile (self-service; held by every gym member). */
  ProfileManage = 'profile:manage',
}

/**
 * Every {@link Permission}, in declaration order.
 *
 * Read off the enum rather than re-listed, so a capability added above is
 * automatically part of "all permissions" — which matters because that phrase is
 * load-bearing: it is what the OWNER role is pinned to (`./role-permissions`), and
 * a hand-maintained copy that fell one entry behind would quietly leave the gym's
 * owner unable to reach a new screen.
 *
 * Also the canonical ORDER. Anything that has to present or store a permission set
 * sorts by this list, so two sets holding the same capabilities serialise
 * identically instead of differing by the order a click happened to add them in.
 */
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

/**
 * Maps each gym-scoped role to the {@link Permission}s it grants. Higher-privilege
 * roles are supersets of lower ones by construction, but stated explicitly (not
 * via inheritance) so an unusual grant stays readable at a glance.
 *
 * `SUPER_ADMIN` is intentionally absent: it is platform-wide rather than
 * gym-scoped and holds *every* permission unconditionally — see
 * {@link roleHasPermission}. The `satisfies` clause keeps the map exhaustive over
 * the gym-scoped roles at compile time.
 */
export const ROLE_PERMISSIONS = {
  OWNER: [
    Permission.GymManage,
    Permission.StaffManage,
    Permission.MemberRead,
    Permission.MemberWrite,
    Permission.TrainerRead,
    Permission.TrainerWrite,
    Permission.LocationRead,
    Permission.LocationWrite,
    Permission.ProductRead,
    Permission.ProductWrite,
    Permission.PackageRead,
    Permission.PackageWrite,
    Permission.ClassRead,
    Permission.ClassWrite,
    Permission.ClassBook,
    Permission.ReviewWrite,
    Permission.ReviewModerate,
    Permission.NotificationManage,
    Permission.BillingRead,
    Permission.BillingManage,
    Permission.SubscriptionManage,
    Permission.CreditPackManage,
    Permission.WorkoutRead,
    Permission.WorkoutWrite,
    Permission.ReportView,
    Permission.AutomationRead,
    Permission.AutomationManage,
    Permission.MarketingRead,
    Permission.MarketingManage,
    Permission.LoyaltyRead,
    Permission.LoyaltyManage,
    Permission.AuditRead,
    Permission.ProfileManage,
  ],
  MANAGER: [
    Permission.StaffManage,
    Permission.MemberRead,
    Permission.MemberWrite,
    Permission.TrainerRead,
    Permission.TrainerWrite,
    Permission.LocationRead,
    Permission.LocationWrite,
    Permission.ProductRead,
    Permission.ProductWrite,
    Permission.PackageRead,
    Permission.PackageWrite,
    Permission.ClassRead,
    Permission.ClassWrite,
    Permission.ReviewModerate,
    Permission.BillingRead,
    Permission.BillingManage,
    Permission.WorkoutRead,
    Permission.WorkoutWrite,
    Permission.ReportView,
    Permission.AutomationRead,
    Permission.AutomationManage,
    Permission.MarketingRead,
    Permission.MarketingManage,
    Permission.LoyaltyRead,
    Permission.LoyaltyManage,
    Permission.AuditRead,
    Permission.ProfileManage,
  ],
  RECEPTIONIST: [
    Permission.MemberRead,
    Permission.MemberWrite,
    Permission.TrainerRead,
    Permission.LocationRead,
    Permission.ProductRead,
    Permission.PackageRead,
    Permission.ClassRead,
    Permission.BillingRead,
    // Front-desk staff redeem loyalty points, but never configure campaigns,
    // automations, or the program itself.
    Permission.LoyaltyRead,
    Permission.ProfileManage,
  ],
  TRAINER: [
    Permission.MemberRead,
    Permission.TrainerRead,
    Permission.LocationRead,
    Permission.ProductRead,
    Permission.PackageRead,
    Permission.ClassRead,
    Permission.WorkoutRead,
    Permission.WorkoutWrite,
    Permission.ProfileManage,
  ],
  MEMBER: [
    Permission.WorkoutRead,
    Permission.ClassBook,
    Permission.ReviewWrite,
    Permission.NotificationManage,
    Permission.SubscriptionManage,
    Permission.CreditPackManage,
    Permission.ProfileManage,
  ],
} satisfies Record<GymScopedRoleName, readonly Permission[]>;

/**
 * Whether `role` (a role *name*) is granted `permission`. `SUPER_ADMIN` always
 * passes — it is the platform-wide role and is never tenant-scoped. An unknown
 * role name grants nothing (fail closed).
 *
 * This answers the question WITHOUT a gym: the built-in matrix, as shipped. Since
 * a gym may now edit its roles at runtime (`./role-permissions`), a caller that
 * holds the gym's settings should resolve against those instead —
 * `resolveRolePermissions`. This stays the default-behaviour path, and the two
 * agree exactly for a gym that has never opened the editor, which is why nothing
 * had to be migrated when overrides arrived.
 */
export function roleHasPermission(role: string, permission: Permission): boolean {
  if (role === 'SUPER_ADMIN') {
    return true;
  }
  const grants = (ROLE_PERMISSIONS as Record<string, readonly Permission[]>)[role];
  return grants?.includes(permission) ?? false;
}
