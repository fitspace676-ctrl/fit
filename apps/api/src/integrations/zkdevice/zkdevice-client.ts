import { createConnection, isIP, type Socket } from 'node:net';
import { assertPublicHost } from '../zkbio/zkbio-url';
import { ZkDeviceError } from './zkdevice-errors';
import {
  CMD,
  MAX_DATA,
  PacketDecoder,
  decodeTime,
  encodePacket,
  encodeUser,
  makeCommKey,
  parseAttendance,
  parseEvent,
  parseUsers,
  records,
  textField,
  uint,
  wallTime,
  type Packet,
} from './zkdevice-protocol';
import type {
  ZkAttendance,
  ZkAttendanceOptions,
  ZkDeviceConnection,
  ZkDeviceInfo,
  ZkUserInput,
} from './zkdevice-types';

interface ClientOptions {
  timeoutMs?: number;
  sessionTimeoutMs?: number;
}
function safeError(error: unknown): ZkDeviceError {
  return error instanceof ZkDeviceError ? error : new ZkDeviceError('unreachable');
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

/** One consumer and one command at a time, bounded queue, fatal errors close the socket. */
class Wire {
  private queue: Packet[] = [];
  private queuedBytes = 0;
  private failure?: ZkDeviceError;
  private waiter?: { resolve: (packet: Packet) => void; reject: (e: ZkDeviceError) => void };
  private readonly decoder = new PacketDecoder();
  constructor(
    readonly socket: Socket,
    private readonly timeoutMs: number,
  ) {
    socket.on('error', () => this.fail(new ZkDeviceError('unreachable')));
    socket.on('close', () => this.fail(new ZkDeviceError('unreachable')));
    socket.on('data', (data: Buffer) => {
      try {
        for (const packet of this.decoder.push(data)) {
          if (this.waiter) {
            const w = this.waiter;
            this.waiter = undefined;
            w.resolve(packet);
          } else {
            this.queuedBytes += packet.payload.length + 8;
            if (this.queue.length >= 1024 || this.queuedBytes > MAX_DATA)
              throw new ZkDeviceError('protocol');
            this.queue.push(packet);
          }
        }
      } catch (e) {
        this.fail(safeError(e));
      }
    });
  }
  fail(error: ZkDeviceError): void {
    this.failure ??= error;
    this.waiter?.reject(this.failure);
    this.waiter = undefined;
    this.queue = [];
    this.queuedBytes = 0;
    this.socket.destroy();
  }
  send(command: number, session: number, reply: number, payload?: Buffer): void {
    if (this.failure) throw this.failure;
    this.socket.write(encodePacket(command, session, reply, payload));
  }
  async next(): Promise<Packet> {
    if (this.failure) throw this.failure;
    const packet = this.queue.shift();
    if (packet) {
      this.queuedBytes -= packet.payload.length + 8;
      return packet;
    }
    if (this.waiter) throw new ZkDeviceError('busy');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<Packet>((resolve, reject) => {
        this.waiter = { resolve, reject };
        timer = setTimeout(() => this.fail(new ZkDeviceError('timeout')), this.timeoutMs);
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Methods in withSession must be awaited sequentially. Concurrent operations fail busy. */
export class ZkDeviceSession {
  private session = 0;
  private reply = 65534;
  private busy = false;
  constructor(private readonly wire: Wire) {}
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new ZkDeviceError('busy');
    this.busy = true;
    try {
      return await fn();
    } catch (e) {
      throw safeError(e);
    } finally {
      this.busy = false;
    }
  }
  private async command(command: number, payload?: Buffer): Promise<Packet> {
    this.reply = (this.reply + 1) % 65535;
    this.wire.send(command, this.session, this.reply, payload);
    const packet = await this.wire.next();
    if (command === CMD.CONNECT) this.session = packet.session;
    if (packet.session !== this.session || packet.reply !== this.reply)
      throw new ZkDeviceError('protocol');
    if (packet.command === CMD.UNAUTH && command !== CMD.CONNECT)
      throw new ZkDeviceError('unauthorized');
    if (packet.command === CMD.ERROR) throw new ZkDeviceError('rejected');
    const acceptedCommands: readonly number[] = [
      CMD.OK,
      CMD.DATA,
      CMD.PREPARE_DATA,
      ...(command === CMD.CONNECT ? [CMD.UNAUTH] : []),
    ];
    if (!acceptedCommands.includes(packet.command)) throw new ZkDeviceError('protocol');
    return packet;
  }
  private async ok(command: number, payload?: Buffer): Promise<Buffer> {
    const packet = await this.command(command, payload);
    if (packet.command !== CMD.OK) throw new ZkDeviceError('protocol');
    return packet.payload;
  }
  /** @internal Session lifecycle, not a raw command interface. */
  async connect(commKey: number): Promise<void> {
    const packet = await this.command(CMD.CONNECT);
    if (packet.command === CMD.UNAUTH) await this.ok(CMD.AUTH, makeCommKey(commKey, this.session));
    else if (packet.command !== CMD.OK) throw new ZkDeviceError('protocol');
  }
  /** @internal */
  async close(): Promise<void> {
    try {
      await this.ok(CMD.EXIT);
    } finally {
      this.wire.socket.destroy();
    }
  }
  private async sizes(): Promise<
    Pick<ZkDeviceInfo, 'userCount' | 'logCount' | 'userCapacity' | 'logCapacity'>
  > {
    const b = await this.ok(CMD.SIZES);
    if (b.length < 80) return {};
    return {
      userCount: b.readUInt32LE(16),
      logCount: b.readUInt32LE(32),
      userCapacity: b.readUInt32LE(60),
      logCapacity: b.readUInt32LE(64),
    };
  }
  private async optional<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ZkDeviceError && e.reason === 'rejected') return undefined;
      throw e;
    }
  }
  checkConnection(): Promise<ZkDeviceInfo> {
    return this.exclusive(async () => {
      const info: ZkDeviceInfo = (await this.optional(() => this.sizes())) ?? {};
      const options = {
        serialNumber: '~SerialNumber',
        deviceName: '~DeviceName',
        platform: '~Platform',
        mac: 'MAC',
        faceFunction: 'FaceFunOn',
        fingerprintVersion: '~ZKFPVersion',
      } as const;
      for (const [field, key] of Object.entries(options)) {
        const value = await this.optional(async () => {
          const text = textField(await this.ok(CMD.OPTIONS, Buffer.from(`${key}\0`)));
          return text.startsWith(`${key}=`) ? text.slice(key.length + 1) : text;
        });
        if (value !== undefined) info[field as keyof typeof options] = value;
      }
      info.firmwareVersion = await this.optional(async () => textField(await this.ok(CMD.VERSION)));
      return info;
    });
  }
  getTime(timeZone: string) {
    return this.exclusive(async () => {
      wallTime('2000-01-01T00:00:00', timeZone);
      const b = await this.ok(CMD.TIME);
      if (b.length < 4) throw new ZkDeviceError('protocol');
      return decodeTime(b.readUInt32LE(0), timeZone);
    });
  }
  private async buffered(command: number, fct = 0): Promise<Buffer> {
    const request = Buffer.alloc(11);
    request[0] = 1;
    request.writeUInt16LE(command, 1);
    request.writeUInt32LE(fct, 3);
    try {
      const prepared = await this.command(CMD.PREPARE_BUFFER, request);
      if (prepared.command === CMD.DATA) return prepared.payload;
      if (prepared.command !== CMD.OK || prepared.payload.length < 5)
        throw new ZkDeviceError('protocol');
      const size = prepared.payload.readUInt32LE(1);
      if (size > MAX_DATA) throw new ZkDeviceError('protocol');
      const chunks: Buffer[] = [];
      for (let offset = 0; offset < size; offset += 0xffc0) {
        const length = Math.min(0xffc0, size - offset);
        const request = Buffer.concat([u32(offset), u32(length)]);
        const first = await this.command(CMD.READ_BUFFER, request);
        let data: Buffer;
        if (first.command === CMD.DATA) data = first.payload;
        else {
          if (
            first.command !== CMD.PREPARE_DATA ||
            first.payload.length < 4 ||
            first.payload.readUInt32LE(0) !== length
          )
            throw new ZkDeviceError('protocol');
          const parts: Buffer[] = [];
          let received = 0;
          while (received < length) {
            const next = await this.wire.next();
            if (next.command !== CMD.DATA || next.session !== this.session || !next.payload.length)
              throw new ZkDeviceError('protocol');
            received += next.payload.length;
            if (received > length) throw new ZkDeviceError('protocol');
            parts.push(next.payload);
          }
          const ack = await this.wire.next();
          if (ack.command !== CMD.OK || ack.session !== this.session)
            throw new ZkDeviceError('protocol');
          data = Buffer.concat(parts);
        }
        if (data.length !== length) throw new ZkDeviceError('protocol');
        chunks.push(data);
      }
      return Buffer.concat(chunks);
    } finally {
      await this.ok(CMD.FREE_DATA);
    }
  }
  /** Always attempt re-enable even when disable or the bulk operation fails. */
  private async bulk<T>(fn: () => Promise<T>): Promise<T> {
    try {
      await this.ok(CMD.DISABLE);
      return await fn();
    } finally {
      await this.ok(CMD.ENABLE);
    }
  }
  private async userData(): Promise<{ data: Buffer; count: number }> {
    const { userCount } = await this.sizes();
    if (userCount === 0) return { data: Buffer.alloc(4), count: 0 };
    return { data: await this.buffered(CMD.USERS, 5), count: userCount ?? -1 };
  }
  listUsers() {
    return this.exclusive(() =>
      this.bulk(async () => {
        const { data, count } = await this.userData();
        return parseUsers(data, count);
      }),
    );
  }
  upsertUser(user: ZkUserInput): Promise<void> {
    return this.exclusive(async () => {
      if (user.enabled !== undefined) throw new ZkDeviceError('unsupported_operation');
      await this.bulk(async () => {
        const { data, count } = await this.userData();
        const users = parseUsers(data, count);
        const layout = users[0]?.recordSize ?? user.recordSize;
        if (!layout || (user.recordSize && user.recordSize !== layout))
          throw new ZkDeviceError('unsupported_layout');
        const { body } = records(data, count, [28, 72]);
        const index = users.findIndex((u) => u.uid === user.uid);
        const existing =
          index < 0 ? undefined : body.subarray(index * layout, (index + 1) * layout);
        await this.ok(CMD.USER_WRITE, encodeUser(user, layout, existing));
        await this.ok(CMD.REFRESH);
      });
    });
  }
  deleteUser(uid: number): Promise<void> {
    return this.exclusive(async () => {
      uint(uid, 65535);
      if (!uid) throw new ZkDeviceError('invalid_argument');
      const b = Buffer.alloc(2);
      b.writeUInt16LE(uid);
      await this.ok(CMD.DELETE_USER, b);
      await this.ok(CMD.REFRESH);
    });
  }
  /** Privilege controls administrator roles, not a portable membership enabled flag. */
  setUserEnabled(_uid: number, _enabled: boolean): Promise<never> {
    return Promise.reject(new ZkDeviceError('unsupported_operation'));
  }
  listAttendance(options: ZkAttendanceOptions): Promise<ZkAttendance[]> {
    return this.exclusive(async () => {
      wallTime(options.since ?? '2000-01-01T00:00:00', options.timeZone);
      return this.bulk(async () => {
        const { logCount } = await this.sizes();
        if (logCount === 0) return [];
        const { data, count } = await this.userData();
        return parseAttendance(
          await this.buffered(CMD.ATTENDANCE),
          logCount ?? -1,
          options.timeZone,
          parseUsers(data, count),
        ).filter((r) => !options.since || r.timestamp.local >= options.since);
      });
    });
  }
  unlockDoor(seconds: number): Promise<void> {
    return this.exclusive(async () => {
      uint(seconds, 60);
      if (!seconds) throw new ZkDeviceError('invalid_argument');
      await this.ok(CMD.UNLOCK, u32(seconds * 10));
    });
  }
  /** Firmware-specific sensor bits: expose raw value, never infer open/closed from ACK. */
  getDoorState(): Promise<{ raw: number | null }> {
    return this.exclusive(async () => {
      const b = await this.ok(CMD.DOOR_STATE);
      return { raw: b.length >= 4 ? b.readUInt32LE(0) : b.length === 1 ? b[0]! : null };
    });
  }
  async readLiveEvents(
    timeZone: string,
    signal: AbortSignal,
    onEvent: (event: ZkAttendance) => void | Promise<void>,
  ): Promise<void> {
    return this.exclusive(async () => {
      wallTime('2000-01-01T00:00:00', timeZone);
      const abort = () => this.wire.fail(new ZkDeviceError('aborted'));
      signal.addEventListener('abort', abort, { once: true });
      try {
        if (signal.aborted) throw new ZkDeviceError('aborted');
        await this.ok(CMD.EVENT, u32(1));
        while (!signal.aborted) {
          const packet = await this.wire.next();
          if (packet.command !== CMD.EVENT || packet.session !== this.session)
            throw new ZkDeviceError('protocol');
          this.wire.send(CMD.OK, this.session, 0);
          if (packet.payload.length) await onEvent(parseEvent(packet.payload, timeZone));
        }
      } finally {
        signal.removeEventListener('abort', abort);
      }
    });
  }
}

export class ZkDeviceClient {
  private readonly timeoutMs: number;
  private readonly sessionTimeoutMs: number;
  constructor(options: ClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.sessionTimeoutMs = options.sessionTimeoutMs ?? 60000;
    for (const value of [this.timeoutMs, this.sessionTimeoutMs]) {
      uint(value, 3600000);
      if (!value) throw new ZkDeviceError('invalid_argument');
    }
  }
  async withSession<T>(
    connection: ZkDeviceConnection,
    fn: (session: ZkDeviceSession) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    let wire: Wire | undefined;
    let session: ZkDeviceSession | undefined;
    let expired = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let rejectDeadline: ((e: ZkDeviceError) => void) | undefined;
    const stop = (reason: 'timeout' | 'aborted') => {
      expired = true;
      const error = new ZkDeviceError(reason);
      wire?.fail(error);
      rejectDeadline?.(error);
    };
    const abort = () => stop('aborted');
    const limit = new Promise<never>((_resolve, reject) => {
      rejectDeadline = reject;
      deadline = setTimeout(() => stop('timeout'), this.sessionTimeoutMs);
    });
    signal?.addEventListener('abort', abort, { once: true });
    const work = async (): Promise<T> => {
      const port = connection.port ?? 4370;
      try {
        uint(port, 65535);
        uint(connection.commKey ?? 0, 0xffffffff);
        if (connection.deviceNumber !== undefined) uint(connection.deviceNumber, 65535);
      } catch {
        throw new ZkDeviceError('invalid_connection');
      }
      if (
        !port ||
        !connection.host ||
        /[\s/@?#]/.test(connection.host) ||
        (!isIP(connection.host) && connection.host.includes(':'))
      )
        throw new ZkDeviceError('invalid_connection');
      let addresses;
      try {
        addresses = await assertPublicHost(
          `http://${isIP(connection.host) === 6 ? `[${connection.host}]` : connection.host}:${port}`,
        );
      } catch {
        throw new ZkDeviceError('blocked_host');
      }
      if (expired || signal?.aborted)
        throw new ZkDeviceError(signal?.aborted ? 'aborted' : 'timeout');
      // Pin the vetted IP; never resolve the hostname again or try another address.
      const socket = createConnection({
        host: addresses[0]!.address,
        family: addresses[0]!.family,
        port,
      });
      wire = new Wire(socket, this.timeoutMs);
      session = new ZkDeviceSession(wire);
      await session.connect(connection.commKey ?? 0);
      return fn(session);
    };
    try {
      if (signal?.aborted) throw new ZkDeviceError('aborted');
      return await Promise.race([work(), limit]);
    } catch (e) {
      throw safeError(e);
    } finally {
      // Exit is best effort; preserve the operation's error. A timeout/abort already destroyed transport.
      if (session && !expired) {
        try {
          await session.close();
        } catch {
          /* sanitized operation result wins */
        }
      }
      wire?.socket.destroy();
      clearTimeout(deadline);
      signal?.removeEventListener('abort', abort);
    }
  }
  checkConnection(c: ZkDeviceConnection) {
    return this.withSession(c, (s) => s.checkConnection());
  }
  getTime(c: ZkDeviceConnection, timeZone: string) {
    return this.withSession(c, (s) => s.getTime(timeZone));
  }
  listUsers(c: ZkDeviceConnection) {
    return this.withSession(c, (s) => s.listUsers());
  }
  upsertUser(c: ZkDeviceConnection, user: ZkUserInput) {
    return this.withSession(c, (s) => s.upsertUser(user));
  }
  deleteUser(c: ZkDeviceConnection, uid: number) {
    return this.withSession(c, (s) => s.deleteUser(uid));
  }
  setUserEnabled(_c: ZkDeviceConnection, _uid: number, _enabled: boolean): Promise<never> {
    return Promise.reject(new ZkDeviceError('unsupported_operation'));
  }
  listAttendance(c: ZkDeviceConnection, options: ZkAttendanceOptions) {
    return this.withSession(c, (s) => s.listAttendance(options));
  }
  unlockDoor(c: ZkDeviceConnection, seconds: number) {
    return this.withSession(c, (s) => s.unlockDoor(seconds));
  }
  getDoorState(c: ZkDeviceConnection) {
    return this.withSession(c, (s) => s.getDoorState());
  }
  readLiveEvents(
    c: ZkDeviceConnection,
    timeZone: string,
    signal: AbortSignal,
    onEvent: (event: ZkAttendance) => void | Promise<void>,
  ) {
    return this.withSession(c, (s) => s.readLiveEvents(timeZone, signal, onEvent), signal);
  }
}
