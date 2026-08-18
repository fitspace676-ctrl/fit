import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GymStatus, Prisma, Role } from '@fit/db';
import type {
  ImpersonateResponse,
  ImpersonationExchangeResponse,
  ListAdminGymsResponse,
  UpdateGymStatusResponse,
} from '@fit/types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TokenService } from '../auth/token.service';
import { generateVerificationToken } from '../auth/auth.service';

/** Audit-log action keys written by the SuperAdmin console. */
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly redis: RedisService,
  ) {}

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
