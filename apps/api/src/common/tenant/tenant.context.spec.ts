import { describe, expect, it } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import { Role } from '@fit/db';
import { TenantContext, tenantStorage, type TenantState } from './tenant.context';

function state(overrides: Partial<TenantState> = {}): TenantState {
  return {
    userId: 'u-1',
    gymId: 'gym-a',
    role: Role.MEMBER,
    allowCrossTenant: false,
    ...overrides,
  };
}

describe('TenantContext', () => {
  const ctx = new TenantContext();

  it('exposes the active tenant inside a store', () => {
    tenantStorage.run(state(), () => {
      expect(ctx.gymId).toBe('gym-a');
      expect(ctx.userId).toBe('u-1');
      expect(ctx.role).toBe(Role.MEMBER);
      expect(ctx.current).toBeDefined();
    });
  });

  it('reports undefined accessors outside any store', () => {
    expect(ctx.current).toBeUndefined();
    expect(ctx.userId).toBeUndefined();
    expect(ctx.role).toBeUndefined();
  });

  it('throws when gymId is read outside a tenant scope', () => {
    expect(() => ctx.gymId).toThrow(InternalServerErrorException);
  });

  it('throws when gymId is read on a cross-tenant (null gym) request', () => {
    tenantStorage.run(state({ gymId: null }), () => {
      expect(() => ctx.gymId).toThrow(InternalServerErrorException);
    });
  });
});
