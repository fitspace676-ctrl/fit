import { describe, expect, it } from 'vitest';
import {
  CMD,
  PacketDecoder,
  checksum,
  decodeTime,
  encodePacket,
  encodeTime,
  encodeUser,
  makeCommKey,
  parseAttendance,
  parseEvent,
  parseUsers,
} from './zkdevice-protocol';

function envelope(b: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(b.length);
  return Buffer.concat([header, b]);
}

describe('ZK binary protocol', () => {
  it('matches independent checksum and connect frame fixtures', () => {
    expect(checksum(Buffer.from('010203', 'hex'))).toBe(0xfdfb);
    expect(encodePacket(CMD.CONNECT, 0, 0).toString('hex')).toBe(
      '50507d8208000000e80317fc00000000',
    );
    const decoder = new PacketDecoder();
    const frame = Buffer.from('50507d8208000000d0072ef82a00d6ff', 'hex');
    // Explicit known valid fixture instead of accepting unverified provider bytes.
    expect(checksum(frame.subarray(8))).toBe(0);
    expect(decoder.push(frame.subarray(0, 7))).toEqual([]);
    expect(decoder.push(frame.subarray(7))[0]).toMatchObject({
      command: 2000,
      session: 42,
      reply: 65494,
    });
  });
  it('rejects corrupted headers, checksum, and oversized frames', () => {
    const b = encodePacket(CMD.OK, 1, 2);
    b[10] = b[10]! ^ 1;
    expect(() => new PacketDecoder().push(b)).toThrow();
    const huge = Buffer.from('50507d82ffffffff', 'hex');
    expect(() => new PacketDecoder().push(huge)).toThrow();
  });
  it.each([
    [0, 0, '617d3279'],
    [1, 0, '61fd3279'],
    [0, 42, '617d3279'],
    [12345, 123, '6de13279'],
    [0xffffffff, 0, '9e823286'],
  ])('scrambles communication key %i with session %i', (key, session, hex) => {
    expect(makeCommKey(key, session).toString('hex')).toBe(hex);
  });
  it('encodes packed device-local calendar time without applying server timezone', () => {
    expect(encodeTime('2000-01-01T00:00:00')).toBe(0);
    expect(encodeTime('2000-02-01T00:00:00')).toBe(2678400);
    expect(decodeTime(encodeTime('2024-02-29T23:59:58'), 'Asia/Tbilisi')).toEqual({
      local: '2024-02-29T23:59:58',
      timeZone: 'Asia/Tbilisi',
    });
    expect(() => encodeTime('2023-02-29T00:00:00')).toThrow();
    expect(() => decodeTime(0, 'invalid/timezone')).toThrow();
  });
  it.each([28, 72] as const)(
    'parses and writes %i-byte users, preserving opaque access/password bytes',
    (size) => {
      const raw = Buffer.alloc(size);
      raw.writeUInt16LE(42);
      raw[2] = 14;
      raw.write('secret', 3, size === 28 ? 5 : 8);
      raw.write('Alice', size === 28 ? 8 : 11);
      raw.writeUInt32LE(123456, size === 28 ? 16 : 35);
      if (size === 28) raw.writeUInt32LE(99, 24);
      else raw.write('99', 48);
      const users = parseUsers(envelope(raw), 1);
      expect(users[0]).toEqual({
        uid: 42,
        privilege: 14,
        name: 'Alice',
        card: 123456,
        userId: '99',
        recordSize: size,
        enabled: null,
      });
      const updated = encodeUser({ uid: 42, userId: '99', name: 'Bob' }, size, raw);
      expect(updated.subarray(3, size === 28 ? 8 : 11)).toEqual(
        raw.subarray(3, size === 28 ? 8 : 11),
      );
      expect(parseUsers(envelope(updated), 1)[0]).toMatchObject({
        name: 'Bob',
        card: 123456,
        privilege: 14,
      });
    },
  );
  it('does not guess unknown or ambiguous layouts or truncate names', () => {
    expect(() => parseUsers(envelope(Buffer.alloc(120)), 1)).toThrow();
    expect(() => parseUsers(envelope(Buffer.alloc(504)), -1)).toThrow();
    expect(() => encodeUser({ uid: 1, userId: '1', name: 'long name' }, 28)).toThrow();
    expect(() => encodeUser({ uid: 1, userId: '1', name: 'A', enabled: false }, 72)).toThrow();
  });
  it.each([8, 16, 40])('parses %i-byte attendance fixtures', (size) => {
    const b = Buffer.alloc(size);
    if (size === 8) {
      b.writeUInt16LE(42);
      b[2] = 1;
      b.writeUInt32LE(2678400, 3);
      b[7] = 2;
    }
    if (size === 16) {
      b.writeUInt32LE(99);
      b.writeUInt32LE(2678400, 4);
      b[8] = 1;
      b[9] = 2;
    }
    if (size === 40) {
      b.writeUInt16LE(42);
      b.write('99', 2);
      b[26] = 1;
      b.writeUInt32LE(2678400, 27);
      b[31] = 2;
    }
    const users = [
      {
        uid: 42,
        userId: '99',
        name: 'A',
        card: 0,
        privilege: 0,
        enabled: null,
        recordSize: 72 as const,
      },
    ];
    expect(parseAttendance(envelope(b), 1, 'Asia/Tbilisi', users)).toEqual([
      {
        userId: '99',
        timestamp: { local: '2000-02-01T00:00:00', timeZone: 'Asia/Tbilisi' },
        verifyType: 1,
        punchState: 2,
      },
    ]);
  });
  it.each([10, 12, 14, 32, 36, 37, 52])('parses %i-byte live event calendars', (size) => {
    const b = Buffer.alloc(size);
    const width = size >= 32 ? 24 : size === 12 ? 4 : 2;
    if (width === 24) b.write('99');
    else if (width === 4) b.writeUInt32LE(99);
    else b.writeUInt16LE(99);
    b[width] = 1;
    b[width + 1] = 2;
    Buffer.from([24, 2, 29, 12, 30, 45]).copy(b, width + 2);
    expect(parseEvent(b, 'Asia/Tbilisi')).toMatchObject({
      userId: '99',
      timestamp: { local: '2024-02-29T12:30:45', timeZone: 'Asia/Tbilisi' },
    });
  });
});
