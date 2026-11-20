import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GymIntegration } from '@fit/db';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SecretBox } from '../common/crypto/secret-box';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { FlittClient } from './flitt/flitt-client';
import { IntegrationsService } from './integrations.service';

const row: GymIntegration = {
  id: 'i',
  gymId: 'gym',
  provider: 'flitt',
  enabled: false,
  merchantId: '1549901',
  secretCiphertext: 'encrypted',
  secretHint: 'st',
  verifiedAt: new Date(),
  lastError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
function setup() {
  const model = {
    findUnique: vi.fn().mockResolvedValue(row),
    findFirst: vi.fn().mockResolvedValue(row),
    count: vi.fn().mockResolvedValue(1),
    upsert: vi.fn().mockResolvedValue(row),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const tx = { gymIntegration: model, auditLog: { create: vi.fn().mockResolvedValue({}) } };
  const db = {
    ...tx,
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => await callback(tx)),
  };
  const tenant = { gymId: 'gym', userId: 'owner', role: 'OWNER', current: { gymId: 'gym' } };
  const flitt = { verifyCredentials: vi.fn().mockResolvedValue({ ok: true }) };
  const secrets = {
    encrypt: vi.fn().mockReturnValue('encrypted'),
    decrypt: vi.fn().mockReturnValue('test'),
  };
  const service = new IntegrationsService(
    { client: db } as unknown as TenantPrismaService,
    tenant as unknown as TenantContext,
    flitt as unknown as FlittClient,
    secrets as unknown as SecretBox,
    { client: db } as unknown as PrismaService,
  );
  return { service, model, tx, db, tenant, flitt, secrets };
}
let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

describe('IntegrationsService', () => {
  it('always returns a disconnected Flitt entry when absent', async () => {
    ctx.model.findUnique.mockResolvedValue(null);
    expect(await ctx.service.list()).toEqual([
      {
        provider: 'flitt',
        connected: false,
        enabled: false,
        merchantId: null,
        secretHint: null,
        verifiedAt: null,
        lastError: null,
        testMode: false,
      },
    ]);
  });
  it.each(['MANAGER', 'RECEPTIONIST', 'TRAINER', 'MEMBER', 'SUPER_ADMIN'])(
    'rejects %s even if GymManage was delegated',
    async (role) => {
      ctx.tenant.role = role;
      await expect(ctx.service.list()).rejects.toMatchObject({ status: 403 });
      await expect(
        ctx.service.connect({ merchantId: '1549901', secretKey: 'test' }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(ctx.service.test()).rejects.toMatchObject({ status: 403 });
      await expect(ctx.service.setEnabled(true)).rejects.toMatchObject({ status: 403 });
      await expect(ctx.service.disconnect()).rejects.toMatchObject({ status: 403 });
      expect(ctx.model.findUnique).not.toHaveBeenCalled();
      expect(ctx.flitt.verifyCredentials).not.toHaveBeenCalled();
    },
  );
  it('verifies first, persists ciphertext only and omits enabled from reconnect updates', async () => {
    const result = await ctx.service.connect({ merchantId: '1549901', secretKey: 'test' });
    expect(ctx.flitt.verifyCredentials.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.model.upsert.mock.invocationCallOrder[0]!,
    );
    expect(ctx.model.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ secretCiphertext: 'encrypted', secretHint: 'st' }),
      }),
    );
    const write = ctx.model.upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(write.update).not.toHaveProperty('enabled');
    expect(JSON.stringify(write)).not.toContain('"secretKey"');
    expect(result).not.toHaveProperty('secretCiphertext');
    expect(result).not.toHaveProperty('secretKey');
    expect(ctx.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        gymId: 'gym',
        actorId: 'owner',
        action: 'integration.connected',
        targetId: 'gym',
        metadata: { provider: 'flitt' },
      },
    });
  });
  it.each(['bad_key', 'unknown_merchant', 'unreachable'])(
    'stores nothing on %s',
    async (reason) => {
      ctx.flitt.verifyCredentials.mockResolvedValue({ ok: false, reason });
      await expect(
        ctx.service.connect({ merchantId: '1549901', secretKey: 'test' }),
      ).rejects.toMatchObject({ status: reason === 'unreachable' ? 503 : 400 });
      expect(ctx.model.upsert).not.toHaveBeenCalled();
      expect(ctx.secrets.encrypt).not.toHaveBeenCalled();
    },
  );
  it('does not expose a complete one/two-character secret as its hint', async () => {
    await ctx.service.connect({ merchantId: '1', secretKey: 'ab' });
    expect(ctx.model.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ secretHint: null }) }),
    );
  });
  it('cannot enable without stored verified credentials', async () => {
    ctx.model.updateMany.mockResolvedValue({ count: 0 });
    await expect(ctx.service.setEnabled(true)).rejects.toMatchObject({ status: 409 });
    expect(ctx.model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          gymId: 'gym',
          provider: 'flitt',
          merchantId: { not: null },
          secretCiphertext: { not: null },
          verifiedAt: { not: null },
        },
      }),
    );
  });
  it('invalidates verification and disables after a failed retest', async () => {
    ctx.flitt.verifyCredentials.mockResolvedValue({ ok: false, reason: 'bad_key' });
    expect(await ctx.service.test()).toEqual({ ok: false, reason: 'bad_key' });
    expect(ctx.model.updateMany).toHaveBeenCalledWith({
      where: { id: 'i', gymId: 'gym', secretCiphertext: 'encrypted' },
      data: { verifiedAt: null, lastError: 'bad_key', enabled: false },
    });
  });
  it('does not stamp concurrently replaced credentials as verified', async () => {
    ctx.model.updateMany.mockResolvedValue({ count: 0 });
    await expect(ctx.service.test()).rejects.toMatchObject({ status: 409 });
  });
  it('clears every credential field on disconnect', async () => {
    expect((await ctx.service.disconnect()).connected).toBe(false);
    expect(ctx.model.updateMany).toHaveBeenCalledWith({
      where: { gymId: 'gym', provider: 'flitt' },
      data: {
        enabled: false,
        merchantId: null,
        secretCiphertext: null,
        secretHint: null,
        verifiedAt: null,
        lastError: null,
      },
    });
  });
  it('scopes internal access explicitly and refuses another request tenant', async () => {
    expect(await ctx.service.getActiveFlittCredentials('gym')).toEqual({
      merchantId: '1549901',
      secretKey: 'test',
    });
    expect(ctx.model.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gymId: 'gym', provider: 'flitt', enabled: true, verifiedAt: { not: null } },
      }),
    );
    await expect(ctx.service.getActiveFlittCredentials('other')).rejects.toMatchObject({
      status: 403,
    });
    await expect(ctx.service.isOnlinePaymentEnabled('other')).rejects.toMatchObject({
      status: 403,
    });
    ctx.model.findFirst.mockResolvedValue(null);
    expect(await ctx.service.getActiveFlittCredentials('gym')).toBeNull();
  });
});
