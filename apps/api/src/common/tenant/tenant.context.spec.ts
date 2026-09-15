import { describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@fit/db';
import { TenantContext, tenantStorage, type TenantState } from './tenant.context';

function catchError(read: () => unknown): unknown {
  try {
    read();
  } catch (error) {
    return error;
  }
  return undefined;
}

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

  // A public route on a host naming no gym (app.<root>, the API's own host): the
  // guest cart used to answer this with a 500 INTERNAL_ERROR.
  it('404s TENANT_REQUIRED when gymId is read outside a tenant scope', () => {
    const error = catchError(() => ctx.gymId);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'TENANT_REQUIRED' });
  });

  it('403s TENANT_REQUIRED when gymId is read on a request bound to no gym', () => {
    tenantStorage.run(state({ gymId: null }), () => {
      const error = catchError(() => ctx.gymId);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'TENANT_REQUIRED',
      });
    });
  });
});
