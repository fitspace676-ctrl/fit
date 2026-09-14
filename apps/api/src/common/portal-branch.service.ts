import { Injectable, NotFoundException } from '@nestjs/common';
import { LocationStatus, Role } from '@fit/db';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { extractBearerToken } from './tenant/tenant.middleware';

/** What {@link resolvePortalBranch} decides from. */
export interface PortalBranchInput {
  /** The gym the public listing is for — every lookup below is pinned to it. */
  gymId: string;
  /** The signed-in caller, or `null`/`undefined` for an anonymous visitor. */
  userId?: string | null;
  /** An explicit `?locationId=` the caller asked for; wins over the home branch. */
  locationId?: string;
}

/** The two reads {@link resolvePortalBranch} makes, on the base (untenanted) client. */
type PortalBranchClient = Pick<PrismaService['client'], 'location' | 'gymMember'>;

/**
 * The branch a member-portal listing (`GET /products`, `/class-instances`,
 * `/services`, `/trainers`) narrows to — `undefined` meaning every branch.
 *
 * Decision D7 of the multi-branch roadmap, in order:
 *
 *  1. **An explicit `locationId`** must be an ACTIVE branch of `gymId`. Anything
 *     else — unknown, inactive, or another gym's — is a `404 LOCATION_NOT_FOUND`,
 *     the same answer for all three, so a probe learns nothing about other tenants
 *     and the listing never runs against a branch outside the gym.
 *  2. **A signed-in member** sees their HOME branch (`GymMember.locationId`) in
 *     this gym. Only a live `MEMBER` row counts: on a staff row the same column is
 *     their base branch, a different question, so staff browsing the portal see
 *     every branch. A member with no home branch, or whose home branch has been
 *     deactivated, also sees every branch rather than an empty page.
 *  3. **An anonymous visitor** sees every branch.
 *
 * The public routes run on the base client, so `gymId` is written into both reads
 * by hand; nothing here relies on the tenant extension.
 */
export async function resolvePortalBranch(
  client: PortalBranchClient,
  { gymId, userId, locationId }: PortalBranchInput,
): Promise<string | undefined> {
  if (locationId !== undefined) {
    const branch = await client.location.findFirst({
      where: { id: locationId, gymId, status: LocationStatus.ACTIVE },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException({ message: 'Location not found', code: 'LOCATION_NOT_FOUND' });
    }
    return branch.id;
  }

  if (!userId) {
    return undefined;
  }
  const member = await client.gymMember.findFirst({
    where: { userId, gymId, role: Role.MEMBER, deletedAt: null },
    select: { locationId: true, location: { select: { status: true } } },
  });
  return member?.locationId && member.location?.status === LocationStatus.ACTIVE
    ? member.locationId
    : undefined;
}

/**
 * {@link resolvePortalBranch} for a controller that has only the raw request: it
 * reads the optional bearer token itself, because the public listings are excluded
 * from the JWT `TenantMiddleware` and nothing else has put a user on the request.
 *
 * A token only identifies the caller when it verifies AND is scoped to the very gym
 * being listed. A missing, malformed, expired or other-gym token is treated as an
 * anonymous visitor rather than a `401`: the listing is public, the anonymous answer
 * is every branch, and a stale session must not break a page anyone may open.
 */
@Injectable()
export class PortalBranchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  resolve(input: {
    gymId: string;
    authorization?: string;
    locationId?: string;
  }): Promise<string | undefined> {
    return resolvePortalBranch(this.prisma.client, {
      gymId: input.gymId,
      userId: this.sessionUserId(input.gymId, input.authorization),
      locationId: input.locationId,
    });
  }

  /** The caller's user id when the bearer token verifies for `gymId`, else `null`. */
  private sessionUserId(gymId: string, authorization: string | undefined): string | null {
    const token = extractBearerToken(authorization);
    if (!token) {
      return null;
    }
    try {
      const claims = this.tokens.verifyAccessToken(token);
      return claims.gymId === gymId ? claims.sub : null;
    } catch {
      return null;
    }
  }
}
