import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GymMemberStatus, Prisma, Role, TrainerStatus } from '@fit/db';
import type {
  CreateStaffInput,
  InviteStaffInput,
  InviteStaffResponse,
  ListStaffQuery,
  ListStaffResponse,
  PendingInvite,
  StaffMember,
  StaffRole,
  UpdateStaffProfileInput,
  UpdateStaffRoleInput,
  UpdateStaffRoleResponse,
} from '@fit/types';
import { gymSettingsStoredSchema } from '@fit/types';
import { env } from '../config/env';
import { generateVerificationToken } from '../auth/auth.service';
import { EmailService } from '../auth/email.service';
import { resolveEmailLocale } from '../mail/email-locale';
import { TokenService } from '../auth/token.service';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { isPlaceholderEmail, placeholderEmail } from '../common/directory-identity';
import { assignedAtLocation } from '../common/location-filter.util';

/** The gym-scoped roles that count as staff — every role except a plain `MEMBER`. */
const STAFF_ROLES: Role[] = [Role.OWNER, Role.MANAGER, Role.RECEPTIONIST, Role.TRAINER];

/**
 * Shape the staff roster query selects off `GymMember`, joined to the
 * (cross-tenant) `User` for the person's identity, plus the directory-staff
 * extras the roster now renders (split name, phone, branch assignments).
 * Kept narrow — staff management never needs the PII the member
 * endpoints also avoid (`passwordHash`, OAuth subject ids).
 *
 * **`locationAssignments`, not `assignedLocationIds`.** Stage 6 of multi-branch
 * moved the work-assignment set into the `LocationStaff` join table and this read
 * follows it. The array is still WRITTEN (see {@link writeLocationAssignments})
 * and is never read here again, which is the whole of the drift decision: a
 * shadow that is only ever written cannot disagree with the source.
 *
 * The join also collapses a round trip the array forced. Resolving names off ids
 * used to mean a second `location.findMany` and a `Map` lookup per row, with a
 * `.filter(Boolean)` to drop ids naming branches that no longer existed. The
 * relation returns the names with the rows and the FK cascade means a dangling id
 * cannot occur, so both the extra query and the defensive filter are gone.
 */
const STAFF_SELECT = {
  id: true,
  userId: true,
  role: true,
  status: true,
  joinedAt: true,
  firstName: true,
  lastName: true,
  locationAssignments: {
    select: { locationId: true, location: { select: { name: true } } },
    orderBy: { location: { name: 'asc' } },
  },
  user: { select: { name: true, email: true, phone: true } },
  // The linked coach profile (staff ⇄ trainer link) — just its id, so the roster
  // can offer "open coach profile" without a second round-trip.
  trainerProfile: { select: { id: true } },
} satisfies Prisma.GymMemberSelect;

type StaffRecord = Prisma.GymMemberGetPayload<{ select: typeof STAFF_SELECT }>;

/** Columns the pending-invite list selects off `StaffInvite`. */
const INVITE_SELECT = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
} satisfies Prisma.StaffInviteSelect;

type InviteRecord = Prisma.StaffInviteGetPayload<{ select: typeof INVITE_SELECT }>;

/**
 * The slice of a transaction client {@link writeLocationAssignments} needs.
 * Structural on purpose: the tenant-**extended** client is not assignable to
 * `Prisma.TransactionClient` (their default args differ), so a helper the scoped
 * `$transaction` can pass has to be typed by the two calls it makes rather than by
 * either client's whole surface — the same shape `products/order-stock.ts` uses
 * and for the same reason.
 */
interface LocationStaffWriter {
  locationStaff: {
    deleteMany(args: { where: { staffId: string } }): Promise<{ count: number }>;
    createMany(args: {
      data: { gymId: string; staffId: string; locationId: string }[];
    }): Promise<{ count: number }>;
  };
}

/** The distinct branch ids a submitted weekly schedule names. */
function shiftLocationIds(shifts: readonly { locationId?: string }[]): string[] {
  return [...new Set(shifts.map((shift) => shift.locationId).filter((id): id is string => !!id))];
}

/**
 * Replace a staff member's branch assignments — the `LocationStaff` rows Stage 6
 * of multi-branch introduced.
 *
 * Set-based, matching the editor: the sent list becomes the assignment set, so
 * this deletes what is there and re-inserts. Moving an assignment is a delete and
 * a create because the pair IS the fact; there is nothing on the row to update.
 *
 * ## The drift decision, in one place
 *
 * `GymMember.assignedLocationIds` still exists and is DEPRECATED. It is kept, not
 * dropped, because `staff.service.ts` selected it until this change: dropping the
 * column in the migration that added this table would 500 every staff list in the
 * gap between the migration running and the new image serving. While both exist the
 * join table is authoritative and the array is a shadow that nothing in the
 * DATABASE keeps in step — there is no trigger, and the schema says so.
 *
 * So this codebase keeps them in step itself, on the only terms that cannot drift:
 *
 *  - **Every write path writes BOTH, in one transaction.** The two callers
 *    ({@link StaffService.createStaff} and {@link StaffService.updateStaffProfile})
 *    set the array on the member in the same `$transaction` that calls this. Either
 *    both land or neither does.
 *  - **No read path reads the array.** `STAFF_SELECT` takes `locationAssignments`,
 *    the roster filter takes `assignedAtLocation`, and the dashboard takes the same
 *    join. A shadow that is written and never read cannot make a number wrong; the
 *    worst it can do is be stale in the database, where only the previous API image
 *    would see it — which is precisely the image it is being kept alive for.
 *
 * The alternative — stop writing the array now — was rejected for that same
 * rolling deploy: an old image reads the array to render the roster's branch
 * column, so a staff member edited during the window would silently lose their
 * branches on the old screens. The alternative after it — keep READING the array
 * as a fallback — was rejected because a fallback is how two sources of truth
 * survive: the moment a read prefers the array for some rows, "authoritative"
 * means nothing and the drift becomes visible instead of inert.
 *
 * The array's write can be deleted with the column, in the follow-up migration.
 * Nothing else has to change when it goes.
 */
async function writeLocationAssignments(
  tx: LocationStaffWriter,
  gymId: string,
  staffId: string,
  locationIds: readonly string[],
): Promise<void> {
  await tx.locationStaff.deleteMany({ where: { staffId } });
  if (locationIds.length === 0) {
    return;
  }
  await tx.locationStaff.createMany({
    // `createMany` with the pair's unique constraint: a duplicate id in the
    // request would violate it, so it is collapsed here rather than 500-ing. The
    // array silently allowed one and doubled the person in any count derived
    // from it.
    data: [...new Set(locationIds)].map((locationId) => ({ gymId, staffId, locationId })),
  });
}

/**
 * Staff-console staff management for a gym (T4.7): invite, list, re-role, and
 * remove the gym's privileged members, and revoke pending invitations.
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `gymMember` /
 * `staffInvite` query is auto-constrained to (and, on create, stamped with) the
 * caller's gym by the Prisma tenant extension, so staff can only ever read or
 * mutate their own gym's staff — there is no `gymId` to pass or to forget.
 *
 * Two invariants the writes defend:
 *   • **Last owner.** A gym must always keep at least one `OWNER`, so the only
 *     remaining owner can neither be re-roled nor removed (`403 LAST_OWNER`).
 *   • **Immediate revocation.** Removing a staff member deletes their membership
 *     and revokes every refresh token they hold (and bumps their `tokenVersion`),
 *     so they cannot mint a new session — access is cut within one short-lived
 *     access-token lifetime.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly email: EmailService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * The gym's active staff plus its pending invitations — the two collections the
   * staff page renders. Neither is paginated: a gym's staff (and outstanding
   * invites) is a small, bounded set. An invite past its `expiresAt` is still
   * listed (flagged `expired`) so staff can revoke or re-send it.
   *
   * The optional `filter` narrows the staff roster by `role` and/or `status` (the
   * staff-list tab's filters) — a `role` is still constrained to the staff roles,
   * so filtering never leaks a plain `MEMBER`. The pending-invite list is left
   * unfiltered (it has no membership status, and its own role could differ from a
   * role filter without being a useful "staff" match).
   */
  async listStaff(filter: ListStaffQuery = {}): Promise<ListStaffResponse> {
    const [staff, invites] = await Promise.all([
      this.prisma.client.gymMember.findMany({
        where: {
          role: filter.role ? (filter.role as Role) : { in: STAFF_ROLES },
          ...(filter.status ? { status: filter.status } : {}),
          // "Who can work at branch X" — the reverse query `assignedLocationIds`
          // could not answer without scanning every membership in the gym,
          // customers included. Served by `location_staff(gymId, locationId)`.
          //
          // Availability, so it OVERLAPS: a coach who covers both sites is on both
          // branches' rosters and per-branch lengths sum to more than this list
          // does unfiltered. Deliberately NOT `GymMember.locationId`, which is the
          // person's base branch and partitions — that column is what a per-branch
          // head-count of the payroll reads, and using it here would answer a
          // different question with the same-looking number.
          ...assignedAtLocation(filter.locationId),
        },
        select: STAFF_SELECT,
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.client.staffInvite.findMany({
        where: { usedAt: null },
        select: INVITE_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      staff: staff.map((row) => this.toStaffMember(row)),
      // Pending invites are NOT branch-filtered, and cannot be: an invitation
      // names an email and a role, and the person has no membership yet — so
      // there are no assignments to filter on. Under a branch filter the roster
      // narrows and this list does not, which is the honest rendering of "nobody
      // has told us where they will work".
      invites: invites.map((row) => this.toPendingInvite(row)),
    };
  }

  /**
   * Add a staff member straight to the directory (`POST /staff`) — a login-less
   * record: no invitation email is sent and no password is set, so they appear in
   * the roster but can never sign in. Backed by a `User` with a null
   * `passwordHash` (the console shows First/Last from the membership, so the
   * `User` only needs a name for other surfaces); an omitted email gets a unique
   * placeholder so the required+unique `User.email` still holds. A supplied email
   * that already belongs to a user is a `409 EMAIL_IN_USE`. The selected
   * specialties, assigned locations and weekly working hours are written in the
   * same transaction. Returns the new staff member.
   */
  async createStaff(input: CreateStaffInput): Promise<StaffMember> {
    const gymId = this.tenant.gymId;
    const email = input.email?.trim() ? input.email.trim().toLowerCase() : null;

    if (email) {
      const clash = await this.prisma.client.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException({
          message: 'That email already belongs to a user',
          code: 'EMAIL_IN_USE',
        });
      }
    }

    const displayName = [input.firstName, input.lastName]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(' ');

    // Both branch sets are checked against the gym's own live branches BEFORE the
    // transaction opens, so a bad id is a 422 rather than a foreign-key violation
    // surfacing as a 500 — and so the check is written once for the two places a
    // branch reaches this service. The array never had this: an id naming a
    // deleted branch, or another gym's, was silently legal.
    const live = await this.liveLocationIds();
    this.assertLiveLocations(input.assignedLocationIds, live);
    this.assertLiveLocations(shiftLocationIds(input.workingHours), live);

    const memberId = await this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email ?? placeholderEmail(),
          name: displayName || null,
          phone: input.phone?.trim() ? input.phone.trim() : null,
        },
        select: { id: true },
      });

      const member = await tx.gymMember.create({
        data: {
          gymId,
          userId: user.id,
          role: input.role as Role,
          status: input.status as GymMemberStatus,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim() || null,
          // The deprecated shadow, written in the same transaction as the join
          // table it shadows — see {@link writeLocationAssignments}.
          assignedLocationIds: input.assignedLocationIds,
        },
        select: { id: true },
      });

      await writeLocationAssignments(tx, gymId, member.id, input.assignedLocationIds);

      if (input.workingHours.length > 0) {
        await tx.shiftSlot.createMany({
          data: input.workingHours.map((shift) => ({
            gymId,
            staffId: member.id,
            dayOfWeek: shift.dayOfWeek,
            startTime: shift.startTime,
            endTime: shift.endTime,
            // A real branch FK. The free-text `location` this replaced took a
            // typed name, joined to nothing, and went stale the moment a branch
            // was renamed; the column survives ONLY to hold the strings that
            // named no branch, and no write path may add to that queue.
            locationId: shift.locationId ?? null,
          })),
        });
      }

      // A coach on the roster must also be assignable to a class, and classes
      // hang off `Trainer`, not off the membership — so the profile is created
      // here, in the same transaction, rather than left for someone to notice.
      if (input.role === Role.TRAINER) {
        await tx.trainer.create({
          data: { gymId, name: displayName || 'Trainer', staffId: member.id },
          select: { id: true },
        });
      }

      return member.id;
    });

    return this.projectStaff(memberId);
  }

  /**
   * Invite someone to join the gym's staff (T4.7). Rejects an address that is
   * already a staff member of this gym with `409 ALREADY_STAFF` (re-role them
   * instead). Any earlier *pending* invite for the same address is replaced, so a
   * re-invite is a clean "resend" rather than a pile-up of duplicates. Mints a
   * single-use token (expiring in `STAFF_INVITE_TTL`), stores the invite, and
   * sends the invite email best-effort. Returns the new invite's id.
   */
  async inviteStaff(input: InviteStaffInput): Promise<InviteStaffResponse> {
    const { email, role } = input;

    // Already a staff member of *this* gym? The scoped query constrains gymId, so
    // this only ever sees our own gym's memberships. A plain MEMBER is allowed —
    // accepting the invite upgrades them — so only staff roles collide.
    const existingStaff = await this.prisma.client.gymMember.findFirst({
      where: { role: { in: STAFF_ROLES }, user: { email } },
      select: { id: true },
    });
    if (existingStaff) {
      throw new ConflictException({
        message: 'That person is already a staff member of your gym',
        code: 'ALREADY_STAFF',
      });
    }

    // Replace any prior pending invite for the same address (a clean resend).
    await this.prisma.client.staffInvite.deleteMany({ where: { email, usedAt: null } });

    const token = generateVerificationToken();
    const invite = await this.prisma.client.staffInvite.create({
      data: {
        gymId: this.tenant.gymId,
        email,
        role,
        token,
        expiresAt: new Date(Date.now() + env.STAFF_INVITE_TTL * 1000),
      },
      select: { id: true },
    });

    // Best-effort delivery: the invite already exists, so a transient mail
    // failure must not fail the request (staff can resend). The gym name is for
    // the email copy only; `Gym` is unscoped (keyed by id), so this is a plain
    // lookup by the request's own tenant id.
    try {
      const gym = await this.prisma.client.gym.findUnique({
        where: { id: this.tenant.gymId },
        select: { name: true, settings: true },
      });
      const language = gymSettingsStoredSchema.parse(gym?.settings ?? {}).locale.language;
      await this.email.sendStaffInviteEmail(
        email,
        token,
        gym?.name ?? 'your gym',
        role,
        resolveEmailLocale(language),
      );
    } catch (error) {
      this.logger.error(
        `Failed to send staff invite email to ${email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return { inviteId: invite.id };
  }

  /**
   * Revoke a pending invitation (`DELETE /staff/invite/:inviteId`). Deletes the
   * invite outright so its accept link can never be redeemed. An unknown /
   * already-used / cross-tenant id is a `404 INVITE_NOT_FOUND` (the scoped `where`
   * constrains `gymId`, so a cross-tenant id never matches).
   */
  async revokeInvite(inviteId: string): Promise<void> {
    const deleted = await this.prisma.client.staffInvite.deleteMany({
      where: { id: inviteId, usedAt: null },
    });
    if (deleted.count === 0) {
      throw new NotFoundException({ message: 'Invitation not found', code: 'INVITE_NOT_FOUND' });
    }
  }

  /**
   * Change a staff member's role (`PATCH /staff/:memberId/role`). Guards the
   * last-owner invariant: downgrading the gym's only `OWNER` is refused with
   * `403 LAST_OWNER`, so a gym can never be left ownerless. An unknown /
   * cross-tenant id is a `404 STAFF_NOT_FOUND`. Returns the updated staff member.
   */
  async updateRole(
    memberId: string,
    input: UpdateStaffRoleInput,
  ): Promise<UpdateStaffRoleResponse> {
    const member = await this.requireStaff(memberId);

    if (member.role === Role.OWNER && input.role !== Role.OWNER) {
      await this.assertNotLastOwner();
    }

    await this.prisma.client.gymMember.update({
      where: { id: memberId },
      data: { role: input.role },
    });
    await this.syncTrainerProfile(memberId, input.role);

    return this.projectStaff(memberId);
  }

  /**
   * Edit a directory staff member's profile (`PATCH /staff/:memberId/profile`).
   * A partial update — only the fields present in `input` change. `firstName` /
   * `lastName` (and the mirrored `User.name`), `status`, contact `email` / `phone`
   * and `assignedLocationIds` patch the member/user; a sent `workingHours`
   * replaces the whole weekly schedule (set-based, matching the schedule editor).
   * Role is changed via {@link updateRole}, not here. `404 STAFF_NOT_FOUND` for an
   * unknown id; `409 EMAIL_IN_USE` when a new email already belongs to someone else.
   */
  async updateStaffProfile(memberId: string, input: UpdateStaffProfileInput): Promise<StaffMember> {
    const existing = await this.prisma.client.gymMember.findFirst({
      where: { id: memberId, role: { in: STAFF_ROLES } },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });
    if (!existing) {
      throw new NotFoundException({ message: 'Staff member not found', code: 'STAFF_NOT_FOUND' });
    }
    const gymId = this.tenant.gymId;

    // Only a non-empty address changes the email; an empty/absent value leaves it
    // untouched (edit never rewrites a real address to a synthetic placeholder).
    const email = input.email?.trim() ? input.email.trim().toLowerCase() : undefined;
    if (email) {
      const clash = await this.prisma.client.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (clash && clash.id !== existing.userId) {
        throw new ConflictException({
          message: 'That email already belongs to a user',
          code: 'EMAIL_IN_USE',
        });
      }
    }

    // Same pre-flight as the create path, for the same reason.
    if (input.assignedLocationIds !== undefined || input.workingHours !== undefined) {
      const live = await this.liveLocationIds();
      this.assertLiveLocations(input.assignedLocationIds ?? [], live);
      this.assertLiveLocations(shiftLocationIds(input.workingHours ?? []), live);
    }

    await this.prisma.client.$transaction(async (tx) => {
      const memberData: Prisma.GymMemberUpdateInput = {};
      if (input.firstName !== undefined) memberData.firstName = input.firstName.trim();
      if (input.lastName !== undefined) memberData.lastName = input.lastName.trim() || null;
      if (input.status !== undefined) memberData.status = input.status;
      if (input.assignedLocationIds !== undefined) {
        // The shadow copy. Kept exactly in step with the join table below rather
        // than left to rot: while both exist a stale array is a live 500 waiting
        // for the rolling deploy this column is being kept alive for.
        memberData.assignedLocationIds = input.assignedLocationIds;
      }
      if (Object.keys(memberData).length > 0) {
        await tx.gymMember.update({ where: { id: memberId }, data: memberData });
      }
      if (input.assignedLocationIds !== undefined) {
        await writeLocationAssignments(tx, gymId, memberId, input.assignedLocationIds);
      }

      const userData: Prisma.UserUpdateInput = {};
      // Re-mirror the combined `User.name` whenever either name part is edited.
      if (input.firstName !== undefined || input.lastName !== undefined) {
        const first =
          input.firstName !== undefined ? input.firstName.trim() : (existing.firstName ?? '');
        const last =
          input.lastName !== undefined ? input.lastName.trim() : (existing.lastName ?? '');
        userData.name =
          [first, last]
            .map((p) => p.trim())
            .filter(Boolean)
            .join(' ') || null;
        // Keep the coach profile's name in step, so renaming someone on the staff
        // roster doesn't leave the schedule crediting their old name.
        if (userData.name) {
          await tx.trainer.updateMany({
            where: { staffId: memberId },
            data: { name: userData.name },
          });
        }
      }
      if (email) userData.email = email;
      if (input.phone !== undefined)
        userData.phone = input.phone.trim() ? input.phone.trim() : null;
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id: existing.userId }, data: userData });
      }

      // A sent schedule replaces the member's whole week (set-based editor).
      if (input.workingHours !== undefined) {
        await tx.shiftSlot.deleteMany({ where: { staffId: memberId } });
        if (input.workingHours.length > 0) {
          await tx.shiftSlot.createMany({
            data: input.workingHours.map((shift) => ({
              gymId,
              staffId: memberId,
              dayOfWeek: shift.dayOfWeek,
              startTime: shift.startTime,
              endTime: shift.endTime,
              locationId: shift.locationId ?? null,
            })),
          });
        }
      }
    });

    return this.projectStaff(memberId);
  }

  /**
   * Remove a staff member (`DELETE /staff/:memberId`). Refuses to remove the
   * gym's only `OWNER` (`403 LAST_OWNER`) for the same reason re-role does. On
   * success the membership is deleted and **every session the user holds is
   * revoked** — their refresh tokens are killed and their `tokenVersion` bumped —
   * so they cannot obtain a new session and lose access within one access-token
   * lifetime. An unknown / cross-tenant id is a `404 STAFF_NOT_FOUND`.
   */
  async removeStaff(memberId: string): Promise<void> {
    const member = await this.requireStaff(memberId);

    if (member.role === Role.OWNER) {
      await this.assertNotLastOwner();
    }

    // Retire the coach profile before the membership goes. The FK is `SET NULL`,
    // so the profile survives the delete (class templates, occurrences, PT
    // sessions and reviews all point at it) — but the person no longer works
    // here, so it must not stay on the public roster or in the class trainer
    // picker either.
    await this.prisma.client.trainer.updateMany({
      where: { staffId: memberId },
      data: { status: TrainerStatus.INACTIVE },
    });

    await this.prisma.client.gymMember.delete({ where: { id: memberId } });

    // Cut their sessions. Refresh-token revocation + a tokenVersion bump together
    // mean their next refresh fails and resolves no staff scope, so the removed
    // member can't keep a session alive. (Refresh tokens are not gym-scoped, so
    // this signs the user out of any other gyms too — an acceptable, fail-safe
    // consequence of removing their access.)
    await this.tokens.revokeAllForUser(member.userId);
    await this.bumpTokenVersion(member.userId);
  }

  /**
   * Bring the member's coach profile in line with the role they now hold.
   *
   * Becoming a `TRAINER` creates the profile (or reactivates the one they had
   * before), because a class can only be assigned to a `Trainer` row — without
   * this a gym could put someone on the roster as a coach and then not find them
   * in the class trainer picker, which is exactly the gap this link closes.
   * Losing the role deactivates the profile rather than deleting it: the classes
   * they already taught still reference it, and re-promoting them later should
   * restore the same coach, ratings and reviews included.
   */
  private async syncTrainerProfile(memberId: string, role: Role): Promise<void> {
    const existing = await this.prisma.client.trainer.findFirst({
      where: { staffId: memberId },
      select: { id: true },
    });

    if (role !== Role.TRAINER) {
      if (existing) {
        await this.prisma.client.trainer.update({
          where: { id: existing.id },
          data: { status: TrainerStatus.INACTIVE },
        });
      }
      return;
    }

    if (existing) {
      await this.prisma.client.trainer.update({
        where: { id: existing.id },
        data: { status: TrainerStatus.ACTIVE },
      });
      return;
    }

    const member = await this.prisma.client.gymMember.findFirst({
      where: { id: memberId },
      select: { firstName: true, lastName: true, user: { select: { name: true, email: true } } },
    });
    if (!member) {
      return;
    }
    const name =
      [member.firstName, member.lastName]
        .map((part) => part?.trim() ?? '')
        .filter(Boolean)
        .join(' ') ||
      member.user.name?.trim() ||
      'Trainer';
    await this.prisma.client.trainer.create({
      data: { gymId: this.tenant.gymId, name, staffId: memberId },
      select: { id: true },
    });
  }

  /**
   * Resolve a staff-role membership in the caller's gym or throw a
   * `404 STAFF_NOT_FOUND`. The scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches — the guard for every write.
   */
  private async requireStaff(id: string): Promise<{ id: string; userId: string; role: Role }> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id, role: { in: STAFF_ROLES } },
      select: { id: true, userId: true, role: true },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Staff member not found', code: 'STAFF_NOT_FOUND' });
    }
    return member;
  }

  /**
   * Throw `403 LAST_OWNER` when the gym has at most one `OWNER` — the caller is
   * about to re-role or remove an owner, and the gym must keep at least one.
   */
  private async assertNotLastOwner(): Promise<void> {
    const owners = await this.prisma.client.gymMember.count({ where: { role: Role.OWNER } });
    if (owners <= 1) {
      throw new ForbiddenException({
        message: 'A gym must keep at least one owner',
        code: 'LAST_OWNER',
      });
    }
  }

  /**
   * Bump a user's `tokenVersion` so any session re-resolved on refresh is stamped
   * with the new counter. Uses the *unscoped* relation via the scoped client
   * (`User` is not a tenant-scoped model), updating by primary key.
   */
  private async bumpTokenVersion(userId: string): Promise<void> {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  /**
   * The ids of the gym's own live branches. The scoped client constrains `gymId`,
   * so this set is exactly "branches this request may name" — which is the check
   * `assignedLocationIds` never had and could not have had: a `String[]` gets no
   * foreign key, so an id naming a deleted branch (or ANOTHER GYM's) was silently
   * legal and stayed in the row forever.
   */
  private async liveLocationIds(): Promise<Set<string>> {
    const locations = await this.prisma.client.location.findMany({ select: { id: true } });
    return new Set(locations.map((loc) => loc.id));
  }

  /**
   * Reject a branch id that is not one of this gym's — a `422 LOCATION_INVALID`.
   *
   * Rejecting rather than silently dropping, deliberately. The old read path
   * filtered unknown ids out when resolving names, so a mistyped branch looked
   * like it saved and then simply was not there; with the join table the same
   * mistake would be a foreign-key violation surfacing as a 500. Neither tells the
   * operator what happened, and only one of them is loud.
   */
  private assertLiveLocations(ids: readonly string[], live: ReadonlySet<string>): void {
    const unknown = ids.find((id) => !live.has(id));
    if (unknown !== undefined) {
      throw new UnprocessableEntityException({
        message: 'Pick a branch of this gym',
        code: 'LOCATION_INVALID',
      });
    }
  }

  /** Re-query one staff member and project it. */
  private async projectStaff(memberId: string): Promise<StaffMember> {
    const row = await this.prisma.client.gymMember.findFirst({
      where: { id: memberId },
      select: STAFF_SELECT,
    });
    // The row was just created/updated under the scoped client, so it must resolve.
    if (!row) {
      throw new NotFoundException({ message: 'Staff member not found', code: 'STAFF_NOT_FOUND' });
    }
    return this.toStaffMember(row);
  }

  /** Project a queried membership row to the wire {@link StaffMember}. */
  private toStaffMember(row: StaffRecord): StaffMember {
    const fullName = row.user.name ?? row.user.email;
    // Directory staff carry a real split name; invited/User-backed staff are split
    // from their single `User.name` so the First/Last columns are always populated.
    const first = row.firstName ?? fullName.trim().split(/\s+/).filter(Boolean)[0] ?? '';
    const last = row.firstName
      ? (row.lastName ?? '')
      : fullName.trim().split(/\s+/).filter(Boolean).slice(1).join(' ');
    // Blank a synthetic placeholder address so the console never shows it.
    const email = isPlaceholderEmail(row.user.email) ? '' : row.user.email;
    return {
      id: row.id,
      userId: row.userId,
      name: [first, last].filter(Boolean).join(' ') || fullName,
      firstName: first,
      lastName: last,
      email,
      phone: row.user.phone,
      role: row.role as StaffRole,
      status: row.status,
      // Read off `LocationStaff`, never off the deprecated array. The wire shape is
      // unchanged so the console did not move with the schema; the guarantees did.
      // Every id here names a live branch of this gym, because the FK cascades the
      // row away with the branch — the `.filter(Boolean)` that used to drop
      // dangling ids is gone because a dangling id can no longer exist.
      assignedLocationIds: row.locationAssignments.map((a) => a.locationId),
      locations: row.locationAssignments.map((a) => a.location.name),
      joinedAt: row.joinedAt.toISOString(),
      trainerId: row.trainerProfile?.id ?? null,
    };
  }

  /** Project a queried invite row to the wire {@link PendingInvite} (computing `expired`). */
  private toPendingInvite(row: InviteRecord): PendingInvite {
    return {
      id: row.id,
      email: row.email,
      role: row.role as StaffRole,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      expired: row.expiresAt.getTime() <= Date.now(),
    };
  }
}
