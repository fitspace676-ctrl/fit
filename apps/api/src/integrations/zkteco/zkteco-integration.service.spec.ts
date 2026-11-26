import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ZKTECO_DEVICE_SETTINGS, DEFAULT_ZKTECO_SETTINGS } from '@fit/types';
import type { SecretBox } from '../../common/crypto/secret-box';
import type { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../../common/tenant/tenant.context';
import type { ZktecoGateway, ZktecoTarget } from './zkteco-gateway';
import { ZktecoIntegrationService } from './zkteco-integration.service';
import type { ZktecoJobs } from './zkteco-jobs.service';
import type { ZktecoTargets } from './zkteco-targets.service';

const zkbioConnection = {
  connectionType: 'zkbio',
  baseUrl: 'https://bio.example.ge',
  host: null,
  port: null,
  deviceNumber: null,
  recordSize: null,
};
const deviceConnection = {
  connectionType: 'device',
  baseUrl: null,
  host: '203.0.113.10',
  port: 4370,
  deviceNumber: 1,
  recordSize: 72,
};
function row(
  settings: unknown = { connection: zkbioConnection, options: DEFAULT_ZKTECO_SETTINGS },
) {
  return {
    id: 'i',
    gymId: 'gym',
    provider: 'zkteco',
    enabled: true,
    merchantId: null,
    secretCiphertext: 'v1:cipher',
    secretHint: 'en',
    verifiedAt: new Date('2026-11-20T08:00:00Z'),
    lastError: null,
    settings,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
const zkbioTarget: ZktecoTarget = {
  type: 'zkbio',
  zkbio: { baseUrl: 'https://bio.example.ge', apiToken: 'private-token' },
  options: { ...DEFAULT_ZKTECO_SETTINGS, checkInDoor: { kind: 'door', id: 'D1' } },
};

function setup(role = 'OWNER') {
  const integration = {
    findUnique: vi.fn().mockResolvedValue(row()),
    upsert: vi.fn((args: { create: Record<string, unknown> }) =>
      Promise.resolve({ ...row(), ...args.create }),
    ),
    update: vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...row(), ...args.data }),
    ),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const tx = {
    gymIntegration: integration,
    zktecoMember: {
      updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    zktecoSyncState: {
      upsert: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    location: { findMany: vi.fn().mockResolvedValue([{ id: 'loc-1' }]) },
    gymMember: {
      findFirst: vi.fn().mockResolvedValue({ id: 'm1' }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const db = {
    ...tx,
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx))),
  };
  const tenant = { gymId: 'gym', userId: 'u1', role, current: { gymId: 'gym' } };
  const secrets = { encrypt: vi.fn().mockReturnValue('v1:cipher'), decrypt: vi.fn() };
  const gateway = {
    check: vi.fn().mockResolvedValue({ ok: true }),
    discover: vi.fn(),
    openDoor: vi.fn().mockResolvedValue({ ok: true }),
    whoIsInside: vi.fn().mockResolvedValue([{ zoneId: 'z', zoneName: 'Z', pin: '20001' }]),
  };
  const targets = { load: vi.fn().mockResolvedValue(zkbioTarget) };
  const jobs = {
    requestFullSync: vi.fn().mockResolvedValue({ accepted: true }),
    isFullSyncRunning: vi.fn().mockResolvedValue(false),
  };
  const service = new ZktecoIntegrationService(
    { client: db } as unknown as TenantPrismaService,
    tenant as unknown as TenantContext,
    secrets as unknown as SecretBox,
    gateway as unknown as ZktecoGateway,
    targets as unknown as ZktecoTargets,
    jobs as unknown as ZktecoJobs,
  );
  return { service, db, tx, integration, gateway, targets, jobs, secrets };
}
let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

describe('ZktecoIntegrationService configuration', () => {
  it('is for the owner only', async () => {
    const staff = setup('MANAGER');
    await expect(staff.service.get()).rejects.toMatchObject({ status: 403 });
    await expect(
      staff.service.connect({
        connectionType: 'zkbio',
        baseUrl: 'https://bio.example.ge',
        apiToken: 't',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(staff.gateway.check).not.toHaveBeenCalled();
  });
  it('reads the card without any secret and with the capabilities of its type', async () => {
    const read = await ctx.service.get();
    expect(read).toMatchObject({
      provider: 'zkteco',
      connected: true,
      enabled: true,
      secretHint: 'en',
      connection: zkbioConnection,
      capabilities: { onExpiry: ['remove_access', 'disable', 'delete'], whoIsInside: true },
    });
    expect(JSON.stringify(read)).not.toContain('v1:cipher');
    ctx.integration.findUnique.mockResolvedValue(null);
    expect(await ctx.service.get()).toMatchObject({
      connected: false,
      connection: null,
      capabilities: null,
      settings: DEFAULT_ZKTECO_SETTINGS,
    });
  });
  it('verifies before storing an encrypted token and resets PINs for a new server', async () => {
    ctx.integration.findUnique.mockResolvedValue(
      row({
        connection: { ...zkbioConnection, baseUrl: 'https://old.example.ge' },
        options: DEFAULT_ZKTECO_SETTINGS,
      }),
    );
    const read = await ctx.service.connect({
      connectionType: 'zkbio',
      baseUrl: 'https://bio.example.ge:8098/api/',
      apiToken: 'private-token',
    });
    expect(ctx.gateway.check).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'zkbio',
        zkbio: { baseUrl: 'https://bio.example.ge:8098', apiToken: 'private-token' },
      }),
    );
    expect(ctx.secrets.encrypt).toHaveBeenCalledWith('private-token');
    const stored = ctx.integration.upsert.mock.calls[0]![0].create;
    expect(stored).toMatchObject({
      secretCiphertext: 'v1:cipher',
      secretHint: 'en',
      merchantId: null,
    });
    expect(JSON.stringify(stored.settings)).not.toContain('private-token');
    expect(ctx.tx.zktecoMember.updateMany).toHaveBeenCalledWith({
      where: { gymId: 'gym' },
      data: { state: 'none', dirty: true, photoRef: null, lastError: null },
    });
    expect(JSON.stringify(read)).not.toContain('private-token');
    expect(ctx.tx.auditLog.create.mock.calls[0]![0]).toMatchObject({
      data: { action: 'integration.connected', metadata: { provider: 'zkteco', type: 'zkbio' } },
    });
  });
  it('stores nothing when the check fails, with 400 or 503', async () => {
    ctx.gateway.check.mockResolvedValueOnce({ ok: false, reason: 'unauthorized' });
    await expect(
      ctx.service.connect({
        connectionType: 'zkbio',
        baseUrl: 'https://bio.example.ge',
        apiToken: 'bad',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'ZKTECO_VERIFICATION_FAILED', data: { reason: 'unauthorized' } },
    });
    ctx.gateway.check.mockResolvedValueOnce({ ok: false, reason: 'unreachable' });
    await expect(
      ctx.service.connect({
        connectionType: 'device',
        host: '203.0.113.10',
        port: 4370,
        deviceNumber: 1,
        commKey: 123,
      }),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      ctx.service.connect({
        connectionType: 'zkbio',
        baseUrl: 'ftp://bio.example.ge',
        apiToken: 't',
      }),
    ).rejects.toMatchObject({ status: 400, response: { data: { reason: 'invalid_connection' } } });
    expect(ctx.integration.upsert).not.toHaveBeenCalled();
  });
  it('never hints a device comm key and coerces zkbio-only settings away', async () => {
    ctx.integration.findUnique.mockResolvedValue(
      row({
        connection: zkbioConnection,
        options: { ...DEFAULT_ZKTECO_SETTINGS, onExpiry: 'disable', syncPhoto: true },
      }),
    );
    await ctx.service.connect({
      connectionType: 'device',
      host: '203.0.113.10',
      port: 4370,
      deviceNumber: 1,
      commKey: 123,
      recordSize: 72,
    });
    const stored = ctx.integration.upsert.mock.calls[0]![0].create as {
      secretHint: string | null;
      settings: { options: { onExpiry: string; syncPhoto: boolean } };
    };
    expect(ctx.secrets.encrypt).toHaveBeenCalledWith('123');
    expect(stored.secretHint).toBeNull();
    expect(stored.settings.options).toMatchObject({ onExpiry: 'delete', syncPhoto: false });
  });
  it('switches on only a verified connection and starts the first full sync', async () => {
    await ctx.service.setEnabled(true);
    expect(ctx.jobs.requestFullSync).toHaveBeenCalledWith('gym');
    ctx.integration.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(ctx.service.setEnabled(true)).rejects.toMatchObject({
      status: 409,
      response: { code: 'ZKTECO_NOT_VERIFIED' },
    });
  });
  it('refuses a setting the connection type cannot honour and an unknown branch', async () => {
    ctx.integration.findUnique.mockResolvedValue(
      row({ connection: deviceConnection, options: DEFAULT_ZKTECO_DEVICE_SETTINGS }),
    );
    await expect(ctx.service.updateSettings({ onExpiry: 'disable' })).rejects.toMatchObject({
      status: 400,
      response: { code: 'ZKTECO_SETTING_UNSUPPORTED', data: { field: 'onExpiry' } },
    });
    await expect(
      ctx.service.updateSettings({ deviceLocations: { SN1: 'loc-1', SN2: 'loc-other-gym' } }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'LOCATION_NOT_FOUND' } });
    expect(ctx.integration.update).not.toHaveBeenCalled();
  });
  it('merges settings and re-marks members only when access rules changed', async () => {
    await ctx.service.updateSettings({ deviceLocations: { SN1: 'loc-1' } });
    expect(ctx.tx.zktecoMember.updateMany).not.toHaveBeenCalled();
    const read = await ctx.service.updateSettings({ accessLevelIds: ['L1'] });
    expect(read.settings.accessLevelIds).toEqual(['L1']);
    expect(ctx.tx.zktecoMember.updateMany).toHaveBeenCalledWith({
      where: { gymId: 'gym' },
      data: { dirty: true },
    });
  });
  it('disconnects but keeps the chosen options for a reconnect', async () => {
    const read = await ctx.service.disconnect();
    expect(read).toMatchObject({
      connected: false,
      enabled: false,
      settings: DEFAULT_ZKTECO_SETTINGS,
    });
    expect((ctx.integration.updateMany.mock.calls[0]![0] as { data: object }).data).toMatchObject({
      enabled: false,
      secretCiphertext: null,
      secretHint: null,
      verifiedAt: null,
    });
  });
  it('disables on a failed retest', async () => {
    ctx.gateway.check.mockResolvedValue({ ok: false, reason: 'unauthorized' });
    expect(await ctx.service.test()).toEqual({ ok: false, reason: 'unauthorized' });
    expect(ctx.integration.updateMany.mock.calls[0]![0]).toEqual({
      where: { id: 'i', gymId: 'gym', secretCiphertext: 'v1:cipher' },
      data: { verifiedAt: null, lastError: 'unauthorized', enabled: false },
    });
  });
});

describe('ZktecoIntegrationService reception actions', () => {
  it('opens the card’s door once and audits it', async () => {
    const desk = setup('RECEPTIONIST');
    desk.targets.load.mockResolvedValue(zkbioTarget);
    expect(await desk.service.openDoor()).toEqual({ ok: true });
    expect(desk.gateway.openDoor).toHaveBeenCalledTimes(1);
    expect(desk.gateway.openDoor).toHaveBeenCalledWith(zkbioTarget, { kind: 'door', id: 'D1' }, 5);
    expect(desk.tx.auditLog.create.mock.calls[0]![0]).toMatchObject({
      data: {
        action: 'zkteco.door_opened',
        metadata: { provider: 'zkteco', door: 'door:D1', ok: true },
      },
    });
  });
  it('lets only the owner pick another door, and needs an enabled integration', async () => {
    const desk = setup('RECEPTIONIST');
    await expect(desk.service.openDoor({ kind: 'gate', id: 'G9' })).rejects.toMatchObject({
      status: 403,
    });
    ctx.targets.load.mockResolvedValueOnce(null);
    await expect(ctx.service.openDoor()).rejects.toMatchObject({ status: 409 });
  });
  it('names who is inside, and refuses on a standalone device', async () => {
    ctx.tx.zktecoMember.findMany.mockResolvedValue([
      {
        pin: '20001',
        gymMemberId: 'm1',
        member: { firstName: 'Nino', lastName: 'B', user: { name: null } },
      },
    ]);
    expect(await ctx.service.inside('Z1')).toEqual({
      zoneCode: 'Z1',
      people: [{ pin: '20001', gymMemberId: 'm1', name: 'Nino B' }],
    });
    await expect(ctx.service.inside()).rejects.toMatchObject({
      response: { code: 'ZKTECO_ZONE_REQUIRED' },
    });
    ctx.targets.load.mockResolvedValue({ ...zkbioTarget, type: 'device' });
    await expect(ctx.service.inside('Z1')).rejects.toMatchObject({ status: 409 });
  });
  it('sets a card, refuses a card someone else has, and re-marks the member', async () => {
    expect(await ctx.service.setMemberCard('m1', '123')).toEqual({
      gymMemberId: 'm1',
      cardNumber: '123',
    });
    expect(ctx.tx.zktecoMember.updateMany).toHaveBeenCalledWith({
      where: { gymId: 'gym', gymMemberId: 'm1' },
      data: { dirty: true },
    });
    const { Prisma } = await import('@fit/db');
    ctx.tx.gymMember.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(ctx.service.setMemberCard('m1', '123')).rejects.toMatchObject({ status: 409 });
    ctx.tx.gymMember.findFirst.mockResolvedValueOnce(null);
    await expect(ctx.service.setMemberCard('nope', null)).rejects.toMatchObject({ status: 404 });
  });
});
