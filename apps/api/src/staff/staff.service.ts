import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@fit/db';
import type {
  InviteStaffInput,
  InviteStaffResponse,
  ListStaffQuery,
  ListStaffResponse,
  PendingInvite,
  StaffMember,
  StaffRole,
  UpdateStaffRoleInput,
  UpdateStaffRoleResponse,
} from '@fit/types';
import { env } from '../config/env';
import { generateVerificationToken } from '../auth/auth.service';
import { EmailService } from '../auth/email.service';
import { TokenService } from '../auth/token.service';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The gym-scoped roles that count as staff — every role except a plain `MEMBER`. */
const STAFF_ROLES: Role[] = [Role.OWNER, Role.MANAGER, Role.RECEPTIONIST, Role.TRAINER];

/**
 * Shape the staff roster query selects off `GymMember`, joined to the
 * (cross-tenant) `User` for the person's identity. Kept narrow — staff
 * management never needs the PII the member endpoints also avoid
 * (`passwordHash`, OAuth subject ids).
 */
const STAFF_SELECT = {
  id: true,
  userId: true,
  role: true,
  status: true,
  joinedAt: true,
  user: { select: { name: true, email: true } },
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
      invites: invites.map((row) => this.toPendingInvite(row)),
    };
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
        select: { name: true },
      });
      await this.email.sendStaffInviteEmail(email, token, gym?.name ?? 'your gym', role);
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

    const updated = await this.prisma.client.gymMember.findFirst({
      where: { id: memberId },
      select: STAFF_SELECT,
    });
    // The row was just updated under the scoped client, so it must still resolve.
    if (!updated) {
      throw new NotFoundException({ message: 'Staff member not found', code: 'STAFF_NOT_FOUND' });
    }
    return this.toStaffMember(updated);
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

  /** Project a queried membership row to the wire {@link StaffMember}. */
  private toStaffMember(row: StaffRecord): StaffMember {
    return {
      id: row.id,
      userId: row.userId,
      name: row.user.name ?? row.user.email,
      email: row.user.email,
      role: row.role as StaffRole,
      status: row.status,
      joinedAt: row.joinedAt.toISOString(),
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
