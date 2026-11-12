import { GymOnboardingService } from '../gym-onboarding/gym-onboarding.service';
import { EmailService } from '../auth/email.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GymStatus, Prisma, Role } from '@fit/db';
import type {
  AdminGymDetail,
  AdminOperator,
  AdminGymStaffMember,
  CreateAdminGymRequestInput,
  AdminGymRequest,
  ListAdminGymRequestsResponse,
  ApproveAdminGymRequestResponse,
  ImpersonateResponse,
  ImpersonationExchangeResponse,
  ListAdminGymsResponse,
  StaffRole,
  UpdateGymStatusResponse,
} from '@fit/types';
import { gymSettingsStoredSchema } from '@fit/types';
import { submitted } from '../gym-onboarding/gym-onboarding.service';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TokenService } from '../auth/token.service';
import { AuthService, generateVerificationToken } from '../auth/auth.service';

/** Audit-log action keys written by the SuperAdmin console. */
const AUDIT_GYM_CREATE = 'gym.create';
const AUDIT_GYM_REQUEST_CREATE = 'gym-request.create';
const AUDIT_GYM_REQUEST_LINK = 'gym-request.link.regenerate';
const AUDIT_GYM_REQUEST_REJECT = 'gym-request.reject';
const AUDIT_IMPERSONATE = 'gym.impersonate';
const AUDIT_IMPERSONATE_START = 'gym.impersonate.start';
const AUDIT_STATUS_UPDATE = 'gym.status.update';

/** Redis key namespace for single-use impersonation handoff codes. */
const HANDOFF_KEY_PREFIX = 'impersonation:';

/**
 * How long a handoff code stays redeemable, in seconds.
 *
 * Not configurable, because it is not a preference: the code's whole life is the
 * round trip from the operator's click to the tenant console's server, which is
 * one redirect. A minute is generous for that and short enough that a code
 * captured from a log is almost certainly already dead — and single-use means
 * the one that isn't still only works if the operator never landed.
 */
const HANDOFF_TTL_SECONDS = 60;

/** Build the Redis key holding the grant a handoff code resolves to. */
function handoffKey(code: string): string {
  return `${HANDOFF_KEY_PREFIX}${code}`;
}

/** What a handoff code resolves to: who may be impersonated, where, on whose order. */
interface HandoffGrant {
  gymId: string;
  ownerId: string;
  actorId: string;
}

/**
 * Cross-tenant operations behind the SuperAdmin platform console (T2.12):
 * listing every gym with operational stats, suspending / reactivating a tenant,
 * and audited owner impersonation for support.
 *
 * Runs on the **unscoped** {@link PrismaService}. `Gym` is the tenant root (keyed
 * by `id`, never tenant-scoped) and `AuditLog` carries no tenant filter, so both
 * read/write platform-wide here by design. `GymMember` *is* tenant-scoped, but
 * the unextended client this service holds applies no `gymId` filter — which is
 * exactly what a cross-tenant roster needs. The SUPER_ADMIN gate lives at the
 * controller (`@AllowCrossTenant` + {@link TenantGuard}); this service trusts it.
 */
@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly redis: RedisService,
    private readonly auth: AuthService,
    private readonly onboarding: GymOnboardingService,
    private readonly email: EmailService,
  ) {}

  /**
   * The signed-in operator's own identity, for the console's chrome. `404` when
   * the session's user row is gone — the token outlived the account.
   */
  async getOperator(userId: string): Promise<AdminOperator> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      throw new NotFoundException({ message: 'Operator not found', code: 'USER_NOT_FOUND' });
    }
    return user;
  }

  /**
   * List every gym, newest first, each with its platform status, membership
   * count, provisioning date, and owner. Powers the operator console's roster.
   *
   * The owner is included because it is what identifies an account to an operator
   * ("whose gym is this"), and because it decides whether {@link impersonate} can
   * do anything at all — a gym with no owner has nobody to impersonate, and the
   * roster can say so before the operator clicks.
   *
   * It costs a SECOND query rather than a join: `Gym.ownerId` is a bare column
   * with an index and no Prisma relation (owners are resolved through
   * `GymMember` everywhere else), so there is no `owner` to `select`. One
   * batched `findMany` over the distinct owner ids keeps this at two queries for
   * the whole roster rather than one per row.
   */
  async listGyms(): Promise<ListAdminGymsResponse> {
    const rows = await this.prisma.client.gym.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        ownerId: true,
        _count: { select: { members: true } },
      },
    });

    const ownerIds = [...new Set(rows.map((gym) => gym.ownerId).filter((id) => id !== null))];
    const owners = ownerIds.length
      ? await this.prisma.client.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, email: true, name: true },
        })
      : [];
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

    return {
      gyms: rows.map((gym) => {
        const owner = gym.ownerId ? ownerById.get(gym.ownerId) : undefined;
        return {
          id: gym.id,
          name: gym.name,
          subdomainSlug: gym.slug,
          status: gym.status,
          memberCount: gym._count.members,
          createdAt: gym.createdAt.toISOString(),
          // An `ownerId` pointing at a user row that no longer exists reports as
          // no owner, which is what it functionally is.
          owner: owner ? { email: owner.email, name: owner.name } : null,
        };
      }),
    };
  }

  /**
   * One gym in full, for the operator console's detail screen.
   *
   * Three reads rather than one join, for the same reason {@link listGyms} needs
   * two: `Gym.ownerId` is a bare column with no Prisma relation, and `GymMember`
   * carries a `userId` rather than an embedded user. So the gym is read, then its
   * staff memberships, then every user id those two produced — batched into one
   * lookup, so the cost does not grow with the size of the staff.
   *
   * `staff` is every membership holding a role other than `MEMBER`: the answer to
   * "who can sign into this console", which is what support is actually asking.
   * Trashed memberships (`deletedAt`) are excluded — the gym's own roster hides
   * them, and an operator seeing people the owner cannot see would be reading a
   * different gym than the one being described to them on the phone.
   */
  async getGym(gymId: string): Promise<AdminGymDetail> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: gymId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        ownerId: true,
        _count: { select: { members: true, locations: true } },
      },
    });
    if (!gym) {
      throw new NotFoundException({ message: 'Gym not found', code: 'GYM_NOT_FOUND' });
    }

    const staffMemberships = await this.prisma.client.gymMember.findMany({
      where: { gymId: gym.id, role: { not: Role.MEMBER }, deletedAt: null },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true, role: true, status: true, joinedAt: true },
    });

    // One lookup covering the owner and every staff member — the owner is
    // usually among them, so a separate query for them would mostly be a repeat.
    const userIds = [
      ...new Set([...staffMemberships.map((m) => m.userId), ...(gym.ownerId ? [gym.ownerId] : [])]),
    ];
    const users = userIds.length
      ? await this.prisma.client.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, name: true, emailVerifiedAt: true },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    const owner = gym.ownerId ? userById.get(gym.ownerId) : undefined;
    const staff: AdminGymStaffMember[] = staffMemberships.flatMap((membership) => {
      const user = userById.get(membership.userId);
      // A membership whose user row is gone is not a person who can sign in, so
      // it is not an answer to "who has access" — drop it rather than render a
      // nameless row.
      if (!user) return [];
      return [
        {
          userId: user.id,
          email: user.email,
          name: user.name,
          // The query already excludes `MEMBER`, and `SUPER_ADMIN` is never a
          // gym membership — but Prisma's enum cannot say so, hence the narrow.
          // `status` needs none: `GymMemberStatus` and `StaffStatus` agree.
          role: membership.role as StaffRole,
          status: membership.status,
          joinedAt: membership.joinedAt.toISOString(),
        },
      ];
    });

    return {
      id: gym.id,
      name: gym.name,
      subdomainSlug: gym.slug,
      status: gym.status,
      memberCount: gym._count.members,
      createdAt: gym.createdAt.toISOString(),
      locationCount: gym._count.locations,
      owner: owner
        ? {
            id: owner.id,
            email: owner.email,
            name: owner.name,
            emailVerifiedAt: owner.emailVerifiedAt?.toISOString() ?? null,
          }
        : null,
      staff,
    };
  }

  private conflict(code: 'SUBDOMAIN_TAKEN' | 'EMAIL_TAKEN'): ConflictException {
    return new ConflictException({
      message: code === 'SUBDOMAIN_TAKEN' ? 'Subdomain is already taken' : 'Email is already taken',
      code,
    });
  }

  private async requestRow(id: string, db: Prisma.TransactionClient = this.prisma.client) {
    const row = await db.gymOnboarding.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundException({
        message: 'Gym request not found',
        code: 'GYM_REQUEST_NOT_FOUND',
      });
    return row;
  }

  private async lockRequest(id: string, db: Prisma.TransactionClient) {
    await db.$queryRaw`SELECT "id" FROM "gym_onboardings" WHERE "id" = ${id} FOR UPDATE`;
    return this.requestRow(id, db);
  }

  private async requestConflicts(db: Prisma.TransactionClient, slug: string, email: string) {
    if (await db.gym.findUnique({ where: { slug }, select: { id: true } }))
      throw this.conflict('SUBDOMAIN_TAKEN');
    if (await db.user.findUnique({ where: { email }, select: { id: true } }))
      throw this.conflict('EMAIL_TAKEN');
  }

  private uniqueConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const uniqueTarget = error.meta?.target;
      const target =
        typeof uniqueTarget === 'string'
          ? uniqueTarget
          : Array.isArray(uniqueTarget)
            ? uniqueTarget.filter((field): field is string => typeof field === 'string').join(',')
            : '';
      throw this.conflict(/email/i.test(target) ? 'EMAIL_TAKEN' : 'SUBDOMAIN_TAKEN');
    }
    throw error;
  }

  async createGymRequest(
    actorId: string,
    input: CreateAdminGymRequestInput,
  ): Promise<AdminGymRequest> {
    this.onboarding.assertConfigured();
    let row;
    try {
      row = await this.prisma.client.$transaction(async (db) => {
        // Serialize competing email/slug reservations, including stale-row replacement.
        // Stable ordering prevents two requests with overlapping keys from deadlocking.
        for (const key of [
          `onboarding-email:${input.ownerEmail}`,
          `onboarding-slug:${input.subdomainSlug}`,
        ].sort()) {
          await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
        }
        await this.requestConflicts(db, input.subdomainSlug, input.ownerEmail);
        const matches = await db.gymOnboarding.findMany({
          where: { OR: [{ subdomainSlug: input.subdomainSlug }, { ownerEmail: input.ownerEmail }] },
          orderBy: { id: 'asc' },
        });
        for (const match of matches) {
          const existing = await this.lockRequest(match.id, db);
          const status = this.onboarding.status(existing);
          if (status === 'REJECTED' || status === 'EXPIRED') {
            await db.gymOnboarding.delete({ where: { id: existing.id } });
          } else {
            throw this.conflict(
              existing.subdomainSlug === input.subdomainSlug ? 'SUBDOMAIN_TAKEN' : 'EMAIL_TAKEN',
            );
          }
        }
        const created = await db.gymOnboarding.create({
          data: { ...input, ...this.onboarding.rotation(), createdByUserId: actorId },
        });
        await db.auditLog.create({
          data: {
            action: AUDIT_GYM_REQUEST_CREATE,
            actorId,
            targetId: created.id,
            metadata: { subdomainSlug: input.subdomainSlug, ownerEmail: input.ownerEmail },
          },
        });
        return created;
      });
    } catch (error) {
      return this.uniqueConflict(error);
    }
    const request = this.onboarding.adminState(row);
    try {
      await this.email.sendOwnerLiveOnboardingEmail(
        row.ownerEmail,
        request.token!,
        row.gymName,
        row.ownerName ?? undefined,
        undefined,
        row.subdomainSlug,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send owner onboarding email: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return request;
  }

  async listGymRequests(): Promise<ListAdminGymRequestsResponse> {
    const rows = await this.prisma.client.gymOnboarding.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { requests: rows.map((row) => this.onboarding.summary(row)) };
  }
  async getGymRequest(id: string): Promise<AdminGymRequest> {
    return this.onboarding.adminState(await this.requestRow(id));
  }

  async regenerateGymRequestLink(actorId: string, id: string): Promise<AdminGymRequest> {
    return this.prisma.client.$transaction(async (db) => {
      const row = await this.lockRequest(id, db);
      if (this.onboarding.isSubmitted(row)) throw submitted();
      const updated = await db.gymOnboarding.update({
        where: { id },
        data: this.onboarding.rotation(),
      });
      await db.auditLog.create({ data: { action: AUDIT_GYM_REQUEST_LINK, actorId, targetId: id } });
      return this.onboarding.adminState(updated);
    });
  }

  async approveGymRequest(actorId: string, id: string): Promise<ApproveAdminGymRequestResponse> {
    let result;
    try {
      result = await this.prisma.client.$transaction(async (db) => {
        const row = await this.lockRequest(id, db);
        if (this.onboarding.status(row) !== 'SUBMITTED')
          throw new ConflictException({
            message: 'Request must be submitted first',
            code: 'ONBOARDING_NOT_SUBMITTED',
          });
        await this.requestConflicts(db, row.subdomainSlug, row.ownerEmail);
        if (!row.passwordHash)
          throw new BadRequestException({
            message: 'Owner password required',
            code: 'ONBOARDING_ACCOUNT_REQUIRED',
          });
        const values = this.onboarding.state(row).values;
        const { gymName, ...business } = values.business;
        const defaults = gymSettingsStoredSchema.parse({});
        const settings = gymSettingsStoredSchema.parse({
          ...defaults,
          business: { ...defaults.business, ...business },
          brand: { ...defaults.brand, ...values.brand },
          payments: { ...defaults.payments, ...values.payments },
        });
        const now = new Date();
        const provisioned = await this.auth.provisionGym(
          db,
          {
            gymName,
            subdomainSlug: row.subdomainSlug,
            ownerEmail: row.ownerEmail,
            ownerName: row.ownerName ?? undefined,
          },
          {
            passwordHash: row.passwordHash,
            createdBy: actorId,
            emailVerifiedAt: now,
            settings: settings as unknown as Prisma.InputJsonValue,
          },
        );
        const location = row.completedSteps.includes('location')
          ? values.location
          : { ...values.location, name: gymName };
        await db.location.create({
          data: {
            ...location,
            hours: location.hours,
            gymId: provisioned.gymId,
            isDefault: true,
          },
        });
        await db.gymOnboarding.update({
          where: { id },
          data: {
            gymId: provisioned.gymId,
            approvedAt: now,
            approvedByUserId: actorId,
            completedAt: now,
          },
        });
        await db.auditLog.create({
          data: {
            action: AUDIT_GYM_CREATE,
            actorId,
            gymId: provisioned.gymId,
            targetId: provisioned.ownerId,
            metadata: {
              subdomainSlug: row.subdomainSlug,
              ownerEmail: row.ownerEmail,
              requestId: id,
            },
          },
        });
        return {
          gymId: provisioned.gymId,
          subdomainSlug: row.subdomainSlug,
          email: row.ownerEmail,
          gymName,
        };
      });
    } catch (error) {
      return this.uniqueConflict(error);
    }
    try {
      await this.email.sendGymReadyEmail(result.email, result.gymName, result.subdomainSlug);
    } catch (error) {
      this.logger.error(
        `Failed to send gym ready email: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { gymId: result.gymId, subdomainSlug: result.subdomainSlug };
  }

  async rejectGymRequest(actorId: string, id: string, reason?: string): Promise<AdminGymRequest> {
    return this.prisma.client.$transaction(async (db) => {
      const row = await this.lockRequest(id, db);
      if (row.approvedAt || row.rejectedAt) throw submitted();
      const updated = await db.gymOnboarding.update({
        where: { id },
        data: {
          rejectedAt: new Date(),
          rejectedByUserId: actorId,
          rejectionReason: reason ?? null,
          codeHash: null,
          codeExpiresAt: null,
        },
      });
      await db.auditLog.create({
        data: {
          action: AUDIT_GYM_REQUEST_REJECT,
          actorId,
          targetId: id,
          metadata: { reason: reason ?? null },
        },
      });
      return this.onboarding.adminState(updated);
    });
  }

  /**
   * Suspend or reactivate a whole gym and record the change in the audit log.
   * Suspension is enforced at login/refresh (see `AuthService`), so flipping a
   * gym to `SUSPENDED` gates its staff + members out of new sessions; flipping
   * it back to `ACTIVE` restores access. Throws `404` for an unknown gym.
   */
  async setGymStatus(
    actorId: string,
    gymId: string,
    status: GymStatus,
  ): Promise<UpdateGymStatusResponse> {
    let updated: { id: string; status: GymStatus };
    try {
      updated = await this.prisma.client.gym.update({
        where: { id: gymId },
        data: { status },
        select: { id: true, status: true },
      });
    } catch (error) {
      // P2025 — no gym with that id. Report absent rather than leak a 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException({ message: 'Gym not found', code: 'GYM_NOT_FOUND' });
      }
      throw error;
    }

    await this.prisma.client.auditLog.create({
      data: {
        action: AUDIT_STATUS_UPDATE,
        actorId,
        gymId: updated.id,
        metadata: { status: updated.status },
      },
    });

    return updated;
  }

  /**
   * Begin an impersonation: check that the gym can be impersonated at all, then
   * hand the operator a single-use code that turns into a session on the gym's
   * own host.
   *
   * **No token is minted here.** The token is minted at redemption
   * ({@link exchangeImpersonationCode}), which means its short life starts when
   * the operator actually arrives rather than while a browser is still following
   * redirects — and means nothing that could authenticate anyone exists until the
   * one request that consumes the code.
   *
   * The grant is written to Redis before the code is returned, and the audit row
   * before that, so an issued code can never escape unaudited. Throws `404` for
   * an unknown gym and `422 GYM_HAS_NO_OWNER` for a gym not yet bound to an owner
   * (nothing to impersonate) — both BEFORE anything is stored, so a failed
   * attempt leaves nothing behind.
   *
   * A SUSPENDED gym can still be impersonated, deliberately: suspension locks out
   * that gym's own people, and looking at the console of a gym you just suspended
   * is a large part of why support reaches for this at all.
   */
  async impersonate(actorId: string, gymId: string): Promise<ImpersonateResponse> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: gymId },
      select: { id: true, ownerId: true },
    });
    if (!gym) {
      throw new NotFoundException({ message: 'Gym not found', code: 'GYM_NOT_FOUND' });
    }
    if (!gym.ownerId) {
      throw new UnprocessableEntityException({
        message: 'Gym has no owner to impersonate',
        code: 'GYM_HAS_NO_OWNER',
      });
    }

    await this.prisma.client.auditLog.create({
      data: {
        action: AUDIT_IMPERSONATE,
        actorId,
        gymId: gym.id,
        targetId: gym.ownerId,
        metadata: { role: Role.OWNER, handoffTtlSeconds: HANDOFF_TTL_SECONDS },
      },
    });

    const code = generateVerificationToken();
    const grant: HandoffGrant = { gymId: gym.id, ownerId: gym.ownerId, actorId };
    await this.redis.client.set(handoffKey(code), JSON.stringify(grant), 'EX', HANDOFF_TTL_SECONDS);

    return { handoffCode: code, expiresInSeconds: HANDOFF_TTL_SECONDS };
  }

  /**
   * Redeem a handoff code for the gym-scoped OWNER session it stands for.
   *
   * Called by the tenant console's server, not a browser, and carries no session
   * of its own — the code is the credential. It is consumed the same way an email
   * verification token is: read, then DELETE, with the delete's own result
   * deciding the race, so two requests arriving with the same code cannot both
   * come away with a session.
   *
   * The token is deliberately issued alone — `signScopedAccessToken`, not
   * `issueTokenPair`. An impersonated session must expire and stay expired; a
   * refresh token would let it renew itself indefinitely in a forgotten tab.
   *
   * Throws `400 HANDOFF_CODE_INVALID` for a code that is unknown, expired, or
   * already spent, and `404 GYM_NOT_FOUND` if the gym was deleted in the seconds
   * between issue and redemption.
   */
  async exchangeImpersonationCode(code: string): Promise<ImpersonationExchangeResponse> {
    const key = handoffKey(code);
    const stored = await this.redis.client.get(key);
    if (!stored) {
      throw invalidHandoffCode();
    }

    // Delete first so a code can't be redeemed twice even if two requests race
    // (DEL returns the number removed: 0 means another request already won).
    const removed = await this.redis.client.del(key);
    if (removed === 0) {
      throw invalidHandoffCode();
    }

    let grant: HandoffGrant;
    try {
      grant = JSON.parse(stored) as HandoffGrant;
    } catch {
      // Only this service writes these keys, so a malformed value is corruption
      // rather than a caller error — but it still authenticates nobody.
      throw invalidHandoffCode();
    }

    const [gym, owner] = await Promise.all([
      this.prisma.client.gym.findUnique({
        where: { id: grant.gymId },
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.client.user.findUnique({
        where: { id: grant.ownerId },
        select: { email: true },
      }),
    ]);
    if (!gym || !owner) {
      throw new NotFoundException({ message: 'Gym not found', code: 'GYM_NOT_FOUND' });
    }

    const accessToken = this.tokens.signScopedAccessToken({
      userId: grant.ownerId,
      role: Role.OWNER,
      gymId: gym.id,
      // The console redeeming this sits on the gym's own subdomain, so the host
      // check (TENANT_MISMATCH) agrees with it.
      gymSlug: gym.slug,
      ttlSeconds: env.JWT_IMPERSONATION_TTL,
    });

    // The session exists from here, so the row naming it is written before the
    // token is handed back — the same ordering the issue path uses.
    await this.prisma.client.auditLog.create({
      data: {
        action: AUDIT_IMPERSONATE_START,
        actorId: grant.actorId,
        gymId: gym.id,
        targetId: grant.ownerId,
        metadata: { role: Role.OWNER, ttlSeconds: env.JWT_IMPERSONATION_TTL },
      },
    });

    return {
      accessToken,
      expiresInSeconds: env.JWT_IMPERSONATION_TTL,
      gym: { id: gym.id, name: gym.name, subdomainSlug: gym.slug },
      ownerEmail: owner.email,
    };
  }
}

/** One `400` for every way a code can fail to resolve — it reveals nothing. */
function invalidHandoffCode(): BadRequestException {
  return new BadRequestException({
    message: 'Handoff code is invalid or has expired',
    code: 'HANDOFF_CODE_INVALID',
  });
}
