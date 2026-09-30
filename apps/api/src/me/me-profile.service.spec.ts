import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import { MeProfileService } from './me-profile.service';

const ROW = { id: 'user-1', name: 'Ana', email: 'ana@example.com', phone: '+995500000000' };

function setup(
  opts: {
    userId?: string | null;
    user?: typeof ROW | null;
    gymId?: string | null;
    credential?: { name: string | null; phone: string | null } | null;
  } = {},
) {
  const findUnique = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue('user' in opts ? opts.user : ROW);
  const update = vi.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(ROW);
  const credentialFindUnique = vi.fn().mockResolvedValue(opts.credential ?? null);
  const credentialUpsert = vi.fn().mockResolvedValue({});
  const prisma = {
    client: {
      user: { findUnique, update },
      gymCredential: { findUnique: credentialFindUnique, upsert: credentialUpsert },
    },
  } as unknown as PrismaService;
  const userId = 'userId' in opts ? opts.userId : 'user-1';
  const tenant = { userId, current: { gymId: opts.gymId ?? null } } as unknown as TenantContext;
  return {
    service: new MeProfileService(prisma, tenant),
    findUnique,
    update,
    credentialFindUnique,
    credentialUpsert,
  };
}

describe('MeProfileService', () => {
  it.each([
    [{ name: 'Gym Ana', phone: '777' }, 'Gym Ana', '777'],
    [null, ROW.name, ROW.phone],
    [{ name: null, phone: null }, ROW.name, ROW.phone],
  ])('reads gym values with User fallback (%j)', async (credential, name, phone) => {
    const { service, credentialFindUnique } = setup({ gymId: 'gym-1', credential });
    expect((await service.getMyProfile()).profile).toEqual({
      userId: ROW.id,
      email: ROW.email,
      name,
      phone,
    });
    expect(credentialFindUnique).toHaveBeenCalledWith({
      where: { userId_gymId: { userId: ROW.id, gymId: 'gym-1' } },
      select: { name: true, phone: true },
    });
  });

  it('upserts only the current gym credential and returns its profile', async () => {
    const { service, update, credentialUpsert } = setup({
      gymId: 'gym-1',
      credential: { name: 'Gym Ana', phone: '777' },
    });
    expect(
      (await service.updateMyProfile({ name: 'Gym Ana', phone: '777' })).profile,
    ).toMatchObject({ name: 'Gym Ana', phone: '777', email: ROW.email });
    expect(update).not.toHaveBeenCalled();
    expect(credentialUpsert).toHaveBeenCalledWith({
      where: { userId_gymId: { userId: ROW.id, gymId: 'gym-1' } },
      create: { userId: ROW.id, gymId: 'gym-1', passwordHash: null, name: 'Gym Ana', phone: '777' },
      update: { name: 'Gym Ana', phone: '777' },
    });
  });

  describe('getMyProfile', () => {
    it('requires a signed-in session', async () => {
      const { service } = setup({ userId: null });
      await expect(service.getMyProfile()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('reads the caller by their own userId and projects the wire shape', async () => {
      const { service, findUnique } = setup({ userId: 'user-7', user: { ...ROW, id: 'user-7' } });

      const result = await service.getMyProfile();

      expect((findUnique.mock.calls[0]?.[0] as { where: unknown }).where).toEqual({ id: 'user-7' });
      expect(result).toEqual({
        profile: {
          userId: 'user-7',
          name: 'Ana',
          email: 'ana@example.com',
          phone: '+995500000000',
        },
      });
    });

    it('throws when the user row is gone', async () => {
      const { service } = setup({ user: null });
      await expect(service.getMyProfile()).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateMyProfile', () => {
    it('requires a signed-in session', async () => {
      const { service } = setup({ userId: null });
      await expect(service.updateMyProfile({ name: 'X' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('writes only the present fields', async () => {
      const { service, update } = setup();
      await service.updateMyProfile({ name: 'Nino' });
      expect((update.mock.calls[0]?.[0] as { data: unknown }).data).toEqual({ name: 'Nino' });
    });

    it('passes a null phone through to clear it', async () => {
      const { service, update } = setup();
      await service.updateMyProfile({ phone: null });
      expect((update.mock.calls[0]?.[0] as { data: unknown }).data).toEqual({ phone: null });
    });

    it('sends an empty patch when nothing is provided', async () => {
      const { service, update } = setup();
      await service.updateMyProfile({});
      expect((update.mock.calls[0]?.[0] as { data: unknown }).data).toEqual({});
    });

    it('returns the updated profile projection', async () => {
      const { service } = setup();
      await expect(service.updateMyProfile({ name: 'Ana' })).resolves.toEqual({
        profile: {
          userId: 'user-1',
          name: 'Ana',
          email: 'ana@example.com',
          phone: '+995500000000',
        },
      });
    });
  });
});
