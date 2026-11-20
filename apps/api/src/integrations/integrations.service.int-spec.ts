import type { SenderClient } from './sender/sender-client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@fit/db';
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { INTEGRATIONS_ENCRYPTION_KEY: undefined as string | undefined },
}));
vi.mock('../config/env', () => ({ env: mockEnv }));
import { asTenant, disconnect, prisma, resetDb, tenantPrisma } from '../test/integration-db';
import { TenantContext, type TenantState } from '../common/tenant/tenant.context';
import type { PrismaService } from '../prisma/prisma.service';
import { SecretBox } from '../common/crypto/secret-box';
import type { FlittClient } from './flitt/flitt-client';
import { IntegrationsService } from './integrations.service';

const verifyCredentials = vi.fn();
const getBalance = vi.fn().mockResolvedValue({ ok: true, balance: '12.34' });
const service = new IntegrationsService(
  { client: tenantPrisma },
  new TenantContext(),
  { verifyCredentials } as unknown as FlittClient,
  new SecretBox(),
  { client: prisma } as unknown as PrismaService,
  { getBalance } as unknown as SenderClient,
);
let state: TenantState;
let gymId: string;
const input = { merchantId: '1549901', secretKey: 'private-payment-key' };

describe('IntegrationsService (Postgres)', () => {
  beforeEach(async () => {
    await resetDb();
    mockEnv.INTEGRATIONS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    verifyCredentials.mockReset().mockResolvedValue({ ok: true });
    const gym = await prisma.gym.create({ data: { name: 'Flitt gym', slug: 'flitt-gym' } });
    const user = await prisma.user.create({ data: { email: 'flitt-owner@example.com' } });
    await prisma.gymMember.create({ data: { gymId: gym.id, userId: user.id, role: Role.OWNER } });
    gymId = gym.id;
    state = { gymId, userId: user.id, role: Role.OWNER, allowCrossTenant: false };
  });
  afterAll(disconnect);

  it('connects encrypted, reads safely, enables and fully disconnects', async () => {
    await asTenant(state, async () => {
      await expect(service.setEnabled(true)).rejects.toMatchObject({ status: 409 });
      const connected = await service.connect(input);
      expect(connected).toMatchObject({
        connected: true,
        enabled: false,
        testMode: true,
        secretHint: 'ey',
      });
      const stored = await prisma.gymIntegration.findUniqueOrThrow({
        where: { gymId_provider: { gymId, provider: 'flitt' } },
      });
      expect(stored.secretCiphertext).toMatch(/^v1:/);
      expect(stored.secretCiphertext).not.toBe(input.secretKey);
      expect(new SecretBox().decrypt(stored.secretCiphertext!)).toBe(input.secretKey);
      const read = JSON.stringify(await service.list());
      expect(read).not.toContain(input.secretKey);
      expect(read).not.toContain(stored.secretCiphertext!);
      expect(await service.getActiveFlittCredentials(gymId)).toBeNull();
      await service.setEnabled(true);
      expect(await service.getActiveFlittCredentials(gymId)).toEqual(input);
      expect(await service.isOnlinePaymentEnabled(gymId)).toBe(true);
      await service.disconnect();
      expect(await service.getActiveFlittCredentials(gymId)).toBeNull();
      expect(await prisma.gymIntegration.findUnique({ where: { id: stored.id } })).toMatchObject({
        merchantId: null,
        secretCiphertext: null,
        secretHint: null,
        verifiedAt: null,
        enabled: false,
      });
      const audit = await prisma.auditLog.findMany({ where: { gymId } });
      expect(audit).toHaveLength(3);
      expect(JSON.stringify(audit)).not.toContain(input.secretKey);
      expect(JSON.stringify(audit)).not.toContain(stored.secretCiphertext!);
    });
  });
  it('keeps Sender isolated from Flitt and stores an encrypted per-gym key', async () => {
    await asTenant(state, async () => {
      await service.connect(input);
      await service.connectSender({ apiKey: 'sender-private-key' });
      expect((await service.list()).map((entry) => entry.provider)).toEqual(['flitt', 'sender']);
      expect(await service.getActiveSenderKey(gymId)).toBeNull();
      await service.setEnabled(true, 'sender');
      expect(await service.getActiveSenderKey(gymId)).toBe('sender-private-key');
      const stored = await prisma.gymIntegration.findUniqueOrThrow({
        where: { gymId_provider: { gymId, provider: 'sender' } },
      });
      expect(stored.secretCiphertext).toMatch(/^v1:/);
      expect(stored.merchantId).toBeNull();
      await service.disconnect('sender');
      expect(await service.getActiveSenderKey(gymId)).toBeNull();
      expect((await service.list())[0]?.connected).toBe(true);
    });
  });
  it('requires verification and clears it on a failed retest', async () => {
    await asTenant(state, async () => {
      await service.connect(input);
      await prisma.gymIntegration.updateMany({ where: { gymId }, data: { verifiedAt: null } });
      await expect(service.setEnabled(true)).rejects.toMatchObject({ status: 409 });
      await service.test();
      await service.setEnabled(true);
      verifyCredentials.mockResolvedValue({ ok: false, reason: 'bad_key' });
      expect(await service.test()).toEqual({ ok: false, reason: 'bad_key' });
      expect((await service.list())[0]).toMatchObject({
        enabled: false,
        verifiedAt: null,
        lastError: 'bad_key',
      });
      await expect(service.setEnabled(true)).rejects.toMatchObject({ status: 409 });
    });
  });
  it('keeps existing credentials on failed connect and hides another gym', async () => {
    await asTenant(state, () => service.connect(input));
    verifyCredentials.mockResolvedValue({ ok: false, reason: 'bad_key' });
    await expect(
      asTenant(state, () => service.connect({ ...input, secretKey: 'wrong' })),
    ).rejects.toMatchObject({ status: 400 });
    const other = await prisma.gym.create({ data: { name: 'Other', slug: 'other-flitt' } });
    await asTenant({ ...state, gymId: other.id }, async () => {
      expect((await service.list())[0]?.connected).toBe(false);
      expect(await tenantPrisma.gymIntegration.findMany()).toEqual([]);
      await expect(service.getActiveFlittCredentials(gymId)).rejects.toMatchObject({ status: 403 });
    });
    const stored = await prisma.gymIntegration.findFirstOrThrow({ where: { gymId } });
    expect(new SecretBox().decrypt(stored.secretCiphertext!)).toBe(input.secretKey);
  });
});
