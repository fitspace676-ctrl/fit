import { Injectable } from '@nestjs/common';
import type {
  ZktecoDoorTarget,
  ZktecoFailureReason,
  ZktecoOpenDoorResponse,
  ZktecoResources,
  ZktecoSettings,
  ZktecoTestResponse,
} from '@fit/types';
import { ZkbioClient } from '../zkbio/zkbio-client';
import { ZkbioApiError, ZkbioTransportError } from '../zkbio/zkbio-errors';
import type {
  Device,
  Occupant,
  Page,
  Pagination,
  Transaction,
  ZkbioConnection,
} from '../zkbio/zkbio-types';
import { ZkDeviceClient, type ZkDeviceSession } from '../zkdevice/zkdevice-client';
import { ZkDeviceError } from '../zkdevice/zkdevice-errors';
import type { ZkDeviceConnection, ZkUser } from '../zkdevice/zkdevice-types';
import {
  deviceUserName,
  localWallTime,
  utcOffsetMinutes,
  wallTimeToInstant,
} from './zkteco-config';

/** One gym's resolved connection: decrypted secret plus the card's options. */
export type ZktecoTarget =
  | { type: 'zkbio'; zkbio: ZkbioConnection; options: ZktecoSettings }
  | {
      type: 'device';
      device: ZkDeviceConnection;
      recordSize: 28 | 72 | null;
      options: ZktecoSettings;
    };

/** What the turnstile should be told about one member. */
export type MemberAction = 'activate' | 'remove_access' | 'disable' | 'delete';

export interface MemberPush {
  pin: string;
  action: MemberAction;
  name: string;
  firstName: string;
  lastName: string;
  /** Null = no card (a set card is cleared when `syncCard` is on). */
  cardNumber: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  /** Base64 photo, only when it changed and `syncPhoto` is on (zkbio). */
  photo: string | null;
  /** What the turnstile was last told, so a disabled person is re-enabled. */
  previousState: string;
}

export interface PushOutcome {
  pin: string;
  ok: boolean;
  /** Short reason code; never provider text. */
  error?: string;
}

/** One passage, normalised across both connection types. */
export interface TurnstileEvent {
  /** Idempotency key, unique per gym. */
  key: string;
  pin: string;
  at: Date;
  /** Device serial number, the key of `deviceLocations`; null when unknown. */
  deviceSn: string | null;
}

export interface EventBatch {
  events: TurnstileEvent[];
  /** Passages read but not entries (exits, alarms, no PIN). */
  skipped: number;
  /** The cursor to store; unchanged when nothing new was read. */
  cursor: string | null;
}

/** Thrown when the whole connection failed (as opposed to one member or one list). */
export class ZktecoUnavailableError extends Error {
  constructor(readonly reason: ZktecoFailureReason) {
    super(`ZKTeco connection failed (${reason})`);
    this.name = 'ZktecoUnavailableError';
  }
}

/** Re-read this much history on every poll; the event key removes duplicates. */
export const EVENT_OVERLAP_MS = 10 * 60_000;
const EVENT_PAGE_SIZE = 200;
const EVENT_MAX_PAGES = 10;
const DISCOVERY_PAGE_SIZE = 200;
const DISCOVERY_MAX_PAGES = 10;
/** A standalone device session is capped at 60s by the client; keep batches well under. */
export const DEVICE_BATCH_SIZE = 40;

/**
 * The one place that knows there are two ways to reach a ZKTeco turnstile. The
 * sync, import and owner endpoints speak in members, passages and doors; this
 * translates to the ZKBio REST client or the standalone device client.
 *
 * Nothing here retries. Remote opening must never be replayed, and every other
 * write is safe to leave for the next job run, which is the retry.
 */
@Injectable()
export class ZktecoGateway {
  constructor(
    private readonly zkbio: ZkbioClient,
    private readonly device: ZkDeviceClient,
  ) {}

  async check(target: ZktecoTarget): Promise<ZktecoTestResponse> {
    if (target.type === 'zkbio') {
      const result = await this.zkbio.checkConnection(target.zkbio);
      return result.ok ? { ok: true } : { ok: false, reason: result.reason };
    }
    try {
      const info = await this.device.checkConnection(target.device);
      return {
        ok: true,
        device: {
          serialNumber: info.serialNumber ?? null,
          deviceName: info.deviceName ?? null,
          firmwareVersion: info.firmwareVersion ?? null,
          userCount: info.userCount ?? null,
          userCapacity: info.userCapacity ?? null,
        },
      };
    } catch (error) {
      return { ok: false, reason: deviceReason(error) };
    }
  }

  /** Everything the settings pickers offer. A list the server refuses is reported, not fatal. */
  async discover(target: ZktecoTarget): Promise<ZktecoResources> {
    const resources: ZktecoResources = {
      devices: [],
      doors: [],
      gates: [],
      readers: [],
      accessLevels: [],
      entranceLevels: [],
      areas: [],
      unavailable: [],
    };
    if (target.type === 'device') {
      const check = await this.check(target);
      if (!check.ok) throw new ZktecoUnavailableError(check.reason ?? 'unreachable');
      const sn = check.device?.serialNumber ?? target.device.host;
      resources.devices.push({
        sn,
        name: check.device?.deviceName ?? 'ZKTeco',
        module: 'device',
        online: true,
      });
      resources.doors.push({ id: '1', name: check.device?.deviceName ?? 'ZKTeco', deviceId: sn });
      return resources;
    }
    const c = target.zkbio;
    const list = async <T>(
      key: ZktecoResources['unavailable'][number],
      read: (page: Pagination) => Promise<Page<T> | T[]>,
    ): Promise<T[]> => {
      try {
        return await readAll(read, DISCOVERY_PAGE_SIZE, DISCOVERY_MAX_PAGES);
      } catch (error) {
        rethrowConnectionFailure(error);
        if (!resources.unavailable.includes(key)) resources.unavailable.push(key);
        return [];
      }
    };
    const toDevice = (module: 'access' | 'entrance') => (d: Device) => ({
      sn: String(d.sn),
      name: String(d.name ?? d.sn),
      module,
      online: onlineState(d.state ?? d.status),
    });
    resources.devices.push(
      ...(await list('devices', (p) => this.zkbio.listAccessDevices(c, p))).map(toDevice('access')),
      ...(await list('devices', (p) => this.zkbio.listEntranceDevices(c, p))).map(
        toDevice('entrance'),
      ),
    );
    resources.doors = (await list('doors', (p) => this.zkbio.listDoors(c, p))).map((d) => ({
      id: String(d.id),
      name: String(d.name),
      deviceId: d.deviceId ? String(d.deviceId) : null,
    }));
    resources.gates = (await list('gates', (p) => this.zkbio.listGates(c, p))).map((d) => ({
      id: String(d.id),
      name: String(d.name),
      deviceId: d.deviceId ? String(d.deviceId) : null,
    }));
    const readers = [
      ...(await list('readers', (p) => this.zkbio.listAccessReaders(c, p))),
      ...(await list('readers', (p) => this.zkbio.listEntranceReaders(c, p))),
    ];
    resources.readers = readers.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      doorId: r.doorId ? String(r.doorId) : null,
      gateId: r.gateId ? String(r.gateId) : null,
    }));
    resources.accessLevels = (
      await list('accessLevels', (p) => this.zkbio.listAccessLevels(c, p))
    ).map((l) => ({ id: String(l.id), name: String(l.name) }));
    resources.entranceLevels = (
      await list('entranceLevels', (p) => this.zkbio.listEntranceLevels(c, p))
    ).map((l) => ({ id: String(l.id), name: String(l.name) }));
    resources.areas = (await list('areas', (p) => this.zkbio.listAreas(c, p))).map((a) => ({
      code: String(a.code),
      name: String(a.name),
    }));
    return resources;
  }

  /**
   * Apply member changes. Per-member failures are returned; a failure of the
   * connection itself throws {@link ZktecoUnavailableError} so the caller leaves
   * the whole batch for the next run.
   */
  async apply(target: ZktecoTarget, pushes: MemberPush[], now: Date): Promise<PushOutcome[]> {
    if (pushes.length === 0) return [];
    return target.type === 'zkbio'
      ? this.applyZkbio(target, pushes, now)
      : this.applyDevice(target, pushes);
  }

  /**
   * Every PIN present on the server/device, for the reconcile job. Returns `null`
   * when the listing is not possible, so reconcile falls back to pushing only.
   */
  async listRemotePins(target: ZktecoTarget, now: Date): Promise<Set<string> | null> {
    try {
      if (target.type === 'device') {
        const users = await this.device.listUsers(target.device);
        return new Set(users.map((u) => u.userId));
      }
      const offset = utcOffsetMinutes(target.options.timeZone, now);
      const people = await readAll(
        (p) => this.zkbio.listPersons(target.zkbio, p, offset),
        1000,
        200,
      );
      return new Set(people.map((p) => String(p.pin)));
    } catch (error) {
      if (target.type === 'device') throw new ZktecoUnavailableError(deviceReason(error));
      rethrowConnectionFailure(error);
      return null;
    }
  }

  /**
   * Passages since `cursor`. zkbio reads the access and entrance transaction
   * lists by time window (never faster than the caller's 10s floor); a device
   * returns its attendance log, filtered to the window.
   */
  async readEvents(target: ZktecoTarget, cursor: string | null, now: Date): Promise<EventBatch> {
    return target.type === 'zkbio'
      ? this.readZkbioEvents(target, cursor, now)
      : this.readDeviceEvents(target, cursor, now);
  }

  /** One remote open. Never retried: a timeout may still have opened the door. */
  async openDoor(
    target: ZktecoTarget,
    door: ZktecoDoorTarget | null,
    seconds: number,
  ): Promise<ZktecoOpenDoorResponse> {
    try {
      if (target.type === 'device') {
        await this.device.unlockDoor(target.device, seconds);
        return { ok: true };
      }
      if (!door) return { ok: false, reason: 'no_door_selected' };
      if (door.kind === 'gate') await this.zkbio.openGate(target.zkbio, door.id, 1);
      else await this.zkbio.openDoor(target.zkbio, door.id, seconds);
      return { ok: true };
    } catch (error) {
      if (error instanceof ZkbioTransportError) {
        if (error.reason === 'unauthorized') return { ok: false, reason: 'unauthorized' };
        if (error.reason === 'timeout') return { ok: false, reason: 'timeout' };
        return { ok: false, reason: 'unreachable' };
      }
      if (error instanceof ZkDeviceError) {
        if (error.reason === 'unauthorized') return { ok: false, reason: 'unauthorized' };
        if (error.reason === 'timeout') return { ok: false, reason: 'timeout' };
        if (error.reason === 'rejected' || error.reason === 'invalid_argument')
          return { ok: false, reason: 'rejected' };
        return { ok: false, reason: 'unreachable' };
      }
      return { ok: false, reason: 'rejected' };
    }
  }

  /** zkbio only: who the server counts inside one zone. */
  async whoIsInside(target: ZktecoTarget, zoneCode: string): Promise<Occupant[]> {
    if (target.type !== 'zkbio') return [];
    try {
      return await this.zkbio.getWhoIsInside(target.zkbio, zoneCode);
    } catch (error) {
      rethrowConnectionFailure(error);
      throw new ZktecoUnavailableError('protocol');
    }
  }

  private async applyZkbio(
    target: Extract<ZktecoTarget, { type: 'zkbio' }>,
    pushes: MemberPush[],
    now: Date,
  ): Promise<PushOutcome[]> {
    const c = target.zkbio;
    const o = target.options;
    const offset = utcOffsetMinutes(o.timeZone, now);
    const outcomes: PushOutcome[] = [];
    for (const push of pushes) {
      try {
        let photoError: string | undefined;
        switch (push.action) {
          case 'activate':
            await this.zkbio.upsertPerson(
              c,
              {
                pin: push.pin,
                name: push.firstName || push.name || push.pin,
                ...(push.lastName ? { lastName: push.lastName } : {}),
                ...(o.syncCard ? { cardNo: push.cardNumber ?? '' } : {}),
                isDisabled: false,
                ...(push.validFrom ? { accStartTime: push.validFrom } : {}),
                ...(push.validUntil ? { accEndTime: push.validUntil } : {}),
                ...(o.accessLevelIds.length ? { accLevelIds: o.accessLevelIds.join(',') } : {}),
              },
              offset,
            );
            if (push.previousState === 'disable') await this.zkbio.enablePersons(c, [push.pin]);
            if (o.accessLevelIds.length)
              await this.zkbio.assignAccessLevels(c, push.pin, o.accessLevelIds);
            if (o.entranceLevelIds.length)
              await this.zkbio.addEntranceLevelByPerson(c, [
                { pin: push.pin, levelIds: o.entranceLevelIds },
              ]);
            if (push.photo) {
              try {
                await this.zkbio.updatePersonPhoto(c, push.pin, push.photo);
              } catch (error) {
                rethrowConnectionFailure(error);
                // Access is granted; only the face template is missing.
                photoError = 'invalid_photo';
              }
            }
            break;
          case 'remove_access':
            if (o.accessLevelIds.length)
              await ignoreMissing(() =>
                this.zkbio.deletePersonAccessLevels(c, push.pin, o.accessLevelIds),
              );
            if (o.entranceLevelIds.length)
              await ignoreMissing(() =>
                this.zkbio.deletePersonEntranceLevels(c, push.pin, o.entranceLevelIds),
              );
            break;
          case 'disable':
            await ignoreMissing(() => this.zkbio.disablePersons(c, [push.pin]));
            break;
          case 'delete':
            await ignoreMissing(() => this.zkbio.deletePerson(c, push.pin));
            break;
        }
        outcomes.push(
          photoError ? { pin: push.pin, ok: true, error: photoError } : { pin: push.pin, ok: true },
        );
      } catch (error) {
        rethrowConnectionFailure(error);
        outcomes.push({ pin: push.pin, ok: false, error: zkbioReason(error) });
      }
    }
    return outcomes;
  }

  private async applyDevice(
    target: Extract<ZktecoTarget, { type: 'device' }>,
    pushes: MemberPush[],
  ): Promise<PushOutcome[]> {
    const o = target.options;
    try {
      return await this.device.withSession(target.device, async (session) => {
        const users = await session.listUsers();
        const layout = users[0]?.recordSize ?? target.recordSize;
        const outcomes: PushOutcome[] = [];
        for (const push of pushes) {
          outcomes.push(await applyOnDevice(session, users, layout, push, o.syncCard));
        }
        return outcomes;
      });
    } catch (error) {
      throw new ZktecoUnavailableError(deviceReason(error));
    }
  }

  private async readZkbioEvents(
    target: Extract<ZktecoTarget, { type: 'zkbio' }>,
    cursor: string | null,
    now: Date,
  ): Promise<EventBatch> {
    const since = cursorInstant(cursor, now);
    const offset = utcOffsetMinutes(target.options.timeZone, now);
    const query = {
      startDate: new Date(since.getTime() - EVENT_OVERLAP_MS),
      endDate: now,
      utcOffsetMinutes: offset,
    };
    const events: TurnstileEvent[] = [];
    let skipped = 0;
    let newest = cursor ? since : null;
    let readAny = false;
    const sources: [string, (p: Pagination) => Promise<Page<Transaction>>][] = [
      ['access', (p) => this.zkbio.listAccessTransactions(target.zkbio, { ...query, ...p })],
      ['entrance', (p) => this.zkbio.listEntranceTransactions(target.zkbio, { ...query, ...p })],
    ];
    for (const [source, read] of sources) {
      let rows: Transaction[];
      try {
        rows = await readAll(read, EVENT_PAGE_SIZE, EVENT_MAX_PAGES);
        readAny = true;
      } catch (error) {
        rethrowConnectionFailure(error);
        // This module is not licensed or not present on the server.
        continue;
      }
      for (const row of rows) {
        if (row.eventTime > now) continue;
        if (!newest || row.eventTime > newest) newest = row.eventTime;
        if (!isEntry(row)) {
          skipped += 1;
          continue;
        }
        const id = row.id ?? row.logId ?? row.eventTime.toISOString();
        events.push({
          key: `${source}:${row.devSn ?? '-'}:${id}:${row.pin}`,
          pin: String(row.pin),
          at: row.eventTime,
          deviceSn: row.devSn ? String(row.devSn) : null,
        });
      }
    }
    if (!readAny) throw new ZktecoUnavailableError('not_zkbio');
    return {
      events,
      skipped,
      cursor: newest
        ? newest.toISOString()
        : (cursor ?? new Date(now.getTime() - EVENT_OVERLAP_MS).toISOString()),
    };
  }

  private async readDeviceEvents(
    target: Extract<ZktecoTarget, { type: 'device' }>,
    cursor: string | null,
    now: Date,
  ): Promise<EventBatch> {
    const timeZone = target.options.timeZone;
    // Device cursors are local wall clocks: the device has no notion of UTC.
    const sinceLocal =
      cursor ?? localWallTime(new Date(now.getTime() - EVENT_OVERLAP_MS), timeZone);
    const windowStart = localWallTime(
      new Date(wallTimeToInstant(sinceLocal, timeZone).getTime() - EVENT_OVERLAP_MS),
      timeZone,
    );
    try {
      return await this.device.withSession(target.device, async (session) => {
        const info = await session.checkConnection();
        const sn = info.serialNumber ?? target.device.host;
        const records = await session.listAttendance({ timeZone, since: windowStart });
        const nowLocal = localWallTime(now, timeZone);
        const events: TurnstileEvent[] = [];
        let skipped = 0;
        let newest = cursor;
        for (const record of records) {
          const local = record.timestamp.local;
          if (local > nowLocal) continue;
          if (!newest || local > newest) newest = local;
          // punchState 1 is check-out on attendance terminals.
          if (!record.userId || record.punchState === 1) {
            skipped += 1;
            continue;
          }
          events.push({
            key: `device:${sn}:${local}:${record.userId}`,
            pin: record.userId,
            at: wallTimeToInstant(local, timeZone),
            deviceSn: sn,
          });
        }
        return { events, skipped, cursor: newest ?? sinceLocal };
      });
    } catch (error) {
      throw new ZktecoUnavailableError(deviceReason(error));
    }
  }
}

async function applyOnDevice(
  session: ZkDeviceSession,
  users: ZkUser[],
  layout: 28 | 72 | null,
  push: MemberPush,
  syncCard: boolean,
): Promise<PushOutcome> {
  const uid = Number(push.pin);
  if (!Number.isInteger(uid) || uid < 1 || uid > 65535)
    return { pin: push.pin, ok: false, error: 'pin_out_of_range' };
  const existing = users.find((u) => u.uid === uid);
  // A slot held by someone the gym did not create (an admin, a staff fingerprint).
  if (existing && existing.userId !== push.pin)
    return { pin: push.pin, ok: false, error: 'pin_conflict' };
  try {
    if (push.action === 'activate') {
      if (!layout) return { pin: push.pin, ok: false, error: 'record_size_required' };
      const card = syncCard ? Number(push.cardNumber ?? 0) : undefined;
      await session.upsertUser({
        uid,
        userId: push.pin,
        name: deviceUserName(push.name, push.pin, layout),
        ...(card !== undefined ? { card } : {}),
        ...(existing ? {} : { recordSize: layout }),
      });
      if (!existing)
        users.push({
          uid,
          userId: push.pin,
          name: '',
          card: card ?? 0,
          privilege: 0,
          enabled: null,
          recordSize: layout,
        });
      return { pin: push.pin, ok: true };
    }
    // A standalone device has no disable bit and no levels: every end is a delete.
    if (existing) await session.deleteUser(uid);
    return { pin: push.pin, ok: true };
  } catch (error) {
    if (
      error instanceof ZkDeviceError &&
      ['rejected', 'invalid_argument', 'unsupported_layout', 'unsupported_operation'].includes(
        error.reason,
      )
    )
      return { pin: push.pin, ok: false, error: error.reason };
    throw error;
  }
}

/** Page through a list until a short page or the cap; also accepts a bare array answer. */
async function readAll<T>(
  read: (page: Pagination) => Promise<Page<T> | T[]>,
  pageSize: number,
  maxPages: number,
): Promise<T[]> {
  const rows: T[] = [];
  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const result = await read({ pageNo, pageSize });
    const data = Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : null;
    if (!data) throw new ZkbioTransportError('not_zkbio');
    rows.push(...data);
    if (Array.isArray(result) || data.length < pageSize || (result.lastPage ?? false)) break;
  }
  return rows;
}

/** A passage that is someone walking in: a PIN, a normal (not alarm) event, not an exit reader. */
function isEntry(row: Transaction): boolean {
  if (!row.pin) return false;
  if (row.eventLevel !== undefined && row.eventLevel !== 0) return false;
  if (row.readerState === 1) return false;
  return true;
}

function onlineState(value: string | null | undefined): boolean | null {
  if (value === undefined || value === null) return null;
  const v = String(value).toLowerCase();
  if (['1', 'online', 'normal', 'true'].includes(v)) return true;
  if (['0', 'offline', 'disable', 'disabled', 'false'].includes(v)) return false;
  return null;
}

function cursorInstant(cursor: string | null, now: Date): Date {
  const parsed = cursor ? Date.parse(cursor) : NaN;
  return Number.isFinite(parsed) && parsed <= now.getTime() ? new Date(parsed) : now;
}

async function ignoreMissing(write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (error) {
    if (error instanceof ZkbioApiError && error.reason === 'person_not_found') return;
    throw error;
  }
}

/**
 * A failure of the connection itself (refused token, server down, timeout)
 * ends the whole batch. Anything else, including an answer of an unexpected
 * shape from one unlicensed module, belongs to that one item or list.
 */
function rethrowConnectionFailure(error: unknown): void {
  if (error instanceof ZkbioTransportError && error.reason !== 'not_zkbio') {
    throw new ZktecoUnavailableError(error.reason);
  }
  if (error instanceof ZktecoUnavailableError) throw error;
}

function zkbioReason(error: unknown): string {
  if (error instanceof ZkbioApiError) return error.reason;
  if (error instanceof RangeError) return 'invalid_argument';
  return 'unknown';
}

function deviceReason(error: unknown): ZktecoFailureReason {
  if (error instanceof ZktecoUnavailableError) return error.reason;
  if (!(error instanceof ZkDeviceError)) return 'unreachable';
  switch (error.reason) {
    case 'unauthorized':
      return 'unauthorized';
    case 'timeout':
      return 'timeout';
    case 'blocked_host':
      return 'blocked_host';
    case 'invalid_connection':
      return 'invalid_connection';
    case 'protocol':
    case 'unsupported_layout':
      return 'protocol';
    default:
      return 'unreachable';
  }
}
