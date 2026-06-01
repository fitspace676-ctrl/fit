import { Role } from '@fit/db';

/**
 * Fine-grained, gym-scoped capabilities. A {@link Role} is the coarse identity a
 * caller carries; a {@link Permission} is the specific action a handler gates on.
 * Decorate routes with `@RequirePermissions(...)` rather than `@Roles(...)`
 * whenever a capability cuts across roles — it keeps authorization expressed in
 * terms of *what* a request does, not *who* the caller happens to be, so adding
 * a role later only means editing {@link ROLE_PERMISSIONS}, not every handler.
 *
 * Naming is `resource:action`. The set is deliberately small and grounded in the
 * roles that exist today (domain models like workouts/billing land in later
 * tasks); extend it alongside {@link ROLE_PERMISSIONS} as features arrive.
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
  /** View billing, invoices, and payment history. */
  BillingRead = 'billing:read',
  /** Manage subscriptions, plans, and payment settings. */
  BillingManage = 'billing:manage',
  /** View workout plans and assignments. */
  WorkoutRead = 'workout:read',
  /** Create or assign workout plans. */
  WorkoutWrite = 'workout:write',
  /** View analytics and reports. */
  ReportView = 'report:view',
}

/**
 * The single source of truth mapping each gym-scoped {@link Role} to the
 * {@link Permission}s it grants. Higher-privilege roles are supersets of lower
 * ones here by construction, but the relationship is expressed explicitly (not
 * via inheritance) so an unusual grant — e.g. a TRAINER that can write workouts
 * but not read billing — stays readable at a glance.
 *
 * `SUPER_ADMIN` is intentionally absent: it is platform-wide rather than
 * gym-scoped and holds *every* permission unconditionally — see
 * {@link roleHasPermission}.
 */
export const ROLE_PERMISSIONS: Record<
  Exclude<Role, typeof Role.SUPER_ADMIN>,
  readonly Permission[]
> = {
  [Role.OWNER]: [
    Permission.GymManage,
    Permission.StaffManage,
    Permission.MemberRead,
    Permission.MemberWrite,
    Permission.BillingRead,
    Permission.BillingManage,
    Permission.WorkoutRead,
    Permission.WorkoutWrite,
    Permission.ReportView,
  ],
  [Role.MANAGER]: [
    Permission.StaffManage,
    Permission.MemberRead,
    Permission.MemberWrite,
    Permission.BillingRead,
    Permission.BillingManage,
    Permission.WorkoutRead,
    Permission.WorkoutWrite,
    Permission.ReportView,
  ],
  [Role.RECEPTIONIST]: [Permission.MemberRead, Permission.MemberWrite, Permission.BillingRead],
  [Role.TRAINER]: [Permission.MemberRead, Permission.WorkoutRead, Permission.WorkoutWrite],
  [Role.MEMBER]: [Permission.WorkoutRead],
};

/**
 * Whether `role` is granted `permission`. `SUPER_ADMIN` always passes — it is the
 * platform-wide role and is never tenant-scoped; every other role is checked
 * against {@link ROLE_PERMISSIONS}. This is the one place permission resolution
 * lives, so both the {@link PermissionsGuard} and any service-level check stay in
 * agreement.
 */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  if (role === Role.SUPER_ADMIN) {
    return true;
  }
  return ROLE_PERMISSIONS[role].includes(permission);
}
