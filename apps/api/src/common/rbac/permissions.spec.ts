import { describe, expect, it } from 'vitest';
import { Role } from '@fit/db';
import { Permission, ROLE_PERMISSIONS, roleHasPermission } from '@fit/types';

/** Index the (literal-keyed) matrix by a Prisma role value for the coverage check. */
const grantsFor = ROLE_PERMISSIONS as Record<string, readonly Permission[]>;

describe('roleHasPermission', () => {
  it('grants SUPER_ADMIN every permission unconditionally', () => {
    for (const permission of Object.values(Permission)) {
      expect(roleHasPermission(Role.SUPER_ADMIN, permission)).toBe(true);
    }
  });

  it('grants OWNER every gym-scoped permission', () => {
    for (const permission of Object.values(Permission)) {
      expect(roleHasPermission(Role.OWNER, permission)).toBe(true);
    }
  });

  it('grants a RECEPTIONIST member + billing-read but not workout writes', () => {
    expect(roleHasPermission(Role.RECEPTIONIST, Permission.MemberWrite)).toBe(true);
    expect(roleHasPermission(Role.RECEPTIONIST, Permission.BillingRead)).toBe(true);
    expect(roleHasPermission(Role.RECEPTIONIST, Permission.WorkoutWrite)).toBe(false);
    expect(roleHasPermission(Role.RECEPTIONIST, Permission.BillingManage)).toBe(false);
  });

  it('limits a MEMBER to reading workouts only', () => {
    expect(roleHasPermission(Role.MEMBER, Permission.WorkoutRead)).toBe(true);
    expect(roleHasPermission(Role.MEMBER, Permission.MemberRead)).toBe(false);
    expect(roleHasPermission(Role.MEMBER, Permission.GymManage)).toBe(false);
  });

  it('lets a TRAINER write workouts but not manage staff', () => {
    expect(roleHasPermission(Role.TRAINER, Permission.WorkoutWrite)).toBe(true);
    expect(roleHasPermission(Role.TRAINER, Permission.StaffManage)).toBe(false);
    expect(roleHasPermission(Role.TRAINER, Permission.BillingRead)).toBe(false);
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
});
