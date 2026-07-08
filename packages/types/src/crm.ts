import { z } from 'zod';
import { sortDirSchema } from './members';

// @fit/types/crm — the staff console's CRM contract (T12.2): leads,
// opportunities, activities, tasks, and the pipeline / revenue-forecast
// aggregations. Shared by the NestJS `/crm` module and the admin app.
//
// Money fields (`expectedValue`, `value`, and every aggregate derived from
// them) are integers in the currency's MINOR units (cents/tetri), matching
// `Product.priceAmount` — no float money crosses the wire. `probability` is a
// whole 0–100 percentage; a deal's *weighted* value is
// `round(value × probability / 100)`.

/** A lead's lifecycle stage — mirrors the Prisma `LeadStatus` enum. */
export const leadStatusSchema = z.enum(['NEW', 'CONTACTED', 'TRIAL', 'CONVERTED', 'LOST']);

/** A lead's lifecycle stage — {@link leadStatusSchema}. */
export type LeadStatus = z.infer<typeof leadStatusSchema>;

/** Where a lead came from — mirrors the Prisma `LeadSource` enum. */
export const leadSourceSchema = z.enum(['WALK_IN', 'INSTAGRAM', 'REFERRAL', 'WEBSITE']);

/** Where a lead came from — {@link leadSourceSchema}. */
export type LeadSource = z.infer<typeof leadSourceSchema>;

/** An opportunity's pipeline stage — mirrors the Prisma `OpportunityStatus` enum. */
export const opportunityStatusSchema = z.enum([
  'INTERESTED',
  'PROPOSAL_SENT',
  'DECISION_PENDING',
  'WON',
  'LOST',
]);

/** An opportunity's pipeline stage — {@link opportunityStatusSchema}. */
export type OpportunityStatus = z.infer<typeof opportunityStatusSchema>;

/** What an opportunity sells — mirrors the Prisma `OpportunityType` enum. */
export const opportunityTypeSchema = z.enum([
  'MEMBERSHIP_UPGRADE',
  'PT_SESSIONS',
  'SERVICE_PACKAGE',
  'OTHER',
]);

/** What an opportunity sells — {@link opportunityTypeSchema}. */
export type OpportunityType = z.infer<typeof opportunityTypeSchema>;

/** Kind of logged CRM touchpoint — mirrors the Prisma `CrmActivityType` enum. */
export const crmActivityTypeSchema = z.enum([
  'CALL',
  'EMAIL',
  'WHATSAPP',
  'MEETING',
  'NOTE',
  'TASK_COMPLETED',
]);

/** Kind of logged CRM touchpoint — {@link crmActivityTypeSchema}. */
export type CrmActivityType = z.infer<typeof crmActivityTypeSchema>;

/** A `(id, name)` reference to the staff user / branch a record points at. */
export interface CrmRef {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

/** Sortable columns of the leads list. `name` sorts by first + last name. */
export const leadSortSchema = z.enum(['name', 'createdAt', 'followUpDate', 'expectedCloseDate']);

/**
 * Query for `GET /crm/leads`. Server-paginated like the member roster: `page`
 * is 1-based, `limit` capped at 100, numbers coerced because they arrive as
 * query strings. `search` matches name / email / phone; the enum + id filters
 * narrow the list.
 */
export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: leadStatusSchema.optional(),
  source: leadSourceSchema.optional(),
  assignedToId: z.string().min(1).optional(),
  locationId: z.string().min(1).optional(),
  sort: leadSortSchema.default('createdAt'),
  dir: sortDirSchema.default('desc'),
});

/** Validated `GET /crm/leads` query — {@link listLeadsQuerySchema}. */
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

/**
 * One lead as the list/detail render it. `assignedTo` / `location` are
 * resolved `(id, name)` refs (null when unassigned); dates are ISO strings.
 * `wonReason` / `lostReason` are only set once the lead closed
 * CONVERTED / LOST.
 */
export interface LeadRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  source: LeadSource;
  interest: string;
  status: LeadStatus;
  assignedTo: CrmRef | null;
  location: CrmRef | null;
  followUpDate: string | null;
  notes: string;
  /** Deal size in MINOR currency units. */
  expectedValue: number;
  expectedCloseDate: string | null;
  /** Chance of closing, whole percent 0–100. */
  probability: number;
  wonReason: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Per-status lead counts for the board's tab badges (unfiltered by status). */
export type LeadStatusCounts = Record<LeadStatus, number>;

/** Response of `GET /crm/leads` — one filtered page plus per-status counts. */
export interface ListLeadsResponse {
  data: LeadRow[];
  total: number;
  page: number;
  limit: number;
  counts: LeadStatusCounts;
}

/**
 * A CRM touchpoint as timelines render it. Exactly one of `leadId` /
 * `opportunityId` is set. `staffName` is the write-time snapshot of who logged
 * it; `occurredAt` is when the touchpoint happened (backdatable).
 */
export interface CrmActivityEntry {
  id: string;
  leadId: string | null;
  opportunityId: string | null;
  type: CrmActivityType;
  staffUserId: string | null;
  staffName: string;
  notes: string;
  occurredAt: string;
  createdAt: string;
}

/** A follow-up to-do as detail pages render it. One parent id is set. */
export interface CrmTaskEntry {
  id: string;
  leadId: string | null;
  opportunityId: string | null;
  title: string;
  completed: boolean;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A lead's detail — the row plus its activity timeline and open/done tasks. */
export interface LeadDetail extends LeadRow {
  /** Touchpoints, newest `occurredAt` first. */
  activities: CrmActivityEntry[];
  /** To-dos, open first then newest. */
  tasks: CrmTaskEntry[];
}

/** Optional trimmed text that normalises absent → `''` and caps length. */
const optionalText = (max: number) => z.string().trim().max(max).default('');

/**
 * Body of `POST /crm/leads`. Names are required; contact + qualification
 * fields are optional (defaulted empty / null) so a walk-in can be captured
 * with just a name and source. `status` defaults to `NEW` server-side.
 */
export const createLeadSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: optionalText(50),
  email: z.string().trim().email().max(320).or(z.literal('')).default(''),
  source: leadSourceSchema,
  interest: optionalText(200),
  assignedToId: z.string().min(1).nullish(),
  locationId: z.string().min(1).nullish(),
  followUpDate: z.string().datetime().nullish(),
  notes: optionalText(2000),
  expectedValue: z.number().int().min(0).default(0),
  expectedCloseDate: z.string().datetime().nullish(),
  probability: z.number().int().min(0).max(100).default(0),
});

/** Validated `POST /crm/leads` body — {@link createLeadSchema}. */
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/**
 * Body of `PATCH /crm/leads/:id` — every editable field optional; only the
 * provided keys change. Open-stage moves (`NEW` / `CONTACTED` / `TRIAL`) go
 * through `status` here; closing as CONVERTED / LOST goes through the explicit
 * `/convert` / `/lose` transitions so the reason is always captured with the
 * close.
 */
export const updateLeadSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(320).or(z.literal('')).optional(),
  source: leadSourceSchema.optional(),
  interest: z.string().trim().max(200).optional(),
  assignedToId: z.string().min(1).nullish(),
  locationId: z.string().min(1).nullish(),
  status: z.enum(['NEW', 'CONTACTED', 'TRIAL']).optional(),
  followUpDate: z.string().datetime().nullish(),
  notes: z.string().trim().max(2000).optional(),
  expectedValue: z.number().int().min(0).optional(),
  expectedCloseDate: z.string().datetime().nullish(),
  probability: z.number().int().min(0).max(100).optional(),
});

/** Validated `PATCH /crm/leads/:id` body — {@link updateLeadSchema}. */
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

/**
 * Body of the winning transitions — `POST /crm/leads/:id/convert` and
 * `POST /crm/opportunities/:id/won`. The reason is optional on a win.
 */
export const markWonSchema = z.object({
  reason: optionalText(500),
});

/** Validated won/convert body — {@link markWonSchema}. */
export type MarkWonInput = z.infer<typeof markWonSchema>;

/**
 * Body of the losing transitions — `POST /crm/leads/:id/lose` and
 * `POST /crm/opportunities/:id/lost`. A loss must say why, so the reason is
 * required.
 */
export const markLostSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

/** Validated lost/lose body — {@link markLostSchema}. */
export type MarkLostInput = z.infer<typeof markLostSchema>;

/** Response of `GET /crm/leads/:id` (and every lead mutation). */
export type GetLeadResponse = LeadDetail;

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

/** Sortable columns of the opportunities list. */
export const opportunitySortSchema = z.enum(['createdAt', 'expectedCloseDate', 'value']);

/**
 * Query for `GET /crm/opportunities` — same pagination contract as the leads
 * list. `search` matches the member's name / the description.
 */
export const listOpportunitiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: opportunityStatusSchema.optional(),
  type: opportunityTypeSchema.optional(),
  assignedToId: z.string().min(1).optional(),
  memberId: z.string().min(1).optional(),
  sort: opportunitySortSchema.default('createdAt'),
  dir: sortDirSchema.default('desc'),
});

/** Validated `GET /crm/opportunities` query — {@link listOpportunitiesQuerySchema}. */
export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesQuerySchema>;

/**
 * One opportunity as the kanban/list render it. `member` is the gym member
 * being sold to (their display name resolved from the linked user);
 * `assignedTo` the owning staff user.
 */
export interface OpportunityRow {
  id: string;
  member: CrmRef;
  type: OpportunityType;
  description: string;
  /** Deal size in MINOR currency units. */
  value: number;
  /** Chance of closing, whole percent 0–100. */
  probability: number;
  status: OpportunityStatus;
  assignedTo: CrmRef | null;
  expectedCloseDate: string | null;
  notes: string;
  wonReason: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Per-status opportunity counts for the kanban column headers. */
export type OpportunityStatusCounts = Record<OpportunityStatus, number>;

/** Response of `GET /crm/opportunities` — one page plus per-status counts. */
export interface ListOpportunitiesResponse {
  data: OpportunityRow[];
  total: number;
  page: number;
  limit: number;
  counts: OpportunityStatusCounts;
}

/** An opportunity's detail — the row plus its timeline and tasks. */
export interface OpportunityDetail extends OpportunityRow {
  /** Touchpoints, newest `occurredAt` first. */
  activities: CrmActivityEntry[];
  /** To-dos, open first then newest. */
  tasks: CrmTaskEntry[];
}

/**
 * Body of `POST /crm/opportunities`. `memberId` must be a member of the
 * caller's gym (a cross-tenant id is a 404); `status` defaults to
 * `INTERESTED` server-side.
 */
export const createOpportunitySchema = z.object({
  memberId: z.string().min(1),
  type: opportunityTypeSchema,
  description: optionalText(200),
  value: z.number().int().min(0).default(0),
  probability: z.number().int().min(0).max(100).default(0),
  assignedToId: z.string().min(1).nullish(),
  expectedCloseDate: z.string().datetime().nullish(),
  notes: optionalText(2000),
});

/** Validated `POST /crm/opportunities` body — {@link createOpportunitySchema}. */
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

/**
 * Body of `PATCH /crm/opportunities/:id`. Open-stage kanban moves go through
 * `status`; closing WON / LOST goes through the explicit transitions so the
 * reason is captured.
 */
export const updateOpportunitySchema = z.object({
  type: opportunityTypeSchema.optional(),
  description: z.string().trim().max(200).optional(),
  value: z.number().int().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  status: z.enum(['INTERESTED', 'PROPOSAL_SENT', 'DECISION_PENDING']).optional(),
  assignedToId: z.string().min(1).nullish(),
  expectedCloseDate: z.string().datetime().nullish(),
  notes: z.string().trim().max(2000).optional(),
});

/** Validated `PATCH /crm/opportunities/:id` body — {@link updateOpportunitySchema}. */
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;

/** Response of `GET /crm/opportunities/:id` (and every opportunity mutation). */
export type GetOpportunityResponse = OpportunityDetail;

// ---------------------------------------------------------------------------
// Activities & tasks
// ---------------------------------------------------------------------------

/**
 * Body of `POST /crm/activities` — log a touchpoint against exactly one of a
 * lead / an opportunity. The acting staff member is resolved from the session
 * server-side, never trusted from the body. `occurredAt` defaults to now and
 * may be backdated. `TASK_COMPLETED` is reserved for the automatic entry
 * written when a task is completed, so it is not accepted here.
 */
export const createCrmActivitySchema = z
  .object({
    leadId: z.string().min(1).optional(),
    opportunityId: z.string().min(1).optional(),
    type: crmActivityTypeSchema.exclude(['TASK_COMPLETED']),
    notes: optionalText(2000),
    occurredAt: z.string().datetime().optional(),
  })
  .refine((v) => Boolean(v.leadId) !== Boolean(v.opportunityId), {
    message: 'Provide exactly one of leadId or opportunityId',
    path: ['leadId'],
  });

/** Validated `POST /crm/activities` body — {@link createCrmActivitySchema}. */
export type CreateCrmActivityInput = z.infer<typeof createCrmActivitySchema>;

/** Response of `POST /crm/activities` — the stored entry. */
export interface CreateCrmActivityResponse {
  activity: CrmActivityEntry;
}

/** Query for `GET /crm/activities/recent` — just a capped feed length. */
export const recentCrmActivitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Validated recent-activities query — {@link recentCrmActivitiesQuerySchema}. */
export type RecentCrmActivitiesQuery = z.infer<typeof recentCrmActivitiesQuerySchema>;

/**
 * One row of the recent-activities feed — the entry plus a resolved reference
 * to what it was logged against, so the feed can say "Call — Nino Beridze
 * (lead)" without extra lookups. `regarding` is null when the parent has been
 * deleted between write and read (not expected — activities cascade — but the
 * shape is honest about the optional joins).
 */
export interface CrmRecentActivity extends CrmActivityEntry {
  regarding: { kind: 'LEAD' | 'OPPORTUNITY'; id: string; name: string } | null;
}

/** Response of `GET /crm/activities/recent`, newest `occurredAt` first. */
export interface RecentCrmActivitiesResponse {
  data: CrmRecentActivity[];
}

/** Body of `POST /crm/tasks` — a to-do on exactly one of a lead / opportunity. */
export const createCrmTaskSchema = z
  .object({
    leadId: z.string().min(1).optional(),
    opportunityId: z.string().min(1).optional(),
    title: z.string().trim().min(1).max(200),
    dueDate: z.string().datetime().nullish(),
  })
  .refine((v) => Boolean(v.leadId) !== Boolean(v.opportunityId), {
    message: 'Provide exactly one of leadId or opportunityId',
    path: ['leadId'],
  });

/** Validated `POST /crm/tasks` body — {@link createCrmTaskSchema}. */
export type CreateCrmTaskInput = z.infer<typeof createCrmTaskSchema>;

/**
 * Body of `PATCH /crm/tasks/:id`. Flipping `completed` to true logs a
 * `TASK_COMPLETED` activity on the task's parent; flipping it back does not
 * retract the entry (the timeline is append-only).
 */
export const updateCrmTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  completed: z.boolean().optional(),
  dueDate: z.string().datetime().nullish(),
});

/** Validated `PATCH /crm/tasks/:id` body — {@link updateCrmTaskSchema}. */
export type UpdateCrmTaskInput = z.infer<typeof updateCrmTaskSchema>;

/** Response of the task mutations — the stored entry. */
export interface CrmTaskResponse {
  task: CrmTaskEntry;
}

// ---------------------------------------------------------------------------
// Aggregations — pipeline & revenue forecast
// ---------------------------------------------------------------------------

/**
 * One open stage of the combined pipeline. Lead stages (`NEW` / `CONTACTED` /
 * `TRIAL`) and opportunity stages (`INTERESTED` / `PROPOSAL_SENT` /
 * `DECISION_PENDING`) appear side by side, tagged by `kind`; closed stages are
 * not stages of the funnel and are summarised in the totals instead.
 */
export interface CrmPipelineStage {
  kind: 'LEAD' | 'OPPORTUNITY';
  stage: LeadStatus | OpportunityStatus;
  count: number;
  /** Σ deal size of the stage, MINOR units. */
  value: number;
  /** Σ round(value × probability / 100) of the stage, MINOR units. */
  weightedValue: number;
}

/**
 * Response of `GET /crm/pipeline`. `winRate` is whole-percent wins over all
 * closed records — (converted leads + won opportunities) / all closed — and 0
 * when nothing has closed yet.
 */
export interface CrmPipelineResponse {
  stages: CrmPipelineStage[];
  totals: {
    openLeads: number;
    openOpportunities: number;
    /** Σ deal size across every open lead + opportunity, MINOR units. */
    pipelineValue: number;
    /** Probability-weighted Σ across every open lead + opportunity, MINOR units. */
    weightedValue: number;
    /** Whole percent 0–100. */
    winRate: number;
  };
}

/**
 * One month of the revenue forecast: open leads + opportunities whose
 * `expectedCloseDate` falls in the month, keyed `YYYY-MM`. `expected` is the
 * probability-weighted sum, `potential` the unweighted sum, both MINOR units.
 */
export interface CrmForecastMonth {
  month: string;
  expected: number;
  potential: number;
  deals: number;
}

/**
 * Response of `GET /crm/forecast` — months in ascending order. Open records
 * with no `expectedCloseDate` cannot be placed on the timeline and are
 * summarised in `unscheduled` instead of a month bucket.
 */
export interface CrmForecastResponse {
  months: CrmForecastMonth[];
  unscheduled: { deals: number; expected: number; potential: number };
  totals: { deals: number; expected: number; potential: number };
}
