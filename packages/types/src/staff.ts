// @fit/types — staff management contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the staff console's own staff management
// (T4.7): the `GET /staff` roster (active staff + pending invitations) the admin
// page renders, the `POST /staff/invite` invitation, the `DELETE /staff/invite/:id`
// revocation, the `PATCH /staff/:memberId/role` re-role, and the
// `DELETE /staff/:memberId` removal. The API validates inbound bodies with these
// Zod schemas and the `@fit/admin` console reuses the inferred types, so the
// table / invite form and the controller can never drift on the wire format.
//
// "Staff" are the gym's privileged {@link GymMember}s — every role except a plain
// `MEMBER` (who is a customer, managed under T4.2/T4.3) and the platform-wide
// `SUPER_ADMIN` (which is never gym-scoped). Roles are referenced by *name*
// (string), like `./permissions`, so this file stays importable by the browser
// bundles without pulling in the Prisma `@fit/db` enum.

import { z } from 'zod';

/**
 * The gym-scoped roles a staff member may be invited as or re-roled to. A subset
 * of the Prisma `Role` enum: `MEMBER` is a customer rather than staff (managed
 * under members, T4.2/T4.3) and `SUPER_ADMIN` is platform-wide, never assigned
 * within a gym — so neither can be picked here. The order is high-to-low
 * privilege so a role <select> renders sensibly.
 */
export const staffRoleSchema = z.enum(['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER']);

/** A role a staff member can hold — {@link staffRoleSchema}. */
export type StaffRole = z.infer<typeof staffRoleSchema>;

/**
 * A staff member's standing within the gym, mirroring the relevant `GymMemberStatus`
 * values (`ACTIVE` / `SUSPENDED`). Staff are created `ACTIVE` on accepting an
 * invite; the status is surfaced so the roster can badge a suspended account.
 */
export const staffStatusSchema = z.enum(['ACTIVE', 'INVITED', 'SUSPENDED']);

/** A staff member's lifecycle state — {@link staffStatusSchema}. */
export type StaffStatus = z.infer<typeof staffStatusSchema>;

/**
 * Body for `POST /staff/invite` — invite someone to join the gym's staff (T4.7).
 * `email` is normalised the same way registration normalises it (trim +
 * lower-case) so the invite matches the address regardless of typed casing, and
 * the accept flow links it to the right account. `role` is the role they will
 * hold once they accept, constrained to an assignable staff role. The API
 * re-validates with this exact schema, so the invite form and the controller can
 * never drift.
 */
export const inviteStaffSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required').max(200),
  role: staffRoleSchema,
});

/** Validated `POST /staff/invite` body — {@link inviteStaffSchema}. */
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

/**
 * Body for `PATCH /staff/:memberId/role` — change a staff member's role (T4.7).
 * A single assignable role; the API rejects downgrading the gym's only `OWNER`
 * with `403 LAST_OWNER` so a gym can never be left ownerless.
 */
export const updateStaffRoleSchema = z.object({
  role: staffRoleSchema,
});

/** Validated `PATCH /staff/:memberId/role` body — {@link updateStaffRoleSchema}. */
export type UpdateStaffRoleInput = z.infer<typeof updateStaffRoleSchema>;

/**
 * One active staff member as the roster table renders it — a denormalised
 * `GymMember` + `User`. `id` is the membership id (the handle the re-role / remove
 * routes take); `userId` is the underlying account (so the UI can flag "this is
 * you"). `joinedAt` is an ISO-8601 instant the table formats in the staff
 * member's local zone.
 */
export interface StaffMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
  joinedAt: string;
}

/**
 * One pending invitation as the roster renders it. `expired` is computed
 * server-side against `expiresAt` so the UI can badge a stale invite (still
 * listed, since staff may want to revoke or re-send it) without re-deriving the
 * comparison. `expiresAt` / `createdAt` are ISO-8601 instants.
 */
export interface PendingInvite {
  id: string;
  email: string;
  role: StaffRole;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
}

/**
 * Successful `GET /staff` response — the gym's active staff plus its pending
 * invitations, the two collections the staff page renders side by side. Neither
 * is paginated: a gym's staff (and outstanding invites) is a small, bounded set,
 * unlike the member roster.
 */
export interface ListStaffResponse {
  staff: StaffMember[];
  invites: PendingInvite[];
}

/**
 * Successful `POST /staff/invite` response (`201 Created`) — the id of the newly
 * created invitation (the handle `DELETE /staff/invite/:inviteId` revokes). A
 * `409 ALREADY_STAFF` is returned instead when the address is already an active
 * staff member of the gym.
 */
export interface InviteStaffResponse {
  inviteId: string;
}

/**
 * Successful `PATCH /staff/:memberId/role` response — the staff member with their
 * new role, so the table can update the row in place without a refetch.
 */
export type UpdateStaffRoleResponse = StaffMember;
