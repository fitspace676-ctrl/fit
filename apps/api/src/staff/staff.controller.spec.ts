import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ListStaffResponse, StaffMember } from '@fit/types';
import { StaffController } from './staff.controller';
import type { StaffService } from './staff.service';

const staffMember: StaffMember = {
  id: 'gm-1',
  userId: 'u-1',
  name: 'Nino',
  email: 'nino@example.com',
  role: 'MANAGER',
  status: 'ACTIVE',
  joinedAt: '2026-01-15T00:00:00.000Z',
};

function setup() {
  const listStaff = vi.fn<() => Promise<ListStaffResponse>>(() =>
    Promise.resolve({ staff: [staffMember], invites: [] }),
  );
  const inviteStaff = vi.fn(() => Promise.resolve({ inviteId: 'inv-1' }));
  const revokeInvite = vi.fn(() => Promise.resolve());
  const updateRole = vi.fn(() => Promise.resolve(staffMember));
  const removeStaff = vi.fn(() => Promise.resolve());

  const service = {
    listStaff,
    inviteStaff,
    revokeInvite,
    updateRole,
    removeStaff,
  } as unknown as StaffService;

  return {
    controller: new StaffController(service),
    listStaff,
    inviteStaff,
    revokeInvite,
    updateRole,
    removeStaff,
  };
}

describe('StaffController', () => {
  afterEach(() => vi.clearAllMocks());

  it('GET /staff delegates to the service', async () => {
    const { controller, listStaff } = setup();
    await expect(controller.list()).resolves.toEqual({ staff: [staffMember], invites: [] });
    expect(listStaff).toHaveBeenCalledOnce();
  });

  describe('POST /staff/invite', () => {
    it('validates and forwards a well-formed body', async () => {
      const { controller, inviteStaff } = setup();
      const result = await controller.invite({ email: 'New@Example.com', role: 'TRAINER' });
      expect(result).toEqual({ inviteId: 'inv-1' });
      // Email is normalised to lower-case by the schema before the service sees it.
      expect(inviteStaff).toHaveBeenCalledWith({ email: 'new@example.com', role: 'TRAINER' });
    });

    it('rejects a missing/invalid role with 400', async () => {
      const { controller, inviteStaff } = setup();
      await expect(controller.invite({ email: 'a@b.com', role: 'MEMBER' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        controller.invite({ email: 'not-an-email', role: 'TRAINER' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(inviteStaff).not.toHaveBeenCalled();
    });
  });

  it('DELETE /staff/invite/:id delegates to the service', async () => {
    const { controller, revokeInvite } = setup();
    await controller.revokeInvite('inv-1');
    expect(revokeInvite).toHaveBeenCalledWith('inv-1');
  });

  describe('PATCH /staff/:memberId/role', () => {
    it('validates and forwards a well-formed body', async () => {
      const { controller, updateRole } = setup();
      await controller.updateRole('gm-1', { role: 'OWNER' });
      expect(updateRole).toHaveBeenCalledWith('gm-1', { role: 'OWNER' });
    });

    it('rejects an invalid role with 400', async () => {
      const { controller, updateRole } = setup();
      await expect(controller.updateRole('gm-1', { role: 'SUPER_ADMIN' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(updateRole).not.toHaveBeenCalled();
    });
  });

  it('DELETE /staff/:memberId delegates to the service', async () => {
    const { controller, removeStaff } = setup();
    await controller.remove('gm-1');
    expect(removeStaff).toHaveBeenCalledWith('gm-1');
  });
});
