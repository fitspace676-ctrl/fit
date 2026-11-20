import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ZKTECO_DEVICE_SETTINGS, DEFAULT_ZKTECO_SETTINGS } from '@fit/types';
import type { ZkbioClient } from '../zkbio/zkbio-client';
import { ZkbioApiError, ZkbioTransportError } from '../zkbio/zkbio-errors';
import type { ZkDeviceClient, ZkDeviceSession } from '../zkdevice/zkdevice-client';
import { ZkDeviceError } from '../zkdevice/zkdevice-errors';
import {
  ZktecoGateway,
  ZktecoUnavailableError,
  type MemberPush,
  type ZktecoTarget,
} from './zkteco-gateway';

// No test here opens a socket: both transport clients are replaced by mocks.
const now = new Date('2026-11-20T08:00:00.000Z');
const zkbioTarget: ZktecoTarget = {
  type: 'zkbio',
  zkbio: { baseUrl: 'https://bio.example.ge', apiToken: 'token' },
  options: {
    ...DEFAULT_ZKTECO_SETTINGS,
    accessLevelIds: ['L1'],
    entranceLevelIds: ['E1'],
    checkInDoor: { kind: 'door', id: 'D1' },
  },
};
const deviceTarget: ZktecoTarget = {
  type: 'device',
  device: { host: '203.0.113.10', port: 4370, commKey: 0, deviceNumber: 1 },
  recordSize: 72,
  options: DEFAULT_ZKTECO_DEVICE_SETTINGS,
};
function push(overrides: Partial<MemberPush> = {}): MemberPush {
  return {
    pin: '20001',
    action: 'activate',
    name: 'ნინო ბერიძე',
    firstName: 'ნინო',
    lastName: 'ბერიძე',
    cardNumber: '123456',
    validFrom: new Date('2026-11-01T00:00:00Z'),
    validUntil: new Date('2026-12-01T00:00:00Z'),
    photo: null,
    previousState: 'none',
    ...overrides,
  };
}
const page = <T>(data: T[]) => ({ page: 1, size: data.length, total: data.length, data });

function setup() {
  const zkbio = {
    checkConnection: vi.fn().mockResolvedValue({ ok: true }),
    upsertPerson: vi.fn().mockResolvedValue({}),
    enablePersons: vi.fn().mockResolvedValue({}),
    disablePersons: vi.fn().mockResolvedValue({}),
    deletePerson: vi.fn().mockResolvedValue({}),
    assignAccessLevels: vi.fn().mockResolvedValue({}),
    addEntranceLevelByPerson: vi.fn().mockResolvedValue({}),
    deletePersonAccessLevels: vi.fn().mockResolvedValue({}),
    deletePersonEntranceLevels: vi.fn().mockResolvedValue({}),
    updatePersonPhoto: vi.fn().mockResolvedValue({}),
    listPersons: vi.fn().mockResolvedValue(page([{ pin: '20001' }])),
    listAccessDevices: vi.fn().mockResolvedValue([{ sn: 'SN1', name: 'Hall', state: '1' }]),
    listEntranceDevices: vi
      .fn()
      .mockResolvedValue(page([{ sn: 'SN2', name: 'Gate', status: 'offline' }])),
    listDoors: vi.fn().mockResolvedValue(page([{ id: 'D1', name: 'Hall door', deviceId: 'dev1' }])),
    listGates: vi.fn().mockRejectedValue(new ZkbioApiError(-1)),
    listAccessReaders: vi.fn().mockResolvedValue(page([{ id: 'R1', name: 'In', doorId: 'D1' }])),
    listEntranceReaders: vi.fn().mockResolvedValue(page([])),
    listAccessLevels: vi.fn().mockResolvedValue(page([{ id: 'L1', name: 'Members' }])),
    listEntranceLevels: vi.fn().mockResolvedValue(page([{ id: 'E1', name: 'Gates' }])),
    listAreas: vi.fn().mockResolvedValue(page([{ code: 'A1', name: 'Main' }])),
    listAccessTransactions: vi.fn().mockResolvedValue(page([])),
    listEntranceTransactions: vi.fn().mockResolvedValue(page([])),
    openDoor: vi.fn().mockResolvedValue({}),
    openGate: vi.fn().mockResolvedValue({}),
    getWhoIsInside: vi.fn().mockResolvedValue([{ zoneId: 'z', zoneName: 'Z', pin: '20001' }]),
  };
  const session = {
    listUsers: vi.fn().mockResolvedValue([]),
    upsertUser: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    checkConnection: vi.fn().mockResolvedValue({ serialNumber: 'DEV-SN', deviceName: 'F22' }),
    listAttendance: vi.fn().mockResolvedValue([]),
  };
  const device = {
    checkConnection: vi
      .fn()
      .mockResolvedValue({ serialNumber: 'DEV-SN', deviceName: 'F22', userCount: 3 }),
    listUsers: vi.fn().mockResolvedValue([]),
    unlockDoor: vi.fn().mockResolvedValue(undefined),
    withSession: vi.fn(async (_c: unknown, fn: (s: ZkDeviceSession) => Promise<unknown>) =>
      fn(session as unknown as ZkDeviceSession),
    ),
  };
  const gateway = new ZktecoGateway(
    zkbio as unknown as ZkbioClient,
    device as unknown as ZkDeviceClient,
  );
  return { gateway, zkbio, device, session };
}
let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

describe('ZktecoGateway.check', () => {
  it('maps a zkbio failure and reports a device about itself', async () => {
    ctx.zkbio.checkConnection.mockResolvedValue({ ok: false, reason: 'unauthorized' });
    expect(await ctx.gateway.check(zkbioTarget)).toEqual({ ok: false, reason: 'unauthorized' });
    expect(await ctx.gateway.check(deviceTarget)).toMatchObject({
      ok: true,
      device: { serialNumber: 'DEV-SN', deviceName: 'F22', userCount: 3 },
    });
    ctx.device.checkConnection.mockRejectedValue(new ZkDeviceError('blocked_host'));
    expect(await ctx.gateway.check(deviceTarget)).toEqual({ ok: false, reason: 'blocked_host' });
  });
});

describe('ZktecoGateway.discover', () => {
  it('lists every picker and reports a refused list as unavailable', async () => {
    const resources = await ctx.gateway.discover(zkbioTarget);
    expect(resources.devices).toEqual([
      { sn: 'SN1', name: 'Hall', module: 'access', online: true },
      { sn: 'SN2', name: 'Gate', module: 'entrance', online: false },
    ]);
    expect(resources.doors).toEqual([{ id: 'D1', name: 'Hall door', deviceId: 'dev1' }]);
    expect(resources.readers).toEqual([{ id: 'R1', name: 'In', doorId: 'D1', gateId: null }]);
    expect(resources.accessLevels).toEqual([{ id: 'L1', name: 'Members' }]);
    expect(resources.areas).toEqual([{ code: 'A1', name: 'Main' }]);
    expect(resources.gates).toEqual([]);
    expect(resources.unavailable).toEqual(['gates']);
  });
  it('fails as a whole when the server itself is down', async () => {
    ctx.zkbio.listAccessDevices.mockRejectedValue(new ZkbioTransportError('unreachable'));
    await expect(ctx.gateway.discover(zkbioTarget)).rejects.toBeInstanceOf(ZktecoUnavailableError);
  });
  it('offers the device and its own lock for a standalone device', async () => {
    const resources = await ctx.gateway.discover(deviceTarget);
    expect(resources.devices).toEqual([
      { sn: 'DEV-SN', name: 'F22', module: 'device', online: true },
    ]);
    expect(resources.doors).toEqual([{ id: '1', name: 'F22', deviceId: 'DEV-SN' }]);
  });
});

describe('ZktecoGateway.apply on zkbio', () => {
  it('activates with the validity window, levels and a re-enable after a disable', async () => {
    const outcomes = await ctx.gateway.apply(
      zkbioTarget,
      [push({ previousState: 'disable' })],
      now,
    );
    expect(outcomes).toEqual([{ pin: '20001', ok: true }]);
    expect(ctx.zkbio.upsertPerson).toHaveBeenCalledWith(
      zkbioTarget.zkbio,
      expect.objectContaining({
        pin: '20001',
        name: 'ნინო',
        lastName: 'ბერიძე',
        cardNo: '123456',
        isDisabled: false,
        accStartTime: new Date('2026-11-01T00:00:00Z'),
        accEndTime: new Date('2026-12-01T00:00:00Z'),
        accLevelIds: 'L1',
      }),
      240,
    );
    expect(ctx.zkbio.enablePersons).toHaveBeenCalledWith(zkbioTarget.zkbio, ['20001']);
    expect(ctx.zkbio.assignAccessLevels).toHaveBeenCalledWith(zkbioTarget.zkbio, '20001', ['L1']);
    expect(ctx.zkbio.addEntranceLevelByPerson).toHaveBeenCalledWith(zkbioTarget.zkbio, [
      { pin: '20001', levelIds: ['E1'] },
    ]);
  });
  it('keeps access when only the photo is refused', async () => {
    ctx.zkbio.updatePersonPhoto.mockRejectedValue(new ZkbioApiError(-27));
    expect(await ctx.gateway.apply(zkbioTarget, [push({ photo: 'base64' })], now)).toEqual([
      { pin: '20001', ok: true, error: 'invalid_photo' },
    ]);
  });
  it('applies each end action and treats an already missing person as done', async () => {
    ctx.zkbio.deletePerson.mockRejectedValue(new ZkbioApiError(-22));
    const outcomes = await ctx.gateway.apply(
      zkbioTarget,
      [
        push({ pin: '1', action: 'remove_access' }),
        push({ pin: '2', action: 'disable' }),
        push({ pin: '3', action: 'delete' }),
      ],
      now,
    );
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(ctx.zkbio.deletePersonAccessLevels).toHaveBeenCalledWith(zkbioTarget.zkbio, '1', ['L1']);
    expect(ctx.zkbio.deletePersonEntranceLevels).toHaveBeenCalledWith(zkbioTarget.zkbio, '1', [
      'E1',
    ]);
    expect(ctx.zkbio.disablePersons).toHaveBeenCalledWith(zkbioTarget.zkbio, ['2']);
    expect(ctx.zkbio.upsertPerson).not.toHaveBeenCalled();
  });
  it('reports a per-member refusal and aborts the batch when the server goes away', async () => {
    ctx.zkbio.upsertPerson.mockRejectedValueOnce(new ZkbioApiError(-23));
    expect(await ctx.gateway.apply(zkbioTarget, [push()], now)).toEqual([
      { pin: '20001', ok: false, error: 'card_in_use' },
    ]);
    ctx.zkbio.upsertPerson.mockRejectedValueOnce(new ZkbioTransportError('timeout'));
    await expect(
      ctx.gateway.apply(zkbioTarget, [push(), push({ pin: '2' })], now),
    ).rejects.toMatchObject({
      reason: 'timeout',
    });
    expect(ctx.zkbio.upsertPerson).toHaveBeenCalledTimes(2);
  });
});

describe('ZktecoGateway.apply on a standalone device', () => {
  it('writes every member in one session, transliterated, and never touches a foreign slot', async () => {
    ctx.session.listUsers.mockResolvedValue([
      {
        uid: 20002,
        userId: '99',
        name: 'admin',
        card: 0,
        privilege: 14,
        enabled: null,
        recordSize: 72,
      },
      {
        uid: 20003,
        userId: '20003',
        name: 'x',
        card: 0,
        privilege: 0,
        enabled: null,
        recordSize: 72,
      },
    ]);
    const outcomes = await ctx.gateway.apply(
      deviceTarget,
      [push(), push({ pin: '20002' }), push({ pin: '20003', action: 'delete' })],
      now,
    );
    expect(outcomes).toEqual([
      { pin: '20001', ok: true },
      { pin: '20002', ok: false, error: 'pin_conflict' },
      { pin: '20003', ok: true },
    ]);
    expect(ctx.device.withSession).toHaveBeenCalledTimes(1);
    expect(ctx.session.upsertUser).toHaveBeenCalledWith({
      uid: 20001,
      userId: '20001',
      name: 'nino beridze',
      card: 123456,
      recordSize: 72,
    });
    expect(ctx.session.deleteUser).toHaveBeenCalledWith(20003);
  });
  it('needs a record size for the first user on an empty device', async () => {
    const target = { ...deviceTarget, recordSize: null } as ZktecoTarget;
    expect(await ctx.gateway.apply(target, [push()], now)).toEqual([
      { pin: '20001', ok: false, error: 'record_size_required' },
    ]);
    expect(ctx.session.upsertUser).not.toHaveBeenCalled();
  });
  it('turns a dropped connection into a batch failure', async () => {
    ctx.device.withSession.mockRejectedValue(new ZkDeviceError('timeout'));
    await expect(ctx.gateway.apply(deviceTarget, [push()], now)).rejects.toMatchObject({
      reason: 'timeout',
    });
  });
});

describe('ZktecoGateway.readEvents', () => {
  it('keeps entries only, keys them and advances the cursor to the newest passage', async () => {
    ctx.zkbio.listAccessTransactions.mockResolvedValue(
      page([
        {
          id: 'e1',
          pin: '20001',
          devSn: 'SN1',
          eventTime: new Date('2026-11-20T07:59:00Z'),
          eventLevel: 0,
          readerState: 0,
        },
        {
          id: 'e2',
          pin: '20001',
          devSn: 'SN1',
          eventTime: new Date('2026-11-20T07:59:30Z'),
          eventLevel: 0,
          readerState: 1,
        },
        {
          id: 'e3',
          pin: '',
          devSn: 'SN1',
          eventTime: new Date('2026-11-20T07:58:00Z'),
          eventLevel: 0,
        },
        {
          id: 'e4',
          pin: '20002',
          devSn: 'SN1',
          eventTime: new Date('2026-11-20T07:57:00Z'),
          eventLevel: 2,
        },
      ]),
    );
    ctx.zkbio.listEntranceTransactions.mockRejectedValue(new ZkbioApiError(-1));
    const batch = await ctx.gateway.readEvents(zkbioTarget, '2026-11-20T07:50:00.000Z', now);
    expect(batch.events).toEqual([
      {
        key: 'access:SN1:e1:20001',
        pin: '20001',
        at: new Date('2026-11-20T07:59:00Z'),
        deviceSn: 'SN1',
      },
    ]);
    expect(batch.skipped).toBe(3);
    expect(batch.cursor).toBe('2026-11-20T07:59:30.000Z');
    // Re-reads the overlap window; the event key removes duplicates downstream.
    expect(ctx.zkbio.listAccessTransactions).toHaveBeenCalledWith(
      zkbioTarget.zkbio,
      expect.objectContaining({
        startDate: new Date('2026-11-20T07:40:00.000Z'),
        endDate: now,
        utcOffsetMinutes: 240,
        pageNo: 1,
      }),
    );
  });
  it('fails when neither module answers and when the server is down', async () => {
    ctx.zkbio.listAccessTransactions.mockRejectedValue(new ZkbioApiError(-1));
    ctx.zkbio.listEntranceTransactions.mockRejectedValue(new ZkbioApiError(-1));
    await expect(ctx.gateway.readEvents(zkbioTarget, null, now)).rejects.toBeInstanceOf(
      ZktecoUnavailableError,
    );
    ctx.zkbio.listAccessTransactions.mockRejectedValue(new ZkbioTransportError('unauthorized'));
    await expect(ctx.gateway.readEvents(zkbioTarget, null, now)).rejects.toMatchObject({
      reason: 'unauthorized',
    });
  });
  it('reads a device log by local wall clock and skips check-outs', async () => {
    ctx.session.listAttendance.mockResolvedValue([
      {
        userId: '20001',
        timestamp: { local: '2026-11-20T11:58:00', timeZone: 'Asia/Tbilisi' },
        punchState: 0,
        verifyType: 1,
      },
      {
        userId: '20001',
        timestamp: { local: '2026-11-20T11:59:00', timeZone: 'Asia/Tbilisi' },
        punchState: 1,
        verifyType: 1,
      },
      {
        userId: '20002',
        timestamp: { local: '2026-11-20T13:00:00', timeZone: 'Asia/Tbilisi' },
        punchState: 0,
        verifyType: 1,
      },
    ]);
    const batch = await ctx.gateway.readEvents(deviceTarget, '2026-11-20T11:50:00', now);
    expect(ctx.session.listAttendance).toHaveBeenCalledWith({
      timeZone: 'Asia/Tbilisi',
      since: '2026-11-20T11:40:00',
    });
    expect(batch.events).toEqual([
      {
        key: 'device:DEV-SN:2026-11-20T11:58:00:20001',
        pin: '20001',
        at: new Date('2026-11-20T07:58:00.000Z'),
        deviceSn: 'DEV-SN',
      },
    ]);
    // The 13:00 record is in the device's future (clock skew) and is left for later.
    expect(batch.cursor).toBe('2026-11-20T11:59:00');
  });
});

describe('ZktecoGateway.openDoor', () => {
  it('opens the chosen door or gate exactly once, even when it times out', async () => {
    expect(await ctx.gateway.openDoor(zkbioTarget, { kind: 'door', id: 'D1' }, 5)).toEqual({
      ok: true,
    });
    expect(ctx.zkbio.openDoor).toHaveBeenCalledWith(zkbioTarget.zkbio, 'D1', 5);
    await ctx.gateway.openDoor(zkbioTarget, { kind: 'gate', id: 'G1' }, 5);
    expect(ctx.zkbio.openGate).toHaveBeenCalledWith(zkbioTarget.zkbio, 'G1', 1);
    ctx.zkbio.openDoor.mockClear().mockRejectedValue(new ZkbioTransportError('timeout'));
    expect(await ctx.gateway.openDoor(zkbioTarget, { kind: 'door', id: 'D1' }, 5)).toEqual({
      ok: false,
      reason: 'timeout',
    });
    expect(ctx.zkbio.openDoor).toHaveBeenCalledTimes(1);
  });
  it('asks for a door on zkbio and unlocks a device directly', async () => {
    expect(await ctx.gateway.openDoor(zkbioTarget, null, 5)).toEqual({
      ok: false,
      reason: 'no_door_selected',
    });
    expect(await ctx.gateway.openDoor(deviceTarget, null, 3)).toEqual({ ok: true });
    expect(ctx.device.unlockDoor).toHaveBeenCalledWith(deviceTarget.device, 3);
  });
});
