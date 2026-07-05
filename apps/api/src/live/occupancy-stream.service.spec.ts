import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassOccupancy } from '@fit/types';
import { OccupancyStreamService } from './occupancy-stream.service';
import type { RedisService } from '../redis/redis.service';

/** The Redis channel the service multiplexes every gym's occupancy over. */
const OCCUPANCY_CHANNEL = 'occupancy:events';

/** The trailing-debounce window the producer coalesces a burst over. */
const DEBOUNCE_MS = 200;

/** A class-occupancy snapshot, the shape the booking flow publishes. */
function snapshot(overrides: Partial<ClassOccupancy> = {}): ClassOccupancy {
  return {
    classInstanceId: 'ci-1',
    capacity: 20,
    bookedCount: 12,
    available: 8,
    waitlistCount: 0,
    status: 'SCHEDULED',
    at: '2026-07-04T10:00:00.000Z',
    ...overrides,
  };
}

type MessageHandler = (channel: string, payload: string) => void;

/**
 * A fake {@link RedisService} whose `duplicate()` returns a subscriber that
 * captures the `message` handler, so a test can drive an inbound Redis message
 * without a live broker.
 */
function setup() {
  let messageHandler: MessageHandler | undefined;
  const subscriber = {
    on: vi.fn((evt: string, cb: MessageHandler) => {
      if (evt === 'message') {
        messageHandler = cb;
      }
      return subscriber;
    }),
    subscribe: vi.fn<() => Promise<number>>().mockResolvedValue(1),
    quit: vi.fn<() => Promise<'OK'>>().mockResolvedValue('OK'),
  };
  const client = {
    publish: vi.fn<() => Promise<number>>().mockResolvedValue(1),
    duplicate: vi.fn(() => subscriber),
  };
  const redis = { client } as unknown as RedisService;
  const service = new OccupancyStreamService(redis);
  return {
    service,
    client,
    subscriber,
    emit: (payload: string) => messageHandler?.(OCCUPANCY_CHANNEL, payload),
  };
}

describe('OccupancyStreamService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces then publishes the gym-tagged envelope to the shared channel', async () => {
    const { service, client } = setup();
    const occ = snapshot();

    service.publish('gym-1', occ);
    // Nothing goes out until the debounce window elapses.
    expect(client.publish).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(client.publish).toHaveBeenCalledWith(
      OCCUPANCY_CHANNEL,
      JSON.stringify({ gymId: 'gym-1', occupancy: occ }),
    );
  });

  it('coalesces a burst on one occurrence into a single publish of the latest snapshot', async () => {
    const { service, client } = setup();

    // A cancel storm: three snapshots for the same occurrence inside one window.
    service.publish('gym-1', snapshot({ bookedCount: 12, available: 8 }));
    service.publish('gym-1', snapshot({ bookedCount: 11, available: 9 }));
    const latest = snapshot({ bookedCount: 10, available: 10 });
    service.publish('gym-1', latest);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(client.publish).toHaveBeenCalledTimes(1);
    expect(client.publish).toHaveBeenCalledWith(
      OCCUPANCY_CHANNEL,
      JSON.stringify({ gymId: 'gym-1', occupancy: latest }),
    );
  });

  it('debounces distinct occurrences independently — one publish each', async () => {
    const { service, client } = setup();

    service.publish('gym-1', snapshot({ classInstanceId: 'ci-1' }));
    service.publish('gym-1', snapshot({ classInstanceId: 'ci-2' }));

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(client.publish).toHaveBeenCalledTimes(2);
  });

  it('swallows a Redis publish failure so it never fails the originating write', async () => {
    const { service, client } = setup();
    client.publish.mockRejectedValueOnce(new Error('redis down'));

    service.publish('gym-1', snapshot());

    // Draining the debounce fires the flush; the rejected publish must be swallowed
    // (logged, never rethrown) rather than surface as a thrown / unhandled error.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(client.publish).toHaveBeenCalledTimes(1);
  });

  it('subscribes to the shared channel on init', async () => {
    const { service, subscriber } = setup();

    await service.onModuleInit();

    expect(subscriber.subscribe).toHaveBeenCalledWith(OCCUPANCY_CHANNEL);
  });

  it('routes an inbound snapshot only to the stream of its own gym', async () => {
    const { service, emit } = setup();
    await service.onModuleInit();

    const forGym1: ClassOccupancy[] = [];
    const subscription = service.stream('gym-1').subscribe((o) => forGym1.push(o));

    const mine = snapshot({ classInstanceId: 'ci-mine' });
    const theirs = snapshot({ classInstanceId: 'ci-theirs' });
    emit(JSON.stringify({ gymId: 'gym-1', occupancy: mine }));
    emit(JSON.stringify({ gymId: 'gym-2', occupancy: theirs }));

    expect(forGym1).toEqual([mine]);
    subscription.unsubscribe();
  });

  it('drops a malformed message without throwing or emitting', async () => {
    const { service, emit } = setup();
    await service.onModuleInit();

    const received: ClassOccupancy[] = [];
    const subscription = service.stream('gym-1').subscribe((o) => received.push(o));

    expect(() => emit('this is not json')).not.toThrow();
    expect(received).toEqual([]);
    subscription.unsubscribe();
  });

  it('cancels pending debounces and tears the subscriber down on destroy', async () => {
    const { service, subscriber, client } = setup();
    await service.onModuleInit();

    // A snapshot pending in the debounce window must not fire after shutdown.
    service.publish('gym-1', snapshot());
    await service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(client.publish).not.toHaveBeenCalled();
    expect(subscriber.quit).toHaveBeenCalledTimes(1);
  });
});
