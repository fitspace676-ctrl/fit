import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import { MeAccountService } from './me-account.service';

function setup({
  superAdmin = false,
  staff = false,
  userId = 'u1',
}: { superAdmin?: boolean; staff?: boolean; userId?: string | null } = {}) {
  const tx = {
    user: { findUnique: vi.fn().mockResolvedValue({ isSuperAdmin: superAdmin }), update: vi.fn() },
    gymMember: { findFirst: vi.fn().mockResolvedValue(staff ? { id: 'staff-other-gym' } : null), updateMany: vi.fn() },
    gymCredential: { deleteMany: vi.fn() }, refreshToken: { deleteMany: vi.fn() },
    pushToken: { deleteMany: vi.fn() }, cart: { deleteMany: vi.fn() },
    notificationPreference: { deleteMany: vi.fn() }, subscription: { updateMany: vi.fn() },
  };
  const transaction = vi.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx));
  const service = new MeAccountService(
    { client: { $transaction: transaction } } as unknown as PrismaService,
    { userId } as unknown as TenantContext,
  );
  return { service, tx, transaction };
}

describe('MeAccountService', () => {
  it('anonymises the shared identity and removes credentials in one transaction across all gyms', async () => {
    const { service, tx, transaction } = setup();
    await service.deleteMyAccount();
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: {
      email: 'deleted+u1@deleted.fit.local', name: null, phone: null, passwordHash: null,
      googleId: null, appleId: null, emailVerifiedAt: null, tokenVersion: { increment: 1 },
    } });
    for (const model of [tx.gymCredential, tx.refreshToken, tx.pushToken, tx.cart, tx.notificationPreference]) {
      expect(model.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    }
    expect(tx.gymMember.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' }, data: expect.objectContaining({ deletedAt: expect.any(Date) as unknown, personalId: null }) as unknown,
    });
    expect(tx.subscription.updateMany).toHaveBeenCalledWith({
      where: { member: { userId: 'u1' }, status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE', 'FROZEN'] } },
      data: { cancelAtPeriodEnd: true },
    });
  });

  it.each([{ superAdmin: true }, { staff: true }])('refuses privileged accounts without writes: %j', async (opts) => {
    const { service, tx } = setup(opts);
    const error = await service.deleteMyAccount().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'ACCOUNT_DELETION_STAFF' });
    expect(tx.gymMember.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', deletedAt: null, role: { not: 'MEMBER' } }, select: { id: true },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.subscription.updateMany).not.toHaveBeenCalled();
  });

  it('requires a session before starting a transaction', async () => {
    const { service, transaction } = setup({ userId: null });
    await expect(service.deleteMyAccount()).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('propagates a database failure so the transaction rolls back', async () => {
    const { service, tx } = setup();
    tx.cart.deleteMany.mockRejectedValue(new Error('database failure'));
    await expect(service.deleteMyAccount()).rejects.toThrow('database failure');
    expect(tx.gymMember.updateMany).not.toHaveBeenCalled();
  });
});
