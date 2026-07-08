import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type {
  CreateCrmActivityResponse,
  CrmForecastResponse,
  CrmPipelineResponse,
  CrmTaskResponse,
  GetLeadResponse,
  GetOpportunityResponse,
  ListLeadsResponse,
  ListOpportunitiesResponse,
  RecentCrmActivitiesResponse,
} from '@fit/types';
import { CrmController } from './crm.controller';
import type { CrmService } from './crm.service';

const leadDetail = (over?: Partial<GetLeadResponse>): GetLeadResponse => ({
  id: 'lead-1',
  firstName: 'Nino',
  lastName: 'Beridze',
  phone: '+995 555 123456',
  email: 'nino@example.com',
  source: 'WALK_IN',
  interest: 'Monthly membership',
  status: 'NEW',
  assignedTo: null,
  location: null,
  followUpDate: null,
  notes: '',
  expectedValue: 12000,
  expectedCloseDate: null,
  probability: 40,
  wonReason: null,
  lostReason: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  activities: [],
  tasks: [],
  ...over,
});

const opportunityDetail = (over?: Partial<GetOpportunityResponse>): GetOpportunityResponse => ({
  id: 'opp-1',
  member: { id: 'gm-1', name: 'Giorgi Maisuradze' },
  type: 'PT_SESSIONS',
  description: '10-pack PT sessions',
  value: 50000,
  probability: 60,
  status: 'INTERESTED',
  assignedTo: null,
  expectedCloseDate: null,
  notes: '',
  wonReason: null,
  lostReason: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  activities: [],
  tasks: [],
  ...over,
});

function setup() {
  const listLeads = vi.fn<() => Promise<ListLeadsResponse>>(() =>
    Promise.resolve({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      counts: { NEW: 0, CONTACTED: 0, TRIAL: 0, CONVERTED: 0, LOST: 0 },
    }),
  );
  const getLead = vi.fn<() => Promise<GetLeadResponse>>(() => Promise.resolve(leadDetail()));
  const createLead = vi.fn<() => Promise<GetLeadResponse>>(() => Promise.resolve(leadDetail()));
  const updateLead = vi.fn<() => Promise<GetLeadResponse>>(() => Promise.resolve(leadDetail()));
  const convertLead = vi.fn<() => Promise<GetLeadResponse>>(() => Promise.resolve(leadDetail()));
  const loseLead = vi.fn<() => Promise<GetLeadResponse>>(() => Promise.resolve(leadDetail()));
  const deleteLead = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const listOpportunities = vi.fn<() => Promise<ListOpportunitiesResponse>>(() =>
    Promise.resolve({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      counts: { INTERESTED: 0, PROPOSAL_SENT: 0, DECISION_PENDING: 0, WON: 0, LOST: 0 },
    }),
  );
  const getOpportunity = vi.fn<() => Promise<GetOpportunityResponse>>(() =>
    Promise.resolve(opportunityDetail()),
  );
  const createOpportunity = vi.fn<() => Promise<GetOpportunityResponse>>(() =>
    Promise.resolve(opportunityDetail()),
  );
  const updateOpportunity = vi.fn<() => Promise<GetOpportunityResponse>>(() =>
    Promise.resolve(opportunityDetail()),
  );
  const winOpportunity = vi.fn<() => Promise<GetOpportunityResponse>>(() =>
    Promise.resolve(opportunityDetail()),
  );
  const loseOpportunity = vi.fn<() => Promise<GetOpportunityResponse>>(() =>
    Promise.resolve(opportunityDetail()),
  );
  const deleteOpportunity = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const logActivity = vi.fn<() => Promise<CreateCrmActivityResponse>>(() =>
    Promise.resolve({
      activity: {
        id: 'act-1',
        leadId: 'lead-1',
        opportunityId: null,
        type: 'CALL',
        staffUserId: 'u-1',
        staffName: 'Staff',
        notes: '',
        occurredAt: '2026-07-01T00:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    }),
  );
  const recentActivities = vi.fn<() => Promise<RecentCrmActivitiesResponse>>(() =>
    Promise.resolve({ data: [] }),
  );
  const createTask = vi.fn<() => Promise<CrmTaskResponse>>(() =>
    Promise.resolve({
      task: {
        id: 'task-1',
        leadId: 'lead-1',
        opportunityId: null,
        title: 'Call back',
        completed: false,
        dueDate: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    }),
  );
  const updateTask = vi.fn<() => Promise<CrmTaskResponse>>(() =>
    Promise.resolve({
      task: {
        id: 'task-1',
        leadId: 'lead-1',
        opportunityId: null,
        title: 'Call back',
        completed: true,
        dueDate: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    }),
  );
  const deleteTask = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const pipeline = vi.fn<() => Promise<CrmPipelineResponse>>(() =>
    Promise.resolve({
      stages: [],
      totals: {
        openLeads: 0,
        openOpportunities: 0,
        pipelineValue: 0,
        weightedValue: 0,
        winRate: 0,
      },
    }),
  );
  const forecast = vi.fn<() => Promise<CrmForecastResponse>>(() =>
    Promise.resolve({
      months: [],
      unscheduled: { deals: 0, expected: 0, potential: 0 },
      totals: { deals: 0, expected: 0, potential: 0 },
    }),
  );

  const service = {
    listLeads,
    getLead,
    createLead,
    updateLead,
    convertLead,
    loseLead,
    deleteLead,
    listOpportunities,
    getOpportunity,
    createOpportunity,
    updateOpportunity,
    winOpportunity,
    loseOpportunity,
    deleteOpportunity,
    logActivity,
    recentActivities,
    createTask,
    updateTask,
    deleteTask,
    pipeline,
    forecast,
  } as unknown as CrmService;

  return {
    controller: new CrmController(service),
    listLeads,
    getLead,
    createLead,
    updateLead,
    convertLead,
    loseLead,
    deleteLead,
    listOpportunities,
    createOpportunity,
    updateOpportunity,
    winOpportunity,
    loseOpportunity,
    logActivity,
    recentActivities,
    createTask,
    updateTask,
    deleteTask,
    pipeline,
    forecast,
  };
}

describe('CrmController', () => {
  let ctx: ReturnType<typeof setup>;
  afterEach(() => vi.clearAllMocks());

  describe('GET /crm/leads', () => {
    it('parses + defaults the query and delegates to the service', async () => {
      ctx = setup();
      await ctx.controller.listLeads({ search: 'nino', status: 'NEW' });

      expect(ctx.listLeads).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'nino',
          status: 'NEW',
          page: 1,
          limit: 20,
          sort: 'createdAt',
          dir: 'desc',
        }),
      );
    });

    it('rejects a non-numeric page with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.listLeads({ page: 'abc' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listLeads).not.toHaveBeenCalled();
    });

    it('rejects an unknown status with 400', async () => {
      ctx = setup();
      const error = await ctx.controller.listLeads({ status: 'SOMEDAY' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listLeads).not.toHaveBeenCalled();
    });
  });

  describe('POST /crm/leads', () => {
    it('validates + defaults the body before delegating', async () => {
      ctx = setup();
      await ctx.controller.createLead({
        firstName: '  Nino ',
        lastName: 'Beridze',
        source: 'INSTAGRAM',
      });

      // Name trimmed; optional fields defaulted so the service sees a full shape.
      expect(ctx.createLead).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Nino',
          lastName: 'Beridze',
          source: 'INSTAGRAM',
          phone: '',
          email: '',
          notes: '',
          expectedValue: 0,
          probability: 0,
        }),
      );
    });

    it('rejects a missing source with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller
        .createLead({ firstName: 'Nino', lastName: 'Beridze' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createLead).not.toHaveBeenCalled();
    });

    it('rejects an out-of-range probability with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .createLead({ firstName: 'Nino', lastName: 'Beridze', source: 'WALK_IN', probability: 150 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createLead).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /crm/leads/:id', () => {
    it('forwards open-stage status moves', async () => {
      ctx = setup();
      await ctx.controller.updateLead('lead-1', { status: 'CONTACTED' });

      expect(ctx.updateLead).toHaveBeenCalledWith(
        'lead-1',
        expect.objectContaining({ status: 'CONTACTED' }),
      );
    });

    it('rejects closing via PATCH — CONVERTED/LOST must go through the transitions', async () => {
      ctx = setup();
      const error = await ctx.controller
        .updateLead('lead-1', { status: 'CONVERTED' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.updateLead).not.toHaveBeenCalled();
    });
  });

  describe('lead close transitions', () => {
    it('converts with an empty body (win reason optional)', async () => {
      ctx = setup();
      await ctx.controller.convertLead('lead-1', undefined);

      expect(ctx.convertLead).toHaveBeenCalledWith('lead-1', { reason: '' });
    });

    it('requires a reason to mark a lead lost', async () => {
      ctx = setup();
      const error = await ctx.controller.loseLead('lead-1', {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.loseLead).not.toHaveBeenCalled();
    });

    it('forwards the loss reason', async () => {
      ctx = setup();
      await ctx.controller.loseLead('lead-1', { reason: 'Joined a competitor' });

      expect(ctx.loseLead).toHaveBeenCalledWith('lead-1', { reason: 'Joined a competitor' });
    });
  });

  describe('POST /crm/opportunities', () => {
    it('validates + defaults the body before delegating', async () => {
      ctx = setup();
      await ctx.controller.createOpportunity({ memberId: 'gm-1', type: 'PT_SESSIONS' });

      expect(ctx.createOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({
          memberId: 'gm-1',
          type: 'PT_SESSIONS',
          description: '',
          value: 0,
          probability: 0,
        }),
      );
    });

    it('rejects a missing memberId with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller
        .createOpportunity({ type: 'PT_SESSIONS' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createOpportunity).not.toHaveBeenCalled();
    });
  });

  describe('opportunity close transitions', () => {
    it('wins with an optional reason', async () => {
      ctx = setup();
      await ctx.controller.winOpportunity('opp-1', { reason: 'Upgraded after trial' });

      expect(ctx.winOpportunity).toHaveBeenCalledWith('opp-1', { reason: 'Upgraded after trial' });
    });

    it('requires a reason to mark an opportunity lost', async () => {
      ctx = setup();
      const error = await ctx.controller
        .loseOpportunity('opp-1', { reason: '' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.loseOpportunity).not.toHaveBeenCalled();
    });

    it('rejects closing via PATCH — WON/LOST must go through the transitions', async () => {
      ctx = setup();
      const error = await ctx.controller
        .updateOpportunity('opp-1', { status: 'WON' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.updateOpportunity).not.toHaveBeenCalled();
    });
  });

  describe('POST /crm/activities', () => {
    it('accepts exactly one parent and forwards the payload', async () => {
      ctx = setup();
      await ctx.controller.logActivity({ leadId: 'lead-1', type: 'CALL', notes: 'Spoke briefly' });

      expect(ctx.logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ leadId: 'lead-1', type: 'CALL', notes: 'Spoke briefly' }),
      );
    });

    it('rejects both parents with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .logActivity({ leadId: 'lead-1', opportunityId: 'opp-1', type: 'CALL' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.logActivity).not.toHaveBeenCalled();
    });

    it('rejects no parent with 400', async () => {
      ctx = setup();
      const error = await ctx.controller.logActivity({ type: 'CALL' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.logActivity).not.toHaveBeenCalled();
    });

    it('rejects the reserved TASK_COMPLETED type with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .logActivity({ leadId: 'lead-1', type: 'TASK_COMPLETED' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.logActivity).not.toHaveBeenCalled();
    });
  });

  describe('GET /crm/activities/recent', () => {
    it('defaults the limit and delegates', async () => {
      ctx = setup();
      await ctx.controller.recentActivities({});

      expect(ctx.recentActivities).toHaveBeenCalledWith({ limit: 20 });
    });

    it('caps the limit at 50', async () => {
      ctx = setup();
      const error = await ctx.controller
        .recentActivities({ limit: '500' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.recentActivities).not.toHaveBeenCalled();
    });
  });

  describe('CRM tasks', () => {
    it('creates a task on exactly one parent', async () => {
      ctx = setup();
      await ctx.controller.createTask({ opportunityId: 'opp-1', title: 'Send proposal' });

      expect(ctx.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ opportunityId: 'opp-1', title: 'Send proposal' }),
      );
    });

    it('rejects a task with both parents', async () => {
      ctx = setup();
      const error = await ctx.controller
        .createTask({ leadId: 'lead-1', opportunityId: 'opp-1', title: 'Send proposal' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createTask).not.toHaveBeenCalled();
    });

    it('forwards a completion flip', async () => {
      ctx = setup();
      await ctx.controller.updateTask('task-1', { completed: true });

      expect(ctx.updateTask).toHaveBeenCalledWith('task-1', { completed: true });
    });

    it('forwards a delete', async () => {
      ctx = setup();
      await ctx.controller.deleteTask('task-1');

      expect(ctx.deleteTask).toHaveBeenCalledWith('task-1');
    });
  });

  describe('aggregations', () => {
    it('delegates the pipeline read', async () => {
      ctx = setup();
      await ctx.controller.pipeline();

      expect(ctx.pipeline).toHaveBeenCalled();
    });

    it('delegates the forecast read', async () => {
      ctx = setup();
      await ctx.controller.forecast();

      expect(ctx.forecast).toHaveBeenCalled();
    });
  });
});
