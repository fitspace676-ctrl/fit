import { Injectable, NotFoundException } from '@nestjs/common';
import { LocationStatus, Prisma } from '@fit/db';
import {
  locationHoursSchema,
  type AdminLocationDetail,
  type AdminLocationRow,
  type CreateLocationData,
  type CreateLocationResponse,
  type GetAdminLocationResponse,
  type ListAdminLocationsQuery,
  type ListAdminLocationsResponse,
  type LocationHours,
  type SetLocationStatusResponse,
  type UpdateLocationData,
  type UpdateLocationResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { MediaCleanupService } from '../storage/media-cleanup.service';

/**
 * The columns the roster/detail queries select off `Location`. Every field is the
 * gym's own content (no cross-tenant join), so the whole row is safe to project.
 */
const LOCATION_SELECT = {
  id: true,
  name: true,
  address: true,
  phone: true,
  photoUrl: true,
  amenities: true,
  hours: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LocationSelect;

type LocationRecord = Prisma.LocationGetPayload<{ select: typeof LOCATION_SELECT }>;

/** A complete open-week fallback for a row whose stored `hours` is empty/malformed. */
const DEFAULT_HOURS: LocationHours = locationHoursSchema.parse({});

/**
 * Staff-console location management for a gym (read + write, T4.5).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `location`
 * query is auto-constrained to (and, on create, stamped with) the caller's gym by
 * the Prisma tenant extension, so staff can only ever read or mutate their own
 * gym's locations — there is no `gymId` to pass or to forget. The roster is
 * paginated server-side so it scales without loading every location into memory.
 *
 * The managed record here is the source the *public* locations listing (`GET
 * /locations`, T3.8) ultimately surfaces; this service owns the editable shape,
 * including the structured weekly `hours` (stored as JSON) and the R2-hosted
 * `photoUrl` the admin form uploads.
 */
@Injectable()
export class AdminLocationsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly media: MediaCleanupService,
  ) {}

  /**
   * One page of the gym's locations, filtered + sorted server-side. `total` is the
   * filtered count (so the pager is accurate) and the page is bounded by
   * `skip`/`take`. An empty page is a normal result.
   */
  async listLocations(query: ListAdminLocationsQuery): Promise<ListAdminLocationsResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.location.findMany({
        where,
        select: LOCATION_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.limit,
      }),
      this.prisma.client.location.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toRow(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * One location's detail for the detail / edit page. A missing id — or one
   * belonging to another tenant (the scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches) — is a `404 LOCATION_NOT_FOUND`.
   */
  async getLocation(id: string): Promise<GetAdminLocationResponse> {
    const row = await this.prisma.client.location.findFirst({
      where: { id },
      select: LOCATION_SELECT,
    });
    if (!row) {
      throw new NotFoundException({ message: 'Location not found', code: 'LOCATION_NOT_FOUND' });
    }
    return this.toDetail(row);
  }

  /**
   * Create a location (T4.5). The whole insert runs on the tenant-scoped client, so
   * `gymId` is stamped from the request's tenant context by the extension; it is
   * also passed explicitly here as belt-and-braces and to satisfy the create
   * input's static type. The structured weekly `hours` are stored as JSON. Returns
   * the new location's detail (`201`).
   */
  async createLocation(input: CreateLocationData): Promise<CreateLocationResponse> {
    const row = await this.prisma.client.location.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        address: input.address,
        phone: input.phone,
        photoUrl: input.photoUrl,
        amenities: input.amenities,
        hours: input.hours as unknown as Prisma.InputJsonValue,
        status: input.status,
      },
      select: LOCATION_SELECT,
    });
    return this.toDetail(row);
  }

  /**
   * Edit a location's profile (T4.5). The id must resolve to a location in the
   * caller's gym (the scoped `where` makes a cross-tenant id a `404`). `status` is
   * deliberately not editable here — it moves through {@link deactivateLocation} /
   * {@link reactivateLocation}. Returns the updated detail.
   */
  async updateLocation(id: string, input: UpdateLocationData): Promise<UpdateLocationResponse> {
    const existing = await this.requireLocation(id);
    await this.prisma.client.location.update({
      where: { id },
      data: {
        name: input.name,
        address: input.address,
        phone: input.phone,
        photoUrl: input.photoUrl,
        amenities: input.amenities,
        hours: input.hours as unknown as Prisma.InputJsonValue,
      },
    });

    // A replaced photo leaves its predecessor behind; free it once the edit is
    // committed. Best-effort by design — the nightly sweep is the backstop.
    await this.media.discardUnreferenced([existing.photoUrl], [input.photoUrl]);

    return this.getLocation(id);
  }

  /**
   * Deactivate a location (T4.5) — set `status` to `INACTIVE` so it drops off the
   * public listing while the record is preserved. Idempotent; `404`-on-miss.
   */
  async deactivateLocation(id: string): Promise<SetLocationStatusResponse> {
    return this.setStatus(id, LocationStatus.INACTIVE);
  }

  /**
   * Reactivate a location (T4.5) — the inverse of {@link deactivateLocation},
   * setting `status` back to `ACTIVE`. Idempotent and `404`-on-miss like its
   * counterpart.
   */
  async reactivateLocation(id: string): Promise<SetLocationStatusResponse> {
    return this.setStatus(id, LocationStatus.ACTIVE);
  }

  /** Set a location's lifecycle `status`, 404-ing an unknown / cross-tenant id. */
  private async setStatus(id: string, status: LocationStatus): Promise<SetLocationStatusResponse> {
    await this.requireLocation(id);
    await this.prisma.client.location.update({ where: { id }, data: { status } });
    return this.getLocation(id);
  }

  /**
   * Resolve a location in the caller's gym or throw `404 LOCATION_NOT_FOUND`. The
   * scoped `where` constrains `gymId`, so a cross-tenant id never matches — the
   * guard for every write.
   */
  private async requireLocation(id: string): Promise<{ id: string; photoUrl: string | null }> {
    const location = await this.prisma.client.location.findFirst({
      where: { id },
      select: { id: true, photoUrl: true },
    });
    if (!location) {
      throw new NotFoundException({ message: 'Location not found', code: 'LOCATION_NOT_FOUND' });
    }
    return location;
  }

  /**
   * The tenant-scoped `where` for the roster (the extension adds `gymId`), narrowed
   * by an optional `status` and a case-insensitive `search` across the location's
   * name + address.
   */
  private buildWhere(query: ListAdminLocationsQuery): Prisma.LocationWhereInput {
    const where: Prisma.LocationWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /** Map the requested sort column to a Prisma `orderBy`. */
  private buildOrderBy(query: ListAdminLocationsQuery): Prisma.LocationOrderByWithRelationInput {
    switch (query.sort) {
      case 'status':
        return { status: query.dir };
      case 'createdAt':
        return { createdAt: query.dir };
      case 'name':
      default:
        return { name: query.dir };
    }
  }

  /**
   * Normalise a row's stored `hours` JSON to a complete seven-day
   * {@link LocationHours}. A row written by this service is already well-formed;
   * the safe-parse fallback keeps a legacy / hand-edited empty value from breaking
   * the projection (it renders as a default open week).
   */
  private parseHours(value: Prisma.JsonValue): LocationHours {
    const parsed = locationHoursSchema.safeParse(value ?? {});
    return parsed.success ? parsed.data : DEFAULT_HOURS;
  }

  /**
   * Project a queried row to the roster {@link AdminLocationRow}. The stored
   * `hours` JSON is normalised to a complete seven-day map so the location cards
   * can render today's hours / live open state straight off the roster.
   */
  private toRow(row: LocationRecord): AdminLocationRow {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      phone: row.phone,
      photoUrl: row.photoUrl,
      amenities: row.amenities,
      hours: this.parseHours(row.hours),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Project a queried row to the full {@link AdminLocationDetail}. */
  private toDetail(row: LocationRecord): AdminLocationDetail {
    return {
      ...this.toRow(row),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
