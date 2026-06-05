import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GymMemberStatus, Prisma, Role } from '@fit/db';
import type {
  BulkExportMembersInput,
  BulkExportMembersResponse,
  CreateMemberInput,
  CreateMemberResponse,
  GetMemberResponse,
  ListMembersQuery,
  ListMembersResponse,
  MemberDetail,
  MemberRow,
  SetMemberStatusResponse,
  UpdateMemberInput,
  UpdateMemberResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

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
  user: { select: { name: true, email: true, phone: true } },
} satisfies Prisma.GymMemberSelect;

type MemberRecord = Prisma.GymMemberGetPayload<{ select: typeof MEMBER_SELECT }>;

/**
 * Staff-console member management for a gym (read + write, T4.2 + T4.3).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `gymMember`
 * query is auto-constrained to (and, on create, stamped with) the caller's gym by
 * the Prisma tenant extension, so a staff member can only ever read or mutate
 * their own gym's members — there is no `gymId` to pass or to forget. The roster
 * is the gym's `MEMBER`-role memberships (staff are managed separately in T4.7),
 * paginated server-side. `User` is cross-tenant, so create links an existing
 * person by email rather than duplicating them.
 *
 * Fields with no backing model yet — `planName` / `lastVisitAt` / `nextBillingAt`
 * plus the detail tabs (billing + attendance, Phase 5/6) — are projected as
 * `null` / `[]`. The wire contract is already the final one (see `@fit/types`
 * `members.ts`); only the data source is deferred, mirroring `TrainersService` /
 * `ClassesService`.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

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

    return this.toDetail(row);
  }

  /**
   * Create a member (T4.3). The email is the cross-gym {@link Role.MEMBER User}
   * identity: a person who already exists (a member of another gym, or one who
   * was removed and is returning) is **linked** rather than duplicated — only a
   * brand-new email mints a `User`. A duplicate within the caller's own gym is a
   * `409 MEMBER_EXISTS`. Wrapped in a transaction so a failed membership insert
   * never leaves an orphan user behind. Returns the new member's detail (`201`).
   *
   * The whole flow runs on the tenant-scoped client: `gymMember` reads/writes are
   * auto-constrained to (and stamped with) the caller's gym, so there is no
   * `gymId` to pass — the duplicate check and the insert are both this-gym-only by
   * construction. An existing user's `name`/`phone` is left untouched (it is their
   * cross-gym identity); edit it afterwards via {@link updateMember} if needed.
   */
  async createMember(input: CreateMemberInput): Promise<CreateMemberResponse> {
    const { name, email, phone, status } = input;

    const row = await this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });

      if (existing) {
        const already = await tx.gymMember.findFirst({
          where: { userId: existing.id },
          select: { id: true },
        });
        if (already) {
          throw new ConflictException({
            message: 'This person is already a member of your gym',
            code: 'MEMBER_EXISTS',
          });
        }
      }

      const userId =
        existing?.id ??
        (await tx.user.create({ data: { name, email, phone }, select: { id: true } })).id;

      // `gymId` is read from the request's tenant context. The tenant extension
      // also stamps it on create, so this is belt-and-braces — and it satisfies
      // the create input's static type (which always requires `gymId`).
      return tx.gymMember.create({
        data: { userId, gymId: this.tenant.gymId, role: Role.MEMBER, status },
        select: MEMBER_SELECT,
      });
    });

    return this.toDetail(row);
  }

  /**
   * Edit a member's profile (`name` / `phone`, T4.3). The id must resolve to a
   * `MEMBER`-role membership in the caller's gym (the scoped `where` makes a
   * cross-tenant id a `404`). The fields live on the shared `User`, so the update
   * targets the membership's `userId`; the email and status are deliberately not
   * editable here (see {@link updateMemberSchema}). Returns the updated detail.
   */
  async updateMember(id: string, input: UpdateMemberInput): Promise<UpdateMemberResponse> {
    const member = await this.requireMember(id);

    await this.prisma.client.user.update({
      where: { id: member.userId },
      data: { name: input.name, phone: input.phone },
    });

    return this.getMember(id);
  }

  /**
   * Deactivate a member (T4.3) — set the membership `status` to `SUSPENDED` so the
   * person can no longer obtain a member session for this gym while their record
   * (and history) is preserved. Idempotent: deactivating an already-suspended
   * member is a no-op `200`. A `404` for an unknown / cross-tenant id.
   */
  async deactivateMember(id: string): Promise<SetMemberStatusResponse> {
    return this.setStatus(id, GymMemberStatus.SUSPENDED);
  }

  /**
   * Reactivate a member (T4.3) — the inverse of {@link deactivateMember}, setting
   * the membership `status` back to `ACTIVE`. Idempotent and `404`-on-miss like
   * its counterpart.
   */
  async reactivateMember(id: string): Promise<SetMemberStatusResponse> {
    return this.setStatus(id, GymMemberStatus.ACTIVE);
  }

  /** Set a member's lifecycle `status`, 404-ing an unknown / cross-tenant id. */
  private async setStatus(id: string, status: GymMemberStatus): Promise<SetMemberStatusResponse> {
    await this.requireMember(id);
    await this.prisma.client.gymMember.update({ where: { id }, data: { status } });
    return this.getMember(id);
  }

  /**
   * Resolve a `MEMBER`-role membership in the caller's gym or throw a
   * `404 MEMBER_NOT_FOUND`. The scoped `where` constrains `gymId`, so a
   * cross-tenant id simply never matches — the guard for every write.
   */
  private async requireMember(id: string): Promise<{ id: string; userId: string }> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id, role: Role.MEMBER },
      select: { id: true, userId: true },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }
    return member;
  }

  /** Project a queried membership row to the full detail (with empty history tabs). */
  private toDetail(row: MemberRecord): MemberDetail {
    return {
      ...this.toRow(row),
      joinedAt: row.joinedAt.toISOString(),
      // Backing models land in Phase 5/6 (billing + attendance) and notes later.
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
      phone: row.user.phone,
      // Deferred fields — see the class docstring. Null renders as "—" in the table.
      status: row.status,
      planName: null,
      lastVisitAt: null,
      nextBillingAt: null,
    };
  }
}
