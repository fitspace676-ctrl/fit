// @fit/types — member self-service ("/me/*") contracts.
//
// The signed-in member reading/managing their own membership, profile, and
// goals. Each endpoint resolves the caller from the session — there is no member
// id on the wire — and is tenant-scoped to the caller's gym.

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/*  GET /me/subscription                                                       */
/* -------------------------------------------------------------------------- */

/** A member subscription's lifecycle state — mirrors the Prisma enum. */
export const meSubscriptionStatusSchema = z.enum([
  'ACTIVE',
  'PAST_DUE',
  'FROZEN',
  'CANCELED',
  'EXPIRED',
]);
export type MeSubscriptionStatus = z.infer<typeof meSubscriptionStatusSchema>;

/** The member's current membership, as the portal's Membership screen renders it. */
export const meSubscriptionSchema = z.object({
  id: z.string().min(1),
  status: meSubscriptionStatusSchema,
  /** Catalogue plan name, snapshotted; `null` for a bespoke / plan-less subscription. */
  planName: z.string().nullable(),
  priceAmount: z.number().int().nonnegative(),
  currency: z.string(),
  interval: z.enum(['MONTH', 'YEAR']),
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  cancelAtPeriodEnd: z.boolean(),
  /** ISO instant the freeze auto-resumes, or `null` when not frozen. */
  frozenUntil: z.string().nullable(),
  /** When the caller joined the gym (their `GymMember.joinedAt`). */
  memberSince: z.string(),
});
export type MeSubscription = z.infer<typeof meSubscriptionSchema>;

/** One invoice / payment row in the member's billing history. */
export const meInvoiceSchema = z.object({
  id: z.string().min(1),
  date: z.string(),
  amount: z.number().int().nonnegative(),
  currency: z.string(),
  status: z.enum(['PAID', 'PENDING', 'FAILED', 'REFUNDED']),
});
export type MeInvoice = z.infer<typeof meInvoiceSchema>;

/**
 * `GET /me/subscription` response. `subscription` is `null` for a member who has
 * never subscribed; `invoices` is their billing history, most recent first (empty
 * until recurring billing records payments).
 */
export interface GetMeSubscriptionResponse {
  subscription: MeSubscription | null;
  invoices: MeInvoice[];
}

/* -------------------------------------------------------------------------- */
/*  GET / PATCH /me/profile                                                    */
/* -------------------------------------------------------------------------- */

/** The caller's editable profile (a User attribute set, gym-independent). */
export const meProfileSchema = z.object({
  userId: z.string().min(1),
  name: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
});
export type MeProfile = z.infer<typeof meProfileSchema>;

/** `GET /me/profile` response. */
export interface GetMeProfileResponse {
  profile: MeProfile;
}

/**
 * Body for `PATCH /me/profile`. Every field optional — only the present ones are
 * written. `phone` may be explicitly `null` to clear it.
 */
export const updateMeProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
  })
  .strict();
export type UpdateMeProfileInput = z.infer<typeof updateMeProfileSchema>;

/** `PATCH /me/profile` response — the updated profile. */
export interface UpdateMeProfileResponse {
  profile: MeProfile;
}

/* -------------------------------------------------------------------------- */
/*  GET / PUT /me/goals                                                        */
/* -------------------------------------------------------------------------- */

/** A single training goal with current/target progress. */
export const meGoalSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  /** Current value and target, free units (e.g. workouts, kg). */
  current: z.number().nonnegative(),
  target: z.number().positive(),
  /** Display unit, e.g. "sessions", "kg". */
  unit: z.string().max(24).default(''),
});
export type MeGoal = z.infer<typeof meGoalSchema>;

/** `GET /me/goals` response. */
export interface ListMeGoalsResponse {
  goals: MeGoal[];
}

/** Body for `PUT /me/goals` — replace the caller's goal set (max 8). */
export const putMeGoalsSchema = z.object({
  goals: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        current: z.number().nonnegative(),
        target: z.number().positive(),
        unit: z.string().trim().max(24).default(''),
      }),
    )
    .max(8),
});
export type PutMeGoalsInput = z.infer<typeof putMeGoalsSchema>;
