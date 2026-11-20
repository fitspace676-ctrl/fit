import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertPublicHost } from '../zkbio/zkbio-url';
import { ZkDeviceClient } from './zkdevice-client';
import { ZkDeviceError } from './zkdevice-errors';
import { CMD, PacketDecoder, encodePacket, makeCommKey, type Packet } from './zkdevice-protocol';

// The production helper is tested independently by zkbio-url.spec.ts. Only this
// test module bypasses it, and every fake socket listens exclusively on loopback.
vi.mock('../zkbio/zkbio-url', () => ({ assertPublicHost: vi.fn() }));
const vet = vi.mocked(assertPublicHost);
let server: Server;
const sockets = new Set<Socket>();
let seen: Packet[];
let handler: (p: Packet, socket: Socket) => void;
let port: number;
function answer(
  socket: Socket,
  p: Packet,
  command: number = CMD.OK,
  payload: Buffer = Buffer.alloc(0),
) {
  socket.write(encodePacket(command, 42, p.reply, payload));
}
function countData(users: number, logs = 0): Buffer {
  const b = Buffer.alloc(80);
  b.writeUInt32LE(users, 16);
  b.writeUInt32LE(logs, 32);
  b.writeUInt32LE(1000, 60);
  b.writeUInt32LE(10000, 64);
  return b;
}
function userData(): Buffer {
  const b = Buffer.alloc(76);
  b.writeUInt32LE(72);
  b.writeUInt16LE(7, 4);
  b.write('Alice', 15);
  b.write('99', 52);
  return b;
}
const client = () => new ZkDeviceClient({ timeoutMs: 100, sessionTimeoutMs: 2000 });
const connection = () => ({ host: 'device.example', port, commKey: 12345, deviceNumber: 2 });
beforeEach(async () => {
  seen = [];
  vet.mockReset();
  vet.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
  handler = (p, socket) => answer(socket, p);
  server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => sockets.delete(socket));
    const decoder = new PacketDecoder();
    socket.on('data', (b) => {
      for (const p of decoder.push(b)) {
        seen.push(p);
        handler(p, socket);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fake address missing');
  port = address.port;
});
afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('standalone fake TCP device', () => {
  it('opens, authenticates, batches, and exits exactly once', async () => {
    handler = (p, socket) => {
      if (p.command === CMD.CONNECT) answer(socket, p, CMD.UNAUTH);
      else if (p.command === CMD.AUTH) {
        expect(p.payload).toEqual(makeCommKey(12345, 42));
        answer(socket, p);
      } else if (p.command === CMD.TIME) answer(socket, p, CMD.OK, Buffer.alloc(4));
      else if (p.command === CMD.DOOR_STATE) answer(socket, p, CMD.OK, Buffer.from([1]));
      else answer(socket, p);
    };
    await client().withSession(connection(), async (s) => {
      expect(await s.getTime('Asia/Tbilisi')).toEqual({
        local: '2000-01-01T00:00:00',
        timeZone: 'Asia/Tbilisi',
      });
      expect(await s.getDoorState()).toEqual({ raw: 1 });
      await s.unlockDoor(3);
    });
    expect(seen.map((p) => p.command)).toEqual([1000, 1102, 201, 75, 31, 1001]);
    expect(seen.find((p) => p.command === CMD.UNLOCK)?.payload.readUInt32LE(0)).toBe(30);
  });
  it('rejects unauthorized replies without exposing host or communication key', async () => {
    handler = (p, socket) => answer(socket, p, CMD.UNAUTH, Buffer.from('12345 device.example'));
    const e = await client()
      .checkConnection(connection())
      .catch((e: unknown) => e);
    expect(e).toBeInstanceOf(ZkDeviceError);
    if (!(e instanceof ZkDeviceError)) throw new Error('Expected a typed device error');
    expect(e.reason).toBe('unauthorized');
    expect(JSON.stringify(e)).not.toContain('12345');
    expect(e.message).not.toContain('device.example');
  });
  it('times out without repeating a door command', async () => {
    handler = (p, socket) => {
      if (p.command !== CMD.UNLOCK) answer(socket, p);
    };
    await expect(client().unlockDoor(connection(), 3)).rejects.toMatchObject({ reason: 'timeout' });
    expect(seen.filter((p) => p.command === CMD.UNLOCK)).toHaveLength(1);
  });
  it('rejects private addresses before opening a socket', async () => {
    vet.mockRejectedValue(new Error('private host secret'));
    await expect(client().checkConnection({ host: '10.0.0.1' })).rejects.toMatchObject({
      reason: 'blocked_host',
    });
    expect(seen).toHaveLength(0);
  });
  it('bounds DNS lookup time and never connects after the deadline', async () => {
    let resolve!: (v: { address: string; family: number }[]) => void;
    vet.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    await expect(
      new ZkDeviceClient({ sessionTimeoutMs: 30 }).checkConnection(connection()),
    ).rejects.toMatchObject({ reason: 'timeout' });
    resolve([{ address: '127.0.0.1', family: 4 }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toHaveLength(0);
  });
  it('reads fragmented and coalesced buffered user chunks, frees and re-enables', async () => {
    const data = userData();
    handler = (p, socket) => {
      if (p.command === CMD.SIZES) answer(socket, p, CMD.OK, countData(1));
      else if (p.command === CMD.PREPARE_BUFFER) {
        expect(p.payload.readUInt16LE(1)).toBe(9);
        expect(p.payload.readUInt32LE(3)).toBe(5);
        const size = Buffer.alloc(5);
        size.writeUInt32LE(data.length, 1);
        answer(socket, p, CMD.OK, size);
      } else if (p.command === CMD.READ_BUFFER) {
        const size = Buffer.alloc(4);
        size.writeUInt32LE(data.length);
        const packets = Buffer.concat([
          encodePacket(CMD.PREPARE_DATA, 42, p.reply, size),
          encodePacket(CMD.DATA, 42, p.reply, data.subarray(0, 30)),
          encodePacket(CMD.DATA, 42, p.reply, data.subarray(30)),
          encodePacket(CMD.OK, 42, p.reply),
        ]);
        socket.write(packets.subarray(0, 5));
        socket.write(packets.subarray(5));
      } else answer(socket, p);
    };
    expect(await client().listUsers(connection())).toMatchObject([
      { uid: 7, userId: '99', name: 'Alice', recordSize: 72 },
    ]);
    expect(seen.map((p) => p.command)).toEqual([1000, 1003, 50, 1503, 1504, 1502, 1002, 1001]);
  });
  it('re-enables in finally on a device rejection during read', async () => {
    handler = (p, socket) => {
      if (p.command === CMD.SIZES) answer(socket, p, CMD.ERROR);
      else answer(socket, p);
    };
    await expect(client().listUsers(connection())).rejects.toMatchObject({ reason: 'rejected' });
    expect(seen.map((p) => p.command)).toContain(CMD.ENABLE);
  });
  it('gets metadata while tolerating unsupported optional options', async () => {
    handler = (p, socket) => {
      if (p.command === CMD.SIZES) answer(socket, p, CMD.OK, countData(1, 2));
      else if (p.command === CMD.OPTIONS)
        answer(
          socket,
          p,
          p.payload.toString().startsWith('~SerialNumber') ? CMD.OK : CMD.ERROR,
          Buffer.from('~SerialNumber=SN123\0'),
        );
      else if (p.command === CMD.VERSION) answer(socket, p, CMD.OK, Buffer.from('ZK6\0'));
      else answer(socket, p);
    };
    expect(await client().checkConnection(connection())).toEqual({
      serialNumber: 'SN123',
      firmwareVersion: 'ZK6',
      userCount: 1,
      logCount: 2,
      userCapacity: 1000,
      logCapacity: 10000,
    });
  });
  it('creates and deletes a user without guessing the layout on an empty device', async () => {
    handler = (p, socket) =>
      answer(socket, p, CMD.OK, p.command === CMD.SIZES ? countData(0) : Buffer.alloc(0));
    await client().upsertUser(connection(), {
      uid: 7,
      userId: '99',
      name: 'Alice',
      recordSize: 72,
    });
    const write = seen.find((p) => p.command === CMD.USER_WRITE)!;
    expect(write.payload.length).toBe(72);
    expect(write.payload.toString('utf8', 48, 50)).toBe('99');
    await client().deleteUser(connection(), 7);
    expect(seen.find((p) => p.command === CMD.DELETE_USER)?.payload.readUInt16LE(0)).toBe(7);
  });
  it('refuses unsupported user enable flags without any connection', async () => {
    await expect(client().setUserEnabled(connection(), 7, false)).rejects.toMatchObject({
      reason: 'unsupported_operation',
    });
    expect(seen).toHaveLength(0);
  });
  it('reads live attendance and stops on abort', async () => {
    const signal = new AbortController();
    const events: unknown[] = [];
    handler = (p, socket) => {
      if (p.command === CMD.OK) return;
      answer(socket, p);
      if (p.command === CMD.EVENT) {
        const event = Buffer.alloc(32);
        event.write('99');
        event[24] = 1;
        event[25] = 2;
        Buffer.from([24, 2, 29, 12, 30, 45]).copy(event, 26);
        socket.write(encodePacket(CMD.EVENT, 42, 0, event));
      }
    };
    await expect(
      client().readLiveEvents(connection(), 'Asia/Tbilisi', signal.signal, (event) => {
        events.push(event);
        signal.abort();
      }),
    ).rejects.toMatchObject({ reason: 'aborted' });
    expect(events).toMatchObject([{ userId: '99', timestamp: { local: '2024-02-29T12:30:45' } }]);
  });
  it('reads multiple buffer ranges and filters attendance in device-local time', async () => {
    const data = Buffer.alloc(4 + 16 * 4200);
    data.writeUInt32LE(data.length - 4);
    for (let i = 0; i < 4200; i++) {
      const offset = 4 + i * 16;
      data.writeUInt32LE(99, offset);
      data.writeUInt32LE(i < 4199 ? 0 : 2678400, offset + 4);
      data[offset + 8] = 1;
    }
    const offsets: number[] = [];
    handler = (p, socket) => {
      if (p.command === CMD.SIZES) answer(socket, p, CMD.OK, countData(0, 4200));
      else if (p.command === CMD.PREPARE_BUFFER) {
        expect(p.payload.readUInt16LE(1)).toBe(CMD.ATTENDANCE);
        const size = Buffer.alloc(5);
        size.writeUInt32LE(data.length, 1);
        answer(socket, p, CMD.OK, size);
      } else if (p.command === CMD.READ_BUFFER) {
        const offset = p.payload.readUInt32LE(0);
        const length = p.payload.readUInt32LE(4);
        offsets.push(offset);
        answer(socket, p, CMD.DATA, data.subarray(offset, offset + length));
      } else answer(socket, p);
    };
    const result = await client().listAttendance(connection(), {
      timeZone: 'Asia/Tbilisi',
      since: '2000-02-01T00:00:00',
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe('99');
    expect(offsets).toEqual([0, 0xffc0]);
  });
  it('rejects a mismatched session and never retries', async () => {
    handler = (p, socket) => {
      if (p.command === CMD.UNLOCK) socket.write(encodePacket(CMD.OK, 99, p.reply));
      else answer(socket, p);
    };
    await expect(client().unlockDoor(connection(), 1)).rejects.toMatchObject({
      reason: 'protocol',
    });
    expect(seen.filter((p) => p.command === CMD.UNLOCK)).toHaveLength(1);
  });
});
