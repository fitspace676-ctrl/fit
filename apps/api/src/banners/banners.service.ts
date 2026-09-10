import { Injectable } from '@nestjs/common';
import type { ListPublicBannersQuery, ListPublicBannersResponse, PublicBanner } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';

/** The four columns a slide draws. Nothing about scheduling leaves the API. */
const PUBLIC_SELECT = {
  id: true,
  title: true,
  imageUrl: true,
  linkUrl: true,
} as const;

/**
 * Public banner discovery behind `GET /banners` — the member app's home-screen
 * carousel (T1.16). Reads the base (untenanted) Prisma client constrained to the
 * explicit `gymId` the app resolves from its configured slug, exactly like the
 * public trainers and products listings: the route is reached before any session
 * exists, so there is no tenant in scope to derive.
 *
 * WHAT "LIVE" MEANS, and why it is decided here rather than in the client: a
 * banner shows when it is `isActive` **and** inside its `startsAt`/`endsAt`
 * window (either end `null` = unbounded on that side) **and** has artwork. The
 * app never receives the dates, so a scheduled campaign cannot leak early through
 * a client that filters wrongly — or at all, which is the more likely failure.
 *
 * The artwork check is the one that is easy to miss: the console creates a banner
 * row and finalises its image in a second request, so a half-created banner is a
 * real row with an empty `imageUrl`. Without the filter it reaches the carousel as
 * a blank slide.
 */
@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  async listBanners(
    query: ListPublicBannersQuery,
    now: Date = new Date(),
  ): Promise<ListPublicBannersResponse> {
    const rows = await this.prisma.client.banner.findMany({
      where: {
        gymId: query.gymId,
        isActive: true,
        imageUrl: { not: '' },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      select: PUBLIC_SELECT,
      // The same total order the console arranges: position first, then oldest
      // first, so two banners left at the default `sortOrder` still have a stable
      // order rather than whatever the planner returns.
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { banners: rows satisfies PublicBanner[] };
  }
}
