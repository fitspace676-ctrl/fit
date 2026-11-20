import { Injectable, NotFoundException } from '@nestjs/common';
import { GymStatus } from '@fit/db';
import {
  gymPortalTheme,
  gymPublicBrand,
  gymPublicContact,
  gymPublicMemberTerms,
  gymPublicTimezone,
  type GymBySubdomainResponse,
  type GymMemberTermsResponse,
  type GymSummary,
  type ListGymsResponse,
  type OnlinePaymentsConfig,
} from '@fit/types';
import { onlinePaymentsStubEnabled } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read access to the platform-wide gym roster.
 *
 * Reads on the unscoped {@link PrismaService}: `Gym` is the tenant root (not a
 * tenant-scoped model), so listing every gym is a deliberately cross-tenant
 * operation. The cross-tenant gate lives at the controller (`@AllowCrossTenant`
 * + `TenantGuard` → `SUPER_ADMIN` only); this service just shapes the rows.
 */
@Injectable()
export class GymsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List every gym, newest first, each with its total membership count. Used by
   * the SuperAdmin operator console (and the `fit gym list` CLI helper) to
   * enumerate tenants across the whole platform.
   */
  async list(): Promise<ListGymsResponse> {
    const rows = await this.prisma.client.gym.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
    });

    const gyms: GymSummary[] = rows.map((gym) => ({
      id: gym.id,
      name: gym.name,
      slug: gym.slug,
      ownerId: gym.ownerId,
      memberCount: gym._count.members,
      createdAt: gym.createdAt.toISOString(),
    }));

    return { gyms };
  }

  /**
   * The gym's own member terms (`GET /gyms/by-subdomain/:slug/terms`): what a
   * visitor agrees to in the join wizard. Its own route rather than a field on
   * the tenant lookup, because that lookup runs on every page and the terms can
   * be long. Same `ACTIVE`-only rule and `404` as {@link resolveBySubdomain}.
   */
  async memberTermsBySubdomain(slug: string): Promise<GymMemberTermsResponse> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { slug },
      select: { status: true, settings: true },
    });
    if (!gym || gym.status !== GymStatus.ACTIVE) {
      throw new NotFoundException({ message: 'Gym not found', code: 'GYM_NOT_FOUND' });
    }
    return gymPublicMemberTerms(gym.settings);
  }

  /**
   * Resolve a tenant subdomain slug to the minimal public view a visitor needs
   * to enter a gym's site (`GET /gyms/by-subdomain/:slug`). Reads the unscoped
   * client because this runs before any tenant is established (it is *how* a
   * public request discovers its tenant). Only an `ACTIVE` gym resolves: an
   * unknown or suspended slug is reported `404 GYM_NOT_FOUND`, so a suspended
   * tenant disappears from the public surface and an absent one can't be probed
   * apart from a suspended one.
   */
  async resolveBySubdomain(slug: string): Promise<GymBySubdomainResponse> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { slug },
      select: { id: true, name: true, status: true, settings: true },
    });
    if (!gym || gym.status !== GymStatus.ACTIVE) {
      throw new NotFoundException({ message: 'Gym not found', code: 'GYM_NOT_FOUND' });
    }

    return {
      gymId: gym.id,
      name: gym.name,
      brand: gymPublicBrand(gym.name, gym.settings),
      contact: gymPublicContact(gym.settings),
      timezone: gymPublicTimezone(gym.settings),
      // The portal's skin, resolved against the brand so both colours are always
      // renderable. It rides along here because the sign-in screen — painted
      // before anyone has a session — has nothing else to ask.
      portal: gymPortalTheme(gym.settings),
      // Whether a purchase button can work at all — see `resolveOnlinePayments`.
      onlinePayments: await this.resolveOnlinePayments(gym.id),
    };
  }

  /**
   * The gym's online-payment capability: its own active Flitt merchant, else the
   * instant stub where `ONLINE_PAYMENTS_STUB` allows it (never in production by
   * default), else none. The same rule `OnlinePaymentsService.purchaseMode`
   * enforces on purchase — read directly here so this public lookup does not
   * have to pull in the payments module.
   */
  private async resolveOnlinePayments(gymId: string): Promise<OnlinePaymentsConfig> {
    const active = await this.prisma.client.gymIntegration.count({
      where: {
        gymId,
        provider: 'flitt',
        enabled: true,
        merchantId: { not: null },
        secretCiphertext: { not: null },
        verifiedAt: { not: null },
      },
    });
    if (active > 0) return { enabled: true, provider: 'flitt' };
    return onlinePaymentsStubEnabled()
      ? { enabled: true, provider: 'stub' }
      : { enabled: false, provider: null };
  }
}
