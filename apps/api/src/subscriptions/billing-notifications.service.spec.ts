import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationCategory, NotificationChannel, SubscriptionStatus } from '@fit/db';
import { BillingNotificationsService } from './billing-notifications.service';
import type {
  NotificationService,
  SendNotificationInput,
  SendNotificationResult,
} from '../notifications/notification.service';
import type { PrismaService } from '../prisma/prisma.service';

/** A TRIAL row as the trial-ending sweep's `select` projects it. */
interface TrialRow {
  id: string;
  gymId: string;
  priceAmount: number;
  currency: string;
  currentPeriodEnd: Date;
  member: { userId: string };
}

const sent = (over?: Partial<SendNotificationResult>): SendNotificationResult => ({
  deduped: false,
  delivered: [],
  suppressed: [],
  ...over,
});

function setup(
  options: {
    gymSettings?: unknown;
    trials?: TrialRow[];
    send?: () => SendNotificationResult | Promise<SendNotificationResult>;
  } = {},
) {
  const {
    gymSettings = { locale: { language: 'en', currency: 'USD' } },
    trials = [],
    send,
  } = options;

  const gymFindUnique = vi
    .fn<(args: unknown) => Promise<{ settings: unknown } | null>>()
    .mockResolvedValue({ settings: gymSettings });
  const subscriptionFindMany = vi
    .fn<(args: unknown) => Promise<TrialRow[]>>()
    .mockResolvedValue(trials);
  const prisma = {
    client: {
      gym: { findUnique: gymFindUnique },
      subscription: { findMany: subscriptionFindMany },
    },
  } as unknown as PrismaService;

  const sendFn = vi
    .fn<(input: SendNotificationInput) => Promise<SendNotificationResult>>()
    .mockImplementation(async () => (send ? send() : sent()));
  const notifications = { send: sendFn } as unknown as NotificationService;

  return {
    service: new BillingNotificationsService(prisma, notifications),
    gymFindUnique,
    subscriptionFindMany,
    send: sendFn,
  };
}

const ref = {
  id: 'sub-1',
  gymId: 'gym-1',
  userId: 'user-1',
  priceAmount: 5000,
  currency: 'USD',
};

afterEach(() => vi.restoreAllMocks());

describe('BillingNotificationsService.renewalSucceeded', () => {
  it('sends a BILLING notification over the preferred channels, keyed to the new period', async () => {
    const { service, send } = setup();

    await service.renewalSucceeded(ref, {
      nextPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      wasTrial: false,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const input = send.mock.calls[0]![0];
    expect(input).toMatchObject({
      gymId: 'gym-1',
      userId: 'user-1',
      category: NotificationCategory.BILLING,
      href: '/account/membership',
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH],
      dedupeKey: 'billing-renewal:sub-1:2026-07-01T00:00:00.000Z',
    });
    // Renewal copy names the settled amount and the next payment date.
    expect(input.title).toBe('Membership renewed');
    expect(input.body).toContain('$50.00');
    expect(input.body).toContain('Jul 1, 2026');
  });

  it('uses trial-conversion copy when the renewal converted a free trial', async () => {
    const { service, send } = setup();

    await service.renewalSucceeded(ref, {
      nextPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      wasTrial: true,
    });

    const input = send.mock.calls[0]![0];
    expect(input.title).toBe('Your membership is now active');
    expect(input.body).toContain('free trial has ended');
  });

  it('renders Georgian copy for a ka-locale gym', async () => {
    const { service, send } = setup({
      gymSettings: { locale: { language: 'ka', currency: 'GEL' } },
    });

    await service.renewalSucceeded(ref, {
      nextPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      wasTrial: false,
    });

    expect(send.mock.calls[0]![0].title).toBe('გაწევრიანება განახლდა');
  });

  it('swallows a send failure — the charge already settled, so it never rethrows', async () => {
    const { service } = setup({
      send: () => {
        throw new Error('smtp down');
      },
    });

    await expect(
      service.renewalSucceeded(ref, {
        nextPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
        wasTrial: false,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('BillingNotificationsService.chargeFailed', () => {
  it('sends a payment-failed notification keyed to the exact ladder rung', async () => {
    const { service, send } = setup();

    await service.chargeFailed(ref, { rung: 2, periodEnd: new Date('2026-06-01T00:00:00.000Z') });

    const input = send.mock.calls[0]![0];
    expect(input).toMatchObject({
      category: NotificationCategory.BILLING,
      dedupeKey: 'billing-failed:sub-1:2026-06-01T00:00:00.000Z:r2',
    });
    expect(input.title).toBe('Payment failed');
    expect(input.body).toContain('$50.00');
  });

  it('swallows a send failure', async () => {
    const { service } = setup({
      send: () => {
        throw new Error('push token invalid');
      },
    });

    await expect(
      service.chargeFailed(ref, { rung: 0, periodEnd: new Date('2026-06-01T00:00:00.000Z') }),
    ).resolves.toBeUndefined();
  });
});

describe('BillingNotificationsService.notifyTrialsEndingSoon', () => {
  const trialRow = (over?: Partial<TrialRow>): TrialRow => ({
    id: 'trial-1',
    gymId: 'gym-1',
    priceAmount: 5000,
    currency: 'USD',
    currentPeriodEnd: new Date('2026-06-13T00:00:00.000Z'),
    member: { userId: 'user-9' },
    ...over,
  });

  const NOW = new Date('2026-06-10T00:00:00.000Z');

  it('queries only live, non-cancelled trials converting inside the lead window', async () => {
    const { service, subscriptionFindMany } = setup({ trials: [] });

    await service.notifyTrialsEndingSoon(NOW, 3);

    const where = (subscriptionFindMany.mock.calls[0]![0] as { where: Record<string, unknown> })
      .where;
    expect(where).toMatchObject({
      status: SubscriptionStatus.TRIAL,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { gt: NOW, lte: new Date('2026-06-13T00:00:00.000Z') },
    });
  });

  it('warns each trial with a heads-up keyed to the trial end and tallies notified', async () => {
    const { service, send } = setup({ trials: [trialRow()] });

    const summary = await service.notifyTrialsEndingSoon(NOW, 3);

    expect(summary).toEqual({ matched: 1, notified: 1, deduped: 0, errors: 0 });
    const input = send.mock.calls[0]![0];
    expect(input).toMatchObject({
      gymId: 'gym-1',
      userId: 'user-9',
      category: NotificationCategory.BILLING,
      dedupeKey: 'trial-ending:trial-1:2026-06-13T00:00:00.000Z',
    });
    expect(input.title).toBe('Your trial is ending');
    expect(input.body).toContain('$50.00');
    expect(input.body).toContain('Jun 13, 2026');
  });

  it('counts an already-sent heads-up as deduped, not notified', async () => {
    const { service } = setup({ trials: [trialRow()], send: () => sent({ deduped: true }) });

    const summary = await service.notifyTrialsEndingSoon(NOW, 3);

    expect(summary).toMatchObject({ matched: 1, notified: 0, deduped: 1 });
  });

  it('processes each trial independently; one failure does not abort the rest', async () => {
    let call = 0;
    const { service } = setup({
      trials: [trialRow({ id: 'a' }), trialRow({ id: 'b' }), trialRow({ id: 'c' })],
      send: () => {
        call += 1;
        if (call === 2) throw new Error('boom');
        return sent();
      },
    });

    const summary = await service.notifyTrialsEndingSoon(NOW, 3);

    expect(summary).toMatchObject({ matched: 3, notified: 2, errors: 1 });
  });
});
