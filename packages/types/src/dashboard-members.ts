// @fit/types — the hand-built Members dashboard tab's contract (Zod schemas).
//
// Sibling of `./dashboard-sales`. Where that tab answers "what did we take?",
// this one answers "who is still here, and for how much longer?" — the standing
// membership numbers plus the retention rate that frames them.
//
// Money is an integer in the currency's MINOR units (cents/tetri) throughout.
// Display labels for statuses and windows are NOT on the wire: they are i18n keys
// resolved client-side, so the API stays locale-free like every sibling contract.
//
// Every figure is a REAL aggregation over rows that exist today. Time series are
// densely zero-filled — a bucket with no signups is a real zero. Retention is the
// one exception in the other direction: a bucket whose denominator is zero emits
// `null`, never `0`, because a gym with no members to retain had no retention
// rate, and 0% is a different and alarming claim.

import { z } from 'zod';
import { salesGranularitySchema } from './dashboard-sales';
import { reportSeriesPointSchema } from './reports-drilldown';

/* -------------------------------------------------------------------------- */
/*  Query                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How the tab's trends are bucketed. Deliberately the SAME vocabulary and the
 * same window mapping as Sales (`SALES_GRANULARITY_RANGE`), so a user who learns
 * one tab's time control has learned the other's.
 */
export const membersGranularitySchema = salesGranularitySchema;
export type MembersGranularity = z.infer<typeof membersGranularitySchema>;

/** The granularity a query without one lands on. */
export const DEFAULT_MEMBERS_GRANULARITY: MembersGranularity = 'daily';

/**
 * How far back the rolling retention window reaches, in days. A string enum
 * rather than a number so it round-trips through a URL query and a
 * `SegmentedControl` value without coercion at either end.
 */
export const retentionWindowSchema = z.enum(['30', '60', '90']);
export type RetentionWindow = z.infer<typeof retentionWindowSchema>;

/** The retention window a query without one lands on. */
export const DEFAULT_RETENTION_WINDOW: RetentionWindow = '30';

/**
 * How far ahead the expiring-soon list looks, in days. Declared here and echoed
 * by the API, but **nothing in Plan A reads it** — Plan B's expiring-soon card is
 * its consumer. It is in the contract from the start so the query shape does not
 * change under that plan.
 */
export const expiringWindowSchema = z.enum(['7', '14', '30']);
export type ExpiringWindow = z.infer<typeof expiringWindowSchema>;

/** The expiring window a query without one lands on. */
export const DEFAULT_EXPIRING_WINDOW: ExpiringWindow = '7';

/**
 * `GET /dashboard/members?granularity=&retentionWindow=&expiringWindow=` query.
 * `.catch` (not `.default`) so a hand-edited URL lands on the default rather than
 * a 400 — the same forgiving rule the overview and sales queries apply.
 */
export const dashboardMembersQuerySchema = z.object({
  granularity: membersGranularitySchema.catch(DEFAULT_MEMBERS_GRANULARITY),
  retentionWindow: retentionWindowSchema.catch(DEFAULT_RETENTION_WINDOW),
  expiringWindow: expiringWindowSchema.catch(DEFAULT_EXPIRING_WINDOW),
});
export type DashboardMembersQuery = z.infer<typeof dashboardMembersQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Response pieces                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The billing states a membership can be in, in lifecycle order — the wire form
 * of `SubscriptionStatus`.
 *
 * All six, not the four a membership dashboard obviously needs: `past-due` is a
 * failed charge staff must react to before it becomes a cancellation, and
 * `canceled` (the member left) is a different fact from `expired` (the billing
 * ran out), which a retention surface must not merge.
 */
export const MEMBER_STATUSES = [
  'trial',
  'active',
  'past-due',
  'frozen',
  'canceled',
  'expired',
] as const;
export const memberStatusSchema = z.enum(MEMBER_STATUSES);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

/** One bucket of the signups-against-churn trend. */
export const signupsChurnPointSchema = z.object({
  /** Bucket start, `YYYY-MM-DD`. */
  label: z.string(),
  signups: z.number(),
  churned: z.number(),
});
export type SignupsChurnPoint = z.infer<typeof signupsChurnPointSchema>;

/**
 * One bucket of the retention trend. `value` is a percentage 0–100, or `null`
 * when the bucket had no members to retain — see this module's header.
 */
export const retentionPointSchema = z.object({
  label: z.string(),
  value: z.number().nullable(),
});
export type RetentionPoint = z.infer<typeof retentionPointSchema>;

/** One bar of the members-by-status breakdown. */
export const memberStatusSliceSchema = z.object({
  status: memberStatusSchema,
  count: z.number(),
});
export type MemberStatusSlice = z.infer<typeof memberStatusSliceSchema>;

/** The tab's four headline figures. `avgLtv` is MINOR units; the rest are counts. */
export const membersKpisSchema = z.object({
  activeMembers: z.number(),
  newSignups: z.number(),
  churned: z.number(),
  avgLtv: z.number(),
});
export type MembersKpis = z.infer<typeof membersKpisSchema>;

/* -------------------------------------------------------------------------- */
/*  Response                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `GET /dashboard/members` response — the whole tab in one round trip, so its
 * controls never leave one card describing a different window from its neighbour.
 * Echoes the resolved query so the client can confirm what it is looking at.
 */
export const dashboardMembersResponseSchema = z.object({
  granularity: membersGranularitySchema,
  retentionWindow: retentionWindowSchema,
  expiringWindow: expiringWindowSchema,
  /** ISO-4217 currency `avgLtv` is denominated in. */
  currency: z.string(),
  kpis: membersKpisSchema,
  /** Members holding a live subscription at each bucket's start — dense. */
  activeOverTime: z.array(reportSeriesPointSchema),
  /** New joins against churned subscriptions per bucket — dense. */
  signupsVsChurn: z.array(signupsChurnPointSchema),
  /** Rolling retention per bucket — dense, with `null` where undefined. */
  retention: z.array(retentionPointSchema),
  /** Only states with a non-zero count, in lifecycle order. */
  byStatus: z.array(memberStatusSliceSchema),
});
export type DashboardMembersResponse = z.infer<typeof dashboardMembersResponseSchema>;
