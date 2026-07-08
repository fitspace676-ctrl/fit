import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CrmActivityType, LeadStatus, OpportunityStatus, Prisma } from '@fit/db';
import type {
  CreateCrmActivityInput,
  CreateCrmActivityResponse,
  CreateCrmTaskInput,
  CreateLeadInput,
  CreateOpportunityInput,
  CrmActivityEntry,
  CrmForecastResponse,
  CrmPipelineResponse,
  CrmPipelineStage,
  CrmRecentActivity,
  CrmRef,
  CrmTaskEntry,
  CrmTaskResponse,
  GetLeadResponse,
  GetOpportunityResponse,
  LeadRow,
  LeadStatusCounts,
  ListLeadsQuery,
  ListLeadsResponse,
  ListOpportunitiesQuery,
  ListOpportunitiesResponse,
  MarkLostInput,
  MarkWonInput,
  OpportunityRow,
  OpportunityStatusCounts,
  RecentCrmActivitiesQuery,
  RecentCrmActivitiesResponse,
  UpdateCrmTaskInput,
  UpdateLeadInput,
  UpdateOpportunityInput,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The lead stages that still sit in the funnel (not closed). */
const OPEN_LEAD_STATUSES = [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.TRIAL] as const;

/** The opportunity stages that still sit in the funnel (not closed). */
const OPEN_OPPORTUNITY_STATUSES = [
  OpportunityStatus.INTERESTED,
  OpportunityStatus.PROPOSAL_SENT,
  OpportunityStatus.DECISION_PENDING,
] as const;

/** How many timeline rows a lead/opportunity detail carries. */
const DETAIL_ACTIVITY_LIMIT = 50;

/** The `(id, name, email)` slice of a `User` a CRM ref is resolved from. */
const USER_REF_SELECT = { id: true, name: true, email: true } satisfies Prisma.UserSelect;

/**
 * Shape the lead queries select — the lead's own columns plus the resolved
 * `assignedTo` staff user and `location` branch refs. Deliberately narrow on
 * the joined `User`: only name/email for the display ref, never auth fields.
 */
const LEAD_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  source: true,
  interest: true,
  status: true,
  followUpDate: true,
  notes: true,
  expectedValue: true,
  expectedCloseDate: true,
  probability: true,
  wonReason: true,
  lostReason: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: USER_REF_SELECT },
  location: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

/** Shape the opportunity queries select — see {@link LEAD_SELECT}. */
const OPPORTUNITY_SELECT = {
  id: true,
  type: true,
  description: true,
  value: true,
  probability: true,
  status: true,
  expectedCloseDate: true,
  notes: true,
  wonReason: true,
  lostReason: true,
  createdAt: true,
  updatedAt: true,
  member: { select: { id: true, user: { select: { name: true, email: true } } } },
  assignedTo: { select: USER_REF_SELECT },
} satisfies Prisma.OpportunitySelect;

/** Shape every activity read selects — exactly the wire `CrmActivityEntry`. */
const ACTIVITY_SELECT = {
  id: true,
  leadId: true,
  opportunityId: true,
  type: true,
  staffUserId: true,
  staffName: true,
  notes: true,
  occurredAt: true,
  createdAt: true,
} satisfies Prisma.CrmActivitySelect;

/** Shape every task read selects — exactly the wire `CrmTaskEntry`. */
const TASK_SELECT = {
  id: true,
  leadId: true,
  opportunityId: true,
  title: true,
  completed: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CrmTaskSelect;

type LeadRecord = Prisma.LeadGetPayload<{ select: typeof LEAD_SELECT }>;
type OpportunityRecord = Prisma.OpportunityGetPayload<{ select: typeof OPPORTUNITY_SELECT }>;
type ActivityRecord = Prisma.CrmActivityGetPayload<{ select: typeof ACTIVITY_SELECT }>;
type TaskRecord = Prisma.CrmTaskGetPayload<{ select: typeof TASK_SELECT }>;

/** A person/branch ref from a nullable joined row — name falls back to email. */
function toRef(row: { id: string; name: string | null; email?: string } | null): CrmRef | null {
  if (!row) return null;
  return { id: row.id, name: row.name ?? row.email ?? '' };
}

/** A deal's probability-weighted value, rounded to a whole minor unit. */
function weighted(value: number, probability: number): number {
  return Math.round((value * probability) / 100);
}

/** `YYYY-MM` bucket of a close date (UTC), the forecast's month key. */
function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * CRM backend (T12.2) — leads, upsell opportunities, their activity timelines
 * and follow-up tasks, plus the pipeline / revenue-forecast aggregations the
 * `/crm` dashboard renders. Ported from the gym-admin prototype's mock-array
 * CRM into real gym-scoped tables.
 *
 * Every query runs on the tenant-scoped Prisma client (all four models are in
 * `TENANT_SCOPED_MODELS`), so no method passes or trusts a `gymId` — another
 * gym's pipeline is unreachable by construction. The acting staff member on an
 * activity is resolved from the session, never from the body.
 */
@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  // -------------------------------------------------------------------------
  // Leads
  // -------------------------------------------------------------------------

  /**
   * One filtered, paginated page of the gym's leads plus per-status counts for
   * the board's tab badges. The counts honour every filter except `status`
   * itself, so switching tabs never changes the badge numbers.
   */
  async listLeads(query: ListLeadsQuery): Promise<ListLeadsResponse> {
    const base: Prisma.LeadWhereInput = {
      ...(query.source ? { source: query.source } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const where: Prisma.LeadWhereInput = {
      ...base,
      ...(query.status ? { status: query.status } : {}),
    };

    const orderBy: Prisma.LeadOrderByWithRelationInput[] =
      query.sort === 'name'
        ? [{ firstName: query.dir }, { lastName: query.dir }]
        : query.sort === 'createdAt'
          ? [{ createdAt: query.dir }]
          : [{ [query.sort]: { sort: query.dir, nulls: 'last' } }];

    const [rows, total, grouped] = await Promise.all([
      this.prisma.client.lead.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: LEAD_SELECT,
      }),
      this.prisma.client.lead.count({ where }),
      this.prisma.client.lead.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);

    const counts: LeadStatusCounts = { NEW: 0, CONTACTED: 0, TRIAL: 0, CONVERTED: 0, LOST: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;

    return {
      data: rows.map((r) => this.toLeadRow(r)),
      total,
      page: query.page,
      limit: query.limit,
      counts,
    };
  }

  /** One lead's detail — the row plus its timeline and tasks. 404s on a miss. */
  async getLead(id: string): Promise<GetLeadResponse> {
    const lead = await this.requireLead(id);
    return this.leadDetail(lead);
  }

  /** Create a lead (status starts `NEW`). Validates the assignee + branch refs. */
  async createLead(input: CreateLeadInput): Promise<GetLeadResponse> {
    await this.requireAssignee(input.assignedToId);
    await this.requireLocation(input.locationId);
    const created = await this.prisma.client.lead.create({
      data: {
        gymId: this.tenant.gymId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email,
        source: input.source,
        interest: input.interest,
        assignedToId: input.assignedToId ?? null,
        locationId: input.locationId ?? null,
        followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
        notes: input.notes,
        expectedValue: input.expectedValue,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
        probability: input.probability,
      },
      select: LEAD_SELECT,
    });
    return this.leadDetail(created);
  }

  /** Edit a lead's editable fields / open-stage status. 404s on a miss. */
  async updateLead(id: string, input: UpdateLeadInput): Promise<GetLeadResponse> {
    await this.requireLead(id);
    if (input.assignedToId != null) await this.requireAssignee(input.assignedToId);
    if (input.locationId != null) await this.requireLocation(input.locationId);
    const updated = await this.prisma.client.lead.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.interest !== undefined ? { interest: input.interest } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
        ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.followUpDate !== undefined
          ? { followUpDate: input.followUpDate ? new Date(input.followUpDate) : null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.expectedValue !== undefined ? { expectedValue: input.expectedValue } : {}),
        ...(input.expectedCloseDate !== undefined
          ? {
              expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
            }
          : {}),
        ...(input.probability !== undefined ? { probability: input.probability } : {}),
      },
      select: LEAD_SELECT,
    });
    return this.leadDetail(updated);
  }

  /**
   * Close a lead as `CONVERTED` (they became a member), persisting the win
   * reason. The opposing `lostReason` is cleared so a closed lead carries
   * exactly one closing story.
   */
  async convertLead(id: string, input: MarkWonInput): Promise<GetLeadResponse> {
    await this.requireLead(id);
    const updated = await this.prisma.client.lead.update({
      where: { id },
      data: { status: LeadStatus.CONVERTED, wonReason: input.reason || null, lostReason: null },
      select: LEAD_SELECT,
    });
    return this.leadDetail(updated);
  }

  /** Close a lead as `LOST`, persisting the (required) loss reason. */
  async loseLead(id: string, input: MarkLostInput): Promise<GetLeadResponse> {
    await this.requireLead(id);
    const updated = await this.prisma.client.lead.update({
      where: { id },
      data: { status: LeadStatus.LOST, lostReason: input.reason, wonReason: null },
      select: LEAD_SELECT,
    });
    return this.leadDetail(updated);
  }

  /** Delete a lead (its activities/tasks cascade). 404s on a miss. */
  async deleteLead(id: string): Promise<void> {
    await this.requireLead(id);
    await this.prisma.client.lead.delete({ where: { id } });
  }

  // -------------------------------------------------------------------------
  // Opportunities
  // -------------------------------------------------------------------------

  /** One filtered, paginated page of opportunities plus per-status counts. */
  async listOpportunities(query: ListOpportunitiesQuery): Promise<ListOpportunitiesResponse> {
    const base: Prisma.OpportunityWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.memberId ? { memberId: query.memberId } : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' } },
              { member: { user: { name: { contains: query.search, mode: 'insensitive' } } } },
              { member: { user: { email: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const where: Prisma.OpportunityWhereInput = {
      ...base,
      ...(query.status ? { status: query.status } : {}),
    };

    const orderBy: Prisma.OpportunityOrderByWithRelationInput[] =
      query.sort === 'expectedCloseDate'
        ? [{ expectedCloseDate: { sort: query.dir, nulls: 'last' } }]
        : [{ [query.sort]: query.dir }];

    const [rows, total, grouped] = await Promise.all([
      this.prisma.client.opportunity.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: OPPORTUNITY_SELECT,
      }),
      this.prisma.client.opportunity.count({ where }),
      this.prisma.client.opportunity.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      }),
    ]);

    const counts: OpportunityStatusCounts = {
      INTERESTED: 0,
      PROPOSAL_SENT: 0,
      DECISION_PENDING: 0,
      WON: 0,
      LOST: 0,
    };
    for (const g of grouped) counts[g.status] = g._count._all;

    return {
      data: rows.map((r) => this.toOpportunityRow(r)),
      total,
      page: query.page,
      limit: query.limit,
      counts,
    };
  }

  /** One opportunity's detail — the row plus timeline and tasks. 404s on a miss. */
  async getOpportunity(id: string): Promise<GetOpportunityResponse> {
    const opportunity = await this.requireOpportunity(id);
    return this.opportunityDetail(opportunity);
  }

  /**
   * Create an opportunity on an existing gym member (status starts
   * `INTERESTED`). An unknown / cross-tenant `memberId` is a
   * `404 MEMBER_NOT_FOUND`, matching the members module.
   */
  async createOpportunity(input: CreateOpportunityInput): Promise<GetOpportunityResponse> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id: input.memberId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }
    await this.requireAssignee(input.assignedToId);
    const created = await this.prisma.client.opportunity.create({
      data: {
        gymId: this.tenant.gymId,
        memberId: input.memberId,
        type: input.type,
        description: input.description,
        value: input.value,
        probability: input.probability,
        assignedToId: input.assignedToId ?? null,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
        notes: input.notes,
      },
      select: OPPORTUNITY_SELECT,
    });
    return this.opportunityDetail(created);
  }

  /** Edit an opportunity's editable fields / open-stage status. 404s on a miss. */
  async updateOpportunity(
    id: string,
    input: UpdateOpportunityInput,
  ): Promise<GetOpportunityResponse> {
    await this.requireOpportunity(id);
    if (input.assignedToId != null) await this.requireAssignee(input.assignedToId);
    const updated = await this.prisma.client.opportunity.update({
      where: { id },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.probability !== undefined ? { probability: input.probability } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
        ...(input.expectedCloseDate !== undefined
          ? {
              expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
            }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      select: OPPORTUNITY_SELECT,
    });
    return this.opportunityDetail(updated);
  }

  /** Close an opportunity as `WON`, persisting the (optional) win reason. */
  async winOpportunity(id: string, input: MarkWonInput): Promise<GetOpportunityResponse> {
    await this.requireOpportunity(id);
    const updated = await this.prisma.client.opportunity.update({
      where: { id },
      data: {
        status: OpportunityStatus.WON,
        wonReason: input.reason || null,
        lostReason: null,
      },
      select: OPPORTUNITY_SELECT,
    });
    return this.opportunityDetail(updated);
  }

  /** Close an opportunity as `LOST`, persisting the (required) loss reason. */
  async loseOpportunity(id: string, input: MarkLostInput): Promise<GetOpportunityResponse> {
    await this.requireOpportunity(id);
    const updated = await this.prisma.client.opportunity.update({
      where: { id },
      data: {
        status: OpportunityStatus.LOST,
        lostReason: input.reason,
        wonReason: null,
      },
      select: OPPORTUNITY_SELECT,
    });
    return this.opportunityDetail(updated);
  }

  /** Delete an opportunity (its activities/tasks cascade). 404s on a miss. */
  async deleteOpportunity(id: string): Promise<void> {
    await this.requireOpportunity(id);
    await this.prisma.client.opportunity.delete({ where: { id } });
  }

  // -------------------------------------------------------------------------
  // Activities
  // -------------------------------------------------------------------------

  /**
   * Log a touchpoint against a lead or an opportunity. The parent must exist in
   * the caller's gym (404 on a miss); the acting staff member is resolved from
   * the session and their display name snapshotted, like `MemberNote`.
   */
  async logActivity(input: CreateCrmActivityInput): Promise<CreateCrmActivityResponse> {
    await this.requireParent(input.leadId, input.opportunityId);
    const staff = await this.resolveStaff();
    const activity = await this.prisma.client.crmActivity.create({
      data: {
        gymId: this.tenant.gymId,
        leadId: input.leadId ?? null,
        opportunityId: input.opportunityId ?? null,
        type: input.type,
        staffUserId: staff.id,
        staffName: staff.name,
        notes: input.notes,
        ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
      },
      select: ACTIVITY_SELECT,
    });
    return { activity: this.toActivityEntry(activity) };
  }

  /**
   * The gym's recent-activities feed, newest `occurredAt` first, each entry
   * resolved to the lead / opportunity it was logged against.
   */
  async recentActivities(query: RecentCrmActivitiesQuery): Promise<RecentCrmActivitiesResponse> {
    const rows = await this.prisma.client.crmActivity.findMany({
      orderBy: { occurredAt: 'desc' },
      take: query.limit,
      select: {
        ...ACTIVITY_SELECT,
        lead: { select: { id: true, firstName: true, lastName: true } },
        opportunity: {
          select: {
            id: true,
            member: { select: { user: { select: { name: true, email: true } } } },
          },
        },
      },
    });
    const data: CrmRecentActivity[] = rows.map((row) => ({
      ...this.toActivityEntry(row),
      regarding: row.lead
        ? { kind: 'LEAD', id: row.lead.id, name: `${row.lead.firstName} ${row.lead.lastName}` }
        : row.opportunity
          ? {
              kind: 'OPPORTUNITY',
              id: row.opportunity.id,
              name: row.opportunity.member.user.name ?? row.opportunity.member.user.email,
            }
          : null,
    }));
    return { data };
  }

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  /** Create a follow-up task on a lead or an opportunity. 404s a bad parent. */
  async createTask(input: CreateCrmTaskInput): Promise<CrmTaskResponse> {
    await this.requireParent(input.leadId, input.opportunityId);
    const task = await this.prisma.client.crmTask.create({
      data: {
        gymId: this.tenant.gymId,
        leadId: input.leadId ?? null,
        opportunityId: input.opportunityId ?? null,
        title: input.title,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
      select: TASK_SELECT,
    });
    return { task: this.toTaskEntry(task) };
  }

  /**
   * Edit / complete a task. The first flip to `completed` also logs a
   * `TASK_COMPLETED` activity on the task's parent (attributed to the acting
   * staff member) so the timeline reflects the done to-do; un-completing does
   * not retract it — the timeline is append-only.
   */
  async updateTask(id: string, input: UpdateCrmTaskInput): Promise<CrmTaskResponse> {
    const existing = await this.prisma.client.crmTask.findFirst({
      where: { id },
      select: TASK_SELECT,
    });
    if (!existing) {
      throw new NotFoundException({ message: 'Task not found', code: 'CRM_TASK_NOT_FOUND' });
    }
    const task = await this.prisma.client.crmTask.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.completed !== undefined ? { completed: input.completed } : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
          : {}),
      },
      select: TASK_SELECT,
    });
    if (input.completed === true && !existing.completed) {
      const staff = await this.resolveStaff();
      await this.prisma.client.crmActivity.create({
        data: {
          gymId: this.tenant.gymId,
          leadId: task.leadId,
          opportunityId: task.opportunityId,
          type: CrmActivityType.TASK_COMPLETED,
          staffUserId: staff.id,
          staffName: staff.name,
          notes: task.title,
        },
      });
    }
    return { task: this.toTaskEntry(task) };
  }

  /** Delete a task. 404s on a miss. */
  async deleteTask(id: string): Promise<void> {
    const existing = await this.prisma.client.crmTask.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException({ message: 'Task not found', code: 'CRM_TASK_NOT_FOUND' });
    }
    await this.prisma.client.crmTask.delete({ where: { id } });
  }

  // -------------------------------------------------------------------------
  // Aggregations
  // -------------------------------------------------------------------------

  /**
   * The combined pipeline: every open stage's count / value / weighted value
   * (leads then opportunities, funnel order), plus totals and the whole-percent
   * win rate over everything that has closed. Weighting happens per deal —
   * `Σ round(value × probability / 100)` — matching the prototype's math.
   */
  async pipeline(): Promise<CrmPipelineResponse> {
    const [openLeads, openOpportunities, closedLeads, closedOpportunities] = await Promise.all([
      this.prisma.client.lead.findMany({
        where: { status: { in: [...OPEN_LEAD_STATUSES] } },
        select: { status: true, expectedValue: true, probability: true },
      }),
      this.prisma.client.opportunity.findMany({
        where: { status: { in: [...OPEN_OPPORTUNITY_STATUSES] } },
        select: { status: true, value: true, probability: true },
      }),
      this.prisma.client.lead.groupBy({
        by: ['status'],
        where: { status: { in: [LeadStatus.CONVERTED, LeadStatus.LOST] } },
        _count: { _all: true },
      }),
      this.prisma.client.opportunity.groupBy({
        by: ['status'],
        where: { status: { in: [OpportunityStatus.WON, OpportunityStatus.LOST] } },
        _count: { _all: true },
      }),
    ]);

    const stages: CrmPipelineStage[] = [
      ...OPEN_LEAD_STATUSES.map((stage): CrmPipelineStage => {
        const rows = openLeads.filter((l) => l.status === stage);
        return {
          kind: 'LEAD',
          stage,
          count: rows.length,
          value: rows.reduce((sum, l) => sum + l.expectedValue, 0),
          weightedValue: rows.reduce((sum, l) => sum + weighted(l.expectedValue, l.probability), 0),
        };
      }),
      ...OPEN_OPPORTUNITY_STATUSES.map((stage): CrmPipelineStage => {
        const rows = openOpportunities.filter((o) => o.status === stage);
        return {
          kind: 'OPPORTUNITY',
          stage,
          count: rows.length,
          value: rows.reduce((sum, o) => sum + o.value, 0),
          weightedValue: rows.reduce((sum, o) => sum + weighted(o.value, o.probability), 0),
        };
      }),
    ];

    const wins =
      (closedLeads.find((g) => g.status === LeadStatus.CONVERTED)?._count._all ?? 0) +
      (closedOpportunities.find((g) => g.status === OpportunityStatus.WON)?._count._all ?? 0);
    const closed =
      closedLeads.reduce((sum, g) => sum + g._count._all, 0) +
      closedOpportunities.reduce((sum, g) => sum + g._count._all, 0);

    return {
      stages,
      totals: {
        openLeads: openLeads.length,
        openOpportunities: openOpportunities.length,
        pipelineValue: stages.reduce((sum, s) => sum + s.value, 0),
        weightedValue: stages.reduce((sum, s) => sum + s.weightedValue, 0),
        winRate: closed > 0 ? Math.round((wins / closed) * 100) : 0,
      },
    };
  }

  /**
   * The revenue forecast: every open lead + opportunity bucketed by its
   * `expectedCloseDate` month (`YYYY-MM`, ascending), `expected` the
   * probability-weighted sum and `potential` the raw sum. Open deals with no
   * close date can't sit on the timeline and are reported as `unscheduled`.
   */
  async forecast(): Promise<CrmForecastResponse> {
    const [openLeads, openOpportunities] = await Promise.all([
      this.prisma.client.lead.findMany({
        where: { status: { in: [...OPEN_LEAD_STATUSES] } },
        select: { expectedValue: true, probability: true, expectedCloseDate: true },
      }),
      this.prisma.client.opportunity.findMany({
        where: { status: { in: [...OPEN_OPPORTUNITY_STATUSES] } },
        select: { value: true, probability: true, expectedCloseDate: true },
      }),
    ]);

    const deals = [
      ...openLeads.map((l) => ({
        value: l.expectedValue,
        probability: l.probability,
        closeDate: l.expectedCloseDate,
      })),
      ...openOpportunities.map((o) => ({
        value: o.value,
        probability: o.probability,
        closeDate: o.expectedCloseDate,
      })),
    ];

    const byMonth = new Map<string, { expected: number; potential: number; deals: number }>();
    const unscheduled = { deals: 0, expected: 0, potential: 0 };
    for (const deal of deals) {
      const expected = weighted(deal.value, deal.probability);
      if (!deal.closeDate) {
        unscheduled.deals += 1;
        unscheduled.expected += expected;
        unscheduled.potential += deal.value;
        continue;
      }
      const key = monthKey(deal.closeDate);
      const bucket = byMonth.get(key) ?? { expected: 0, potential: 0, deals: 0 };
      bucket.expected += expected;
      bucket.potential += deal.value;
      bucket.deals += 1;
      byMonth.set(key, bucket);
    }

    const months = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bucket]) => ({ month, ...bucket }));

    return {
      months,
      unscheduled,
      totals: {
        deals: deals.length,
        expected: months.reduce((sum, m) => sum + m.expected, 0) + unscheduled.expected,
        potential: months.reduce((sum, m) => sum + m.potential, 0) + unscheduled.potential,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** The lead, or a `404 LEAD_NOT_FOUND` for an unknown / cross-tenant id. */
  private async requireLead(id: string): Promise<LeadRecord> {
    const lead = await this.prisma.client.lead.findFirst({ where: { id }, select: LEAD_SELECT });
    if (!lead) {
      throw new NotFoundException({ message: 'Lead not found', code: 'LEAD_NOT_FOUND' });
    }
    return lead;
  }

  /** The opportunity, or a `404 OPPORTUNITY_NOT_FOUND` on a miss. */
  private async requireOpportunity(id: string): Promise<OpportunityRecord> {
    const opportunity = await this.prisma.client.opportunity.findFirst({
      where: { id },
      select: OPPORTUNITY_SELECT,
    });
    if (!opportunity) {
      throw new NotFoundException({
        message: 'Opportunity not found',
        code: 'OPPORTUNITY_NOT_FOUND',
      });
    }
    return opportunity;
  }

  /**
   * Assert the activity/task parent exists in the caller's gym. The schemas
   * guarantee exactly one id is provided; the lookup runs on the scoped client
   * so a cross-tenant id reads as absent.
   */
  private async requireParent(leadId?: string, opportunityId?: string): Promise<void> {
    if (leadId) {
      const lead = await this.prisma.client.lead.findFirst({
        where: { id: leadId },
        select: { id: true },
      });
      if (!lead) {
        throw new NotFoundException({ message: 'Lead not found', code: 'LEAD_NOT_FOUND' });
      }
      return;
    }
    const opportunity = await this.prisma.client.opportunity.findFirst({
      where: { id: opportunityId },
      select: { id: true },
    });
    if (!opportunity) {
      throw new NotFoundException({
        message: 'Opportunity not found',
        code: 'OPPORTUNITY_NOT_FOUND',
      });
    }
  }

  /**
   * Assert an `assignedToId` is a user who actually belongs to the caller's
   * gym (any staff role) before wiring the FK — otherwise a lead could be
   * "assigned" to an arbitrary platform user id. `400 CRM_ASSIGNEE_INVALID`
   * when not. No-op for absent/null (unassigning is always allowed).
   */
  private async requireAssignee(userId: string | null | undefined): Promise<void> {
    if (userId == null) return;
    const membership = await this.prisma.client.gymMember.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!membership) {
      throw new BadRequestException({
        message: 'Assignee is not a member of this gym',
        code: 'CRM_ASSIGNEE_INVALID',
      });
    }
  }

  /** Assert a `locationId` is one of the gym's branches — `400` when not. */
  private async requireLocation(locationId: string | null | undefined): Promise<void> {
    if (locationId == null) return;
    const location = await this.prisma.client.location.findFirst({
      where: { id: locationId },
      select: { id: true },
    });
    if (!location) {
      throw new BadRequestException({
        message: 'Location does not belong to this gym',
        code: 'CRM_LOCATION_INVALID',
      });
    }
  }

  /**
   * The acting staff member for an activity snapshot, resolved from the
   * session like `MemberNote.authorName` — never trusted from the body.
   */
  private async resolveStaff(): Promise<{ id: string | null; name: string }> {
    const userId = this.tenant.userId ?? null;
    const user = userId
      ? await this.prisma.client.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        })
      : null;
    return { id: userId, name: user?.name ?? user?.email ?? 'Staff' };
  }

  /** A lead's detail response — the row plus its timeline and tasks. */
  private async leadDetail(lead: LeadRecord): Promise<GetLeadResponse> {
    const [activities, tasks] = await Promise.all([
      this.prisma.client.crmActivity.findMany({
        where: { leadId: lead.id },
        orderBy: { occurredAt: 'desc' },
        take: DETAIL_ACTIVITY_LIMIT,
        select: ACTIVITY_SELECT,
      }),
      this.prisma.client.crmTask.findMany({
        where: { leadId: lead.id },
        orderBy: [{ completed: 'asc' }, { createdAt: 'desc' }],
        select: TASK_SELECT,
      }),
    ]);
    return {
      ...this.toLeadRow(lead),
      activities: activities.map((a) => this.toActivityEntry(a)),
      tasks: tasks.map((t) => this.toTaskEntry(t)),
    };
  }

  /** An opportunity's detail response — the row plus its timeline and tasks. */
  private async opportunityDetail(opportunity: OpportunityRecord): Promise<GetOpportunityResponse> {
    const [activities, tasks] = await Promise.all([
      this.prisma.client.crmActivity.findMany({
        where: { opportunityId: opportunity.id },
        orderBy: { occurredAt: 'desc' },
        take: DETAIL_ACTIVITY_LIMIT,
        select: ACTIVITY_SELECT,
      }),
      this.prisma.client.crmTask.findMany({
        where: { opportunityId: opportunity.id },
        orderBy: [{ completed: 'asc' }, { createdAt: 'desc' }],
        select: TASK_SELECT,
      }),
    ]);
    return {
      ...this.toOpportunityRow(opportunity),
      activities: activities.map((a) => this.toActivityEntry(a)),
      tasks: tasks.map((t) => this.toTaskEntry(t)),
    };
  }

  private toLeadRow(lead: LeadRecord): LeadRow {
    return {
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      interest: lead.interest,
      status: lead.status,
      assignedTo: toRef(lead.assignedTo),
      location: lead.location ? { id: lead.location.id, name: lead.location.name } : null,
      followUpDate: lead.followUpDate?.toISOString() ?? null,
      notes: lead.notes,
      expectedValue: lead.expectedValue,
      expectedCloseDate: lead.expectedCloseDate?.toISOString() ?? null,
      probability: lead.probability,
      wonReason: lead.wonReason,
      lostReason: lead.lostReason,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    };
  }

  private toOpportunityRow(opportunity: OpportunityRecord): OpportunityRow {
    return {
      id: opportunity.id,
      member: {
        id: opportunity.member.id,
        name: opportunity.member.user.name ?? opportunity.member.user.email,
      },
      type: opportunity.type,
      description: opportunity.description,
      value: opportunity.value,
      probability: opportunity.probability,
      status: opportunity.status,
      assignedTo: toRef(opportunity.assignedTo),
      expectedCloseDate: opportunity.expectedCloseDate?.toISOString() ?? null,
      notes: opportunity.notes,
      wonReason: opportunity.wonReason,
      lostReason: opportunity.lostReason,
      createdAt: opportunity.createdAt.toISOString(),
      updatedAt: opportunity.updatedAt.toISOString(),
    };
  }

  private toActivityEntry(activity: ActivityRecord): CrmActivityEntry {
    return {
      id: activity.id,
      leadId: activity.leadId,
      opportunityId: activity.opportunityId,
      type: activity.type,
      staffUserId: activity.staffUserId,
      staffName: activity.staffName,
      notes: activity.notes,
      occurredAt: activity.occurredAt.toISOString(),
      createdAt: activity.createdAt.toISOString(),
    };
  }

  private toTaskEntry(task: TaskRecord): CrmTaskEntry {
    return {
      id: task.id,
      leadId: task.leadId,
      opportunityId: task.opportunityId,
      title: task.title,
      completed: task.completed,
      dueDate: task.dueDate?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}
