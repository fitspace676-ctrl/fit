import { ZkDeviceError } from './zkdevice-errors';
import type { ZkAttendance, ZkUser, ZkUserInput, ZkWallTime } from './zkdevice-types';

export const CMD = {
  CONNECT: 1000,
  EXIT: 1001,
  ENABLE: 1002,
  DISABLE: 1003,
  AUTH: 1102,
  OK: 2000,
  ERROR: 2001,
  UNAUTH: 2005,
  PREPARE_DATA: 1500,
  DATA: 1501,
  FREE_DATA: 1502,
  PREPARE_BUFFER: 1503,
  READ_BUFFER: 1504,
  USER_WRITE: 8,
  DELETE_USER: 18,
  USERS: 9,
  ATTENDANCE: 13,
  OPTIONS: 11,
  SIZES: 50,
  UNLOCK: 31,
  DOOR_STATE: 75,
  EVENT: 500,
  REFRESH: 1013,
  TIME: 201,
  VERSION: 1100,
} as const;
export const MAX_DATA = 16 * 1024 * 1024;
export interface Packet {
  command: number;
  session: number;
  reply: number;
  payload: Buffer;
}

/** Standard one's complement checksum; outgoing reply counter is the wire value. */
export function checksum(bytes: Buffer): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    sum += bytes[i]! + ((bytes[i + 1] ?? 0) << 8);
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  return ~sum & 0xffff;
}
export function encodePacket(
  command: number,
  session: number,
  reply: number,
  payload = Buffer.alloc(0),
): Buffer {
  const packet = Buffer.alloc(16 + payload.length);
  packet.writeUInt16LE(0x5050, 0);
  packet.writeUInt16LE(0x827d, 2);
  packet.writeUInt32LE(8 + payload.length, 4);
  packet.writeUInt16LE(command, 8);
  packet.writeUInt16LE(session, 12);
  packet.writeUInt16LE(reply, 14);
  payload.copy(packet, 16);
  packet.writeUInt16LE(checksum(packet.subarray(8)), 10);
  return packet;
}
/** Streaming decoder handles coalesced and fragmented TCP frames with a hard bound. */
export class PacketDecoder {
  private buffered: Buffer = Buffer.alloc(0);
  push(bytes: Buffer): Packet[] {
    if (this.buffered.length + bytes.length > MAX_DATA + 65536) throw new ZkDeviceError('protocol');
    this.buffered = Buffer.concat([this.buffered, bytes]);
    const packets: Packet[] = [];
    while (this.buffered.length >= 8) {
      const size = this.buffered.readUInt32LE(4);
      if (
        this.buffered.readUInt16LE(0) !== 0x5050 ||
        this.buffered.readUInt16LE(2) !== 0x827d ||
        size < 8 ||
        size > MAX_DATA
      )
        throw new ZkDeviceError('protocol');
      if (this.buffered.length < size + 8) break;
      const body = this.buffered.subarray(8, size + 8);
      if (checksum(body) !== 0) throw new ZkDeviceError('protocol');
      packets.push({
        command: body.readUInt16LE(0),
        session: body.readUInt16LE(4),
        reply: body.readUInt16LE(6),
        payload: Buffer.from(body.subarray(8)),
      });
      this.buffered = this.buffered.subarray(size + 8);
    }
    return packets;
  }
}
export function makeCommKey(key: number, session: number, ticks = 50): Buffer {
  let reversed = 0;
  for (let i = 0; i < 32; i++) reversed = ((reversed << 1) | ((key >>> i) & 1)) >>> 0;
  const b = Buffer.alloc(4);
  b.writeUInt32LE((reversed + session) >>> 0);
  const t = ticks & 255;
  return Buffer.from([b[2]! ^ 0x53 ^ t, b[3]! ^ 0x4f ^ t, t, b[1]! ^ 0x4b ^ t]);
}
export function wallTime(local: string, timeZone: string): ZkWallTime {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
  } catch {
    throw new ZkDeviceError('invalid_argument');
  }
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(local)) throw new ZkDeviceError('invalid_argument');
  const d = new Date(`${local}Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 19) !== local)
    throw new ZkDeviceError('invalid_argument');
  return { local, timeZone };
}
export function encodeTime(local: string): number {
  wallTime(local, 'UTC');
  const d = new Date(`${local}Z`);
  if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2099)
    throw new ZkDeviceError('invalid_argument');
  return (
    ((d.getUTCFullYear() - 2000) * 12 * 31 + d.getUTCMonth() * 31 + d.getUTCDate() - 1) * 86400 +
    d.getUTCHours() * 3600 +
    d.getUTCMinutes() * 60 +
    d.getUTCSeconds()
  );
}
export function decodeTime(value: number, timeZone: string): ZkWallTime {
  const second = value % 60;
  value = Math.floor(value / 60);
  const minute = value % 60;
  value = Math.floor(value / 60);
  const hour = value % 24;
  value = Math.floor(value / 24);
  const day = (value % 31) + 1;
  value = Math.floor(value / 31);
  const month = (value % 12) + 1;
  const year = Math.floor(value / 12) + 2000;
  const pad = (v: number) => String(v).padStart(2, '0');
  try {
    return wallTime(
      `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`,
      timeZone,
    );
  } catch {
    throw new ZkDeviceError('protocol');
  }
}
export function textField(b: Buffer): string {
  return b.toString('utf8').split('\0')[0] ?? '';
}
export function records(
  data: Buffer,
  count: number,
  sizes: readonly number[],
): { body: Buffer; size: number } {
  if (data.length < 4 || data.readUInt32LE(0) !== data.length - 4)
    throw new ZkDeviceError('protocol');
  const body = data.subarray(4);
  if (!body.length && count === 0) return { body, size: sizes[0]! };
  const candidates = sizes.filter(
    (s) => body.length % s === 0 && (count <= 0 || body.length / s === count),
  );
  if (candidates.length !== 1) throw new ZkDeviceError('unsupported_layout');
  return { body, size: candidates[0]! };
}
export function parseUsers(data: Buffer, count: number): ZkUser[] {
  const { body, size } = records(data, count, [28, 72]);
  const users: ZkUser[] = [];
  for (let p = 0; p < body.length; p += size) {
    const b = body.subarray(p, p + size);
    users.push({
      uid: b.readUInt16LE(0),
      privilege: b[2]!,
      name: textField(b.subarray(size === 28 ? 8 : 11, size === 28 ? 16 : 35)),
      card: b.readUInt32LE(size === 28 ? 16 : 35),
      userId: size === 28 ? String(b.readUInt32LE(24)) : textField(b.subarray(48, 72)),
      enabled: null,
      recordSize: size as 28 | 72,
    });
  }
  return users;
}
export function uint(value: number, max: number): void {
  if (!Number.isInteger(value) || value < 0 || value > max)
    throw new ZkDeviceError('invalid_argument');
}
function putText(b: Buffer, value: string, offset: number, length: number): void {
  if (value.includes('\0') || Buffer.byteLength(value) > length)
    throw new ZkDeviceError('invalid_argument');
  b.write(value, offset, length, 'utf8');
}
/** Preserve password/group/access bytes when updating an existing record. */
export function encodeUser(user: ZkUserInput, size: 28 | 72, existing?: Buffer): Buffer {
  if (user.enabled !== undefined) throw new ZkDeviceError('unsupported_operation');
  uint(user.uid, 65535);
  if (!user.uid) throw new ZkDeviceError('invalid_argument');
  uint(user.card ?? 0, 0xffffffff);
  uint(user.privilege ?? 0, 255);
  if (!user.userId) throw new ZkDeviceError('invalid_argument');
  const b = existing ? Buffer.from(existing) : Buffer.alloc(size);
  if (b.length !== size) throw new ZkDeviceError('protocol');
  b.writeUInt16LE(user.uid, 0);
  b[2] = user.privilege ?? existing?.[2] ?? 0;
  const nameStart = size === 28 ? 8 : 11;
  const nameLength = size === 28 ? 8 : 24;
  b.fill(0, nameStart, nameStart + nameLength);
  putText(b, user.name, nameStart, nameLength);
  if (user.card !== undefined || !existing) b.writeUInt32LE(user.card ?? 0, size === 28 ? 16 : 35);
  if (size === 28) {
    if (!/^\d+$/.test(user.userId)) throw new ZkDeviceError('invalid_argument');
    const pin = Number(user.userId);
    uint(pin, 0xffffffff);
    b.writeUInt32LE(pin, 24);
  } else {
    b.fill(0, 48, 72);
    putText(b, user.userId, 48, 24);
  }
  return b;
}
export function parseAttendance(
  data: Buffer,
  count: number,
  timeZone: string,
  users: readonly ZkUser[] = [],
): ZkAttendance[] {
  const { body, size } = records(data, count, [8, 16, 40]);
  const result: ZkAttendance[] = [];
  for (let p = 0; p < body.length; p += size) {
    const b = body.subarray(p, p + size);
    const uid = size === 8 ? b.readUInt16LE(0) : 0;
    result.push({
      userId:
        size === 8
          ? (users.find((u) => u.uid === uid)?.userId ?? String(uid))
          : size === 16
            ? String(b.readUInt32LE(0))
            : textField(b.subarray(2, 26)),
      timestamp: decodeTime(b.readUInt32LE(size === 8 ? 3 : size === 16 ? 4 : 27), timeZone),
      verifyType: b[size === 8 ? 2 : size === 16 ? 8 : 26]!,
      punchState: b[size === 8 ? 7 : size === 16 ? 9 : 31]!,
    });
  }
  return result;
}
/** Event records use six calendar bytes, not packed attendance timestamps. */
export function parseEvent(b: Buffer, timeZone: string): ZkAttendance {
  if (![10, 12, 14, 32, 36, 37, 52].includes(b.length))
    throw new ZkDeviceError('unsupported_layout');
  const width = b.length >= 32 ? 24 : b.length === 12 ? 4 : 2;
  const t = b.subarray(width + 2, width + 8);
  const pad = (v: number) => String(v).padStart(2, '0');
  return {
    userId:
      width === 24
        ? textField(b.subarray(0, 24))
        : String(width === 4 ? b.readUInt32LE(0) : b.readUInt16LE(0)),
    verifyType: b[width]!,
    punchState: b[width + 1]!,
    timestamp: wallTime(
      `${2000 + t[0]!}-${pad(t[1]!)}-${pad(t[2]!)}T${pad(t[3]!)}:${pad(t[4]!)}:${pad(t[5]!)}`,
      timeZone,
    ),
  };
}
