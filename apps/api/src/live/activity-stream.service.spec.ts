import { describe, expect, it, vi } from 'vitest';
import type { ActivityEvent } from '@fit/types';
import { ActivityStreamService } from './activity-stream.service';
import type { RedisService } from '../redis/redis.service';

/** The Redis channel the service multiplexes every gym's events over. */
const ACTIVITY_CHANNEL = 'activity:events';

/** A `checkin` activity event, the shape the reception flow publishes. */
function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'checkin:c1',
    type: 'checkin',
    title: 'Checked in',
    detail: 'Front desk',
    memberId: 'm1',
    memberName: 'Ada Lovelace',
    amount: null,
    currency: null,
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
  const service = new ActivityStreamService(redis);
  return {
    service,
    client,
    subscriber,
    emit: (payload: string) => messageHandler?.(ACTIVITY_CHANNEL, payload),
  };
}

describe('ActivityStreamService', () => {
  it('publishes the gym-tagged envelope to the shared channel', async () => {
    const { service, client } = setup();
    const ev = event();

    await service.publish('gym-1', ev);

    expect(client.publish).toHaveBeenCalledWith(
      ACTIVITY_CHANNEL,
      JSON.stringify({ gymId: 'gym-1', event: ev }),
    );
  });

  it('swallows a Redis publish failure so it never fails the originating write', async () => {
    const { service, client } = setup();
    client.publish.mockRejectedValueOnce(new Error('redis down'));

    await expect(service.publish('gym-1', event())).resolves.toBeUndefined();
  });

  it('subscribes to the shared channel on init', async () => {
    const { service, subscriber } = setup();

    await service.onModuleInit();

    expect(subscriber.subscribe).toHaveBeenCalledWith(ACTIVITY_CHANNEL);
  });

  it('routes an inbound message only to the stream of its own gym', async () => {
    const { service, emit } = setup();
    await service.onModuleInit();

    const forGym1: ActivityEvent[] = [];
    const subscription = service.stream('gym-1').subscribe((e) => forGym1.push(e));

    const mine = event({ id: 'checkin:mine' });
    const theirs = event({ id: 'checkin:theirs' });
    emit(JSON.stringify({ gymId: 'gym-1', event: mine }));
    emit(JSON.stringify({ gymId: 'gym-2', event: theirs }));

    expect(forGym1).toEqual([mine]);
    subscription.unsubscribe();
  });

  it('drops a malformed message without throwing or emitting', async () => {
    const { service, emit } = setup();
    await service.onModuleInit();

    const received: ActivityEvent[] = [];
    const subscription = service.stream('gym-1').subscribe((e) => received.push(e));

    expect(() => emit('this is not json')).not.toThrow();
    expect(received).toEqual([]);
    subscription.unsubscribe();
  });

  it('tears the subscriber connection down on destroy', async () => {
    const { service, subscriber } = setup();
    await service.onModuleInit();

    await service.onModuleDestroy();

    expect(subscriber.quit).toHaveBeenCalledTimes(1);
  });
});
