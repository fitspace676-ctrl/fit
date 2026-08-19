import { Injectable } from '@nestjs/common';
import { Prisma } from '@fit/db';
import type {
  AdminAuditLogRow,
  AuditLogRow,
  ListAdminAuditLogQuery,
  ListAdminAuditLogResponse,
  ListAuditLogQuery,
  ListAuditLogResponse,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The columns the viewer projects off `AuditLog` — the whole row is small. */
const AUDIT_SELECT = {
  id: true,
  action: true,
  actorId: true,
  targetId: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

type AuditRecord = Prisma.AuditLogGetPayload<{ select: typeof AUDIT_SELECT }>;

/** The identity fields resolved for an actor / target, keyed by user id. */
type UserIdentity = { name: string | null; email: string };

/** The gym fields the platform feed resolves for an entry, keyed by gym id. */
type GymIdentity = { id: string; name: string; subdomainSlug: string };

/**
 * Read side of the audit trail — for one gym's staff, and for the platform.
 *
 * Two entry points over one projection. {@link listAuditLogs} is the staff
 * console's view of its OWN gym, pinned to the tenant context. {@link
 * listPlatformAuditLogs} is the operator console's view ACROSS gyms, which
 * additionally resolves the gym each entry belongs to — because across tenants
 * "suspended" means nothing until you know whose.
 *
 * Runs on the **unscoped** {@link PrismaService}: `AuditLog` carries no `gymId`
 * filter in the tenant Prisma extension (it is deliberately denormalised and not
 * a tenant-scoped model), so this service constrains every query to the caller's
 * own gym **explicitly** by reading {@link TenantContext.gymId}. The controller's
 * {@link TenantGuard} has already pinned the request to one gym, so a staff member
 * only ever reads their own gym's entries — the same isolation the scoped client
 * gives other features, applied by hand here because the model opts out of it.
 *
 * `actorId` / `targetId` are denormalised scalars (no FK — the trail must outlive
 * the records it references), so names/emails are resolved best-effort in a second
 * `User` query and left `null` when the user no longer exists. The metadata is the
 * action-specific JSON the writer stored (see `SuperAdminService`).
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * One page of the gym's audit entries, newest first, filtered server-side by
   * action and/or a calendar-day range. `total` is the filtered count (so the
   * pager is accurate) and the page is bounded by `skip`/`take` — the trail is
   * never loaded into memory. An empty page is a normal result.
   */
  async listAuditLogs(query: ListAuditLogQuery): Promise<ListAuditLogResponse> {
    const where = this.buildWhere(query, this.tenant.gymId);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        select: AUDIT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    const identities = await this.resolveIdentities(rows);

    return {
      data: rows.map((row) => this.toRow(row, identities)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * One page of the PLATFORM's audit trail, newest first — every gym, or one when
   * `gymId` narrows it.
   *
   * The same page shape as the staff feed plus the gym each entry belongs to,
   * resolved in one batched query over the page's distinct gym ids. `AuditLog`
   * carries `gymId` as a denormalised scalar with no FK (the trail outlives what
   * it references), so an entry whose gym has been deleted resolves to `null`
   * rather than disappearing — which is the honest answer about something that
   * did happen to a gym that is now gone.
   *
   * SUPER_ADMIN-only; the gate is the controller's (`@AllowCrossTenant` +
   * `TenantGuard`), and this method deliberately applies no tenant filter of its
   * own — that is the whole point of it.
   */
  async listPlatformAuditLogs(query: ListAdminAuditLogQuery): Promise<ListAdminAuditLogResponse> {
    const where = this.buildWhere(query, query.gymId);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        select: { ...AUDIT_SELECT, gymId: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    const [identities, gyms] = await Promise.all([
      this.resolveIdentities(rows),
      this.resolveGyms(rows),
    ]);

    return {
      data: rows.map(
        (row): AdminAuditLogRow => ({
          ...this.toRow(row, identities),
          gym: (row.gymId ? gyms.get(row.gymId) : undefined) ?? null,
        }),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * The `where` for the trail: pinned to `gymId` when one is given, narrowed by an
   * optional exact `action` and a `from`/`to` calendar-day range. `to` is made
   * inclusive of the whole day by taking entries strictly before the *next*
   * midnight.
   *
   * The gym is a PARAMETER rather than something read here, so the two callers
   * cannot be confused for each other: the staff feed passes the tenant context's
   * gym (never a client-supplied one), and the platform feed passes whatever the
   * operator asked to narrow to, or nothing at all.
   */
  private buildWhere(query: ListAuditLogQuery, gymId?: string): Prisma.AuditLogWhereInput {
    // `undefined` in a Prisma filter means "do not constrain", which is exactly
    // what an unnarrowed platform query wants — and is why the gym-scoped caller
    // passes its context gym explicitly rather than relying on a default.
    const where: Prisma.AuditLogWhereInput = { gymId };

    if (query.action) {
      where.action = query.action;
    }

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) {
      createdAt.gte = new Date(`${query.from}T00:00:00.000Z`);
    }
    if (query.to) {
      // Inclusive upper bound: everything before the start of the day after `to`.
      const next = new Date(`${query.to}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      createdAt.lt = next;
    }
    if (createdAt.gte || createdAt.lt) {
      where.createdAt = createdAt;
    }

    return where;
  }

  /**
   * Resolve the distinct actor + target user ids on a page to their name + email
   * in a single `User` query. `User` is cross-tenant (an operator acting on the
   * gym need not be a member of it), so this reads it unscoped — exactly what the
   * unextended client this service holds does. Returns a lookup map; an id absent
   * from it (the user was deleted) renders as `null`.
   */
  private async resolveIdentities(rows: AuditRecord[]): Promise<Map<string, UserIdentity>> {
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.actorId);
      if (row.targetId) {
        ids.add(row.targetId);
      }
    }
    if (ids.size === 0) {
      return new Map();
    }

    const users = await this.prisma.client.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, email: true },
    });

    return new Map(users.map((user) => [user.id, { name: user.name, email: user.email }]));
  }

  /**
   * Resolve the distinct gym ids on a page to their name + subdomain in a single
   * query. Only the platform feed needs this — the staff feed's entries are all
   * one gym, and that gym is the one asking.
   */
  private async resolveGyms(rows: { gymId: string | null }[]): Promise<Map<string, GymIdentity>> {
    const ids = [...new Set(rows.map((row) => row.gymId).filter((id) => id !== null))];
    if (ids.length === 0) {
      return new Map();
    }

    const gyms = await this.prisma.client.gym.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, slug: true },
    });

    return new Map(
      gyms.map((gym) => [gym.id, { id: gym.id, name: gym.name, subdomainSlug: gym.slug }]),
    );
  }

  /** Project a queried entry + the resolved identities to the wire {@link AuditLogRow}. */
  private toRow(row: AuditRecord, identities: Map<string, UserIdentity>): AuditLogRow {
    const actor = identities.get(row.actorId);
    const target = row.targetId ? identities.get(row.targetId) : undefined;

    return {
      id: row.id,
      action: row.action,
      actorId: row.actorId,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      targetId: row.targetId,
      targetName: target?.name ?? null,
      targetEmail: target?.email ?? null,
      // Prisma types JSON columns as `JsonValue`; the wire contract is an object map.
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
