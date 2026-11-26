import type { SenderClient } from './sender/sender-client';
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
  settings: null,
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
  const sender = {
    getBalance: vi.fn().mockResolvedValue({ ok: true, balance: '12.34' }),
    send: vi.fn().mockResolvedValue({ ok: true, messageId: 'sms1' }),
  };
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
    sender as unknown as SenderClient,
  );
  return { service, model, tx, db, tenant, flitt, secrets, sender };
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
      {
        provider: 'sender',
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
      await expect(ctx.service.connectSender({ apiKey: 'key' })).rejects.toMatchObject({
        status: 403,
      });
      await expect(ctx.service.testSender()).rejects.toMatchObject({ status: 403 });
      await expect(ctx.service.setEnabled(true, 'sender')).rejects.toMatchObject({ status: 403 });
      await expect(ctx.service.disconnect('sender')).rejects.toMatchObject({ status: 403 });
      await expect(ctx.service.sendTestSms('599123456')).rejects.toMatchObject({ status: 403 });
      expect(ctx.sender.getBalance).not.toHaveBeenCalled();
      expect(ctx.sender.send).not.toHaveBeenCalled();
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher
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

describe('Sender integration lifecycle', () => {
  it('verifies before encrypting and writes the real audit provider', async () => {
    const result = await ctx.service.connectSender({ apiKey: 'private-key' });
    expect(ctx.sender.getBalance.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.model.upsert.mock.invocationCallOrder[0]!,
    );
    const write = ctx.model.upsert.mock.calls[0]![0] as {
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(write.update).toMatchObject({
      merchantId: null,
      secretCiphertext: 'encrypted',
      secretHint: 'ey',
    });
    expect(write.update).not.toHaveProperty('enabled');
    expect(write.create.provider).toBe('sender');
    expect(JSON.stringify(write)).not.toContain('private-key');
    expect(result).toMatchObject({
      provider: 'sender',
      connected: true,
      merchantId: null,
      testMode: false,
    });
    expect(ctx.tx.auditLog.create.mock.calls[0]![0]).toMatchObject({
      data: { metadata: { provider: 'sender' } },
    });
  });
  it.each(['bad_key', 'unreachable'])('never stores an unverified key: %s', async (reason) => {
    ctx.sender.getBalance.mockResolvedValue({ ok: false, reason });
    await expect(ctx.service.connectSender({ apiKey: 'private' })).rejects.toMatchObject({
      response: { code: 'SENDER_VERIFICATION_FAILED', data: { reason } },
    });
    expect(ctx.model.upsert).not.toHaveBeenCalled();
  });
  it('requires verified key but no merchant to enable', async () => {
    await ctx.service.setEnabled(true, 'sender');
    expect(ctx.model.updateMany.mock.calls[0]![0]).toEqual({
      where: {
        gymId: 'gym',
        provider: 'sender',
        secretCiphertext: { not: null },
        verifiedAt: { not: null },
      },
      data: { enabled: true },
    });
    ctx.model.updateMany.mockResolvedValue({ count: 0 });
    await expect(ctx.service.setEnabled(true, 'sender')).rejects.toMatchObject({
      response: { code: 'SENDER_NOT_VERIFIED' },
    });
  });
  it('returns balance, invalidates bad keys and guards concurrent replacement', async () => {
    expect(await ctx.service.testSender()).toEqual({ ok: true, balance: '12.34' });
    ctx.sender.getBalance.mockResolvedValue({ ok: false, reason: 'bad_key' });
    await ctx.service.testSender();
    expect(ctx.model.updateMany.mock.calls[1]![0]).toMatchObject({
      data: { enabled: false, verifiedAt: null, lastError: 'bad_key' },
    });
    ctx.model.updateMany.mockResolvedValue({ count: 0 });
    await expect(ctx.service.testSender()).rejects.toMatchObject({
      response: { code: 'SENDER_CREDENTIALS_CHANGED' },
    });
  });
  it('clears sender credentials on disconnect', async () => {
    expect(await ctx.service.disconnect('sender')).toMatchObject({
      provider: 'sender',
      connected: false,
      enabled: false,
    });
    expect(ctx.model.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { gymId: 'gym', provider: 'sender' },
      data: { enabled: false, secretCiphertext: null, secretHint: null, verifiedAt: null },
    });
  });
  it('enforces tenant scope for jobs and returns no key for absent integrations', async () => {
    expect(await ctx.service.getActiveSenderKey('gym')).toBe('test');
    expect(ctx.model.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { gymId: 'gym', provider: 'sender', enabled: true, verifiedAt: { not: null } },
    });
    await expect(ctx.service.getActiveSenderKey('other')).rejects.toMatchObject({ status: 403 });
    Object.assign(ctx.tenant, { current: undefined });
    expect(await ctx.service.getActiveSenderKey('other')).toBe('test');
    ctx.model.findFirst.mockResolvedValue(null);
    expect(await ctx.service.getActiveSenderKey('gym')).toBeNull();
  });
  it('normalizes test recipients and never returns a provider payload', async () => {
    expect(await ctx.service.sendTestSms('+995 599 12 34 56')).toEqual({ ok: true });
    expect(ctx.sender.send.mock.calls[0]![1]).toMatchObject({ destination: '599123456', smsno: 2 });
    expect(await ctx.service.sendTestSms('bad')).toEqual({ ok: false, reason: 'invalid_phone' });
    expect(ctx.sender.send).toHaveBeenCalledTimes(1);
    ctx.model.findFirst.mockResolvedValue(null);
    await expect(ctx.service.sendTestSms('599123456')).rejects.toMatchObject({
      response: { code: 'SENDER_NOT_VERIFIED' },
    });
  });
});
