import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  BookingStatus,
  GymMemberStatus,
  NotificationCategory,
  NotificationChannel,
  Prisma,
  Role,
  TrainerStatus,
} from '@fit/db';
import type {
  CreateStaffInput,
  InviteStaffInput,
  CreateStaffResponse,
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
import { Permission, gymSettingsStoredSchema } from '@fit/types';
import { env } from '../config/env';
import { generateVerificationToken } from '../auth/auth.service';
import { EmailService } from '../auth/email.service';
import { resolveEmailLocale } from '../mail/email-locale';
import { TokenService } from '../auth/token.service';
import { invalidateGymAccess } from '../common/rbac/request-access';
import { CreditPacksService } from '../billing/credit-packs.service';
import { NotificationService } from '../notifications/notification.service';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { syncTrainerProfile, type TrainerSyncClient } from './trainer-profile-sync';
import { assertPermission } from '../common/rbac/assert-permission';
import { isPlaceholderEmail, placeholderEmail } from '../common/directory-identity';
import { assignedAtLocation } from '../common/location-filter.util';
import { findDefaultLocationId } from '../locations/default-location';

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
  firstName: true,
  lastName: true,
  locationIds: true,
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
/** A member whose booking a coach's removal cancelled — one notice each. */
interface CancellationNotice {
  kind: 'class' | 'pt';
  /** The cancelled occurrence or slot — the notice's dedupe key. */
  refId: string;
  userId: string;
  title: string;
  startsAt: Date;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly email: EmailService,
    private readonly tokens: TokenService,
    @Optional() private readonly creditPacks?: CreditPacksService,
    @Optional() private readonly notifications?: NotificationService,
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
          archivedAt: null,
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

    const inviteLocationIds = [...new Set(invites.flatMap((row) => row.locationIds))];
    const locations = inviteLocationIds.length
      ? await this.prisma.client.location.findMany({
          where: { id: { in: inviteLocationIds } },
          select: { id: true, name: true },
        })
      : [];
    return {
      staff: staff.map((row) => this.toStaffMember(row)),
      invites: invites
        .filter((row) => !filter.locationId || row.locationIds.includes(filter.locationId))
        .map((row) => ({
          ...this.toPendingInvite(row),
          locations: locations
            .filter((loc) => row.locationIds.includes(loc.id))
            .map((loc) => loc.name),
        })),
    };
  }

  /**
   * Add a staff member straight to the directory (`POST /staff`). No password is
   * set; with an email (and active status) a sign-in invitation goes out too, so
   * they can set one — without an email the record stays login-less, in the
   * roster but unable to sign in. Backed by a `User` with a null
   * `passwordHash` (the console shows First/Last from the membership, so the
   * `User` only needs a name for other surfaces); an omitted email gets a unique
   * placeholder so the required+unique `User.email` still holds. A supplied email
   * already in this gym is a `409 EMAIL_IN_USE`; an identity from another gym
   * is linked with a separate, password-less credential. The selected
   * specialties, assigned locations and weekly working hours are written in the
   * same transaction. Returns the new staff member.
   */
  async createStaff(input: CreateStaffInput): Promise<CreateStaffResponse> {
    this.assertMayHandleRole(input.role);
    const gymId = this.tenant.gymId;
    const email = input.email?.trim() ? input.email.trim().toLowerCase() : null;
    // Someone added with an email is invited to sign in and stays INVITED until
    // they accept (redemption sets ACTIVE); without an email the record is ACTIVE
    // straight away. An explicit SUSPENDED is kept and invites no one.
    const status: GymMemberStatus =
      input.status === 'SUSPENDED'
        ? GymMemberStatus.SUSPENDED
        : email
          ? GymMemberStatus.INVITED
          : GymMemberStatus.ACTIVE;

    const existingUser = email
      ? await this.prisma.client.user.findUnique({ where: { email }, select: { id: true } })
      : null;
    let archivedMemberId: string | null = null;
    if (existingUser) {
      const clash = await this.prisma.client.gymMember.findFirst({
        where: { userId: existingUser.id, gymId },
        select: { id: true, archivedAt: true },
      });
      if (clash?.archivedAt) archivedMemberId = clash.id;
      if (clash && !clash.archivedAt) {
        throw new ConflictException({
          message: 'That email already belongs to a member of this gym',
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
      const user =
        existingUser ??
        (await tx.user.create({
          data: {
            email: email ?? placeholderEmail(),
            name: displayName || null,
            phone: input.phone?.trim() ? input.phone.trim() : null,
          },
          select: { id: true },
        }));
      await tx.gymCredential.upsert({
        where: { userId_gymId: { userId: user.id, gymId } },
        create: {
          userId: user.id,
          gymId,
          passwordHash: null,
          name: displayName || null,
          phone: input.phone?.trim() ? input.phone.trim() : null,
        },
        update: {},
      });

      // The BASE branch (`GymMember.locationId`), which partitions the payroll —
      // not the roster, which overlaps. A person assigned to exactly one branch is
      // based there; anyone else (several branches, or none yet) falls back to the
      // gym's default, the same place a new member's home branch lands. Checked
      // against the live branches above, so a single id is already this gym's.
      const assigned = [...new Set(input.assignedLocationIds)];
      const baseLocationId =
        assigned.length === 1 ? assigned[0] : await findDefaultLocationId(tx, gymId);

      const memberData = {
        gymId,
        userId: user.id,
        role: input.role as Role,
        status,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim() || null,
        locationId: baseLocationId,
        // The deprecated shadow, written in the same transaction as the join
        // table it shadows — see {@link writeLocationAssignments}.
        assignedLocationIds: input.assignedLocationIds,
      };
      const member = archivedMemberId
        ? await tx.gymMember.update({
            where: { id: archivedMemberId },
            data: { ...memberData, archivedAt: null },
            select: { id: true },
          })
        : await tx.gymMember.create({ data: memberData, select: { id: true } });

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

    // A new employee's branch assignments are half of what `PermissionsGuard`
    // resolves for an `assigned`-scope role, and that answer is cached per person.
    // Bust it after the transaction commits — busting inside would let a concurrent
    // request re-cache the pre-commit roster for the whole TTL.
    invalidateGymAccess(gymId);

    const member = await this.projectStaff(memberId);

    // Every staff role has a console, so a person added with an email is invited
    // to sign in to it — otherwise the record could never log in. Best-effort: the
    // member is already saved (INVITED), and a failed send leaves the pending
    // invite in the Invitations tab to resend.
    if (!email || status !== GymMemberStatus.INVITED) {
      return { ...member, inviteSent: null };
    }
    try {
      await this.issueInvite({
        email,
        role: input.role,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim() || null,
        locationIds: [...new Set(input.assignedLocationIds)],
      });
      return { ...member, inviteSent: true };
    } catch {
      return { ...member, inviteSent: false };
    }
  }

  /**
   * Invite someone to join the gym's staff (T4.7). Rejects an address that is
   * already a staff member of this gym with `409 ALREADY_STAFF` (re-role them
   * instead). Any earlier *pending* invite for the same address is replaced, so a
   * re-invite is a clean "resend" rather than a pile-up of duplicates. Mints a
   * single-use token (expiring in `STAFF_INVITE_TTL`), stores the invite, and
   * awaits provider acceptance of the invite email. Returns the new invite's id.
   */
  async inviteStaff(input: InviteStaffInput): Promise<InviteStaffResponse> {
    const { email, role, firstName, lastName } = input;
    const locationIds = [...new Set(input.locationIds)];
    this.assertLiveLocations(locationIds, await this.liveLocationIds());
    this.assertMayHandleRole(role);

    // Already a staff member of *this* gym? The scoped query constrains gymId, so
    // this only ever sees our own gym's memberships. A plain MEMBER is allowed —
    // accepting the invite upgrades them — so only staff roles collide.
    const existingStaff = await this.prisma.client.gymMember.findFirst({
      where: { archivedAt: null, role: { in: STAFF_ROLES }, user: { email } },
      select: { id: true },
    });
    if (existingStaff) {
      throw new ConflictException({
        message: 'That person is already a staff member of your gym',
        code: 'ALREADY_STAFF',
      });
    }

    return this.issueInvite({ email, role, firstName, lastName, locationIds });
  }

  /**
   * Mint, store and email one staff invitation — shared by {@link inviteStaff} and
   * by {@link createStaff} when the added person has an email. Any earlier pending
   * invite for the address is replaced (a clean resend). The invite row survives a
   * delivery failure so it can be resent, but the failure is never reported as
   * success: it throws `503 EMAIL_SEND_FAILED`.
   */
  private async issueInvite(data: {
    email: string;
    role: InviteStaffInput['role'];
    firstName: string | null;
    lastName: string | null;
    locationIds: string[];
  }): Promise<InviteStaffResponse> {
    const { email, role, firstName, lastName, locationIds } = data;
    // Replace any prior pending invite for the same address (a clean resend).
    await this.prisma.client.staffInvite.deleteMany({ where: { email, usedAt: null } });

    const token = generateVerificationToken();
    const invite = await this.prisma.client.staffInvite.create({
      data: {
        gymId: this.tenant.gymId,
        email,
        role,
        firstName,
        lastName,
        locationIds,
        token,
        expiresAt: new Date(Date.now() + env.STAFF_INVITE_TTL * 1000),
      },
      select: { id: true },
    });

    // Keep the pending invite for a resend, but never report delivery failure as success.
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
      throw new ServiceUnavailableException({
        message: 'The invitation email could not be sent. Please try again.',
        code: 'EMAIL_SEND_FAILED',
      });
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
   * cross-tenant id is a `404 STAFF_NOT_FOUND`. A real change signs the person out
   * everywhere at once (see below). Returns the updated staff member.
   */
  async updateRole(
    memberId: string,
    input: UpdateStaffRoleInput,
  ): Promise<UpdateStaffRoleResponse> {
    const member = await this.requireStaff(memberId);
    this.assertMayHandleRole(member.role);
    this.assertMayHandleRole(input.role);

    if (member.role === Role.OWNER && input.role !== Role.OWNER) {
      await this.assertNotLastOwner();
    }

    if (member.role !== input.role) {
      // The role rides in the access token, so a changed role ends every session:
      // bumping `tokenVersion` fails the very next request on any token minted
      // under the old role (a demoted manager keeps nothing for the rest of its
      // 15-minute life), and the refresh families go too, so the person signs in
      // again and lands straight on the console of their new role.
      await this.prisma.client.$transaction(async (tx) => {
        await tx.gymMember.update({
          where: { id: memberId },
          data: { role: input.role },
        });
        await this.tokens.revokeAllForUser(
          member.userId,
          undefined,
          tx as unknown as Prisma.TransactionClient,
        );
        await tx.user.update({
          where: { id: member.userId },
          data: { tokenVersion: { increment: 1 } },
        });
      });
      invalidateGymAccess(this.tenant.gymId);
    }
    await this.syncTrainerProfile(memberId, input.role);

    return this.projectStaff(memberId);
  }

  /**
   * Edit a directory staff member's profile (`PATCH /staff/:memberId/profile`).
   * A partial update — only the fields present in `input` change. `firstName` /
   * `lastName` (and the mirrored `User.name`), `status`, contact `email` / `phone`
   * and `assignedLocationIds` patch the member/user; a sent `workingHours`
   * replaces the whole weekly schedule (set-based, matching the schedule editor) -
   * except for a `TRAINER`, whose week is owned by `Trainer.availability` and only
   * mirrored onto these rows, so a sent schedule is ignored rather than becoming a
   * second writer. Role is changed via {@link updateRole}, not here. `404 STAFF_NOT_FOUND` for an
   * unknown id; `409 EMAIL_IN_USE` when a new email already belongs to someone else.
   */
  async updateStaffProfile(memberId: string, input: UpdateStaffProfileInput): Promise<StaffMember> {
    const existing = await this.prisma.client.gymMember.findFirst({
      where: { id: memberId, archivedAt: null, role: { in: STAFF_ROLES } },
      select: { id: true, userId: true, role: true, firstName: true, lastName: true },
    });
    if (!existing) {
      throw new NotFoundException({ message: 'Staff member not found', code: 'STAFF_NOT_FOUND' });
    }
    this.assertMayHandleRole(existing.role);
    if (input.assignedLocationIds !== undefined) {
      assertPermission(this.tenant.role, Permission.StaffAssignLocation);
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

      // A sent schedule replaces the member's whole week (set-based editor) -
      // unless they are a coach. A coach's hours live on `Trainer.availability`
      // and are mirrored onto these rows by `trainer-shift-mirror.ts`; accepting
      // them here too would make this the second writer, and the two would
      // disagree the first time either screen was used. The console renders the
      // section read-only for a TRAINER row; this is the same rule for anything
      // that talks to the API directly.
      if (input.workingHours !== undefined && existing.role !== Role.TRAINER) {
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

    // The edit may have moved this person between branches, which changes what an
    // `assigned`-scope role of theirs may reach — see `createStaff` for why the
    // bust waits for the commit.
    invalidateGymAccess(gymId);

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
    this.assertMayHandleRole(member.role);

    if (member.role === Role.OWNER) {
      await this.assertNotLastOwner();
    }

    const notices = await this.prisma.client.$transaction(async (tx) => {
      const trainer = await tx.trainer.findFirst({
        where: { staffId: memberId, archivedAt: null },
      });
      const cancelled: CancellationNotice[] = trainer
        ? await this.archiveTrainer(tx as unknown as Prisma.TransactionClient, trainer.id)
        : [];
      const [services, sessions] = await Promise.all([
        tx.service.count({ where: { staffId: memberId } }),
        tx.serviceSession.count({ where: { staffId: memberId } }),
      ]);
      if (services || sessions) {
        // These required FKs retain service/order/PT history. Never put archived
        // staff in member trash: its retention job would hard-delete history.
        await tx.gymMember.update({
          where: { id: memberId },
          data: { archivedAt: new Date(), status: GymMemberStatus.SUSPENDED },
        });
        await tx.service.updateMany({ where: { staffId: memberId }, data: { status: 'ARCHIVED' } });
        const futureSlots = {
          staffId: memberId,
          startsAt: { gt: new Date() },
          status: { in: ['OPEN' as const, 'BOOKED' as const] },
        };
        // The booked ones had a member waiting on this coach — tell them.
        const booked = await tx.serviceSession.findMany({
          where: { ...futureSlots, status: 'BOOKED', memberId: { not: null } },
          select: {
            id: true,
            startsAt: true,
            service: { select: { name: true } },
            member: { select: { userId: true } },
          },
        });
        for (const slot of booked) {
          if (slot.member) {
            cancelled.push({
              kind: 'pt',
              refId: slot.id,
              userId: slot.member.userId,
              title: slot.service.name,
              startsAt: slot.startsAt,
            });
          }
        }
        await tx.serviceSession.updateMany({ where: futureSlots, data: { status: 'CANCELLED' } });
        await tx.shiftSlot.deleteMany({ where: { staffId: memberId } });
        await tx.locationStaff.deleteMany({ where: { staffId: memberId } });
      } else {
        await tx.gymMember.delete({ where: { id: memberId } });
      }
      await this.tokens.revokeAllForUser(
        member.userId,
        undefined,
        tx as unknown as Prisma.TransactionClient,
      );
      await tx.user.update({
        where: { id: member.userId },
        data: { tokenVersion: { increment: 1 } },
      });
      // Removal ends this gym's sign-in: the gym's password goes with it, so a
      // later re-invite has the person choose a new one instead of reviving the
      // old. Other gyms' credentials are untouched.
      await tx.gymCredential.updateMany({
        where: { userId: member.userId, gymId: this.tenant.gymId },
        data: { passwordHash: null },
      });
      return cancelled;
    });
    invalidateGymAccess(this.tenant.gymId);
    await this.notifyCancellations(notices);
  }

  async staffDeleteImpact(memberId: string) {
    await this.requireStaff(memberId);
    const trainer = await this.prisma.client.trainer.findFirst({
      where: { staffId: memberId, archivedAt: null },
    });
    if (trainer) return this.trainerDeleteImpact(trainer.id);
    const ptSessions = await this.prisma.client.serviceSession.count({
      where: {
        staffId: memberId,
        startsAt: { gt: new Date() },
        status: { in: ['OPEN', 'BOOKED'] },
      },
    });
    return { classes: 0, ptSessions };
  }

  async trainerDeleteImpact(id: string) {
    const trainer = await this.requireUnarchivedTrainer(id);
    const where = { trainerId: id, startsAt: { gt: new Date() }, status: 'SCHEDULED' as const };
    const [classes, ptSessions, serviceSessions] = await Promise.all([
      // The same set removal cancels: taught directly or inherited from the template.
      this.prisma.client.classInstance.count({
        where: {
          startsAt: where.startsAt,
          status: where.status,
          OR: [{ trainerId: id }, { trainerId: null, template: { trainerId: id } }],
        },
      }),
      this.prisma.client.ptSession.count({ where }),
      trainer.staffId
        ? this.prisma.client.serviceSession.count({
            where: {
              staffId: trainer.staffId,
              startsAt: { gt: new Date() },
              status: { in: ['OPEN', 'BOOKED'] },
            },
          })
        : Promise.resolve(0),
    ]);
    return { classes, ptSessions: ptSessions + serviceSessions };
  }

  async removeTrainer(id: string): Promise<void> {
    const trainer = await this.requireUnarchivedTrainer(id);
    if (trainer.staffId) {
      // Reuse role protection, LAST_OWNER and atomic session revocation.
      await this.removeStaff(trainer.staffId);
    } else {
      const notices = await this.prisma.client.$transaction((tx) =>
        this.archiveTrainer(tx as unknown as Prisma.TransactionClient, id),
      );
      await this.notifyCancellations(notices);
    }
  }

  private async requireUnarchivedTrainer(id: string) {
    const trainer = await this.prisma.client.trainer.findFirst({ where: { id, archivedAt: null } });
    if (!trainer)
      throw new NotFoundException({ code: 'TRAINER_NOT_FOUND', message: 'Trainer not found' });
    return trainer;
  }

  /**
   * Retire a coach. Their future classes are CANCELLED, not left without a coach
   * — including occurrences that only inherit them from the template: every held
   * seat's class credit is refunded and every live booking released, the same as
   * a cancellation from the schedule drawer. Future PT sessions are cancelled.
   * Templates lose the coach (a manager re-staffs them). Returns one notice per
   * member whose booking was cancelled, for {@link notifyCancellations}.
   */
  private async archiveTrainer(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<CancellationNotice[]> {
    const now = new Date();
    await tx.trainer.update({
      where: { id },
      data: { archivedAt: now, status: TrainerStatus.INACTIVE },
    });

    // Read before the templates are unassigned below — an occurrence with no
    // coach of its own is taught by its template's.
    const instances = await tx.classInstance.findMany({
      where: {
        startsAt: { gt: now },
        status: 'SCHEDULED',
        OR: [{ trainerId: id }, { trainerId: null, template: { trainerId: id } }],
      },
      select: {
        id: true,
        startsAt: true,
        template: { select: { title: true } },
        classType: { select: { name: true } },
        bookings: {
          where: { status: { not: BookingStatus.CANCELED } },
          select: { status: true, creditPackId: true, member: { select: { userId: true } } },
        },
      },
    });

    const notices: CancellationNotice[] = [];
    for (const instance of instances) {
      for (const booking of instance.bookings) {
        if (booking.status === BookingStatus.BOOKED) {
          await this.creditPacks?.refundCredit(
            tx as unknown as Parameters<CreditPacksService['refundCredit']>[0],
            booking.creditPackId,
            this.tenant.gymId,
          );
        }
        notices.push({
          kind: 'class',
          refId: instance.id,
          userId: booking.member.userId,
          title: instance.template?.title ?? instance.classType?.name ?? '',
          startsAt: instance.startsAt,
        });
      }
    }
    const ids = instances.map((instance) => instance.id);
    if (ids.length > 0) {
      await tx.booking.updateMany({
        where: { classInstanceId: { in: ids }, status: { not: BookingStatus.CANCELED } },
        data: { status: BookingStatus.CANCELED, waitlistPosition: null },
      });
      await tx.classInstance.updateMany({
        where: { id: { in: ids } },
        data: { status: 'CANCELED', bookedCount: 0 },
      });
    }

    await tx.classTemplate.updateMany({ where: { trainerId: id }, data: { trainerId: null } });
    // PT requires its trainer FK. Keep the historical identity, cancel future sessions.
    await tx.ptSession.updateMany({
      where: { trainerId: id, startsAt: { gt: now }, status: 'SCHEDULED' },
      data: { status: 'CANCELED' },
    });
    return notices;
  }

  /**
   * Tell each member whose class or PT session was cancelled by a coach's
   * removal — in-app, email and push, in the gym's language and clock. Runs after
   * the removal committed and is best-effort: a failed notice is logged, never
   * thrown, so it cannot undo or fail the removal.
   */
  private async notifyCancellations(notices: CancellationNotice[]): Promise<void> {
    if (!this.notifications || notices.length === 0) return;
    const gymId = this.tenant.gymId;
    let language = 'ka';
    let timeZone = 'Asia/Tbilisi';
    try {
      const gym = await this.prisma.client.gym.findUnique({
        where: { id: gymId },
        select: { settings: true },
      });
      const settings = gymSettingsStoredSchema.parse(gym?.settings ?? {});
      language = settings.locale.language;
      timeZone = settings.locale.timezone || timeZone;
    } catch {
      // Defaults above.
    }
    const ka = language === 'ka';
    const when = new Intl.DateTimeFormat(ka ? 'ka-GE' : 'en-GB', {
      timeZone,
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    for (const notice of notices) {
      const at = when.format(notice.startsAt);
      const copy =
        notice.kind === 'class'
          ? {
              title: ka ? 'კლასი გაუქმდა' : 'Class cancelled',
              body: ka
                ? `„${notice.title}“ (${at}) გაუქმდა. თქვენი ჯავშანი მოიხსნა; თუ ის კრედიტით იყო, კრედიტი დაგიბრუნდათ.`
                : `"${notice.title}" (${at}) has been cancelled. Your booking was released; a class credit used for it has been returned.`,
            }
          : {
              title: ka ? 'PT სესია გაუქმდა' : 'PT session cancelled',
              body: ka
                ? `„${notice.title}“ (${at}) გაუქმდა. დეტალებისთვის დაუკავშირდით დარბაზს.`
                : `"${notice.title}" (${at}) has been cancelled. Please contact the gym for details.`,
            };
      try {
        await this.notifications.send({
          gymId,
          userId: notice.userId,
          category: NotificationCategory.BOOKING,
          channels: [
            NotificationChannel.IN_APP,
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
          ],
          href: '/account/bookings',
          dedupeKey: `coach-removed:${notice.kind}:${notice.refId}`,
          ...copy,
        });
      } catch (error) {
        this.logger.warn(`Cancellation notice failed: ${String(error)}`);
      }
    }
  }

  /**
   * Bring the member's coach profile in line with the role they now hold. The
   * rule itself lives in `trainer-profile-sync.ts`, because auth's invite
   * redemption needs exactly the same behaviour and cannot reach a private
   * method on this service.
   */
  private async syncTrainerProfile(memberId: string, role: Role): Promise<void> {
    await syncTrainerProfile(this.prisma.client as unknown as TrainerSyncClient, {
      gymId: this.tenant.gymId,
      memberId,
      role,
    });
  }

  /**
   * Resolve a staff-role membership in the caller's gym or throw a
   * `404 STAFF_NOT_FOUND`. The scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches — the guard for every write.
   */
  private async requireStaff(id: string): Promise<{ id: string; userId: string; role: Role }> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id, archivedAt: null, role: { in: STAFF_ROLES } },
      select: { id: true, userId: true, role: true },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Staff member not found', code: 'STAFF_NOT_FOUND' });
    }
    return member;
  }

  /**
   * The OWNER role is reserved to owners: only an `OWNER` (or the platform
   * `SUPER_ADMIN`) may create an owner, promote someone to owner, or re-role,
   * edit, or remove an existing owner. A manager holds `staff:assign-role`
   * for the operational roles but must never be able to reach ownership —
   * `403 OWNER_ROLE_RESTRICTED` otherwise. A no-op for every other role.
   */
  private assertMayHandleRole(role: string): void {
    if (role !== Role.OWNER) return;
    const caller = this.tenant.role;
    if (caller === Role.OWNER || caller === Role.SUPER_ADMIN) return;
    throw new ForbiddenException({
      message: 'Only an owner can assign or change the Owner role',
      code: 'OWNER_ROLE_RESTRICTED',
    });
  }

  /**
   * Throw `403 LAST_OWNER` when the gym has at most one `OWNER` — the caller is
   * about to re-role or remove an owner, and the gym must keep at least one.
   */
  private async assertNotLastOwner(): Promise<void> {
    const owners = await this.prisma.client.gymMember.count({
      where: { role: Role.OWNER, archivedAt: null },
    });
    if (owners <= 1) {
      throw new ForbiddenException({
        message: 'A gym must keep at least one owner',
        code: 'LAST_OWNER',
      });
    }
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
      firstName: row.firstName,
      lastName: row.lastName,
      locationIds: row.locationIds,
      locations: [],
      email: row.email,
      role: row.role as StaffRole,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      expired: row.expiresAt.getTime() <= Date.now(),
    };
  }
}
