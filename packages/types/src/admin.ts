// @fit/types — SuperAdmin platform console contracts (T2.12).
//
// Cross-tenant operator endpoints under `/admin/gyms`, reachable only by a
// SUPER_ADMIN (enforced API-side by `@AllowCrossTenant` + `TenantGuard`). The
// API validates inbound bodies with these Zod schemas and the `@fit/superadmin`
// console reuses the inferred types, so the request/response contract never
// drifts between the operator UI and the backend.

import { z } from 'zod';

/**
 * Platform lifecycle of a whole gym (tenant), mirroring the Prisma `GymStatus`
 * enum. `SUSPENDED` gates the gym's staff + members out of new sessions
 * (login + refresh) until it is flipped back to `ACTIVE`.
 */
export const gymStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);

export type GymStatus = z.infer<typeof gymStatusSchema>;

/**
 * A single gym as listed by `GET /admin/gyms` for the operator console.
 * `subdomainSlug` is the tenant's DNS label (`<subdomainSlug>.<root>`), which is
 * also how the console builds a link into that gym's portal and staff console.
 *
 * It used to carry an `mrr` field that the API filled with a literal `0`,
 * because the subscription model it would aggregate had not landed. A column of
 * zeroes is not a placeholder in a roster an operator uses to judge accounts —
 * it reads as "these gyms earn nothing". The field is gone until there is
 * revenue to report; `createdAt` and `owner` replace it with facts the platform
 * actually holds today.
 */
export interface AdminGymSummary {
  id: string;
  name: string;
  /** The tenant's subdomain label — the `slug` column, surfaced under its role here. */
  subdomainSlug: string;
  status: GymStatus;
  /** Total memberships in the gym (across every role and status). */
  memberCount: number;
  /** When the tenant was provisioned, ISO-8601. */
  createdAt: string;
  /**
   * The gym's owner, or `null` for a gym not yet bound to one — which is also
   * exactly the gym that cannot be impersonated (`GYM_HAS_NO_OWNER`).
   */
  owner: { email: string; name: string | null } | null;
}

/**
 * Successful `GET /admin/gyms` response — the platform-wide gym roster.
 * Cross-tenant by nature; SUPER_ADMIN only.
 */
export interface ListAdminGymsResponse {
  gyms: AdminGymSummary[];
}

/**
 * Body for `PATCH /admin/gyms/:id/status`. The only mutable field is the gym's
 * platform lifecycle status — suspending or reactivating the whole tenant.
 */
export const updateGymStatusSchema = z.object({
  status: gymStatusSchema,
});

export type UpdateGymStatusInput = z.infer<typeof updateGymStatusSchema>;

/** Successful `PATCH /admin/gyms/:id/status` response — the gym's new status. */
export interface UpdateGymStatusResponse {
  id: string;
  status: GymStatus;
}

/**
 * Successful `POST /admin/gyms/:id/impersonate` response — a **handoff code**,
 * not a token.
 *
 * The endpoint used to answer with the impersonation JWT itself, which left the
 * operator console holding a credential it could only display. Getting that
 * credential into the tenant's own console means moving it across an origin, and
 * the obvious ways to move a JWT (a query string, a fragment) put a live session
 * into browser history, the referrer header, and every proxy log between here and
 * there.
 *
 * So the console gets an opaque, single-use, short-lived code instead. It travels
 * in the URL, where it is worth nothing after the one redemption that turns it
 * into a session — `POST /auth/impersonation/exchange`, which mints the token
 * server-side and hands it straight to a cookie.
 */
export interface ImpersonateResponse {
  /** Opaque single-use code, redeemed at `POST /auth/impersonation/exchange`. */
  handoffCode: string;
  /** How long the code stays redeemable. Seconds — deliberately very short. */
  expiresInSeconds: number;
}

/**
 * Body for `POST /auth/impersonation/exchange`. The code IS the credential, so
 * the route carries no session of its own: it is called by the tenant console's
 * server the moment an operator lands on its impersonation entry point.
 */
export const impersonationExchangeSchema = z.object({
  code: z.string().min(1),
});

export type ImpersonationExchangeInput = z.infer<typeof impersonationExchangeSchema>;

/**
 * Successful `POST /auth/impersonation/exchange` response — the gym-scoped OWNER
 * session, plus who and what it belongs to so the console can say so on screen.
 *
 * There is deliberately **no refresh token**. An impersonated session is meant to
 * run out: it lasts `expiresInSeconds` and then it is over, rather than renewing
 * itself in a tab the operator forgot about.
 */
export interface ImpersonationExchangeResponse {
  accessToken: string;
  /** The access token's remaining lifetime, in seconds. */
  expiresInSeconds: number;
  gym: {
    id: string;
    name: string;
    subdomainSlug: string;
  };
  /** The owner being impersonated — what the console's banner names. */
  ownerEmail: string;
}
