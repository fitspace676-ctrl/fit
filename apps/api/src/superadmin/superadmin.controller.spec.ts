import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { GymStatus } from '@fit/db';
import { SuperAdminController } from './superadmin.controller';
import type { SuperAdminService } from './superadmin.service';
import type { TenantContext } from '../common/tenant/tenant.context';

function setup(userId: string | null = 'admin-1') {
  const listGyms = vi.fn(() => Promise.resolve({ gyms: [] }));
  const setGymStatus = vi.fn(() => Promise.resolve({ id: 'gym-1', status: GymStatus.SUSPENDED }));
  const impersonate = vi.fn(() =>
    Promise.resolve({ handoffCode: 'handoff-code', expiresInSeconds: 60 }),
  );
  const superadmin = { listGyms, setGymStatus, impersonate } as unknown as SuperAdminService;
  // `null` models "no authenticated actor" — the controller reads `undefined`
  // from a real TenantContext, so coerce it here. (A `= undefined` default
  // would be swallowed by the default-parameter value.)
  const tenant = { userId: userId ?? undefined } as unknown as TenantContext;
  return {
    controller: new SuperAdminController(superadmin, tenant),
    listGyms,
    setGymStatus,
    impersonate,
  };
}

describe('SuperAdminController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /admin/gyms', () => {
    it('delegates to the service', async () => {
      await ctx.controller.list();
      expect(ctx.listGyms).toHaveBeenCalledOnce();
    });
  });

  describe('PATCH /admin/gyms/:id/status', () => {
    it('parses the body and forwards the actor, id, and status', async () => {
      await ctx.controller.setStatus('gym-1', { status: 'SUSPENDED' });
      expect(ctx.setGymStatus).toHaveBeenCalledWith('admin-1', 'gym-1', 'SUSPENDED');
    });

    it('rejects an invalid status with a 400', async () => {
      await expect(ctx.controller.setStatus('gym-1', { status: 'NOPE' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(ctx.setGymStatus).not.toHaveBeenCalled();
    });

    it('rejects a missing body with a 400', async () => {
      await expect(ctx.controller.setStatus('gym-1', undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('POST /admin/gyms/:id/impersonate', () => {
    it('forwards the actor and gym id', async () => {
      const result = await ctx.controller.impersonate('gym-1');
      expect(ctx.impersonate).toHaveBeenCalledWith('admin-1', 'gym-1');
      expect(result).toEqual({ handoffCode: 'handoff-code', expiresInSeconds: 60 });
    });
  });

  describe('missing actor', () => {
    it('throws 500 when no authenticated actor is in scope', async () => {
      const noActor = setup(null);
      await expect(noActor.controller.impersonate('gym-1')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});
