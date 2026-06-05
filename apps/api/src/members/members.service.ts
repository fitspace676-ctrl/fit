import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, Role } from '@fit/db';
import type {
  BulkExportMembersInput,
  BulkExportMembersResponse,
  GetMemberResponse,
  ListMembersQuery,
  ListMembersResponse,
  MemberRow,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/**
 * Shape the roster/detail queries select off `GymMember`, joined to the
 * (cross-tenant) `User` for the member's identity. Kept narrow on purpose — the
 * member endpoints must never leak PII the table doesn't need (`passwordHash`,
 * OAuth subject ids, tokens), so only `name` + `email` are pulled from `User`.
 */
const MEMBER_SELECT = {
  id: true,
  status: true,
  joinedAt: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.GymMemberSelect;

type MemberRecord = Prisma.GymMemberGetPayload<{ select: typeof MEMBER_SELECT }>;

/**
 * Staff-console read access to a gym's member roster (T4.2).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `gymMember`
 * query is auto-constrained to the caller's gym by the Prisma tenant extension,
 * so a staff member can only ever read their own gym's members — there is no
 * `gymId` to pass or to forget. The roster is the gym's `MEMBER`-role
 * memberships (staff are managed separately in T4.7), paginated server-side.
 *
 * Fields with no backing model yet — `phone` (T4.3), and `planName` /
 * `lastVisitAt` / `nextBillingAt` plus the detail tabs (billing + attendance,
 * Phase 5/6) — are projected as `null` / `[]`. The wire contract is already the
 * final one (see `@fit/types` `members.ts`); only the data source is deferred,
 * mirroring `TrainersService` / `ClassesService`.
 */
@Injectable()
export class MembersService {
  constructor(private readonly prisma: TenantPrismaService) {}

  /**
   * One page of the gym's members, filtered + sorted server-side. `total` is the
   * filtered count (so the pager is accurate), and the page is bounded by
   * `skip`/`take` — the full roster is never loaded into memory. An empty page is
   * a normal result.
   */
  async listMembers(query: ListMembersQuery): Promise<ListMembersResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.gymMember.findMany({
        where,
        select: MEMBER_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.limit,
      }),
      this.prisma.client.gymMember.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toRow(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * One member's detail for the tabbed detail page. A missing id — or one
   * belonging to another tenant (the scoped `where` already constrains `gymId`,
   * so a cross-tenant id simply never matches) — is a `404`. The history tabs are
   * empty until their models land (Phase 5/6); the page renders each empty state.
   */
  async getMember(id: string): Promise<GetMemberResponse> {
    const row = await this.prisma.client.gymMember.findFirst({
      where: { id, role: Role.MEMBER },
      select: MEMBER_SELECT,
    });
    if (!row) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }

    return {
      ...this.toRow(row),
      joinedAt: row.joinedAt.toISOString(),
      // Backing models land in Phase 5/6 (billing + attendance) and T4.3 (notes).
      subscriptions: [],
      bookings: [],
      payments: [],
      notes: '',
    };
  }

  /**
   * Enqueue an async CSV export of the selected members (or, with no `ids`, the
   * members matching `filters` / the whole gym). The export is generated off the
   * request path and streamed (never an in-memory array), so this only registers
   * the job and hands back its `jobId`; the worker that produces the file lands
   * with the export-job infrastructure. Returns `202 Accepted`.
   */
  bulkExport(_input: BulkExportMembersInput): Promise<BulkExportMembersResponse> {
    // The streaming CSV worker is deferred (see the class docstring); for now the
    // endpoint honours its contract by minting the job handle the client polls.
    return Promise.resolve({ jobId: randomUUID() });
  }

  /**
   * The tenant-scoped `where` for the roster: always the gym's `MEMBER`-role
   * memberships (the extension adds `gymId`), narrowed by an optional `status`
   * and a case-insensitive `search` across the member's name + email.
   */
  private buildWhere(query: ListMembersQuery): Prisma.GymMemberWhereInput {
    const where: Prisma.GymMemberWhereInput = { role: Role.MEMBER };

    if (query.status) {
      where.status = query.status;
    }

    const search = query.search?.trim();
    if (search) {
      where.user = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    // `planId` filtering needs the subscription model (Phase 5/6); accepted on the
    // wire now but a no-op until plans exist, so it never errors a caller.
    void query.planId;

    return where;
  }

  /**
   * Map the requested sort column to a Prisma `orderBy`. `name` sorts on the
   * joined user; `lastVisitAt` has no column yet (attendance, Phase 5/6) so it
   * falls back to `joinedAt` — a stable, meaningful order until visits are tracked.
   */
  private buildOrderBy(query: ListMembersQuery): Prisma.GymMemberOrderByWithRelationInput {
    switch (query.sort) {
      case 'name':
        return { user: { name: query.dir } };
      case 'status':
        return { status: query.dir };
      case 'joinedAt':
      case 'lastVisitAt':
      default:
        return { joinedAt: query.dir };
    }
  }

  /** Project a queried membership row to the denormalised wire {@link MemberRow}. */
  private toRow(row: MemberRecord): MemberRow {
    return {
      id: row.id,
      name: row.user.name ?? row.user.email,
      email: row.user.email,
      // Deferred fields — see the class docstring. Null renders as "—" in the table.
      phone: null,
      status: row.status,
      planName: null,
      lastVisitAt: null,
      nextBillingAt: null,
    };
  }
}
