import { Injectable } from '@nestjs/common';
import { LocationStatus, type Prisma } from '@fit/db';
import {
  CLOSED_LABEL,
  dayHoursSchema,
  formatDayHours,
  WEEKDAYS,
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

/** {@link WEEKDAYS} as a set, for "is this key a weekday I know?" lookups. */
const WEEKDAY_KEYS: ReadonlySet<string> = new Set(WEEKDAYS);

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
   * projected from the stored structured week to a flat weekday→label string
   * map, so a legacy / malformed stored shape can never break the listing.
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

  /**
   * Project a stored `hours` JSON value onto the public flat `weekday → display
   * string` map the {@link LocationSummary} contract declares.
   *
   * The write side stores the *structured* week the
   * {@link import('@fit/types').locationHoursSchema} validates — `{ closed, open,
   * close }` per day — which is a different shape from the display map the public
   * card reads. Nothing used to bridge the two: the old projection kept only
   * values that were already strings, so every structured day was silently
   * dropped and a fully configured branch published `{}`. That stayed invisible
   * only while every seeded location had `hours: {}`.
   *
   * Emitted Monday-first off {@link WEEKDAYS} rather than in stored order: the
   * column is `jsonb`, which does not preserve key order (same-length keys come
   * back bytewise — fri, mon, sat, …), so the card cannot get a readable week by
   * iterating what Postgres hands back.
   *
   * Only days actually present are emitted. A branch that has never had hours set
   * still stores `{}`, and an absent day is genuinely unknown — filling either
   * from `locationHoursSchema`'s 09:00–17:00 defaults (as the staff-console
   * {@link import('./admin-locations.service').AdminLocationsService} deliberately
   * does, so the edit form always has seven rows of inputs) would publish opening
   * hours the gym never entered. An empty map is the card's documented "no hours
   * configured" state.
   */
  private toHours(hours: Prisma.JsonValue): Record<string, string> {
    if (!hours || typeof hours !== 'object' || Array.isArray(hours)) {
      return {};
    }
    const stored: Record<string, Prisma.JsonValue | undefined> = hours;
    const out: Record<string, string> = {};

    for (const day of WEEKDAYS) {
      const label = this.toDayLabel(stored[day]);
      if (label !== null) {
        out[day] = label;
      }
    }
    // Any other key is not a weekday this API knows about. A plain string is
    // still passed through, exactly as the previous projection did, so no row
    // that rendered before this fix stops rendering because of it.
    for (const [key, value] of Object.entries(stored)) {
      if (!WEEKDAY_KEYS.has(key) && typeof value === 'string') {
        out[key] = value;
      }
    }
    return out;
  }

  /**
   * One stored day as a display string, or `null` when it should not be shown.
   *
   * The rendering itself is {@link formatDayHours}, shared with the staff console
   * so a branch closing at midnight cannot read `06:00–24:00` to a visitor and
   * `06:00–00:00` to the staff editing it. What is left here is the part that is
   * genuinely this caller's: turning an untrusted stored JSON value into either a
   * day that helper can format, or `null` for "do not publish this one".
   *
   * A `closed` day short-circuits to {@link CLOSED_LABEL} before parsing, because
   * the schema ignores a shut day's times and so must this — a stored shut day
   * with junk times is still a shut day, not a dropped one.
   *
   * Validation is otherwise {@link dayHoursSchema}'s, so the API cannot publish a
   * time format or a backwards window the admin form would have rejected — but the
   * times must both be *present* before it parses, since that schema defaults a
   * missing one. Anything else (a fragment, a malformed value, `null`) is dropped
   * rather than guessed at.
   */
  private toDayLabel(value: Prisma.JsonValue | undefined): string | null {
    // A legacy row may already hold a flat display string; pass it through.
    if (typeof value === 'string') {
      return value || null;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const day: Record<string, Prisma.JsonValue | undefined> = value;
    if (day.closed === true) {
      return CLOSED_LABEL;
    }
    if (typeof day.open !== 'string' || typeof day.close !== 'string') {
      return null;
    }
    const parsed = dayHoursSchema.safeParse(value);
    if (!parsed.success) {
      return null;
    }
    return formatDayHours(parsed.data);
  }
}
