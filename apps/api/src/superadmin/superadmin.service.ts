import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { GymStatus, Prisma, Role } from '@fit/db';
import type {
  ImpersonateResponse,
  ListAdminGymsResponse,
  UpdateGymStatusResponse,
} from '@fit/types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';

/** Audit-log action keys written by the SuperAdmin console. */
const AUDIT_IMPERSONATE = 'gym.impersonate';
const AUDIT_STATUS_UPDATE = 'gym.status.update';

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
  ) {}

  /**
   * List every gym, newest first, each with its platform status, total
   * membership count, and monthly recurring revenue. Powers the operator
   * console's gyms table.
   */
  async listGyms(): Promise<ListAdminGymsResponse> {
    const rows = await this.prisma.client.gym.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        _count: { select: { members: true } },
      },
    });

    return {
      gyms: rows.map((gym) => ({
        id: gym.id,
        name: gym.name,
        subdomainSlug: gym.slug,
        status: gym.status,
        memberCount: gym._count.members,
        // MRR aggregates a gym's active paid subscriptions — a model that lands
        // with billing (Phase 5/6). Until then there is no revenue data to sum,
        // so report 0 rather than invent a figure. The shape is in place so the
        // console renders the column today and only the source changes later.
        mrr: 0,
      })),
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
   * Mint a short-lived, gym-scoped access token that acts as the gym's OWNER, so
   * an operator can reproduce / support an owner's view. Every call writes
   * exactly one audit-log row naming the actor (the SUPER_ADMIN) and the target
   * gym + impersonated owner — the row is committed before the token is returned,
   * so a token can never escape unaudited.
   *
   * Throws `404` for an unknown gym and `422 GYM_HAS_NO_OWNER` for a gym not yet
   * bound to an owner (nothing to impersonate). Token issuance itself degrades to
   * `503` when `JWT_SECRET` is unset, exactly like every other issuing path.
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

    const accessToken = this.tokens.signScopedAccessToken({
      userId: gym.ownerId,
      role: Role.OWNER,
      gymId: gym.id,
      ttlSeconds: env.JWT_IMPERSONATION_TTL,
    });

    await this.prisma.client.auditLog.create({
      data: {
        action: AUDIT_IMPERSONATE,
        actorId,
        gymId: gym.id,
        targetId: gym.ownerId,
        metadata: { role: Role.OWNER, ttlSeconds: env.JWT_IMPERSONATION_TTL },
      },
    });

    return { accessToken };
  }
}
