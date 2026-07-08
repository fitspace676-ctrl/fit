import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrmService } from './crm.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** A lead row as the service's `LEAD_SELECT` projects it. */
function leadRecord(over?: Record<string, unknown>) {
  return {
    id: 'lead-1',
    firstName: 'Nino',
    lastName: 'Beridze',
    phone: '+995 555 123456',
    email: 'nino@example.com',
    source: 'WALK_IN',
    interest: 'Monthly membership',
    status: 'NEW',
    followUpDate: null,
    notes: '',
    expectedValue: 12000,
    expectedCloseDate: null,
    probability: 40,
    wonReason: null,
    lostReason: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    assignedTo: null,
    location: null,
    ...over,
  };
}

/** An opportunity row as the service's `OPPORTUNITY_SELECT` projects it. */
function opportunityRecord(over?: Record<string, unknown>) {
  return {
    id: 'opp-1',
    type: 'PT_SESSIONS',
    description: '10-pack PT sessions',
    value: 50000,
    probability: 60,
    status: 'INTERESTED',
    expectedCloseDate: null,
    notes: '',
    wonReason: null,
    lostReason: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    member: { id: 'gm-1', user: { name: 'Giorgi Maisuradze', email: 'giorgi@example.com' } },
    assignedTo: null,
    ...over,
  };
}

interface AnyArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

function setup(overrides?: {
  leadFindMany?: unknown[];
  leadFindFirst?: unknown;
  leadGroupBy?: unknown[];
  leadCount?: number;
  oppFindMany?: unknown[];
  oppFindFirst?: unknown;
  oppGroupBy?: unknown[];
  gymMemberFindFirst?: { id: string } | null;
  locationFindFirst?: { id: string } | null;
  user?: { name: string | null; email: string } | null;
  taskFindFirst?: unknown;
  activityFindMany?: unknown[];
}) {
  const leadFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.leadFindMany ?? []),
  );
  const leadFindFirst = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.leadFindFirst ?? null),
  );
  const leadCount = vi.fn<(args: AnyArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.leadCount ?? 0),
  );
  const leadGroupBy = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.leadGroupBy ?? []),
  );
  const leadCreate = vi.fn<(args: AnyArgs) => Promise<unknown>>((args) =>
    Promise.resolve(leadRecord(args.data)),
  );
  const leadUpdate = vi.fn<(args: AnyArgs) => Promise<unknown>>((args) =>
    Promise.resolve(leadRecord(args.data)),
  );
  const leadDelete = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(leadRecord()),
  );

  const oppFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.oppFindMany ?? []),
  );
  const oppFindFirst = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.oppFindFirst ?? null),
  );
  const oppCount = vi.fn<(args: AnyArgs) => Promise<number>>(() => Promise.resolve(0));
  const oppGroupBy = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.oppGroupBy ?? []),
  );
  const oppCreate = vi.fn<(args: AnyArgs) => Promise<unknown>>((args) =>
    Promise.resolve(opportunityRecord(args.data)),
  );
  const oppUpdate = vi.fn<(args: AnyArgs) => Promise<unknown>>((args) =>
    Promise.resolve(opportunityRecord(args.data)),
  );
  const oppDelete = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(opportunityRecord()),
  );

  const activityFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.activityFindMany ?? []),
  );
  const activityCreate = vi.fn<(args: AnyArgs) => Promise<unknown>>((args) =>
    Promise.resolve({
      id: 'act-new',
      leadId: (args.data?.leadId as string | null) ?? null,
      opportunityId: (args.data?.opportunityId as string | null) ?? null,
      type: args.data?.type ?? 'CALL',
      staffUserId: (args.data?.staffUserId as string | null) ?? null,
      staffName: args.data?.staffName ?? 'Staff',
      notes: args.data?.notes ?? '',
      occurredAt: new Date('2026-07-02T00:00:00.000Z'),
      createdAt: new Date('2026-07-02T00:00:00.000Z'),
    }),
  );

  const taskFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() => Promise.resolve([]));
  const taskFindFirst = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.taskFindFirst ?? null),
  );
  const taskCreate = vi.fn<(args: AnyArgs) => Promise<unknown>>((args) =>
    Promise.resolve({
      id: 'task-new',
      leadId: (args.data?.leadId as string | null) ?? null,
      opportunityId: (args.data?.opportunityId as string | null) ?? null,
      title: args.data?.title ?? '',
      completed: false,
      dueDate: null,
      createdAt: new Date('2026-07-02T00:00:00.000Z'),
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    }),
  );
  const taskUpdate = vi.fn<(args: AnyArgs) => Promise<unknown>>((args) =>
    Promise.resolve({
      id: 'task-1',
      leadId: 'lead-1',
      opportunityId: null,
      title: 'Call back',
      completed: (args.data?.completed as boolean | undefined) ?? false,
      dueDate: null,
      createdAt: new Date('2026-07-02T00:00:00.000Z'),
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    }),
  );
  const taskDelete = vi.fn<(args: AnyArgs) => Promise<unknown>>(() => Promise.resolve({}));

  const gymMemberFindFirst = vi.fn<(args: AnyArgs) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(overrides?.gymMemberFindFirst ?? null),
  );
  const locationFindFirst = vi.fn<(args: AnyArgs) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(overrides?.locationFindFirst ?? null),
  );
  const userFindUnique = vi.fn<
    (args: AnyArgs) => Promise<{ name: string | null; email: string } | null>
  >(() => Promise.resolve(overrides?.user ?? null));

  const client = {
    lead: {
      findMany: leadFindMany,
      findFirst: leadFindFirst,
      count: leadCount,
      groupBy: leadGroupBy,
      create: leadCreate,
      update: leadUpdate,
      delete: leadDelete,
    },
    opportunity: {
      findMany: oppFindMany,
      findFirst: oppFindFirst,
      count: oppCount,
      groupBy: oppGroupBy,
      create: oppCreate,
      update: oppUpdate,
      delete: oppDelete,
    },
    crmActivity: { findMany: activityFindMany, create: activityCreate },
    crmTask: {
      findMany: taskFindMany,
      findFirst: taskFindFirst,
      create: taskCreate,
      update: taskUpdate,
      delete: taskDelete,
    },
    gymMember: { findFirst: gymMemberFindFirst },
    location: { findFirst: locationFindFirst },
    user: { findUnique: userFindUnique },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'u-1' } as unknown as TenantContext;

  return {
    service: new CrmService(prisma, tenant),
    leadFindMany,
    leadFindFirst,
    leadGroupBy,
    leadCreate,
    leadUpdate,
    leadDelete,
    oppFindMany,
    oppFindFirst,
    oppCreate,
    oppUpdate,
    activityFindMany,
    activityCreate,
    taskFindFirst,
    taskCreate,
    taskUpdate,
    taskDelete,
    gymMemberFindFirst,
    locationFindFirst,
    userFindUnique,
  };
}

describe('CrmService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listLeads', () => {
    it('applies filters + search to the page but keeps the tab counts status-free', async () => {
      const ctx = setup();
      await ctx.service.listLeads({
        page: 2,
        limit: 10,
        search: 'nino',
        status: 'NEW',
        source: 'INSTAGRAM',
        sort: 'createdAt',
        dir: 'desc',
      });

      const findArgs = ctx.leadFindMany.mock.calls[0]?.[0];
      expect(findArgs?.where).toMatchObject({ status: 'NEW', source: 'INSTAGRAM' });
      expect(findArgs?.skip).toBe(10);
      expect(findArgs?.take).toBe(10);

      // The groupBy powering the tab badges keeps every filter except `status`.
      const groupArgs = ctx.leadGroupBy.mock.calls[0]?.[0];
      expect(groupArgs?.where).toMatchObject({ source: 'INSTAGRAM' });
      expect((groupArgs?.where as Record<string, unknown>).status).toBeUndefined();
    });

    it('zero-fills the per-status counts', async () => {
      const ctx = setup({
        leadGroupBy: [{ status: 'NEW', _count: { _all: 3 } }],
      });
      const result = await ctx.service.listLeads({
        page: 1,
        limit: 20,
        sort: 'createdAt',
        dir: 'desc',
      });

      expect(result.counts).toEqual({ NEW: 3, CONTACTED: 0, TRIAL: 0, CONVERTED: 0, LOST: 0 });
    });
  });

  describe('lead lifecycle', () => {
    it('404s an unknown / cross-tenant lead', async () => {
      const ctx = setup({ leadFindFirst: null });
      const error = await ctx.service.getLead('nope').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
    });

    it('rejects an assignee who is not a member of the gym with 400', async () => {
      const ctx = setup({ gymMemberFindFirst: null });
      const error = await ctx.service
        .createLead({
          firstName: 'Nino',
          lastName: 'Beridze',
          phone: '',
          email: '',
          source: 'WALK_IN',
          interest: '',
          assignedToId: 'u-stranger',
          notes: '',
          expectedValue: 0,
          probability: 0,
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.leadCreate).not.toHaveBeenCalled();
    });

    it('persists the win reason on convert and clears any loss reason', async () => {
      const ctx = setup({ leadFindFirst: leadRecord() });
      await ctx.service.convertLead('lead-1', { reason: 'Signed annual plan' });

      expect(ctx.leadUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: { status: 'CONVERTED', wonReason: 'Signed annual plan', lostReason: null },
        }),
      );
    });

    it('persists the loss reason on lose and clears any win reason', async () => {
      const ctx = setup({ leadFindFirst: leadRecord() });
      await ctx.service.loseLead('lead-1', { reason: 'Too expensive' });

      expect(ctx.leadUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'LOST', lostReason: 'Too expensive', wonReason: null },
        }),
      );
    });
  });

  describe('opportunities', () => {
    it('404s a create against an unknown / cross-tenant member', async () => {
      const ctx = setup({ gymMemberFindFirst: null });
      const error = await ctx.service
        .createOpportunity({
          memberId: 'gm-nope',
          type: 'PT_SESSIONS',
          description: '',
          value: 0,
          probability: 0,
          notes: '',
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(ctx.oppCreate).not.toHaveBeenCalled();
    });

    it('persists the win reason on won', async () => {
      const ctx = setup({ oppFindFirst: opportunityRecord() });
      await ctx.service.winOpportunity('opp-1', { reason: 'Loved the trial session' });

      expect(ctx.oppUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'WON', wonReason: 'Loved the trial session', lostReason: null },
        }),
      );
    });

    it('stores an empty win reason as null', async () => {
      const ctx = setup({ oppFindFirst: opportunityRecord() });
      await ctx.service.winOpportunity('opp-1', { reason: '' });

      expect(ctx.oppUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'WON', wonReason: null, lostReason: null },
        }),
      );
    });
  });

  describe('activities', () => {
    it('404s a log against an unknown lead', async () => {
      const ctx = setup({ leadFindFirst: null });
      const error = await ctx.service
        .logActivity({ leadId: 'nope', type: 'CALL', notes: '' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(ctx.activityCreate).not.toHaveBeenCalled();
    });

    it('snapshots the acting staff member from the session, never the body', async () => {
      const ctx = setup({
        leadFindFirst: leadRecord(),
        user: { name: 'Tamar K.', email: 'tamar@gym.ge' },
      });
      await ctx.service.logActivity({ leadId: 'lead-1', type: 'CALL', notes: 'Spoke briefly' });

      expect(ctx.userFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u-1' } }),
      );
      const createArgs = ctx.activityCreate.mock.calls[0]?.[0];
      expect(createArgs?.data).toMatchObject({ staffUserId: 'u-1', staffName: 'Tamar K.' });
    });
  });

  describe('tasks', () => {
    it('logs a TASK_COMPLETED activity on the first completion flip', async () => {
      const ctx = setup({
        taskFindFirst: {
          id: 'task-1',
          leadId: 'lead-1',
          opportunityId: null,
          title: 'Call back',
          completed: false,
          dueDate: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        user: { name: 'Tamar K.', email: 'tamar@gym.ge' },
      });
      await ctx.service.updateTask('task-1', { completed: true });

      const createArgs = ctx.activityCreate.mock.calls[0]?.[0];
      expect(createArgs?.data).toMatchObject({
        type: 'TASK_COMPLETED',
        leadId: 'lead-1',
        notes: 'Call back',
      });
    });

    it('does not re-log when the task was already completed', async () => {
      const ctx = setup({
        taskFindFirst: {
          id: 'task-1',
          leadId: 'lead-1',
          opportunityId: null,
          title: 'Call back',
          completed: true,
          dueDate: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await ctx.service.updateTask('task-1', { completed: true });

      expect(ctx.activityCreate).not.toHaveBeenCalled();
    });

    it('404s an unknown task', async () => {
      const ctx = setup({ taskFindFirst: null });
      const error = await ctx.service
        .updateTask('nope', { completed: true })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('pipeline', () => {
    it('aggregates per-stage counts, values, weighted values, and the win rate', async () => {
      const ctx = setup({
        leadFindMany: [
          { status: 'NEW', expectedValue: 10000, probability: 50 },
          { status: 'NEW', expectedValue: 20000, probability: 25 },
          { status: 'TRIAL', expectedValue: 30000, probability: 80 },
        ],
        oppFindMany: [{ status: 'INTERESTED', value: 40000, probability: 10 }],
        // 3 converted + 1 lost lead, 1 won + 1 lost opportunity → 4 wins / 6 closed.
        leadGroupBy: [
          { status: 'CONVERTED', _count: { _all: 3 } },
          { status: 'LOST', _count: { _all: 1 } },
        ],
        oppGroupBy: [
          { status: 'WON', _count: { _all: 1 } },
          { status: 'LOST', _count: { _all: 1 } },
        ],
      });
      const result = await ctx.service.pipeline();

      const newStage = result.stages.find((s) => s.stage === 'NEW');
      // 10000×50% + 20000×25% = 5000 + 5000.
      expect(newStage).toMatchObject({
        kind: 'LEAD',
        count: 2,
        value: 30000,
        weightedValue: 10000,
      });

      const interested = result.stages.find((s) => s.stage === 'INTERESTED');
      expect(interested).toMatchObject({
        kind: 'OPPORTUNITY',
        count: 1,
        value: 40000,
        weightedValue: 4000,
      });

      expect(result.totals.openLeads).toBe(3);
      expect(result.totals.openOpportunities).toBe(1);
      // 30000 + 30000 + 40000 open value across every stage.
      expect(result.totals.pipelineValue).toBe(100000);
      // 10000 (NEW) + 24000 (TRIAL) + 4000 (INTERESTED).
      expect(result.totals.weightedValue).toBe(38000);
      // 4 wins over 6 closed → 67%.
      expect(result.totals.winRate).toBe(67);
    });

    it('reports a zero win rate when nothing has closed', async () => {
      const ctx = setup();
      const result = await ctx.service.pipeline();

      expect(result.totals.winRate).toBe(0);
    });
  });

  describe('forecast', () => {
    it('buckets open deals by close month with an unscheduled bucket', async () => {
      const ctx = setup({
        leadFindMany: [
          {
            expectedValue: 10000,
            probability: 50,
            expectedCloseDate: new Date('2026-08-15T00:00:00.000Z'),
          },
          { expectedValue: 5000, probability: 20, expectedCloseDate: null },
        ],
        oppFindMany: [
          {
            value: 40000,
            probability: 25,
            expectedCloseDate: new Date('2026-08-01T00:00:00.000Z'),
          },
          {
            value: 20000,
            probability: 10,
            expectedCloseDate: new Date('2026-07-20T00:00:00.000Z'),
          },
        ],
      });
      const result = await ctx.service.forecast();

      // Months ascending: July before August.
      expect(result.months.map((m) => m.month)).toEqual(['2026-07', '2026-08']);
      expect(result.months[1]).toEqual({
        month: '2026-08',
        // 10000×50% + 40000×25% = 5000 + 10000.
        expected: 15000,
        potential: 50000,
        deals: 2,
      });
      expect(result.unscheduled).toEqual({ deals: 1, expected: 1000, potential: 5000 });
      expect(result.totals).toEqual({ deals: 4, expected: 18000, potential: 75000 });
    });
  });
});
