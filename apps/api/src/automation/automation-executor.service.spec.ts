import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomationActionType, AutomationTriggerType } from '@fit/db';
import type { AutomationFactsService } from './automation-facts.service';
import type { AutomationCondition, AutomationConditionFacts } from '@fit/types';
import { env } from '../config/env';
import { AutomationExecutorService } from './automation-executor.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { MailerService } from '../mail/mailer.service';
import type { AutomationMergeService } from './automation-merge.service';
import type { LoyaltyPointsService } from '../loyalty/loyalty-points.service';
import type {
  NotificationService,
  SendNotificationInput,
  SendNotificationResult,
} from '../notifications/notification.service';

interface AnyArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A rule as the executor's `RULE_SELECT` projects it (plus optional triggerConfig). */
interface FireRule {
  id: string;
  triggerType: AutomationTriggerType;
  actionType: AutomationActionType;
  actionConfig: {
    body: string;
    subject?: string;
    offer?: { discountPercent?: number; bonusPoints?: number; offerCode?: string };
  };
  triggerConfig: { days?: number };
  name: string;
  conditions: AutomationCondition[];
  timingOffset: string;
  recipient: 'member' | 'trainer';
}

function activeRule(over: Partial<FireRule> = {}): FireRule {
  return {
    id: 'rule-1',
    name: 'Rule',
    conditions: [],
    timingOffset: '0d',
    triggerConfig: {},
    triggerType: AutomationTriggerType.member_joined,
    actionType: AutomationActionType.email,
    actionConfig: { body: 'Welcome' },
    recipient: 'member',
    ...over,
  };
}

function setup(overrides?: {
  ruleFindMany?: unknown[];
  ruleFindFirst?: unknown;
  runFindMany?: unknown[];
  memberFindMany?: unknown[];
  invoiceFindMany?: unknown[];
  facts?: AutomationConditionFacts | null;
  runFindFirst?: unknown;
  gymFindMany?: unknown[];
  subFindMany?: unknown[];
  runCreateThrows?: boolean;
  ruleFindManyThrows?: boolean;
  /** What the merge service resolves to; `null` means "nobody to send to". */
  mergeTarget?: {
    recipient: string | null;
    values: Record<string, string>;
    memberId?: string | null;
    userId?: string | null;
  } | null;
  /** The booking / class instance / PT session the anchor and cancel checks read. */
  booking?: unknown;
  classInstance?: unknown;
  serviceSession?: unknown;
  /** What `LoyaltyPointsService.awardAutomationBonus` resolves to (or throws). */
  bonusAwarded?: boolean | 'throws';
  /** `false` stands in for an unconfigured mail transport (Resend key unset). */
  mailSent?: boolean;
  mailThrows?: boolean;
  /** What `NotificationService.send` returns; defaults to one live push + in-app. */
  notifyResult?: SendNotificationResult;
  notifyThrows?: boolean;
  /** The member `resolveMemberId` finds; `null` means the trigger names nobody. */
  memberId?: string | null;
  memberUser?: { userId: string } | null;
}) {
  const ruleFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() => {
    if (overrides?.ruleFindManyThrows) return Promise.reject(new Error('db down'));
    return Promise.resolve(overrides?.ruleFindMany ?? []);
  });
  const runFindFirst = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.runFindFirst ?? null),
  );
  const runCreate = vi.fn<(args: AnyArgs) => Promise<unknown>>((args) => {
    if (overrides?.runCreateThrows && args.data?.status === 'SUCCESS') {
      return Promise.reject(new Error('write failed'));
    }
    return Promise.resolve({ id: 'run-x', ...args.data });
  });
  const gymFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.gymFindMany ?? []),
  );
  const subFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.subFindMany ?? []),
  );

  const ruleFindFirst = vi.fn().mockResolvedValue(overrides?.ruleFindFirst ?? null);
  const runFindMany = vi.fn().mockResolvedValue(overrides?.runFindMany ?? []);
  const runUpdate = vi.fn().mockResolvedValue({ count: 1 });
  const memberFindMany = vi
    .fn<(args: AnyArgs) => Promise<unknown[]>>()
    .mockResolvedValue(overrides?.memberFindMany ?? []);
  const invoiceFindMany = vi
    .fn<(args: AnyArgs) => Promise<unknown[]>>()
    .mockResolvedValue(overrides?.invoiceFindMany ?? []);
  const memberFindFirst = vi
    .fn<(args: AnyArgs) => Promise<unknown>>()
    .mockResolvedValue(
      overrides?.memberUser === undefined ? { userId: 'user-1' } : overrides.memberUser,
    );
  const pushTokenCount = vi.fn<(args: AnyArgs) => Promise<number>>().mockResolvedValue(2);
  const taskCreate = vi
    .fn<(args: AnyArgs) => Promise<unknown>>()
    .mockResolvedValue({ id: 'task-1' });
  // Entity reads are held to gym-1: another gym's id finds nothing.
  const inGym = (row: unknown) =>
    vi.fn((args: AnyArgs) => Promise.resolve(args.where?.gymId === 'gym-1' ? (row ?? null) : null));
  const bookingFindFirst = inGym(overrides?.booking);
  const classInstanceFindFirst = inGym(overrides?.classInstance);
  const sessionFindFirst = inGym(overrides?.serviceSession);
  const awardBonus = vi.fn(() =>
    overrides?.bonusAwarded === 'throws'
      ? Promise.reject(new Error('ledger down'))
      : Promise.resolve(overrides?.bonusAwarded ?? true),
  );
  const loyalty = { awardAutomationBonus: awardBonus } as unknown as LoyaltyPointsService;
  const loadFacts = vi.fn().mockResolvedValue(overrides?.facts ?? null);
  const factsService = { loadConditionFacts: loadFacts } as unknown as AutomationFactsService;
  const client = {
    automationRule: { findMany: ruleFindMany, findFirst: ruleFindFirst },
    automationRun: {
      findFirst: runFindFirst,
      create: runCreate,
      findMany: runFindMany,
      updateMany: runUpdate,
    },
    gymMember: { findMany: memberFindMany, findFirst: memberFindFirst },
    pushToken: { count: pushTokenCount },
    memberTask: { create: taskCreate },
    invoice: { findMany: invoiceFindMany },
    booking: { findFirst: bookingFindFirst },
    classInstance: { findFirst: classInstanceFindFirst },
    serviceSession: { findFirst: sessionFindFirst },
    gym: { findMany: gymFindMany },
    subscription: { findMany: subFindMany },
  };

  const prisma = { client } as unknown as PrismaService;
  const redisSet = vi.fn(() => Promise.resolve('OK'));
  const redis = { client: { set: redisSet } } as unknown as RedisService;

  // Personalisation + delivery. Defaults to a resolvable member and a working
  // transport, so a test only states the part it is actually about.
  const mergeResolve = vi.fn(() =>
    Promise.resolve(
      overrides?.mergeTarget === undefined
        ? {
            recipient: 'nino@example.com',
            memberId: overrides?.memberId === undefined ? 'gm-1' : overrides.memberId,
            userId: overrides?.memberUser === null ? null : 'user-1',
            values: { member_first_name: 'Nino' },
          }
        : overrides.mergeTarget,
    ),
  );
  const merge = {
    brand: vi.fn(() =>
      Promise.resolve({
        name: 'Iron Gym',
        business: { address: null, phone: null, email: null, website: null },
        language: 'en',
        currency: 'GEL',
      }),
    ),
    resolve: mergeResolve,
    resolveMemberId: vi
      .fn()
      .mockResolvedValue(overrides?.memberId === undefined ? 'gm-1' : overrides.memberId),
  } as unknown as AutomationMergeService;

  const mailSend = vi.fn<
    (message: {
      to: string;
      subject: string;
      text: string;
    }) => Promise<{ sent: boolean; id: string | null }>
  >(() => {
    if (overrides?.mailThrows) return Promise.reject(new Error('resend exploded'));
    return Promise.resolve({ sent: overrides?.mailSent ?? true, id: 'email-1' });
  });
  const mailer = { send: mailSend } as unknown as MailerService;

  const notifySend = vi.fn<(input: SendNotificationInput) => Promise<SendNotificationResult>>(
    () => {
      if (overrides?.notifyThrows) return Promise.reject(new Error('expo down'));
      return Promise.resolve(
        overrides?.notifyResult ?? {
          deduped: false,
          delivered: [
            { channel: 'PUSH', ref: 'ticket-1' },
            { channel: 'IN_APP', ref: 'n-1' },
          ],
          suppressed: [],
        },
      );
    },
  );
  const notifications = { send: notifySend } as unknown as NotificationService;

  return {
    service: new AutomationExecutorService(
      prisma,
      redis,
      merge,
      mailer,
      factsService,
      notifications,
      loyalty,
    ),
    awardBonus,
    bookingFindFirst,
    classInstanceFindFirst,
    sessionFindFirst,
    notifySend,
    memberFindFirst,
    pushTokenCount,
    taskCreate,
    ruleFindFirst,
    runFindMany,
    runUpdate,
    memberFindMany,
    invoiceFindMany,
    loadFacts,
    mergeResolve,
    mailSend,
    ruleFindMany,
    runFindFirst,
    runCreate,
    gymFindMany,
    subFindMany,
    redisSet,
  };
}

const executorEnabled = env.AUTOMATION_EXECUTOR_ENABLED;
afterEach(() => {
  vi.restoreAllMocks();
  env.AUTOMATION_EXECUTOR_ENABLED = executorEnabled;
});

describe('AutomationExecutorService.dispatchForGym', () => {
  it('records a SUCCESS run per active rule on the trigger', async () => {
    const { service, ruleFindMany, runCreate } = setup({
      ruleFindMany: [activeRule({ id: 'r1' }), activeRule({ id: 'r2', actionType: 'sms' })],
    });
    const count = await service.dispatchForGym('gym-1', 'member_joined', {
      entityId: 'm-1',
      entityType: 'member',
    });

    expect(count).toBe(2);
    const where = ruleFindMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({ gymId: 'gym-1', active: true, isTemplate: false });
    const first = runCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(first.status).toBe('SUCCESS');
    expect(first.entityId).toBe('m-1');
    expect(first.entityType).toBe('member');
  });

  it('returns 0 without throwing when the rules query fails', async () => {
    const { service, runCreate } = setup({ ruleFindManyThrows: true });
    const count = await service.dispatchForGym('gym-1', 'member_joined');
    expect(count).toBe(0);
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('records a FAILED breadcrumb when the run write throws, and never rethrows', async () => {
    const { service, runCreate } = setup({
      ruleFindMany: [activeRule()],
      runCreateThrows: true,
    });
    const count = await service.dispatchForGym('gym-1', 'member_joined');
    expect(count).toBe(0);
    // First call is the SUCCESS attempt (throws), second is the FAILED breadcrumb.
    expect(runCreate).toHaveBeenCalledTimes(2);
    expect((runCreate.mock.calls[1]?.[0]?.data as Record<string, unknown>).status).toBe('FAILED');
  });
});

describe('AutomationExecutorService.fireRule', () => {
  it('skips a rule already fired for the entity since dedupeSince', async () => {
    const { service, runCreate } = setup({ runFindFirst: { id: 'existing' } });
    const recorded = await service.fireRule('gym-1', activeRule(), {
      entityId: 'sub-1',
      dedupeSince: new Date('2026-07-08T00:00:00.000Z'),
    });
    expect(recorded).toBe(false);
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('records when no prior run exists in the dedupe window', async () => {
    const { service, runCreate } = setup({ runFindFirst: null });
    const recorded = await service.fireRule('gym-1', activeRule(), {
      entityId: 'sub-1',
      dedupeSince: new Date('2026-07-08T00:00:00.000Z'),
    });
    expect(recorded).toBe(true);
    expect(runCreate).toHaveBeenCalledOnce();
  });
});

describe('AutomationExecutorService.scanMembershipExpiring', () => {
  it('records a run per expiring subscription in the rule window', async () => {
    const { service, subFindMany, runCreate } = setup({
      gymFindMany: [{ id: 'gym-1' }],
      ruleFindMany: [
        activeRule({ id: 'exp', triggerType: 'membership_expiring', triggerConfig: { days: 7 } }),
      ],
      subFindMany: [{ id: 'sub-1' }, { id: 'sub-2' }],
    });
    const now = new Date('2026-07-08T12:00:00.000Z');
    const summary = await service.scanMembershipExpiring({ now });

    expect(summary.gymsProcessed).toBe(1);
    expect(summary.rulesMatched).toBe(1);
    expect(summary.runsRecorded).toBe(2);

    // The window is the whole UTC day 7 days ahead: [2026-07-15, 2026-07-16).
    const where = subFindMany.mock.calls[0]?.[0]?.where as {
      currentPeriodEnd: { gte: Date; lt: Date };
    };
    expect(where.currentPeriodEnd.gte.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    expect(where.currentPeriodEnd.lt.toISOString()).toBe('2026-07-16T00:00:00.000Z');
    expect(runCreate).toHaveBeenCalledTimes(2);
  });

  it('skips a subscription already recorded today, counting it as skipped', async () => {
    const { service } = setup({
      gymFindMany: [{ id: 'gym-1' }],
      ruleFindMany: [
        activeRule({ id: 'exp', triggerType: 'membership_expiring', triggerConfig: { days: 7 } }),
      ],
      subFindMany: [{ id: 'sub-1' }],
      runFindFirst: { id: 'already' },
    });
    const summary = await service.scanMembershipExpiring({
      now: new Date('2026-07-08T12:00:00.000Z'),
    });
    expect(summary.runsRecorded).toBe(0);
    expect(summary.runsSkipped).toBe(1);
  });

  it('ignores a rule missing its days config', async () => {
    const { service, subFindMany } = setup({
      gymFindMany: [{ id: 'gym-1' }],
      ruleFindMany: [
        activeRule({ id: 'exp', triggerType: 'membership_expiring', triggerConfig: {} }),
      ],
    });
    const summary = await service.scanMembershipExpiring({
      now: new Date('2026-07-08T12:00:00.000Z'),
    });
    expect(summary.rulesMatched).toBe(0);
    expect(subFindMany).not.toHaveBeenCalled();
  });
});

// The executor used to write `Queued email (stubbed executor)` and send nothing,
// which made every merge field in the rule editor decoration. These pin the
// delivery path and, just as importantly, that the log stops overclaiming.
describe('AutomationExecutorService — email delivery', () => {
  it('personalises the message and mails the resolved recipient', async () => {
    const { service, mailSend, runCreate } = setup({
      ruleFindMany: [
        activeRule({ actionConfig: { subject: 'Hi {{member_first_name}}', body: 'Welcome!' } }),
      ],
    });

    await service.dispatchForGym('gym-1', 'member_joined', {
      entityId: 'gm-1',
      entityType: 'member',
    });

    expect(mailSend).toHaveBeenCalledTimes(1);
    expect(mailSend.mock.calls[0]?.[0]).toMatchObject({
      to: 'nino@example.com',
      subject: 'Hi Nino',
      text: 'Welcome!',
    });
    expect(runCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      status: 'SUCCESS',
      detail: 'Emailed nino@example.com',
    });
  });

  // A known token the trigger can't back must never reach a member as `{{…}}`.
  it('blanks a token the trigger has no value for', async () => {
    const { service, mailSend } = setup({
      ruleFindMany: [activeRule({ actionConfig: { body: 'See you at {{class_name}}.' } })],
    });

    await service.dispatchForGym('gym-1', 'member_joined', {
      entityId: 'gm-1',
      entityType: 'member',
    });

    expect(mailSend.mock.calls[0]?.[0]?.text).toBe('See you at .');
  });

  it('says so, and stays SUCCESS, when the mail transport is unconfigured', async () => {
    const { service, runCreate } = setup({
      ruleFindMany: [activeRule()],
      mailSent: false,
    });

    await service.dispatchForGym('gym-1', 'member_joined', {
      entityId: 'gm-1',
      entityType: 'member',
    });

    expect(runCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      status: 'SUCCESS',
      detail: 'Email not sent — mail transport is not configured',
    });
  });

  it('records FAILED without throwing when the send blows up', async () => {
    const { service, runCreate } = setup({ ruleFindMany: [activeRule()], mailThrows: true });

    // Member creation dispatches this fire-and-forget — it must never reject.
    await expect(
      service.dispatchForGym('gym-1', 'member_joined', {
        entityId: 'gm-1',
        entityType: 'member',
      }),
    ).resolves.toBe(1);

    expect(runCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      status: 'FAILED',
      detail: 'Email failed: resend exploded',
    });
  });

  it('sends nothing when the context resolves to no recipient', async () => {
    const { service, mailSend, runCreate } = setup({
      ruleFindMany: [activeRule()],
      mergeTarget: null,
    });

    await service.dispatchForGym('gym-1', 'member_joined', {});

    expect(mailSend).not.toHaveBeenCalled();
    expect(runCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      status: 'SUCCESS',
      detail: 'No recipient for this trigger — nothing sent',
    });
  });

  it('logs a non-email action honestly and never touches the mailer', async () => {
    const { service, mailSend, runCreate } = setup({
      ruleFindMany: [activeRule({ actionType: 'sms' })],
    });

    await service.dispatchForGym('gym-1', 'member_joined', {
      entityId: 'gm-1',
      entityType: 'member',
    });

    expect(mailSend).not.toHaveBeenCalled();
    expect(runCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      status: 'SUCCESS',
      detail: 'SMS not delivered yet; message: Welcome',
    });
  });
});

describe('AutomationExecutorService — push and task delivery', () => {
  const NOW_PUSH = new Date('2026-10-27T09:00:00Z');
  const pushRule = activeRule({
    id: 'r-push',
    name: 'Welcome push',
    actionType: 'push_notification',
    actionConfig: { subject: 'Hi {{member_first_name}}', body: 'Welcome, {{member_first_name}}!' },
  });

  async function fire(rule: FireRule, over: Parameters<typeof setup>[0] = {}) {
    const ctx = setup({ ruleFindMany: [rule], ...over });
    await ctx.service.dispatchForGym('gym-1', 'member_joined', {
      entityId: 'gm-1',
      entityType: 'member',
      now: NOW_PUSH,
    });
    return { ...ctx, data: ctx.runCreate.mock.calls[0]?.[0]?.data };
  }

  it('pushes to the member with an interpolated title and a per-day dedupe key', async () => {
    const { notifySend, pushTokenCount, mailSend, data } = await fire(pushRule);

    expect(notifySend.mock.calls[0]?.[0]).toEqual({
      gymId: 'gym-1',
      userId: 'user-1',
      category: 'SYSTEM',
      title: 'Hi Nino',
      body: 'Welcome, Nino!',
      channels: ['PUSH', 'IN_APP'],
      dedupeKey: 'automation:r-push:gm-1:2026-10-27',
    });
    expect(pushTokenCount.mock.calls[0]?.[0]?.where).toEqual({ userId: 'user-1' });
    expect(mailSend).not.toHaveBeenCalled();
    expect(data).toMatchObject({ status: 'SUCCESS', detail: 'Pushed to 2 device(s)' });
  });

  it('titles the notification with the rule name when there is no subject', async () => {
    const { notifySend } = await fire(activeRule({ ...pushRule, actionConfig: { body: 'Hey' } }));

    expect(notifySend.mock.calls[0]?.[0]?.title).toBe('Welcome push');
  });

  it('reports in-app only when the push channel had no device', async () => {
    const { data } = await fire(pushRule, {
      notifyResult: {
        deduped: false,
        delivered: [
          { channel: 'PUSH', ref: null, pending: true },
          { channel: 'IN_APP', ref: 'n-1' },
        ],
        suppressed: [],
      },
    });

    expect(data).toMatchObject({
      status: 'SUCCESS',
      detail: 'In-app notification delivered (no push device)',
    });
  });

  it('records SKIPPED when the same rule already notified this entity today', async () => {
    const { data } = await fire(pushRule, {
      notifyResult: { deduped: true, delivered: [], suppressed: [] },
    });

    expect(data).toMatchObject({ status: 'SKIPPED', detail: 'Already notified today' });
  });

  it('sends nothing when the trigger resolves to no member', async () => {
    const { notifySend, data } = await fire(pushRule, { mergeTarget: null });

    expect(notifySend).not.toHaveBeenCalled();
    expect(data).toMatchObject({ status: 'SUCCESS', detail: 'No recipient' });
  });

  it('records FAILED without throwing when the push transport errors', async () => {
    const { data } = await fire(pushRule, { notifyThrows: true });

    expect(data).toMatchObject({ status: 'FAILED', detail: 'Push failed: expo down' });
  });

  it('creates a pending member task titled with the interpolated message', async () => {
    const { taskCreate, data } = await fire(
      activeRule({
        actionType: 'create_task',
        actionConfig: { body: 'Call {{member_first_name}}' },
      }),
    );

    expect(taskCreate.mock.calls[0]?.[0]?.data).toEqual({
      gymId: 'gym-1',
      memberId: 'gm-1',
      title: 'Call Nino',
      dueDate: null,
      assignee: null,
      status: 'PENDING',
    });
    expect(data).toMatchObject({ status: 'SUCCESS', detail: 'Task created: Call Nino' });
  });

  it('caps the task title at 200 characters', async () => {
    const { taskCreate } = await fire(
      activeRule({ actionType: 'create_task', actionConfig: { body: 'x'.repeat(250) } }),
    );

    expect((taskCreate.mock.calls[0]?.[0]?.data?.title as string).length).toBe(200);
  });

  it('creates no task when the trigger names no member', async () => {
    const { taskCreate, data } = await fire(activeRule({ actionType: 'create_task' }), {
      memberId: null,
    });

    expect(taskCreate).not.toHaveBeenCalled();
    expect(data).toMatchObject({ status: 'SUCCESS', detail: 'No member for this trigger' });
  });
});

describe('AutomationExecutorService — checkin_milestone', () => {
  const milestoneRules = [
    activeRule({ id: 'm10', triggerType: 'checkin_milestone', triggerConfig: { days: 10 } }),
    activeRule({ id: 'm50', triggerType: 'checkin_milestone', triggerConfig: { days: 50 } }),
  ];

  it('fires only the rule whose triggerConfig.days matches the milestone', async () => {
    const { service, runCreate } = setup({ ruleFindMany: milestoneRules });

    const count = await service.dispatchForGym('gym-1', 'checkin_milestone', {
      entityId: 'gm-1',
      entityType: 'member',
      milestone: 50,
    });

    expect(count).toBe(1);
    expect(runCreate.mock.calls.map((call) => call[0]?.data?.ruleId)).toEqual(['m50']);
  });

  it('fires nothing when no rule matches the milestone', async () => {
    const { service, runCreate } = setup({ ruleFindMany: milestoneRules });

    await expect(
      service.dispatchForGym('gym-1', 'checkin_milestone', { entityId: 'gm-1', milestone: 25 }),
    ).resolves.toBe(0);
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('fires every milestone rule when the caller passes no milestone', async () => {
    const { service } = setup({ ruleFindMany: milestoneRules });

    await expect(
      service.dispatchForGym('gym-1', 'checkin_milestone', { entityId: 'gm-1' }),
    ).resolves.toBe(2);
  });
});

const CONDITION_FACTS: AutomationConditionFacts = {
  member_age: 30,
  member_gender: 'FEMALE',
  member_status: 'ACTIVE',
  member_kind: 'MEMBER',
  member_branch: null,
  member_tags: [],
  member_joined_days_ago: 10,
  member_last_checkin_days_ago: 2,
  member_checkin_count: 5,
  subscription_plan: null,
  subscription_status: null,
  subscription_days_until_expiry: null,
  booking_attendance: null,
};
const adult: AutomationCondition[] = [{ field: 'member_age', operator: 'gte', value: 18 }];
const NOW = new Date('2026-07-08T12:00:00Z');

describe('conditions and delayed actions', () => {
  it('skips unmatched or missing condition facts without writing a run', async () => {
    for (const facts of [null, { ...CONDITION_FACTS, member_age: 17 }]) {
      const { service, runCreate, mailSend } = setup({ facts });
      expect(
        await service.fireRule('gym-1', activeRule({ conditions: adult }), {
          entityId: 'gm-1',
          entityType: 'member',
        }),
      ).toBe(false);
      expect(runCreate).not.toHaveBeenCalled();
      expect(mailSend).not.toHaveBeenCalled();
    }
  });
  it('queues a positive offset after checking facts, without delivering yet', async () => {
    const { service, runCreate, mailSend, loadFacts } = setup({ facts: CONDITION_FACTS });
    expect(
      await service.fireRule('gym-1', activeRule({ conditions: adult, timingOffset: '3h' }), {
        entityId: 'gm-1',
        entityType: 'member',
        now: NOW,
      }),
    ).toBe(true);
    expect(loadFacts).toHaveBeenCalledWith('gym-1', 'gm-1', NOW);
    expect(runCreate.mock.calls[0]?.[0].data).toMatchObject({
      status: 'QUEUED',
      scheduledFor: new Date('2026-07-08T15:00:00Z'),
      detail: 'Scheduled for 2026-07-08T15:00:00.000Z',
    });
    expect(mailSend).not.toHaveBeenCalled();
  });
  it('does not queue an immediate dispatch', async () => {
    const { service, runCreate, mailSend } = setup();
    await service.fireRule('gym-1', activeRule({ timingOffset: '3h' }), { immediate: true });
    expect(mailSend).toHaveBeenCalledOnce();
    expect(runCreate.mock.calls[0]?.[0].data?.status).toBe('SUCCESS');
  });
  it.each([
    ['sms', 'SMS not delivered yet; message: Hi Nino '],
    ['push_notification', 'Pushed to 2 device(s)'],
    ['create_task', 'Task created: Hi Nino '],
  ] as const)('interpolates the %s message', async (actionType, detail) => {
    const { service, runCreate, mailSend } = setup();
    await service.fireRule(
      'gym-1',
      activeRule({
        actionType,
        actionConfig: {
          subject: '{{member_first_name}}',
          body: 'Hi {{member_first_name}} {{class_name}}',
        },
      }),
    );
    expect(runCreate.mock.calls[0]?.[0].data?.detail).toBe(detail);
    expect(mailSend).not.toHaveBeenCalled();
  });
  it.each([
    [
      'SUCCESS',
      activeRule({ conditions: adult, timingOffset: '3h' }),
      CONDITION_FACTS,
      'Emailed nino@example.com',
    ],
    ['SKIPPED', null, CONDITION_FACTS, 'Rule inactive'],
    [
      'SKIPPED',
      activeRule({ conditions: adult }),
      { ...CONDITION_FACTS, member_age: 17 },
      'Conditions no longer met',
    ],
  ] as const)('processes due rows as %s', async (status, rule, facts, detail) => {
    env.AUTOMATION_EXECUTOR_ENABLED = true;
    const { service, runFindMany, ruleFindFirst, runUpdate, runCreate, mailSend } = setup({
      ruleFindFirst: rule,
      facts,
      runFindMany: [
        { id: 'run-1', gymId: 'gym-1', ruleId: 'rule-1', entityId: 'gm-1', entityType: 'member' },
      ],
    });
    await service.runDueQueued(NOW);
    expect(runFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'QUEUED', scheduledFor: { lte: NOW } },
        take: 200,
      }),
    );
    expect(ruleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rule-1', gymId: 'gym-1', active: true, isTemplate: false },
      }),
    );
    expect(runUpdate).toHaveBeenCalledWith({
      where: { id: 'run-1', gymId: 'gym-1', status: 'QUEUED' },
      data: { status, detail, ranAt: NOW },
    });
    expect(runCreate).not.toHaveBeenCalled();
    expect(mailSend).toHaveBeenCalledTimes(status === 'SUCCESS' ? 1 : 0);
  });
  it('does not process due rows without the separate Redis lock', async () => {
    env.AUTOMATION_EXECUTOR_ENABLED = true;
    const { service, redisSet, runFindMany } = setup();
    redisSet.mockResolvedValueOnce(null as never);
    await service.runDueQueued(NOW);
    expect(redisSet).toHaveBeenCalledWith('automation:queued:lock', '1', 'EX', 600, 'NX');
    expect(runFindMany).not.toHaveBeenCalled();
  });
});

describe('date scanners', () => {
  it('adds timing to the expiry lookahead and delivers scans immediately', async () => {
    const { service, subFindMany, runCreate } = setup({
      gymFindMany: [{ id: 'gym-1' }],
      ruleFindMany: [
        activeRule({
          triggerType: 'membership_expiring',
          triggerConfig: { days: 7 },
          timingOffset: '48h',
        }),
      ],
      subFindMany: [{ id: 'sub-1' }],
    });
    const result = await service.scanMembershipExpiring({ now: NOW });
    expect(result.runsRecorded).toBe(1);
    expect(subFindMany.mock.calls[0]?.[0].where).toMatchObject({
      gymId: 'gym-1',
      currentPeriodEnd: { gte: new Date('2026-07-17'), lt: new Date('2026-07-18') },
    });
    expect(runCreate.mock.calls[0]?.[0].data?.status).toBe('SUCCESS');
  });
  it('counts condition skips separately from dedupe skips', async () => {
    const { service, runCreate } = setup({
      gymFindMany: [{ id: 'gym-1' }],
      ruleFindMany: [
        activeRule({
          triggerType: 'membership_expiring',
          triggerConfig: { days: 7 },
          conditions: adult,
        }),
      ],
      subFindMany: [{ id: 'sub-1' }],
      facts: null,
    });
    expect(await service.scanMembershipExpiring({ now: NOW })).toMatchObject({
      conditionsSkipped: 1,
      runsSkipped: 0,
      runsRecorded: 0,
    });
    expect(runCreate).not.toHaveBeenCalled();
  });
  it('matches birthday month/day across a year boundary', async () => {
    const { service, memberFindMany, runCreate } = setup({
      gymFindMany: [{ id: 'gym-1' }],
      ruleFindMany: [activeRule({ triggerType: 'birthday', timingOffset: '1d' })],
      memberFindMany: [
        { id: 'match', dateOfBirth: new Date('1990-01-01') },
        { id: 'other', dateOfBirth: new Date('1990-01-02') },
      ],
    });
    expect(
      (await service.scanBirthdays({ now: new Date('2026-12-31T12:00:00Z') })).runsRecorded,
    ).toBe(1);
    expect(memberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gymId: 'gym-1', status: 'ACTIVE', deletedAt: null, dateOfBirth: { not: null } },
      }),
    );
    expect(runCreate.mock.calls[0]?.[0].data).toMatchObject({
      entityId: 'match',
      entityType: 'member',
    });
  });
  it('uses the latest check-in day or joinedAt for members without check-ins', async () => {
    const { service, memberFindMany } = setup({
      gymFindMany: [{ id: 'gym-1' }],
      ruleFindMany: [
        activeRule({ triggerType: 'no_checkin', triggerConfig: { days: 7 }, timingOffset: '1d' }),
      ],
      memberFindMany: [{ id: 'gm-1' }],
    });
    expect((await service.scanNoCheckin({ now: NOW })).runsRecorded).toBe(1);
    const window = { gte: new Date('2026-06-30'), lt: new Date('2026-07-01') };
    expect(memberFindMany.mock.calls[0]?.[0].where).toEqual({
      gymId: 'gym-1',
      status: 'ACTIVE',
      deletedAt: null,
      OR: [
        {
          checkIns: {
            some: { gymId: 'gym-1', checkedInAt: window },
            none: { gymId: 'gym-1', checkedInAt: { gte: window.lt } },
          },
        },
        { checkIns: { none: { gymId: 'gym-1' } }, joinedAt: window },
      ],
    });
  });
  it('queues a positive offset on membership_expired, now an event trigger', async () => {
    const { service, runCreate, mailSend } = setup();
    expect(
      await service.fireRule(
        'gym-1',
        activeRule({ triggerType: 'membership_expired', timingOffset: '2d' }),
        { entityId: 'sub-1', entityType: 'subscription', now: NOW },
      ),
    ).toBe(true);
    expect(runCreate.mock.calls[0]?.[0].data).toMatchObject({
      status: 'QUEUED',
      triggerType: 'membership_expired',
      entityId: 'sub-1',
      scheduledFor: new Date('2026-07-10T12:00:00Z'),
    });
    expect(mailSend).not.toHaveBeenCalled();
  });
  it('scans unpaid invoices by their due-date window', async () => {
    const invoices = setup({
      gymFindMany: [{ id: 'gym-1' }],
      ruleFindMany: [activeRule({ triggerType: 'invoice_overdue' })],
      invoiceFindMany: [{ id: 'inv-1' }],
    });
    await invoices.service.scanInvoiceOverdue({ now: NOW });
    expect(invoices.invoiceFindMany.mock.calls[0]?.[0].where).toEqual({
      gymId: 'gym-1',
      status: { in: ['PENDING', 'FAILED'] },
      dueDate: { gte: new Date('2026-07-08'), lt: new Date('2026-07-09') },
    });
    expect(invoices.runCreate.mock.calls[0]?.[0].data).toMatchObject({
      entityType: 'invoice',
      entityId: 'inv-1',
    });
  });
});

// `product_stock_low` is about stock, not the buyer: its message goes to the gym.
describe('AutomationExecutorService — gym-recipient trigger', () => {
  const stockRule = (over: Partial<FireRule> = {}) =>
    activeRule({
      triggerType: AutomationTriggerType.product_stock_low,
      actionConfig: { subject: 'Low stock', body: 'Restock {{order_items}}' },
      ...over,
    });
  const ctx = { entityId: 'order-1', entityType: 'order' as const };

  it('emails the gym business address, passing the trigger to the merge service', async () => {
    const { service, mailSend, mergeResolve, runCreate } = setup({
      ruleFindMany: [stockRule()],
      mergeTarget: { recipient: 'desk@iron.ge', values: { order_items: 'Protein bar × 2' } },
    });
    await service.dispatchForGym('gym-1', 'product_stock_low', ctx);

    expect((mergeResolve.mock.calls[0] as unknown[])[1]).toMatchObject({
      ...ctx,
      triggerType: 'product_stock_low',
    });
    expect(mailSend.mock.calls[0]?.[0]).toMatchObject({
      to: 'desk@iron.ge',
      text: 'Restock Protein bar × 2',
    });
    expect(runCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      status: 'SUCCESS',
      detail: 'Emailed gym desk@iron.ge',
    });
  });

  it('says so when the gym has no business email', async () => {
    const { service, mailSend, runCreate } = setup({
      ruleFindMany: [stockRule()],
      mergeTarget: { recipient: null, values: {} },
    });
    await service.dispatchForGym('gym-1', 'product_stock_low', ctx);
    expect(mailSend).not.toHaveBeenCalled();
    expect(runCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      status: 'SUCCESS',
      detail: 'No gym email configured — nothing sent',
    });
  });

  it.each(['push_notification', 'sms', 'create_task'] as const)(
    'skips a %s action without notifying anyone',
    async (actionType) => {
      const { service, mailSend, notifySend, taskCreate, mergeResolve, runCreate } = setup({
        ruleFindMany: [stockRule({ actionType })],
      });
      await service.dispatchForGym('gym-1', 'product_stock_low', ctx);
      expect(mailSend).not.toHaveBeenCalled();
      expect(notifySend).not.toHaveBeenCalled();
      expect(taskCreate).not.toHaveBeenCalled();
      expect(mergeResolve).not.toHaveBeenCalled();
      expect(runCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        status: 'SKIPPED',
        detail: 'This trigger only supports the email action',
      });
    },
  );

  it('ignores member conditions on a gym-recipient trigger', async () => {
    const { service, loadFacts, mailSend } = setup({
      ruleFindMany: [
        stockRule({ conditions: [{ field: 'member_age', operator: 'gte', value: 18 }] }),
      ],
      mergeTarget: { recipient: 'desk@iron.ge', values: {} },
      facts: null,
    });
    await expect(service.dispatchForGym('gym-1', 'product_stock_low', ctx)).resolves.toBe(1);
    expect(loadFacts).not.toHaveBeenCalled();
    expect(mailSend).toHaveBeenCalledOnce();
  });
});

describe('timing in hours and anchored to the class start', () => {
  const NOW_T = new Date('2026-07-08T12:00:00Z');
  const HOUR = 60 * 60 * 1000;
  const reminder = activeRule({
    triggerType: 'class_booked',
    timingOffset: '-24h',
    actionConfig: { body: 'See you tomorrow' },
  });
  const bookingCtx = { entityId: 'b-1', entityType: 'booking', now: NOW_T } as const;

  it('queues a +2h rule two hours from now', async () => {
    const { service, runCreate, mailSend } = setup();
    await service.fireRule('gym-1', activeRule({ timingOffset: '2h' }), {
      entityId: 'gm-1',
      entityType: 'member',
      now: NOW_T,
    });
    expect(runCreate.mock.calls[0]?.[0].data).toMatchObject({
      status: 'QUEUED',
      scheduledFor: new Date(NOW_T.getTime() + 2 * HOUR),
    });
    expect(mailSend).not.toHaveBeenCalled();
  });

  it('queues -24h on class_booked for a day before the class starts', async () => {
    const startsAt = new Date(NOW_T.getTime() + 72 * HOUR);
    const { service, runCreate, mailSend, classInstanceFindFirst } = setup({
      booking: { classInstanceId: 'ci-1' },
      classInstance: { startsAt },
    });
    expect(await service.fireRule('gym-1', reminder, bookingCtx)).toBe(true);
    expect(classInstanceFindFirst.mock.calls[0]?.[0]?.where).toEqual({
      id: 'ci-1',
      gymId: 'gym-1',
    });
    expect(runCreate.mock.calls[0]?.[0].data).toMatchObject({
      status: 'QUEUED',
      scheduledFor: new Date(startsAt.getTime() - 24 * HOUR),
    });
    expect(mailSend).not.toHaveBeenCalled();
  });

  it('sends at once when the class starts sooner than the offset', async () => {
    const { service, runCreate, mailSend } = setup({
      booking: { classInstanceId: 'ci-1' },
      classInstance: { startsAt: new Date(NOW_T.getTime() + HOUR) },
    });
    await service.fireRule('gym-1', reminder, bookingCtx);
    expect(mailSend).toHaveBeenCalledOnce();
    expect(runCreate.mock.calls[0]?.[0].data?.status).toBe('SUCCESS');
  });

  it('anchors pt_session_booked to the session start', async () => {
    const startsAt = new Date(NOW_T.getTime() + 48 * HOUR);
    const { service, runCreate } = setup({ serviceSession: { startsAt } });
    await service.fireRule(
      'gym-1',
      activeRule({ triggerType: 'pt_session_booked', timingOffset: '-2h' }),
      { entityId: 's-1', entityType: 'service_session', now: NOW_T },
    );
    expect(runCreate.mock.calls[0]?.[0].data).toMatchObject({
      status: 'QUEUED',
      scheduledFor: new Date(startsAt.getTime() - 2 * HOUR),
    });
  });

  it('skips with a note when the booking is not in this gym', async () => {
    const { service, runCreate, mailSend } = setup({
      booking: { classInstanceId: 'ci-1' },
      classInstance: { startsAt: new Date(NOW_T.getTime() + 72 * HOUR) },
    });
    await service.fireRule('gym-2', reminder, bookingCtx);
    expect(runCreate.mock.calls[0]?.[0].data).toMatchObject({
      gymId: 'gym-2',
      status: 'SKIPPED',
      detail: 'Entity not found',
    });
    expect(mailSend).not.toHaveBeenCalled();
  });
});

describe('due reminders for a cancelled booking or session', () => {
  const NOW_D = new Date('2026-07-08T12:00:00Z');
  const due = (entityType: string) => [
    { id: 'run-1', gymId: 'gym-1', ruleId: 'rule-1', entityId: 'e-1', entityType },
  ];
  const classRule = activeRule({ triggerType: 'class_booked', timingOffset: '-24h' });

  it.each([
    [
      'a cancelled booking',
      { status: 'CANCELED', classInstanceId: 'ci-1' },
      { status: 'SCHEDULED' },
    ],
    ['a cancelled class', { status: 'BOOKED', classInstanceId: 'ci-1' }, { status: 'CANCELED' }],
    ['a no-show', { status: 'NO_SHOW', classInstanceId: 'ci-1' }, { status: 'SCHEDULED' }],
  ])('skips the reminder for %s', async (_label, booking, classInstance) => {
    env.AUTOMATION_EXECUTOR_ENABLED = true;
    const { service, runUpdate, mailSend } = setup({
      ruleFindFirst: classRule,
      runFindMany: due('booking'),
      booking,
      classInstance,
    });
    await service.runDueQueued(NOW_D);
    expect((runUpdate.mock.calls[0]?.[0] as AnyArgs | undefined)?.data).toMatchObject({
      status: 'SKIPPED',
      detail: 'Booking cancelled',
    });
    expect(mailSend).not.toHaveBeenCalled();
  });

  it('sends the reminder for a booking that still stands', async () => {
    env.AUTOMATION_EXECUTOR_ENABLED = true;
    const { service, runUpdate, mailSend } = setup({
      ruleFindFirst: classRule,
      runFindMany: due('booking'),
      booking: { status: 'BOOKED', classInstanceId: 'ci-1' },
      classInstance: { status: 'SCHEDULED' },
    });
    await service.runDueQueued(NOW_D);
    expect((runUpdate.mock.calls[0]?.[0] as AnyArgs | undefined)?.data?.status).toBe('SUCCESS');
    expect(mailSend).toHaveBeenCalledOnce();
  });

  it.each([
    ['cancelled', { status: 'CANCELLED', memberId: 'gm-1' }],
    ['released', { status: 'OPEN', memberId: null }],
  ])('skips a PT reminder for a %s session', async (_label, serviceSession) => {
    env.AUTOMATION_EXECUTOR_ENABLED = true;
    const { service, runUpdate } = setup({
      ruleFindFirst: activeRule({ triggerType: 'pt_session_booked', timingOffset: '-2h' }),
      runFindMany: due('service_session'),
      serviceSession,
    });
    await service.runDueQueued(NOW_D);
    expect((runUpdate.mock.calls[0]?.[0] as AnyArgs | undefined)?.data).toMatchObject({
      status: 'SKIPPED',
      detail: 'Session cancelled',
    });
  });

  it('still sends a delayed follow-up about a cancellation', async () => {
    env.AUTOMATION_EXECUTOR_ENABLED = true;
    const { service, runUpdate, bookingFindFirst } = setup({
      ruleFindFirst: activeRule({ triggerType: 'class_cancelled_member', timingOffset: '1h' }),
      runFindMany: due('booking'),
      booking: { status: 'CANCELED', classInstanceId: 'ci-1' },
    });
    await service.runDueQueued(NOW_D);
    expect(bookingFindFirst).not.toHaveBeenCalled();
    expect((runUpdate.mock.calls[0]?.[0] as AnyArgs | undefined)?.data?.status).toBe('SUCCESS');
  });
});

describe('recipient, offer and bonus', () => {
  const ctx = { entityId: 'b-1', entityType: 'booking' } as const;

  it('passes the rule recipient and pushes to the trainer account', async () => {
    const { service, mergeResolve, notifySend } = setup({
      mergeTarget: {
        recipient: 'gio@irongym.ge',
        memberId: 'gm-1',
        userId: 'user-staff',
        values: { recipient_name: 'Gio' },
      },
    });
    await service.fireRule(
      'gym-1',
      activeRule({
        triggerType: 'class_booked',
        recipient: 'trainer',
        actionType: 'push_notification',
        actionConfig: { body: 'Hi {{recipient_name}}' },
      }),
      ctx,
    );
    expect((mergeResolve.mock.calls[0] as unknown[])[1]).toMatchObject({ recipient: 'trainer' });
    expect(notifySend.mock.calls[0]?.[0]).toMatchObject({ userId: 'user-staff', body: 'Hi Gio' });
  });

  it('hands the offer to the merge service as tokens, beside the dispatcher’s values', async () => {
    const { service, mergeResolve } = setup();
    await service.fireRule(
      'gym-1',
      activeRule({
        actionConfig: { body: 'x', offer: { discountPercent: 20, offerCode: 'BACK20' } },
      }),
      { ...ctx, extraValues: { cancelled_by: 'member' } },
    );
    expect((mergeResolve.mock.calls[0] as unknown[])[1]).toMatchObject({
      recipient: 'member',
      extraValues: {
        cancelled_by: 'member',
        discount_percent: '20',
        bonus_points: '',
        offer_code: 'BACK20',
        offer_expiry: '',
      },
    });
  });

  const bonusRule = activeRule({ actionConfig: { body: 'x', offer: { bonusPoints: 50 } } });

  it('credits the bonus once per rule and entity, and says so', async () => {
    const { service, awardBonus, runCreate } = setup();
    await service.fireRule('gym-1', bonusRule, ctx);
    expect(awardBonus).toHaveBeenCalledWith('gym-1', 'gm-1', 50, 'automation:rule-1:b-1', 'Rule');
    expect(runCreate.mock.calls[0]?.[0].data).toMatchObject({
      status: 'SUCCESS',
      detail: 'Emailed nino@example.com (+50 points)',
    });
  });

  it.each([
    ['already credited', false],
    ['the ledger throws', 'throws'],
  ] as const)('still sends when %s', async (_label, bonusAwarded) => {
    const { service, runCreate, mailSend } = setup({ bonusAwarded });
    await service.fireRule('gym-1', bonusRule, ctx);
    expect(mailSend).toHaveBeenCalledOnce();
    expect(runCreate.mock.calls[0]?.[0].data).toMatchObject({
      status: 'SUCCESS',
      detail: 'Emailed nino@example.com',
    });
  });

  it('credits no bonus on a trainer-recipient rule', async () => {
    const { service, awardBonus } = setup();
    await service.fireRule('gym-1', { ...bonusRule, recipient: 'trainer' }, ctx);
    expect(awardBonus).not.toHaveBeenCalled();
  });
});
