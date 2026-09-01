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
 * Query for `GET /staff` — optionally narrow the roster by `role` and/or
 * `status` (the staff-list tab's filters). Both are optional; omitting them
 * returns every staff member, as before. A `role` is constrained to an
 * assignable staff role and `status` to a staff lifecycle state, so an
 * unexpected value is a `400` rather than a silent empty roster.
 */
export const listStaffQuerySchema = z.object({
  role: staffRoleSchema.optional(),
  status: staffStatusSchema.optional(),
  /**
   * Narrow the roster to the people ROSTERED at one branch — Stage 6's
   * `LocationStaff` join table, the work-assignment set the console edits as
   * {@link StaffMember.assignedLocationIds}.
   *
   * Not `GymMember.locationId`. That column is on a staff row too, where it means
   * the person's BASE branch, and reading it here would answer a different
   * question: it partitions the payroll, so it is what a head-count uses, while
   * this list answers "who can work here". A coach who covers both sites appears
   * under both branches, and per-branch roster lengths therefore sum to more than
   * the gym-wide roster — which is correct for a capability and would be a bug for
   * a total.
   *
   * A staff member with no assignments at all reaches no branch and is visible only
   * gym-wide. Omit for every branch, which is what "All locations" sends.
   */
  locationId: z.string().trim().min(1).optional(),
});

/** Validated `GET /staff` query — {@link listStaffQuerySchema}. */
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;

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
  /**
   * Split name for the roster's First/Last columns. Real values for a directory
   * staff member (stored on the membership); for an invited, `User`-backed member
   * they're derived from `name` server-side so the columns are always populated.
   */
  firstName: string;
  lastName: string;
  email: string;
  /** Contact phone (from the linked `User`), or `null` when none is on file. */
  phone: string | null;
  role: StaffRole;
  status: StaffStatus;
  /**
   * Ids of the gym branches this member is rostered to work at (the edit form's
   * selection).
   *
   * The name is unchanged and the SOURCE is not: since Stage 6 these are read from
   * the `LocationStaff` join table, which has real foreign keys, rather than from
   * the `GymMember.assignedLocationIds` array, which had none and could hold the id
   * of a deleted branch — or of another gym's — forever. The wire shape is
   * deliberately identical so the console did not have to change with the schema.
   *
   * Many-valued, and a capability rather than a location: it says where this person
   * CAN be rostered, not where they are today. Where one shift is worked is on the
   * shift ({@link ShiftSlotRow.locationId}).
   */
  assignedLocationIds: string[];
  /**
   * Names of those branches, resolved through the join table's relation (may be
   * empty). Every entry corresponds to an id in {@link assignedLocationIds}: a
   * dangling id can no longer occur, because the FK cascades the row away with the
   * branch.
   */
  locations: string[];
  joinedAt: string;
  /**
   * The coach profile this person teaches under, or `null` when they have none.
   * A `TRAINER`-role member always has one — the API creates it with the staff
   * record and keeps its name in step — so the roster can link straight to it and
   * classes can be assigned to the same person the directory lists. Non-trainer
   * roles read `null` unless they held the role before (the profile is
   * deactivated, not deleted, so their class history survives).
   */
  trainerId: string | null;
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
