import { Injectable } from '@nestjs/common';
import { LocationStatus, type Prisma } from '@fit/db';
import {
  type ListLocationsQuery,
  type ListLocationsResponse,
  type LocationSummary,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The columns the public listing selects off `Location`. A deliberately slim
 * projection of the gym's own branches — the display fields a discovery card /
 * pickup picker needs, no lifecycle/audit columns a storefront has no use for.
 */
const LOCATION_SELECT = {
  id: true,
  name: true,
  address: true,
  photoUrl: true,
  amenities: true,
  hours: true,
} satisfies Prisma.LocationSelect;

type LocationRecord = Prisma.LocationGetPayload<{ select: typeof LOCATION_SELECT }>;

/**
 * Read access to a gym's locations for the public purchase/discovery surfaces
 * (`GET /locations`).
 *
 * Powers the member-facing choice of *where* to buy/collect: the purchase
 * wizard's first step (T3.8) and the shop cart's pickup picker (T7.7) — both
 * gymId-scoped reads a visitor / member browses, never a session.
 *
 * Mirrors the public {@link import('../products/products.service').ProductsService}:
 * it runs on the **base** {@link PrismaService} (the route is `@Public()` and
 * excluded from the JWT `TenantMiddleware`), so the gym is constrained explicitly
 * by the `gymId` query param. Only `ACTIVE` locations are listed — a deactivated
 * branch drops off the storefront while its row is preserved — and each is mapped
 * to the slim public {@link LocationSummary}. Distinct from the staff-only
 * {@link import('./admin-locations.service').AdminLocationsService} (`/admin/locations`,
 * T4.5), which manages the same `Location` rows behind the `TenantGuard` + permissions.
 */
@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List the gym's active locations, ordered by name. Scoped by the explicit
   * `gymId` (an unknown gym simply matches nothing). An empty array is a normal
   * result the caller renders as its "no locations configured" state.
   */
  async listLocations(query: ListLocationsQuery): Promise<ListLocationsResponse> {
    const rows = await this.prisma.client.location.findMany({
      where: { gymId: query.gymId, status: LocationStatus.ACTIVE },
      select: LOCATION_SELECT,
      orderBy: { name: 'asc' },
    });

    return { locations: rows.map((row) => this.toSummary(row)) };
  }

  /**
   * Project a queried row to the public {@link LocationSummary}. `hours` is
   * normalised to a flat weekday→label string map (dropping any non-string
   * value) so a legacy / richer stored shape can never break the listing.
   */
  private toSummary(row: LocationRecord): LocationSummary {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      photoUrl: row.photoUrl,
      amenities: row.amenities,
      hours: this.toHours(row.hours),
    };
  }

  /** Coerce a stored `hours` JSON value to the public flat `string → string` map. */
  private toHours(hours: Prisma.JsonValue): Record<string, string> {
    if (!hours || typeof hours !== 'object' || Array.isArray(hours)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [day, label] of Object.entries(hours)) {
      if (typeof label === 'string') {
        out[day] = label;
      }
    }
    return out;
  }
}
