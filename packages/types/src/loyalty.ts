import { z } from 'zod';

// @fit/types/loyalty — the staff console's Loyalty contract (T12.10): program
// config, the points ledger, the rewards catalogue, and redemptions. Shared by
// the NestJS `/loyalty` module, the admin app (T12.11), and the reports
// drill-down (T12.13).
//
// The reason / reward-type / redemption-status strings are the exact wire
// contract: they match the Prisma `LoyaltyReason` / `LoyaltyRewardType` /
// `LoyaltyRedemptionStatus` enum member names, so nothing is mapped between the
// database, the server, and JSON. Inferred from the gym-admin prototype's
// `app/reports/loyalty/page.tsx` (Points Issued vs Redeemed, Redemptions by
// Reward Type, Top Earners, Recent Redemptions).

// ---------------------------------------------------------------------------
// Enums & catalogs
// ---------------------------------------------------------------------------

/** Why a ledger entry was written — mirrors Prisma `LoyaltyReason`. */
export const loyaltyReasonSchema = z.enum([
  'check_in',
  'purchase',
  'manual',
  'redemption',
  'signup',
]);

/** A loyalty ledger reason — {@link loyaltyReasonSchema}. */
export type LoyaltyReason = z.infer<typeof loyaltyReasonSchema>;

/** The category a reward belongs to — mirrors Prisma `LoyaltyRewardType`. */
export const loyaltyRewardTypeSchema = z.enum([
  'pt_session',
  'day_pass',
  'guest_pass',
  'merchandise',
  'drink',
  'discount',
  'other',
]);

/** A reward category — {@link loyaltyRewardTypeSchema}. */
export type LoyaltyRewardType = z.infer<typeof loyaltyRewardTypeSchema>;

/** A redemption's fulfilment state — mirrors Prisma `LoyaltyRedemptionStatus`. */
export const loyaltyRedemptionStatusSchema = z.enum(['pending', 'fulfilled', 'cancelled']);

/** A redemption status — {@link loyaltyRedemptionStatusSchema}. */
export type LoyaltyRedemptionStatus = z.infer<typeof loyaltyRedemptionStatusSchema>;

export interface LoyaltyRewardTypeMeta {
  value: LoyaltyRewardType;
  label: string;
}

/** The reward-type catalog (T12.10), served to the reward composer's type picker. */
export const LOYALTY_REWARD_TYPE_CATALOG: readonly LoyaltyRewardTypeMeta[] = [
  { value: 'pt_session', label: 'Free PT session' },
  { value: 'day_pass', label: 'Day pass' },
  { value: 'guest_pass', label: 'Guest pass' },
  { value: 'merchandise', label: 'Merchandise' },
  { value: 'drink', label: 'Smoothie / drink' },
  { value: 'discount', label: 'Discount' },
  { value: 'other', label: 'Other' },
];

export interface LoyaltyReasonMeta {
  value: LoyaltyReason;
  label: string;
}

/** The reason catalog (T12.10) — labels the member ledger renders per entry. */
export const LOYALTY_REASON_CATALOG: readonly LoyaltyReasonMeta[] = [
  { value: 'check_in', label: 'Check-in' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'signup', label: 'Sign-up bonus' },
  { value: 'manual', label: 'Manual adjustment' },
  { value: 'redemption', label: 'Redemption' },
];

export interface LoyaltyCatalogResponse {
  rewardTypes: readonly LoyaltyRewardTypeMeta[];
  reasons: readonly LoyaltyReasonMeta[];
}

// ---------------------------------------------------------------------------
// Program configuration
// ---------------------------------------------------------------------------

/**
 * The gym's loyalty program config. `pointsPerCurrencyUnit` is points awarded per
 * one MAJOR currency unit (e.g. per dollar/tetri-less unit) spent on a paid order;
 * the API converts the order's minor-unit `total` before applying it.
 */
export interface LoyaltyProgramResponse {
  enabled: boolean;
  pointsPerCheckIn: number;
  pointsPerCurrencyUnit: number;
  signupBonus: number;
  updatedAt: string | null;
}

/** Partial update of the program config — every field optional (PUT/PATCH). */
export const updateLoyaltyProgramSchema = z
  .object({
    enabled: z.boolean().optional(),
    pointsPerCheckIn: z.number().int().min(0).max(1_000_000).optional(),
    pointsPerCurrencyUnit: z.number().int().min(0).max(1_000_000).optional(),
    signupBonus: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateLoyaltyProgramInput = z.infer<typeof updateLoyaltyProgramSchema>;

// ---------------------------------------------------------------------------
// Rewards catalogue
// ---------------------------------------------------------------------------

export interface LoyaltyRewardRow {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  type: LoyaltyRewardType;
  active: boolean;
  stock: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListLoyaltyRewardsResponse {
  data: LoyaltyRewardRow[];
}

const rewardBase = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
  pointsCost: z.number().int().min(1).max(10_000_000),
  type: loyaltyRewardTypeSchema.default('other'),
  active: z.boolean().default(true),
  stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
});

export const createLoyaltyRewardSchema = rewardBase;
export type CreateLoyaltyRewardInput = z.infer<typeof createLoyaltyRewardSchema>;

export const updateLoyaltyRewardSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500),
    pointsCost: z.number().int().min(1).max(10_000_000),
    type: loyaltyRewardTypeSchema,
    active: z.boolean(),
    stock: z.number().int().min(0).max(1_000_000).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateLoyaltyRewardInput = z.infer<typeof updateLoyaltyRewardSchema>;

// ---------------------------------------------------------------------------
// Member balance & ledger
// ---------------------------------------------------------------------------

export interface LoyaltyLedgerEntryRow {
  id: string;
  memberId: string;
  delta: number;
  reason: LoyaltyReason;
  refId: string | null;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

/** A member's current balance plus their recent ledger history. */
export interface MemberLoyaltyResponse {
  memberId: string;
  balance: number;
  entries: LoyaltyLedgerEntryRow[];
}

/** A member's current points balance (the cheap read for the redeem dialog). */
export interface MemberBalanceResponse {
  memberId: string;
  balance: number;
}

/** A staff points adjustment — a signed non-zero delta with an optional note. */
export const adjustLoyaltyPointsSchema = z.object({
  delta: z
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((v) => v !== 0, { message: 'Adjustment cannot be zero' }),
  note: z.string().trim().max(300).optional(),
});

export type AdjustLoyaltyPointsInput = z.infer<typeof adjustLoyaltyPointsSchema>;

// ---------------------------------------------------------------------------
// Redemptions
// ---------------------------------------------------------------------------

export interface RedemptionRow {
  id: string;
  memberId: string;
  memberName: string;
  rewardId: string | null;
  rewardName: string;
  rewardType: LoyaltyRewardType;
  pointsSpent: number;
  status: LoyaltyRedemptionStatus;
  redeemedAt: string;
}

/** Redeem a reward for a member — validated against balance + stock server-side. */
export const redeemRewardSchema = z.object({
  memberId: z.string().min(1),
  rewardId: z.string().min(1),
});

export type RedeemRewardInput = z.infer<typeof redeemRewardSchema>;

/** The result of a successful redeem — the record plus the member's new balance. */
export interface RedeemRewardResult {
  redemption: RedemptionRow;
  balance: number;
}

export const listRedemptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: loyaltyRedemptionStatusSchema.optional(),
  type: loyaltyRewardTypeSchema.optional(),
  memberId: z.string().min(1).optional(),
});

export type ListRedemptionsQuery = z.infer<typeof listRedemptionsQuerySchema>;

export interface ListRedemptionsResponse {
  data: RedemptionRow[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Reports & aggregations (feed T12.13)
// ---------------------------------------------------------------------------

/** Headline loyalty KPIs across all time, gym-scoped. */
export interface LoyaltySummaryResponse {
  totalIssued: number;
  totalRedeemed: number;
  netOutstanding: number;
  redemptionsCount: number;
  activeRewards: number;
}

/** One month's issued-vs-redeemed totals (`month` = `YYYY-MM`). */
export interface LoyaltyPointsBucket {
  month: string;
  issued: number;
  redeemed: number;
}

export interface LoyaltyPointsTimeseriesResponse {
  data: LoyaltyPointsBucket[];
}

export const loyaltyTimeseriesQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

export type LoyaltyTimeseriesQuery = z.infer<typeof loyaltyTimeseriesQuerySchema>;

export interface LoyaltyRedemptionsByTypeRow {
  type: LoyaltyRewardType;
  label: string;
  points: number;
  count: number;
}

export interface LoyaltyRedemptionsByTypeResponse {
  data: LoyaltyRedemptionsByTypeRow[];
}

export interface LoyaltyTopEarnerRow {
  memberId: string;
  name: string;
  email: string;
  points: number;
}

export interface LoyaltyTopEarnersResponse {
  data: LoyaltyTopEarnerRow[];
}

export const loyaltyTopEarnersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type LoyaltyTopEarnersQuery = z.infer<typeof loyaltyTopEarnersQuerySchema>;
