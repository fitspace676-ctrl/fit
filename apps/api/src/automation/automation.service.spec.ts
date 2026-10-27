import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AutomationService } from './automation.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** A rule row as the service's `RULE_SELECT` projects it. */
function ruleRecord(over?: Record<string, unknown>) {
  return {
    id: 'rule-1',
    name: 'Welcome new members',
    triggerType: 'member_joined',
    triggerConfig: {},
    timingOffset: 'day_of',
    conditions: [],
    actionType: 'email',
    actionConfig: { subject: 'Welcome', body: 'Welcome {{member_first_name}}!' },
    active: true,
    isTemplate: false,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    createdBy: { id: 'u-1', name: 'Nino', email: 'nino@example.com' },
    ...over,
  };
}

interface AnyArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

function setup(overrides?: {
  ruleFindMany?: unknown[];
  ruleFindFirst?: unknown;
  ruleCount?: number;
  runFindMany?: unknown[];
  runCount?: number;
}) {
  const ruleFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.ruleFindMany ?? []),
  );
  const ruleFindFirst = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.ruleFindFirst ?? null),
  );
  const ruleCount = vi.fn<(args: AnyArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.ruleCount ?? 0),
  );
  const ruleCreate = vi.fn<(args: AnyArgs) => Promise<unknown>>((args) =>
    Promise.resolve(ruleRecord(args.data)),
  );
  const ruleUpdate = vi.fn<(args: AnyArgs) => Promise<unknown>>((args) =>
    Promise.resolve(ruleRecord({ ...(overrides?.ruleFindFirst as object), ...args.data })),
  );
  const ruleDelete = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(ruleRecord()),
  );

  const runFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.runFindMany ?? []),
  );
  const runCount = vi.fn<(args: AnyArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.runCount ?? 0),
  );

  const locations = vi.fn().mockResolvedValue([{ id: 'loc-1', name: 'Main' }]);
  const plans = vi.fn().mockResolvedValue([{ id: 'plan-1', name: 'Gold' }]);
  const members = vi.fn().mockResolvedValue([{ tags: ['vip', 'new'] }, { tags: ['vip'] }]);
  const client = {
    location: { findMany: locations },
    subscriptionPlan: { findMany: plans },
    gymMember: { findMany: members },
    automationRule: {
      findMany: ruleFindMany,
      findFirst: ruleFindFirst,
      count: ruleCount,
      create: ruleCreate,
      update: ruleUpdate,
      delete: ruleDelete,
    },
    automationRun: { findMany: runFindMany, count: runCount },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'u-1' } as unknown as TenantContext;

  return {
    service: new AutomationService(prisma, tenant),
    locations,
    plans,
    members,
    ruleFindMany,
    ruleFindFirst,
    ruleCount,
    ruleCreate,
    ruleUpdate,
    ruleDelete,
    runFindMany,
    runCount,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('AutomationService.catalog', () => {
  it('returns the trigger / action / timing catalogs', async () => {
    const { service } = setup();
    const catalog = await service.catalog();
    expect(catalog.triggers.some((t) => t.value === 'member_joined')).toBe(true);
    expect(catalog.triggers.find((t) => t.value === 'membership_expiring')?.needsDays).toBe(true);
    expect(catalog.actions.map((a) => a.value)).toContain('push_notification');
    expect(catalog.timings.find((t) => t.value === '-7d')?.days).toBe(-7);
  });
});

describe('AutomationService.listRules', () => {
  it('excludes templates and paginates', async () => {
    const { service, ruleFindMany, ruleCount } = setup({
      ruleFindMany: [ruleRecord()],
      ruleCount: 1,
    });
    const res = await service.listRules({
      page: 1,
      limit: 20,
      sort: 'createdAt',
      dir: 'desc',
    } as never);

    expect(res.total).toBe(1);
    expect(res.data[0]?.id).toBe('rule-1');
    expect(res.data[0]?.triggerType).toBe('member_joined');
    const where = ruleFindMany.mock.calls[0]?.[0].where as Record<string, unknown>;
    expect(where.isTemplate).toBe(false);
    expect(ruleCount).toHaveBeenCalledOnce();
  });

  it('applies the trigger / active / search filters', async () => {
    const { service, ruleFindMany } = setup();
    await service.listRules({
      page: 1,
      limit: 20,
      sort: 'name',
      dir: 'asc',
      triggerType: 'payment_failed',
      active: true,
      search: 'dunning',
    } as never);
    const where = ruleFindMany.mock.calls[0]?.[0].where as Record<string, unknown>;
    expect(where.triggerType).toBe('payment_failed');
    expect(where.active).toBe(true);
    expect(where.name).toEqual({ contains: 'dunning', mode: 'insensitive' });
  });
});

describe('AutomationService.listTemplates', () => {
  it('reads only templates', async () => {
    const { service, ruleFindMany } = setup({
      ruleFindMany: [ruleRecord({ id: 'tmpl-1', isTemplate: true })],
    });
    const res = await service.listTemplates();
    expect(res.data[0]?.id).toBe('tmpl-1');
    expect(ruleFindMany.mock.calls[0]?.[0].where).toEqual({ isTemplate: true });
  });
});

describe('AutomationService.createRule', () => {
  it('persists a rule with the session author and defaults active', async () => {
    const { service, ruleCreate } = setup();
    const res = await service.createRule({
      name: 'Welcome new members',
      triggerType: 'member_joined',
      triggerConfig: {},
      timingOffset: 'day_of',
      conditions: [],
      actionType: 'email',
      actionConfig: { subject: 'Welcome', body: 'Hi {{member_first_name}}' },
      active: true,
    });
    const data = ruleCreate.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.gymId).toBe('gym-1');
    expect(data.createdById).toBe('u-1');
    expect(data.isTemplate).toBe(false);
    expect(res.runs).toEqual([]);
    expect(res.runCount).toBe(0);
  });
});

describe('AutomationService.updateRule', () => {
  it('404s an unknown rule', async () => {
    const { service } = setup({ ruleFindFirst: null });
    await expect(service.updateRule('missing', { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects retargeting to a needs-days trigger without days', async () => {
    const { service } = setup({ ruleFindFirst: ruleRecord() });
    await expect(
      service.updateRule('rule-1', { triggerType: 'no_checkin' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows retargeting when days is supplied together', async () => {
    const { service, ruleUpdate } = setup({ ruleFindFirst: ruleRecord() });
    await service.updateRule('rule-1', {
      triggerType: 'no_checkin',
      triggerConfig: { days: 14 },
    });
    const data = ruleUpdate.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.triggerType).toBe('no_checkin');
    expect(data.triggerConfig).toEqual({ days: 14 });
  });
});

describe('AutomationService.toggleRule', () => {
  it('flips active on a rule', async () => {
    const { service, ruleUpdate } = setup({ ruleFindFirst: ruleRecord({ active: true }) });
    await service.toggleRule('rule-1', { active: false });
    expect((ruleUpdate.mock.calls[0]?.[0]?.data as Record<string, unknown>).active).toBe(false);
  });

  it('refuses to toggle a template', async () => {
    const { service } = setup({ ruleFindFirst: ruleRecord({ isTemplate: true }) });
    await expect(service.toggleRule('tmpl-1', { active: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AutomationService.saveAsTemplate', () => {
  it('clones the rule as an inactive template', async () => {
    const { service, ruleCreate } = setup({
      ruleFindFirst: ruleRecord({ actionConfig: { body: 'hi' }, triggerConfig: {} }),
    });
    await service.saveAsTemplate('rule-1', { name: 'Welcome template' });
    const data = ruleCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.isTemplate).toBe(true);
    expect(data.active).toBe(false);
    expect(data.name).toBe('Welcome template');
    expect(data.triggerType).toBe('member_joined');
  });
});

describe('AutomationService.deleteRule', () => {
  it('404s an unknown rule', async () => {
    const { service } = setup({ ruleFindFirst: null });
    await expect(service.deleteRule('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an existing rule', async () => {
    const { service, ruleDelete } = setup({ ruleFindFirst: ruleRecord() });
    await service.deleteRule('rule-1');
    expect(ruleDelete).toHaveBeenCalledWith({ where: { id: 'rule-1' } });
  });
});

describe('AutomationService.listRuns', () => {
  it('404s an unknown rule', async () => {
    const { service } = setup({ ruleFindFirst: null });
    await expect(service.listRuns('missing', { limit: 50 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the run log newest first', async () => {
    const { service, runFindMany } = setup({
      ruleFindFirst: ruleRecord(),
      runFindMany: [
        {
          id: 'run-1',
          ruleId: 'rule-1',
          triggerType: 'member_joined',
          status: 'SUCCESS',
          entityId: 'm-1',
          entityType: 'member',
          detail: 'Queued email (stubbed executor)',
          ranAt: new Date('2026-07-02T00:00:00.000Z'),
        },
      ],
    });
    const res = await service.listRuns('rule-1', { limit: 50 });
    expect(res.data[0]?.status).toBe('SUCCESS');
    expect(runFindMany.mock.calls[0]?.[0]?.orderBy).toEqual({ ranAt: 'desc' });
  });
});

describe('AutomationService.getStats', () => {
  it('aggregates rule and run counts into the header KPIs', async () => {
    const { service, ruleCount, runCount } = setup({ ruleCount: 5, runCount: 42 });
    const stats = await service.getStats();
    expect(stats).toEqual({
      totalRules: 5,
      activeRules: 5,
      totalRuns: 42,
      messagesSent: 42,
      sentLast30Days: 42,
    });
    // Two rule counts (total + active) and three run counts (total + sent + 30d).
    expect(ruleCount).toHaveBeenCalledTimes(2);
    expect(runCount).toHaveBeenCalledTimes(3);
    // The active-rules count filters on active:true.
    expect(ruleCount.mock.calls[1]?.[0]?.where).toMatchObject({ active: true });
  });
});

describe('AutomationService builder fields', () => {
  it('scopes all option queries to the tenant and deduplicates tags', async () => {
    const { service, locations, plans, members } = setup();
    const result = await service.catalog();
    expect(result.conditionOptions).toEqual({
      locations: [{ id: 'loc-1', name: 'Main' }],
      plans: [{ id: 'plan-1', name: 'Gold' }],
      tags: ['new', 'vip'],
    });
    expect(result.conditionFields).toHaveLength(12);
    expect(locations).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gymId: 'gym-1', status: 'ACTIVE' } }),
    );
    expect(plans).toHaveBeenCalledWith(expect.objectContaining({ where: { gymId: 'gym-1' } }));
    expect(members).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gymId: 'gym-1', deletedAt: null } }),
    );
  });
  it('normalizes legacy offsets and persists conditions', async () => {
    const { service, ruleCreate } = setup();
    const conditions = [{ field: 'member_age', operator: 'gte', value: 18 }] as const;
    await service.createRule({
      name: 'Welcome',
      triggerType: 'member_joined',
      triggerConfig: {},
      timingOffset: '1_day_after',
      conditions: [...conditions],
      actionType: 'email',
      actionConfig: { body: 'Hi' },
      active: true,
    });
    expect(ruleCreate.mock.calls[0]?.[0].data).toMatchObject({ timingOffset: '1d', conditions });
  });
  it('rejects negative event offsets on create and on retargeting a scan rule', async () => {
    const { service, ruleCreate } = setup({
      ruleFindFirst: ruleRecord({ triggerType: 'birthday', timingOffset: '-1d' }),
    });
    await expect(
      service.createRule({
        name: 'Welcome',
        triggerType: 'member_joined',
        triggerConfig: {},
        timingOffset: '-1h',
        conditions: [],
        actionType: 'email',
        actionConfig: { body: 'Hi' },
        active: true,
      }),
    ).rejects.toThrow('AUTOMATION_TIMING_BEFORE_NOT_ALLOWED');
    expect(ruleCreate).not.toHaveBeenCalled();
    await expect(service.updateRule('rule-1', { triggerType: 'member_joined' })).rejects.toThrow(
      'AUTOMATION_TIMING_BEFORE_NOT_ALLOWED',
    );
    await expect(
      service.updateRule('rule-1', { triggerType: 'member_joined', timingOffset: '0d' }),
    ).resolves.toMatchObject({ triggerType: 'member_joined', timingOffset: '0d' });
  });
  it('preserves conditions in templates and tolerates malformed historical conditions', async () => {
    const conditions = [{ field: 'member_age', operator: 'gte', value: 18 }];
    const { service, ruleCreate } = setup({ ruleFindFirst: ruleRecord({ conditions }) });
    await service.saveAsTemplate('rule-1', {});
    expect(ruleCreate.mock.calls[0]?.[0].data).toMatchObject({ conditions, timingOffset: '0d' });
    const malformed = setup({ ruleFindFirst: ruleRecord({ conditions: { bad: true } }) });
    expect((await malformed.service.getRule('rule-1')).conditions).toEqual([]);
  });
});

describe('AutomationService gym-recipient triggers', () => {
  const stockRule = {
    name: 'Stock low',
    triggerType: 'product_stock_low',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionConfig: { body: 'Restock' },
    active: true,
  } as const;

  it('rejects a non-email action on create and accepts email', async () => {
    const { service, ruleCreate } = setup();
    await expect(service.createRule({ ...stockRule, actionType: 'sms' })).rejects.toThrow(
      'AUTOMATION_ACTION_NOT_ALLOWED_FOR_TRIGGER',
    );
    expect(ruleCreate).not.toHaveBeenCalled();
    await expect(service.createRule({ ...stockRule, actionType: 'email' })).resolves.toMatchObject({
      triggerType: 'product_stock_low',
      actionType: 'email',
    });
  });

  it('checks the merged record when only one field changes', async () => {
    const pushRule = setup({ ruleFindFirst: ruleRecord({ actionType: 'push_notification' }) });
    await expect(
      pushRule.service.updateRule('rule-1', { triggerType: 'product_stock_low' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pushRule.ruleUpdate).not.toHaveBeenCalled();

    const stock = setup({ ruleFindFirst: ruleRecord({ triggerType: 'product_stock_low' }) });
    await expect(stock.service.updateRule('rule-1', { actionType: 'create_task' })).rejects.toThrow(
      'AUTOMATION_ACTION_NOT_ALLOWED_FOR_TRIGGER',
    );
    await expect(stock.service.updateRule('rule-1', { name: 'Renamed' })).resolves.toMatchObject({
      name: 'Renamed',
    });
  });
});
