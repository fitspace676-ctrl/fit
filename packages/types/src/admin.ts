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
 * A single gym as listed by `GET /admin/gyms` for the operator console. The
 * `subdomainSlug` is the tenant's DNS label (`<subdomainSlug>.fit.ge`); `mrr` is
 * the gym's monthly recurring revenue in minor currency units (tetri / cents).
 */
export interface AdminGymSummary {
  id: string;
  name: string;
  /** The tenant's subdomain label — the `slug` column, surfaced under its role here. */
  subdomainSlug: string;
  status: GymStatus;
  /** Total memberships in the gym (across every role and status). */
  memberCount: number;
  /** Monthly recurring revenue in minor units (tetri). 0 until billing lands. */
  mrr: number;
}

/**
 * Successful `GET /admin/gyms` response — the platform-wide gym roster with
 * status, member counts, and MRR. Cross-tenant by nature; SUPER_ADMIN only.
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
 * Successful `POST /admin/gyms/:id/impersonate` response. Returns a short-lived,
 * gym-scoped access token minted for the gym's owner so an operator can act as
 * them for support; the impersonation is always written to the audit log.
 */
export interface ImpersonateResponse {
  accessToken: string;
}
