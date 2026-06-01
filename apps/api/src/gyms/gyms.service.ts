import { Injectable } from '@nestjs/common';
import type { GymSummary, ListGymsResponse } from '@fit/types';
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
}
