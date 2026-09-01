import { describe, expect, it } from 'vitest';
import { Role } from '@fit/db';
import { ACCOUNT_PERMISSIONS, Permission, ROLE_PERMISSIONS, roleHasPermission } from '@fit/types';

/** Index the (literal-keyed) matrix by a Prisma role value for the coverage check. */
const grantsFor = ROLE_PERMISSIONS as Record<string, readonly Permission[]>;

const holds = (role: string, ...permissions: Permission[]) => {
  for (const permission of permissions) {
    expect(roleHasPermission(role, permission), `${role} should hold ${permission}`).toBe(true);
  }
};
const lacks = (role: string, ...permissions: Permission[]) => {
  for (const permission of permissions) {
    expect(roleHasPermission(role, permission), `${role} should lack ${permission}`).toBe(false);
  }
};

describe('roleHasPermission', () => {
  it('grants SUPER_ADMIN every permission unconditionally', () => {
    holds(Role.SUPER_ADMIN, ...Object.values(Permission));
  });

  it('grants OWNER every permission (full system access)', () => {
    holds(Role.OWNER, ...Object.values(Permission));
  });

  it('gives MANAGER full operations but no ownership or system-level control', () => {
    holds(
      Role.MANAGER,
      Permission.StaffManage,
      Permission.StaffAssignRole,
      Permission.StaffAssignLocation,
      Permission.PaymentRefund,
      Permission.InventoryAdjust,
      Permission.StocktakePerform,
      Permission.ProductPricing,
      Permission.ReportView,
      Permission.ReportExport,
      Permission.RevenueRead,
      Permission.AutomationManage,
      Permission.MarketingManage,
      Permission.AuditRead,
      Permission.LocationWrite,
    );
    lacks(
      Role.MANAGER,
      Permission.GymManage,
      Permission.GymSubscriptionManage,
      Permission.LocationManage,
      Permission.RolesManage,
      // Member self-service is not a staff capability.
      Permission.ClassBook,
      Permission.ReviewWrite,
      Permission.SubscriptionManage,
      Permission.CreditPackManage,
    );
  });

  it('gives RECEPTIONIST the front desk but no refunds, stock changes, or reports', () => {
    holds(
      Role.RECEPTIONIST,
      Permission.MemberRead,
      Permission.MemberWrite,
      Permission.MembershipSell,
      Permission.MembershipManage,
      Permission.MembershipRenew,
      Permission.MembershipCancel,
      Permission.MemberPaymentRead,
      Permission.MemberCheckinRead,
      Permission.PosAccess,
      Permission.PaymentProcess,
      Permission.DiscountApply,
      Permission.TransactionRead,
      Permission.SalesHistoryRead,
      Permission.ProductRead,
      Permission.InventoryRead,
      Permission.BillingRead,
      Permission.BookingManage,
      Permission.ClassAttendance,
      Permission.ClassWaitlist,
      Permission.PtSessionManage,
      Permission.PtPackageSell,
      Permission.StaffScheduleRead,
    );
    lacks(
      Role.RECEPTIONIST,
      Permission.PaymentRefund,
      Permission.InventoryAdjust,
      Permission.StocktakePerform,
      Permission.ProductPricing,
      Permission.ProductWrite,
      Permission.ClassWrite,
      Permission.TrainerScheduleManage,
      Permission.StaffManage,
      Permission.StaffRead,
      Permission.ReportView,
      Permission.ReportExport,
      Permission.RevenueRead,
      Permission.BillingManage,
      Permission.GymManage,
      Permission.AutomationRead,
      Permission.AuditRead,
      Permission.WorkoutWrite,
    );
  });

  it('gives TRAINER training access only', () => {
    holds(
      Role.TRAINER,
      Permission.MemberRead,
      Permission.ClassRead,
      Permission.ClassManageOwn,
      Permission.PtSessionRead,
      Permission.PtSessionManageOwn,
      Permission.TrainerRead,
      Permission.StaffScheduleRead,
      Permission.WorkoutRead,
      Permission.WorkoutWrite,
    );
    lacks(
      Role.TRAINER,
      Permission.PosAccess,
      Permission.PaymentProcess,
      Permission.ProductRead,
      Permission.InventoryRead,
      Permission.MemberWrite,
      Permission.MembershipSell,
      Permission.MemberPaymentRead,
      Permission.ClassWrite,
      Permission.PtSessionManage,
      Permission.BillingRead,
      Permission.ReportView,
      Permission.StaffManage,
      Permission.GymManage,
    );
  });

  it('limits a MEMBER to self-service', () => {
    holds(
      Role.MEMBER,
      Permission.WorkoutRead,
      Permission.ClassBook,
      Permission.ReviewWrite,
      Permission.SubscriptionManage,
      Permission.CreditPackManage,
    );
    lacks(Role.MEMBER, Permission.MemberRead, Permission.ClassWrite, Permission.GymManage);
  });

  it('grants the account permissions to every known role', () => {
    for (const role of Object.values(Role)) {
      holds(role, ...ACCOUNT_PERMISSIONS);
    }
  });

  it('grants nothing — not even account permissions — to an unknown role', () => {
    lacks('JANITOR', ...Object.values(Permission));
  });
});

describe('ROLE_PERMISSIONS', () => {
  it('defines a grant list for every gym-scoped role (SUPER_ADMIN excluded)', () => {
    const gymRoles = Object.values(Role).filter((r) => r !== Role.SUPER_ADMIN);
    for (const role of gymRoles) {
      expect(grantsFor[role]).toBeDefined();
    }
    expect(ROLE_PERMISSIONS).not.toHaveProperty(Role.SUPER_ADMIN);
  });

  it('only references known permissions', () => {
    const known = new Set<string>(Object.values(Permission));
    for (const grants of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of grants) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });

  it('keeps account permissions out of the role lists', () => {
    for (const grants of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of ACCOUNT_PERMISSIONS) {
        expect(grants).not.toContain(permission);
      }
    }
  });
});
