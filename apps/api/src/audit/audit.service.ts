import { Injectable } from '@nestjs/common';
import { Prisma } from '@fit/db';
import type { AuditLogRow, ListAuditLogQuery, ListAuditLogResponse } from '@fit/types';
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

/**
 * Read side of the gym's audit trail for the staff console viewer (T4.9).
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
    const where = this.buildWhere(query);
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
   * The `where` for the trail: always pinned to the caller's gym (read from the
   * tenant context, never trusted from the client), narrowed by an optional exact
   * `action` and a `from`/`to` calendar-day range. `to` is made inclusive of the
   * whole day by taking entries strictly before the *next* midnight.
   */
  private buildWhere(query: ListAuditLogQuery): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = { gymId: this.tenant.gymId };

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
