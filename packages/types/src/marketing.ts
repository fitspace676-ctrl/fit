import { z } from 'zod';
import { memberStatusSchema } from './members';

// @fit/types/marketing — the staff console's Marketing contract (T12.7):
// campaigns, promo codes, audience segments, and message templates. Shared by
// the NestJS `/marketing` module and the admin app (T12.8/T12.9).
//
// The channel / status / discount value strings are the exact wire contract:
// they match the Prisma `MarketingChannel` / `CampaignStatus` /
// `CampaignScheduleType` / `PromoDiscountType` / `PromoStatus` enum member names,
// so nothing is mapped between the database, the server, and JSON. Ported from
// the gym-admin prototype's `app/marketing/page.tsx`.

// ---------------------------------------------------------------------------
// Channels & merge fields
// ---------------------------------------------------------------------------

/** The delivery channel a campaign/template targets — mirrors Prisma `MarketingChannel`. */
export const marketingChannelSchema = z.enum(['email', 'sms', 'push']);

/** A marketing channel — {@link marketingChannelSchema}. */
export type MarketingChannel = z.infer<typeof marketingChannelSchema>;

/** One entry of the channel catalog — the stored value and its display label. */
export interface MarketingChannelMeta {
  value: MarketingChannel;
  label: string;
}

/** The channel catalog (T12.7), served to the composer's channel picker. */
export const MARKETING_CHANNEL_CATALOG: readonly MarketingChannelMeta[] = [
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push notification' },
  { value: 'sms', label: 'SMS' },
];

/**
 * A `{{token}}` the composer can drop into a subject/body and the (stubbed)
 * dispatch fills per-recipient. The catalog is the single source of truth the
 * builder renders its merge-field menu from.
 */
export interface MarketingMergeField {
  token: string;
  label: string;
}

/** The merge-field catalog (T12.7), served alongside the channels. */
export const MARKETING_MERGE_FIELDS: readonly MarketingMergeField[] = [
  { token: '{{first_name}}', label: 'First name' },
  { token: '{{last_name}}', label: 'Last name' },
  { token: '{{email}}', label: 'Email' },
  { token: '{{phone}}', label: 'Phone' },
  { token: '{{plan_name}}', label: 'Plan name' },
  { token: '{{expiry_date}}', label: 'Expiry date' },
  { token: '{{location}}', label: 'Location' },
  { token: '{{business_name}}', label: 'Business name' },
  { token: '{{class_name}}', label: 'Class name' },
  { token: '{{payment_amount}}', label: 'Payment amount' },
];

/**
 * Merge values for {@link interpolateMergeFields}, keyed by the **bare** token name
 * (the token without its braces — e.g. `first_name` for `{{first_name}}`).
 */
export type MergeValues = Record<string, string>;

/** The bare names of every catalog token (`first_name`, `last_name`, …). */
const KNOWN_MERGE_KEYS = new Set(
  MARKETING_MERGE_FIELDS.map((field) => field.token.replace(/[{}]/g, '')),
);

/**
 * Expand every `{{token}}` in `text`. A token present in `values` becomes its value;
 * an unknown token is always left untouched (a likely typo staff can still see).
 *
 * A **known** catalog token with no provided value depends on `blankMissing`:
 * - `true` (default) — blank it, so a raw `{{…}}` never reaches a recipient. This is
 *   the server's send-time safety pass, which has the full value set.
 * - `false` — leave it raw. This is the client's live preview, which only holds the
 *   member-derived values; the tokens it can't fill stay visible and are filled by
 *   the server pass on send, so preview and delivered mail agree.
 */
export function interpolateMergeFields(
  text: string,
  values: MergeValues,
  options?: { blankMissing?: boolean },
): string {
  const blankMissing = options?.blankMissing ?? true;
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.toLowerCase();
    const value = values[key];
    if (value !== undefined) {
      return value;
    }
    return blankMissing && KNOWN_MERGE_KEYS.has(key) ? '' : match;
  });
}

/**
 * Response of `GET /marketing/catalog` — the channel and merge-field catalogs the
 * campaign composer and template editor render their pickers from, served from
 * this one shared source so the UI never hard-codes a list that could drift.
 */
export interface MarketingCatalogResponse {
  channels: readonly MarketingChannelMeta[];
  mergeFields: readonly MarketingMergeField[];
}

// ---------------------------------------------------------------------------
// Audience criteria (shared by segments and inline campaign targeting)
// ---------------------------------------------------------------------------

/**
 * The filter a segment (or a campaign's inline audience) resolves to a set of
 * {@link https | GymMember}s (T12.7). Every field is optional and ANDed together;
 * an empty bag matches the gym's whole `MEMBER` roster. Ported from the
 * prototype's segment filters, generalised to real columns:
 *
 * - `membershipPlanIds` — members holding an active subscription on one of these
 *   plans (the prototype's "plan" filter, keyed by stable plan id not name).
 * - `status` — the member's standing (`ACTIVE` / `INVITED` / `SUSPENDED`).
 * - `joinedAfter` / `joinedBefore` — ISO bounds on `GymMember.joinedAt` (the
 *   prototype's "join date").
 * - `visitedWithinDays` — checked in at least once in the last N days.
 * - `notVisitedForDays` — the "at risk" filter: no check-in in the last N days.
 * - `minSpent` — lifetime spend on `PAID` orders ≥ this MINOR-unit amount.
 * - `minClassAttendance` — at least this many `ATTENDED` bookings.
 */
export const audienceCriteriaSchema = z.object({
  membershipPlanIds: z.array(z.string().min(1)).max(50).optional(),
  status: z.array(memberStatusSchema).max(3).optional(),
  joinedAfter: z.string().datetime().optional(),
  joinedBefore: z.string().datetime().optional(),
  visitedWithinDays: z.number().int().min(1).max(3650).optional(),
  notVisitedForDays: z.number().int().min(1).max(3650).optional(),
  minSpent: z.number().int().min(0).max(100_000_000).optional(),
  minClassAttendance: z.number().int().min(0).max(100_000).optional(),
});

/** A resolved audience filter — {@link audienceCriteriaSchema}. */
export type AudienceCriteria = z.infer<typeof audienceCriteriaSchema>;

/** A `(id, name, email)` sample of one member a segment resolves to. */
export interface AudienceMemberSample {
  id: string;
  name: string;
  email: string;
}

/**
 * Response of the segment-preview endpoints — the live match count for a set of
 * criteria plus a small sample of matching members for the builder to show.
 */
export interface AudiencePreviewResponse {
  count: number;
  sample: AudienceMemberSample[];
}

/** How many sample members a preview returns. */
export const AUDIENCE_PREVIEW_SAMPLE_SIZE = 10;

// ---------------------------------------------------------------------------
// Audience segments — CRUD + preview
// ---------------------------------------------------------------------------

/** One saved audience segment as the list/detail render it. */
export interface AudienceSegmentRow {
  id: string;
  name: string;
  criteria: AudienceCriteria;
  createdAt: string;
  updatedAt: string;
}

/** Response of `GET /marketing/segments` — every segment, newest first. */
export interface ListAudienceSegmentsResponse {
  data: AudienceSegmentRow[];
}

/** Body of `POST /marketing/segments`. */
export const createAudienceSegmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  criteria: audienceCriteriaSchema.default({}),
});

/** Validated create-segment body — {@link createAudienceSegmentSchema}. */
export type CreateAudienceSegmentInput = z.infer<typeof createAudienceSegmentSchema>;

/** Body of `PATCH /marketing/segments/:id` — every field optional. */
export const updateAudienceSegmentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  criteria: audienceCriteriaSchema.optional(),
});

/** Validated update-segment body — {@link updateAudienceSegmentSchema}. */
export type UpdateAudienceSegmentInput = z.infer<typeof updateAudienceSegmentSchema>;

/** Body of `POST /marketing/segments/preview` — ad-hoc criteria to resolve. */
export const previewAudienceSchema = z.object({
  criteria: audienceCriteriaSchema.default({}),
});

/** Validated preview body — {@link previewAudienceSchema}. */
export type PreviewAudienceInput = z.infer<typeof previewAudienceSchema>;

// ---------------------------------------------------------------------------
// Message templates — CRUD
// ---------------------------------------------------------------------------

/** One message template as the list/detail render it. */
export interface MessageTemplateRow {
  id: string;
  name: string;
  channel: MarketingChannel;
  subject: string | null;
  body: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

/** Response of `GET /marketing/templates` — every template, newest first. */
export interface ListMessageTemplatesResponse {
  data: MessageTemplateRow[];
}

/** Body of `POST /marketing/templates`. */
export const createMessageTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  channel: marketingChannelSchema,
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(5000),
  category: z.string().trim().max(60).default(''),
});

/** Validated create-template body — {@link createMessageTemplateSchema}. */
export type CreateMessageTemplateInput = z.infer<typeof createMessageTemplateSchema>;

/** Body of `PATCH /marketing/templates/:id` — every field optional. */
export const updateMessageTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  channel: marketingChannelSchema.optional(),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(5000).optional(),
  category: z.string().trim().max(60).optional(),
});

/** Validated update-template body — {@link updateMessageTemplateSchema}. */
export type UpdateMessageTemplateInput = z.infer<typeof updateMessageTemplateSchema>;

// ---------------------------------------------------------------------------
// Promo codes — CRUD + toggle + validate/redeem
// ---------------------------------------------------------------------------

/** How a promo code discounts — mirrors Prisma `PromoDiscountType`. */
export const promoDiscountTypeSchema = z.enum(['percentage', 'fixed']);

/** A promo discount type — {@link promoDiscountTypeSchema}. */
export type PromoDiscountType = z.infer<typeof promoDiscountTypeSchema>;

/**
 * What a promo code may be spent on — mirrors Prisma `PromoScope`. A code is
 * written for a purpose, so honouring it across everything the gym sells is how a
 * drinks voucher ends up discounting an annual membership. `all` is the
 * deliberate opt-in to that breadth.
 */
export const promoScopeSchema = z.enum(['all', 'products', 'packages', 'subscriptions']);

/** What a code applies to — {@link promoScopeSchema}. */
export type PromoScope = z.infer<typeof promoScopeSchema>;

/** Whether a promo code is honoured — mirrors Prisma `PromoStatus`. */
export const promoStatusSchema = z.enum(['active', 'inactive']);

/** A promo code status — {@link promoStatusSchema}. */
export type PromoStatus = z.infer<typeof promoStatusSchema>;

/** One promo code as the list/detail render it. */
export interface PromoCodeRow {
  id: string;
  code: string;
  description: string;
  discountType: PromoDiscountType;
  /** Whole percent (1–100) for `percentage`; MINOR-unit amount for `fixed`. */
  discountValue: number;
  /** Optional MINOR-unit floor a purchase must reach for the code to apply. */
  minPurchase: number | null;
  usageLimit: number | null;
  usedCount: number;
  /** What the code may be spent on; `all` honours it across the catalogue. */
  appliesTo: PromoScope;
  /** ISO instant the code starts working, or `null` for "already running". */
  startsAt: string | null;
  expiryDate: string | null;
  /** When true a member may redeem this code only once, ever. */
  oncePerMember: boolean;
  status: PromoStatus;
  createdAt: string;
  updatedAt: string;
}

/** Response of `GET /marketing/promo-codes` — every code, newest first. */
export interface ListPromoCodesResponse {
  data: PromoCodeRow[];
}

/**
 * The promo body shared by create and update. A `percentage` discount must be
 * 1–100; a `fixed` one is an absolute MINOR-unit amount. The refine keeps a
 * percentage from exceeding 100 so a half-configured code never persists.
 */
const promoBase = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code may only contain letters, numbers, hyphens, and underscores'),
  description: z.string().trim().max(300).default(''),
  discountType: promoDiscountTypeSchema,
  discountValue: z.number().int().min(1).max(100_000_000),
  minPurchase: z.number().int().min(0).max(100_000_000).nullable().optional(),
  usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  appliesTo: promoScopeSchema.default('all'),
  startsAt: z.string().datetime().nullable().optional(),
  expiryDate: z.string().datetime().nullable().optional(),
  oncePerMember: z.boolean().default(false),
  status: promoStatusSchema.default('active'),
});

/** Reject a `percentage` code whose value exceeds 100. */
function refinePercentage(
  value: { discountType: PromoDiscountType; discountValue: number },
  ctx: z.RefinementCtx,
): void {
  if (value.discountType === 'percentage' && value.discountValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A percentage discount cannot exceed 100',
      path: ['discountValue'],
    });
  }
}

/** Body of `POST /marketing/promo-codes`. */
export const createPromoCodeSchema = promoBase.superRefine(refinePercentage);

/** Validated create-promo body — {@link createPromoCodeSchema}. */
export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>;

/** Body of `PATCH /marketing/promo-codes/:id` — every field optional. */
export const updatePromoCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, 'Code may only contain letters, numbers, hyphens, and underscores')
      .optional(),
    description: z.string().trim().max(300).optional(),
    discountType: promoDiscountTypeSchema.optional(),
    discountValue: z.number().int().min(1).max(100_000_000).optional(),
    minPurchase: z.number().int().min(0).max(100_000_000).nullable().optional(),
    usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    appliesTo: promoScopeSchema.optional(),
    startsAt: z.string().datetime().nullable().optional(),
    expiryDate: z.string().datetime().nullable().optional(),
    oncePerMember: z.boolean().optional(),
    status: promoStatusSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.discountType === 'percentage' &&
      value.discountValue !== undefined &&
      value.discountValue > 100
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A percentage discount cannot exceed 100',
        path: ['discountValue'],
      });
    }
  });

/** Validated update-promo body — {@link updatePromoCodeSchema}. */
export type UpdatePromoCodeInput = z.infer<typeof updatePromoCodeSchema>;

/** Body of `POST /marketing/promo-codes/:id/toggle` — the new status. */
export const togglePromoCodeSchema = z.object({
  status: promoStatusSchema,
});

/** Validated toggle body — {@link togglePromoCodeSchema}. */
export type TogglePromoCodeInput = z.infer<typeof togglePromoCodeSchema>;

/**
 * Body of `POST /marketing/promo-codes/validate` (and `/redeem`) — the code to
 * check, matched case-insensitively, and the cart total in MINOR units (for the
 * `minPurchase` check and the computed discount).
 */
export const validatePromoCodeSchema = z.object({
  code: z.string().trim().min(1).max(64),
  amount: z.number().int().min(0).max(100_000_000).optional(),
  /**
   * What is being bought. Omitted means "no particular catalogue", which only a
   * code scoped to `all` can satisfy — a scoped code cannot be confirmed against
   * a purchase whose kind is unknown.
   */
  scope: promoScopeSchema.optional(),
  /**
   * Who is buying. Required to enforce a one-per-customer code: an anonymous
   * walk-in cannot be checked against past redemptions, so such a code is
   * refused rather than quietly granted twice.
   */
  memberId: z.string().min(1).optional(),
});

/** Validated validate/redeem body — {@link validatePromoCodeSchema}. */
export type ValidatePromoCodeInput = z.infer<typeof validatePromoCodeSchema>;

/** Why a promo code was rejected — a stable machine-readable reason. */
export const promoRejectionReasonSchema = z.enum([
  'not_found',
  'inactive',
  /** Its window has not opened yet — a campaign scheduled ahead of time. */
  'not_started',
  'expired',
  'usage_limit_reached',
  /** A one-per-customer code this member has already spent. */
  'already_redeemed',
  /** The purchase is not what this code is for (a drinks code on a membership). */
  'out_of_scope',
  'below_min_purchase',
]);

/** A promo rejection reason — {@link promoRejectionReasonSchema}. */
export type PromoRejectionReason = z.infer<typeof promoRejectionReasonSchema>;

/**
 * Response of `POST /marketing/promo-codes/validate` — always `200`. `valid`
 * tells the caller whether the code applies; on rejection `reason` says why; on
 * success `promo` is the code and `discountAmount` the MINOR-unit discount for
 * the supplied `amount` (omitted when no `amount` was sent).
 */
export interface PromoValidationResult {
  valid: boolean;
  reason?: PromoRejectionReason;
  promo?: PromoCodeRow;
  discountAmount?: number;
}

/**
 * Response of `POST /marketing/promo-codes/redeem` — the code after its
 * `usedCount` was incremented and the MINOR-unit discount applied. Redeeming an
 * invalid code is a `409` carrying the {@link PromoRejectionReason}, never this.
 */
export interface PromoRedeemResult {
  promo: PromoCodeRow;
  discountAmount: number;
}

// ---------------------------------------------------------------------------
// Campaigns — CRUD + send/schedule + save-as-template
// ---------------------------------------------------------------------------

/** A campaign's lifecycle state — mirrors Prisma `CampaignStatus`. */
export const campaignStatusSchema = z.enum(['draft', 'scheduled', 'sent', 'paused', 'active']);

/** A campaign status — {@link campaignStatusSchema}. */
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

/** When a campaign delivers — mirrors Prisma `CampaignScheduleType`. */
export const campaignScheduleTypeSchema = z.enum(['now', 'scheduled']);

/** A campaign schedule type — {@link campaignScheduleTypeSchema}. */
export type CampaignScheduleType = z.infer<typeof campaignScheduleTypeSchema>;

/** A `(id, name)` reference to the staff user who authored a campaign. */
export interface MarketingRef {
  id: string;
  name: string;
}

/**
 * One campaign as the list/detail render it. Exactly one of `audienceSegmentId`
 * / `inlineCriteria` describes the audience (or neither, for the whole roster);
 * `audienceSize` is the match count snapshotted at schedule/send time and
 * `sentCount` the number the (stubbed) dispatch delivered. `createdBy` is the
 * resolved author ref (null once the staff user is deleted).
 */
export interface CampaignRow {
  id: string;
  name: string;
  channel: MarketingChannel;
  audienceSegmentId: string | null;
  inlineCriteria: AudienceCriteria | null;
  subject: string | null;
  body: string;
  scheduleType: CampaignScheduleType;
  scheduledAt: string | null;
  status: CampaignStatus;
  audienceSize: number;
  sentCount: number;
  sentAt: string | null;
  createdBy: MarketingRef | null;
  createdAt: string;
  updatedAt: string;
}

/** Sortable columns of the campaigns list. */
export const campaignSortSchema = z.enum(['createdAt', 'updatedAt', 'name']);

/** Query for `GET /marketing/campaigns` — server-paginated, filterable. */
export const listCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  channel: marketingChannelSchema.optional(),
  status: campaignStatusSchema.optional(),
  sort: campaignSortSchema.default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

/** Validated `GET /marketing/campaigns` query — {@link listCampaignsQuerySchema}. */
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;

/** Response of `GET /marketing/campaigns` — one filtered page. */
export interface ListCampaignsResponse {
  data: CampaignRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * The campaign body shared by create and update. The audience is a saved segment
 * (`audienceSegmentId`), ad-hoc `inlineCriteria`, or neither (the whole roster);
 * supplying both is rejected. `scheduleType: 'scheduled'` requires `scheduledAt`.
 */
const campaignBase = z.object({
  name: z.string().trim().min(1).max(120),
  channel: marketingChannelSchema,
  audienceSegmentId: z.string().min(1).nullable().optional(),
  inlineCriteria: audienceCriteriaSchema.nullable().optional(),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().max(5000).default(''),
  scheduleType: campaignScheduleTypeSchema.default('now'),
  scheduledAt: z.string().datetime().nullable().optional(),
});

/** Reject a campaign that names both a segment and inline criteria. */
function refineAudience(
  value: { audienceSegmentId?: string | null; inlineCriteria?: AudienceCriteria | null },
  ctx: z.RefinementCtx,
): void {
  if (value.audienceSegmentId && value.inlineCriteria) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Specify either a saved segment or inline criteria, not both',
      path: ['audienceSegmentId'],
    });
  }
}

/** Body of `POST /marketing/campaigns`. */
export const createCampaignSchema = campaignBase.superRefine((value, ctx) => {
  refineAudience(value, ctx);
  if (value.scheduleType === 'scheduled' && !value.scheduledAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A scheduled campaign requires scheduledAt',
      path: ['scheduledAt'],
    });
  }
});

/** Validated create-campaign body — {@link createCampaignSchema}. */
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/** Body of `PATCH /marketing/campaigns/:id` — every field optional. */
export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    channel: marketingChannelSchema.optional(),
    audienceSegmentId: z.string().min(1).nullable().optional(),
    inlineCriteria: audienceCriteriaSchema.nullable().optional(),
    subject: z.string().trim().max(200).nullable().optional(),
    body: z.string().trim().max(5000).optional(),
    scheduleType: campaignScheduleTypeSchema.optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
  })
  .superRefine(refineAudience);

/** Validated update-campaign body — {@link updateCampaignSchema}. */
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

/**
 * Body of `POST /marketing/campaigns/:id/schedule` — when the campaign should
 * fire. Sets `scheduleType: 'scheduled'`, `scheduledAt`, and status `scheduled`.
 */
export const scheduleCampaignSchema = z.object({
  scheduledAt: z.string().datetime(),
});

/** Validated schedule body — {@link scheduleCampaignSchema}. */
export type ScheduleCampaignInput = z.infer<typeof scheduleCampaignSchema>;

/**
 * Body of `POST /marketing/campaigns/:id/save-as-template` — an optional name +
 * category for the created {@link MessageTemplateRow} (name defaults to the
 * campaign's). The template copies the campaign's channel, subject, and body.
 */
export const saveCampaignAsTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().max(60).default(''),
});

/** Validated save-as-template body — {@link saveCampaignAsTemplateSchema}. */
export type SaveCampaignAsTemplateInput = z.infer<typeof saveCampaignAsTemplateSchema>;

/** Response of `GET /marketing/campaigns/:id` (and every campaign mutation). */
export type GetCampaignResponse = CampaignRow;

// ── The promo rules, as pure functions ───────────────────────────────────────
//
// Both the marketing service (validate / redeem) and the shop checkout have to
// decide whether a code applies and what it takes off. Written twice they would
// drift, and the drift would be invisible: a code the console calls valid while
// checkout silently ignores it. So the rules live here, over plain values, and
// each caller supplies its own database access.

/** The stored code, reduced to the fields the rules actually read. */
export interface PromoRuleFacts {
  status: string;
  appliesTo: string;
  startsAt: Date | null;
  expiryDate: Date | null;
  usageLimit: number | null;
  usedCount: number;
  minPurchase: number | null;
  oncePerMember: boolean;
  discountType: string;
  discountValue: number;
}

/** What is being bought, and by whom, when that is known. */
export interface PromoRuleContext {
  /** Which catalogue the purchase came from; absent means "unknown". */
  scope?: PromoScope;
  /** Whether this buyer has already spent a one-per-customer code. */
  alreadyRedeemed?: boolean;
  /** Purchase total in MINOR units, for the minimum-spend floor. */
  amount?: number;
  /** Milliseconds since epoch; injectable so the window is testable. */
  now?: number;
}

/**
 * Why this code cannot be used, or `null` when it can.
 *
 * The order is deliberate: the reason a customer is shown should be the most
 * fundamental one. "This code is switched off" is more useful than "you have
 * already used it", and a code outside its window is not really about scope.
 */
export function promoRejectionReason(
  promo: PromoRuleFacts,
  context: PromoRuleContext = {},
): PromoRejectionReason | null {
  const now = context.now ?? Date.now();

  if (promo.status !== 'active') return 'inactive';
  if (promo.startsAt && promo.startsAt.getTime() > now) return 'not_started';
  if (promo.expiryDate && promo.expiryDate.getTime() < now) return 'expired';
  if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
    return 'usage_limit_reached';
  }
  // A scoped code needs to know what is being bought; without that the honest
  // answer is no, since honouring a supplements code against a membership is
  // precisely what the scope exists to stop.
  if (promo.appliesTo !== 'all' && promo.appliesTo !== context.scope) {
    return 'out_of_scope';
  }
  if (promo.oncePerMember && context.alreadyRedeemed) return 'already_redeemed';
  if (
    promo.minPurchase !== null &&
    context.amount !== undefined &&
    context.amount < promo.minPurchase
  ) {
    return 'below_min_purchase';
  }
  return null;
}

/**
 * What the code takes off `amount`, in MINOR units.
 *
 * Never more than the amount itself: a 5000-off voucher against a 3000 basket
 * discounts 3000, not 5000, so a purchase can never total below zero and turn
 * into a refund. Percentages round down, so rounding always favours the gym by
 * at most a tetri.
 */
export function computePromoDiscount(
  promo: Pick<PromoRuleFacts, 'discountType' | 'discountValue'>,
  amount: number,
): number {
  if (amount <= 0) return 0;
  if (promo.discountType === 'percentage') {
    return Math.min(amount, Math.floor((amount * promo.discountValue) / 100));
  }
  return Math.min(amount, promo.discountValue);
}
