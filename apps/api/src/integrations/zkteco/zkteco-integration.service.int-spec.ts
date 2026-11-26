import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@fit/db';
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { INTEGRATIONS_ENCRYPTION_KEY: undefined as string | undefined },
}));
vi.mock('../../config/env', () => ({ env: mockEnv, zktecoJobsEnabled: () => false }));
import { asTenant, disconnect, prisma, resetDb, tenantPrisma } from '../../test/integration-db';
import { SecretBox } from '../../common/crypto/secret-box';
import { TenantContext, type TenantState } from '../../common/tenant/tenant.context';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ZktecoGateway } from './zkteco-gateway';
import { ZktecoIntegrationService } from './zkteco-integration.service';
import type { ZktecoJobs } from './zkteco-jobs.service';
import { ZktecoTargets } from './zkteco-targets.service';

// The gateway is a mock: nothing here talks to a ZKTeco server or device.
const check = vi.fn();
const targets = new ZktecoTargets(
  { client: prisma } as unknown as PrismaService,
  new SecretBox(),
  new TenantContext(),
);
const jobs = {
  requestFullSync: vi.fn().mockResolvedValue({ accepted: true }),
  isFullSyncRunning: vi.fn().mockResolvedValue(false),
};
const service = new ZktecoIntegrationService(
  { client: tenantPrisma },
  new TenantContext(),
  new SecretBox(),
  { check } as unknown as ZktecoGateway,
  targets,
  jobs as unknown as ZktecoJobs,
);
const token = 'zkbio-private-api-token';
let state: TenantState;
let gymId: string;

async function makeGym(slug: string) {
  const gym = await prisma.gym.create({ data: { name: slug, slug } });
  const owner = await prisma.user.create({ data: { email: `${slug}-owner@example.com` } });
  await prisma.gymMember.create({ data: { gymId: gym.id, userId: owner.id, role: Role.OWNER } });
  await prisma.location.create({ data: { gymId: gym.id, name: 'Main', isDefault: true } });
  return {
    gymId: gym.id,
    state: {
      gymId: gym.id,
      userId: owner.id,
      role: Role.OWNER,
      allowCrossTenant: false,
    } as TenantState,
  };
}
async function makeMember(gym: string, email: string) {
  const user = await prisma.user.create({ data: { email } });
  return prisma.gymMember.create({ data: { gymId: gym, userId: user.id, role: Role.MEMBER } });
}

describe('ZktecoIntegrationService (Postgres)', () => {
  beforeEach(async () => {
    await resetDb();
    mockEnv.INTEGRATIONS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    check.mockReset().mockResolvedValue({ ok: true });
    ({ gymId, state } = await makeGym('zk-gym'));
  });
  afterAll(disconnect);

  it('stores the token encrypted, the rest as settings, and never reads either back', async () => {
    await asTenant(state, async () => {
      const read = await service.connect({
        connectionType: 'zkbio',
        baseUrl: 'https://bio.example.ge:8098',
        apiToken: token,
      });
      expect(read).toMatchObject({ connected: true, enabled: false, secretHint: 'en' });
      const stored = await prisma.gymIntegration.findUniqueOrThrow({
        where: { gymId_provider: { gymId, provider: 'zkteco' } },
      });
      expect(stored.secretCiphertext).toMatch(/^v1:/);
      expect(new SecretBox().decrypt(stored.secretCiphertext!)).toBe(token);
      expect(JSON.stringify(stored.settings)).not.toContain(token);
      expect(stored.settings).toMatchObject({
        connection: { connectionType: 'zkbio', baseUrl: 'https://bio.example.ge:8098' },
      });
      const everything = JSON.stringify([read, await service.get(), await service.status()]);
      expect(everything).not.toContain(token);
      expect(everything).not.toContain(stored.secretCiphertext!);

      await service.setEnabled(true);
      expect(await targets.load(gymId, { enabledOnly: true })).toMatchObject({
        type: 'zkbio',
        zkbio: { baseUrl: 'https://bio.example.ge:8098', apiToken: token },
      });
      await service.updateSettings({ importEvents: false, timeZone: 'Europe/Berlin' });
      expect((await service.get()).settings).toMatchObject({
        importEvents: false,
        timeZone: 'Europe/Berlin',
      });
      await service.disconnect();
      expect(await targets.load(gymId, { enabledOnly: false })).toBeNull();
      expect((await service.get()).settings.timeZone).toBe('Europe/Berlin');
    });
    const audit = await prisma.auditLog.findMany({ where: { gymId } });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'integration.connected',
        'integration.enabled',
        'integration.settings_updated',
        'integration.disconnected',
      ]),
    );
    expect(JSON.stringify(audit)).not.toContain(token);
  });

  it('keeps a failed connect from replacing working credentials', async () => {
    await asTenant(state, () =>
      service.connect({
        connectionType: 'zkbio',
        baseUrl: 'https://bio.example.ge',
        apiToken: token,
      }),
    );
    check.mockResolvedValue({ ok: false, reason: 'unauthorized' });
    await expect(
      asTenant(state, () =>
        service.connect({
          connectionType: 'zkbio',
          baseUrl: 'https://bio.example.ge',
          apiToken: 'wrong',
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    const stored = await prisma.gymIntegration.findFirstOrThrow({
      where: { gymId, provider: 'zkteco' },
    });
    expect(new SecretBox().decrypt(stored.secretCiphertext!)).toBe(token);
  });

  it('isolates the integration, identities and passages per gym', async () => {
    await asTenant(state, () =>
      service.connect({
        connectionType: 'zkbio',
        baseUrl: 'https://bio.example.ge',
        apiToken: token,
      }),
    );
    const member = await makeMember(gymId, 'zk-member@example.com');
    await prisma.zktecoMember.create({
      data: { gymId, gymMemberId: member.id, pin: '20001', deviceUid: 20001 },
    });
    await prisma.zktecoEvent.create({
      data: { gymId, eventKey: 'access:SN1:1:20001', pin: '20001', occurredAt: new Date() },
    });
    const other = await makeGym('zk-other');
    // The same PIN in another gym is a different person.
    await prisma.zktecoMember.create({
      data: { gymId: other.gymId, pin: '20001', deviceUid: 20001 },
    });

    await asTenant(other.state, async () => {
      expect((await service.get()).connected).toBe(false);
      expect(await tenantPrisma.gymIntegration.findMany()).toEqual([]);
      expect(await tenantPrisma.zktecoEvent.findMany()).toEqual([]);
      expect((await tenantPrisma.zktecoMember.findMany()).map((m) => m.gymId)).toEqual([
        other.gymId,
      ]);
      await expect(targets.load(gymId, { enabledOnly: false })).rejects.toMatchObject({
        status: 403,
      });
      await expect(service.setMemberCard(member.id, '123')).rejects.toMatchObject({ status: 404 });
    });
    await expect(
      prisma.zktecoEvent.create({
        data: { gymId, eventKey: 'access:SN1:1:20001', pin: '20001', occurredAt: new Date() },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('keeps access cards unique per gym and survives a member purge with the PIN', async () => {
    const a = await makeMember(gymId, 'card-a@example.com');
    const b = await makeMember(gymId, 'card-b@example.com');
    const other = await makeGym('zk-cards');
    const c = await makeMember(other.gymId, 'card-c@example.com');
    await asTenant(state, () => service.setMemberCard(a.id, '555'));
    await expect(asTenant(state, () => service.setMemberCard(b.id, '555'))).rejects.toMatchObject({
      status: 409,
    });
    await asTenant(other.state, () => service.setMemberCard(c.id, '555'));

    await prisma.zktecoMember.create({
      data: { gymId, gymMemberId: a.id, pin: '20002', deviceUid: 20002 },
    });
    await prisma.gymMember.delete({ where: { id: a.id } });
    expect(await prisma.zktecoMember.findFirst({ where: { gymId, pin: '20002' } })).toMatchObject({
      gymMemberId: null,
    });
  });
});
