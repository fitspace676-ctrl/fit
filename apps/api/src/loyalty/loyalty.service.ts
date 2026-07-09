import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@fit/db';
import {
  LOYALTY_REASON_CATALOG,
  LOYALTY_REWARD_TYPE_CATALOG,
  type AdjustLoyaltyPointsInput,
  type CreateLoyaltyRewardInput,
  type ListLoyaltyRewardsResponse,
  type ListRedemptionsQuery,
  type ListRedemptionsResponse,
  type LoyaltyCatalogResponse,
  type LoyaltyLedgerEntryRow,
  type LoyaltyPointsBucket,
  type LoyaltyPointsTimeseriesResponse,
  type LoyaltyProgramResponse,
  type LoyaltyRedemptionsByTypeResponse,
  type LoyaltyRewardRow,
  type LoyaltyRewardType,
  type LoyaltySummaryResponse,
  type LoyaltyTopEarnerRow,
  type LoyaltyTopEarnersResponse,
  type MemberBalanceResponse,
  type MemberLoyaltyResponse,
  type RedeemRewardInput,
  type RedeemRewardResult,
  type RedemptionRow,
  type UpdateLoyaltyProgramInput,
  type UpdateLoyaltyRewardInput,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** How many of a member's most recent ledger entries the detail view returns. */
const MEMBER_LEDGER_LIMIT = 50;

const REWARD_SELECT = {
  id: true,
  name: true,
  description: true,
  pointsCost: true,
  type: true,
  active: true,
  stock: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LoyaltyRewardSelect;

type RewardRecord = Prisma.LoyaltyRewardGetPayload<{ select: typeof REWARD_SELECT }>;

const REDEMPTION_SELECT = {
  id: true,
  memberId: true,
  rewardId: true,
  rewardName: true,
  rewardType: true,
  pointsSpent: true,
  status: true,
  redeemedAt: true,
  member: { select: { user: { select: { name: true, email: true } } } },
} satisfies Prisma.LoyaltyRedemptionSelect;

type RedemptionRecord = Prisma.LoyaltyRedemptionGetPayload<{ select: typeof REDEMPTION_SELECT }>;

const LEDGER_SELECT = {
  id: true,
  memberId: true,
  delta: true,
  reason: true,
  refId: true,
  balanceAfter: true,
  note: true,
  createdAt: true,
} satisfies Prisma.LoyaltyLedgerEntrySelect;

type LedgerRecord = Prisma.LoyaltyLedgerEntryGetPayload<{ select: typeof LEDGER_SELECT }>;

/**
 * Staff-console Loyalty API (`/loyalty`, T12.10) — program config, the rewards
 * catalogue, member balances + ledger, redemptions, and the report aggregations
 * that feed the Loyalty drill-down (T12.13).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: the extension pins
 * every query to the caller's gym, so no handler passes or trusts a `gymId`. The
 * automatic earn hooks (points on check-in / purchase / signup) live in the
 * separate, cross-tenant {@link LoyaltyPointsService} so they can run detached
 * from a request; this service owns the interactive surface (config, CRUD,
 * redeem, manual adjust, reports).
 *
 * A member's balance is authoritative as `SUM(delta)` over their ledger entries;
 * `balanceAfter` is a display snapshot written alongside each entry.
 */
@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** `GET /loyalty/catalog` — the reward-type + reason catalogs the admin UI renders. */
  catalog(): LoyaltyCatalogResponse {
    return { rewardTypes: LOYALTY_REWARD_TYPE_CATALOG, reasons: LOYALTY_REASON_CATALOG };
  }

  // -------------------------------------------------------------------------
  // Program configuration
  // -------------------------------------------------------------------------

  /** The gym's program config, or disabled zero-rule defaults if never configured. */
  async getProgram(): Promise<LoyaltyProgramResponse> {
    const program = await this.prisma.client.loyaltyProgram.findFirst();
    if (!program) {
      return {
        enabled: false,
        pointsPerCheckIn: 0,
        pointsPerCurrencyUnit: 0,
        signupBonus: 0,
        updatedAt: null,
      };
    }
    return this.toProgramResponse(program);
  }

  /** Upsert the gym's program config from a partial patch. */
  async updateProgram(input: UpdateLoyaltyProgramInput): Promise<LoyaltyProgramResponse> {
    const gymId = this.tenant.gymId;
    const program = await this.prisma.client.loyaltyProgram.upsert({
      where: { gymId },
      create: {
        gymId,
        enabled: input.enabled ?? false,
        pointsPerCheckIn: input.pointsPerCheckIn ?? 0,
        pointsPerCurrencyUnit: input.pointsPerCurrencyUnit ?? 0,
        signupBonus: input.signupBonus ?? 0,
      },
      update: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.pointsPerCheckIn !== undefined
          ? { pointsPerCheckIn: input.pointsPerCheckIn }
          : {}),
        ...(input.pointsPerCurrencyUnit !== undefined
          ? { pointsPerCurrencyUnit: input.pointsPerCurrencyUnit }
          : {}),
        ...(input.signupBonus !== undefined ? { signupBonus: input.signupBonus } : {}),
      },
    });
    return this.toProgramResponse(program);
  }

  // -------------------------------------------------------------------------
  // Rewards catalogue
  // -------------------------------------------------------------------------

  async listRewards(): Promise<ListLoyaltyRewardsResponse> {
    const rows = await this.prisma.client.loyaltyReward.findMany({
      orderBy: { createdAt: 'desc' },
      select: REWARD_SELECT,
    });
    return { data: rows.map((r) => this.toRewardRow(r)) };
  }

  async createReward(input: CreateLoyaltyRewardInput): Promise<LoyaltyRewardRow> {
    const created = await this.prisma.client.loyaltyReward.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        description: input.description,
        pointsCost: input.pointsCost,
        type: input.type,
        active: input.active,
        stock: input.stock ?? null,
      },
      select: REWARD_SELECT,
    });
    return this.toRewardRow(created);
  }

  async updateReward(id: string, input: UpdateLoyaltyRewardInput): Promise<LoyaltyRewardRow> {
    await this.requireReward(id);
    const updated = await this.prisma.client.loyaltyReward.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.pointsCost !== undefined ? { pointsCost: input.pointsCost } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.stock !== undefined ? { stock: input.stock } : {}),
      },
      select: REWARD_SELECT,
    });
    return this.toRewardRow(updated);
  }

  async deleteReward(id: string): Promise<void> {
    await this.requireReward(id);
    // Redemptions snapshot the reward's name + type and FK to it with `SetNull`, so
    // deleting a reward keeps its redemption history intact (the FK simply nulls).
    await this.prisma.client.loyaltyReward.delete({ where: { id } });
  }

  // -------------------------------------------------------------------------
  // Member balance, ledger, and manual adjustment
  // -------------------------------------------------------------------------

  /** One member's balance + recent ledger, for the member-detail Loyalty section. */
  async getMemberLoyalty(memberId: string): Promise<MemberLoyaltyResponse> {
    await this.requireMember(memberId);
    const [balance, entries] = await Promise.all([
      this.memberBalance(memberId),
      this.prisma.client.loyaltyLedgerEntry.findMany({
        where: { memberId },
        orderBy: { createdAt: 'desc' },
        take: MEMBER_LEDGER_LIMIT,
        select: LEDGER_SELECT,
      }),
    ]);
    return { memberId, balance, entries: entries.map((e) => this.toLedgerRow(e)) };
  }

  /** One member's current balance (the cheap read for the redeem dialog). */
  async getMemberBalance(memberId: string): Promise<MemberBalanceResponse> {
    await this.requireMember(memberId);
    return { memberId, balance: await this.memberBalance(memberId) };
  }

  /** Apply a signed staff adjustment; a debit that would overdraw the balance 409s. */
  async adjustPoints(
    memberId: string,
    input: AdjustLoyaltyPointsInput,
  ): Promise<MemberBalanceResponse> {
    await this.requireMember(memberId);
    const balance = await this.memberBalance(memberId);
    const next = balance + input.delta;
    if (next < 0) {
      throw new ConflictException({
        message: 'Adjustment would take the balance below zero',
        code: 'LOYALTY_BALANCE_NEGATIVE',
      });
    }
    await this.prisma.client.loyaltyLedgerEntry.create({
      data: {
        gymId: this.tenant.gymId,
        memberId,
        delta: input.delta,
        reason: 'manual',
        refId: null,
        note: input.note ?? null,
        balanceAfter: next,
      },
    });
    return { memberId, balance: next };
  }

  // -------------------------------------------------------------------------
  // Redemptions
  // -------------------------------------------------------------------------

  /**
   * Redeem a reward for a member. In one transaction: re-checks the balance, atomically
   * decrements finite stock (a conditional `updateMany` so two concurrent redeems can't
   * oversell), writes the redemption record (snapshotting the reward's name + type), and
   * appends the paired `-pointsCost` ledger entry.
   */
  async redeem(input: RedeemRewardInput): Promise<RedeemRewardResult> {
    const gymId = this.tenant.gymId;
    await this.requireMember(input.memberId);
    const reward = await this.requireReward(input.rewardId);
    if (!reward.active) {
      throw new ConflictException({
        message: 'This reward is not currently available',
        code: 'LOYALTY_REWARD_INACTIVE',
      });
    }

    const record = await this.prisma.client.$transaction(async (tx) => {
      const agg = await tx.loyaltyLedgerEntry.aggregate({
        where: { gymId, memberId: input.memberId },
        _sum: { delta: true },
      });
      const balance = agg._sum.delta ?? 0;
      if (balance < reward.pointsCost) {
        throw new ConflictException({
          message: 'Member does not have enough points for this reward',
          code: 'LOYALTY_INSUFFICIENT_POINTS',
        });
      }

      if (reward.stock !== null) {
        const decremented = await tx.loyaltyReward.updateMany({
          where: { id: reward.id, stock: { gt: 0 } },
          data: { stock: { decrement: 1 } },
        });
        if (decremented.count === 0) {
          throw new ConflictException({
            message: 'This reward is out of stock',
            code: 'LOYALTY_REWARD_OUT_OF_STOCK',
          });
        }
      }

      const redemption = await tx.loyaltyRedemption.create({
        data: {
          gymId,
          memberId: input.memberId,
          rewardId: reward.id,
          rewardName: reward.name,
          rewardType: reward.type,
          pointsSpent: reward.pointsCost,
          status: 'fulfilled',
        },
        select: REDEMPTION_SELECT,
      });

      await tx.loyaltyLedgerEntry.create({
        data: {
          gymId,
          memberId: input.memberId,
          delta: -reward.pointsCost,
          reason: 'redemption',
          refId: redemption.id,
          balanceAfter: balance - reward.pointsCost,
        },
      });

      return redemption;
    });

    return {
      redemption: this.toRedemptionRow(record),
      balance: await this.memberBalance(input.memberId),
    };
  }

  async listRedemptions(query: ListRedemptionsQuery): Promise<ListRedemptionsResponse> {
    const where: Prisma.LoyaltyRedemptionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { rewardType: query.type } : {}),
      ...(query.memberId ? { memberId: query.memberId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.loyaltyRedemption.findMany({
        where,
        orderBy: { redeemedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: REDEMPTION_SELECT,
      }),
      this.prisma.client.loyaltyRedemption.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toRedemptionRow(r)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** Cancel a redemption: refund the points via a compensating entry and restore stock. */
  async cancelRedemption(id: string): Promise<RedeemRewardResult> {
    const gymId = this.tenant.gymId;
    const existing = await this.prisma.client.loyaltyRedemption.findFirst({
      where: { id },
      select: { ...REDEMPTION_SELECT, rewardId: true },
    });
    if (!existing) {
      throw new NotFoundException({
        message: 'Redemption not found',
        code: 'LOYALTY_REDEMPTION_NOT_FOUND',
      });
    }
    if (existing.status === 'cancelled') {
      throw new ConflictException({
        message: 'This redemption has already been cancelled',
        code: 'LOYALTY_REDEMPTION_ALREADY_CANCELLED',
      });
    }

    const record = await this.prisma.client.$transaction(async (tx) => {
      const agg = await tx.loyaltyLedgerEntry.aggregate({
        where: { gymId, memberId: existing.memberId },
        _sum: { delta: true },
      });
      const balance = agg._sum.delta ?? 0;

      const updated = await tx.loyaltyRedemption.update({
        where: { id },
        data: { status: 'cancelled' },
        select: REDEMPTION_SELECT,
      });

      // Reverse the debit with a positive `redemption` entry so the issued/redeemed
      // report nets the cancellation out.
      await tx.loyaltyLedgerEntry.create({
        data: {
          gymId,
          memberId: existing.memberId,
          delta: existing.pointsSpent,
          reason: 'redemption',
          refId: existing.id,
          note: 'Redemption cancelled',
          balanceAfter: balance + existing.pointsSpent,
        },
      });

      // Restore finite stock if the reward still exists.
      if (existing.rewardId) {
        await tx.loyaltyReward.updateMany({
          where: { id: existing.rewardId, stock: { not: null } },
          data: { stock: { increment: 1 } },
        });
      }

      return updated;
    });

    return {
      redemption: this.toRedemptionRow(record),
      balance: await this.memberBalance(existing.memberId),
    };
  }

  // -------------------------------------------------------------------------
  // Reports & aggregations (feed T12.13)
  // -------------------------------------------------------------------------

  async summary(): Promise<LoyaltySummaryResponse> {
    const [issued, outstanding, redeemedAgg, redemptionsCount, activeRewards] = await Promise.all([
      this.prisma.client.loyaltyLedgerEntry.aggregate({
        where: { delta: { gt: 0 }, reason: { not: 'redemption' } },
        _sum: { delta: true },
      }),
      this.prisma.client.loyaltyLedgerEntry.aggregate({ _sum: { delta: true } }),
      this.prisma.client.loyaltyRedemption.aggregate({
        where: { status: { not: 'cancelled' } },
        _sum: { pointsSpent: true },
      }),
      this.prisma.client.loyaltyRedemption.count({ where: { status: { not: 'cancelled' } } }),
      this.prisma.client.loyaltyReward.count({ where: { active: true } }),
    ]);

    const totalIssued = issued._sum.delta ?? 0;
    const totalRedeemed = redeemedAgg._sum.pointsSpent ?? 0;
    return {
      totalIssued,
      totalRedeemed,
      netOutstanding: outstanding._sum.delta ?? 0,
      redemptionsCount,
      activeRewards,
    };
  }

  /**
   * Issued-vs-redeemed points bucketed by calendar month over the trailing
   * `months` window (inclusive of the current month). Issued = positive non-
   * redemption deltas; redeemed = the negated net of `redemption` entries (so a
   * cancellation reduces the month's redeemed total).
   */
  async pointsTimeseries(months: number): Promise<LoyaltyPointsTimeseriesResponse> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const entries = await this.prisma.client.loyaltyLedgerEntry.findMany({
      where: { createdAt: { gte: start } },
      select: { delta: true, reason: true, createdAt: true },
    });

    const buckets = new Map<string, LoyaltyPointsBucket>();
    for (let i = 0; i < months; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
      const key = monthKey(d);
      buckets.set(key, { month: key, issued: 0, redeemed: 0 });
    }

    for (const entry of entries) {
      const bucket = buckets.get(monthKey(entry.createdAt));
      if (!bucket) {
        continue;
      }
      if (entry.reason === 'redemption') {
        bucket.redeemed -= entry.delta;
      } else if (entry.delta > 0) {
        bucket.issued += entry.delta;
      }
    }

    return { data: [...buckets.values()] };
  }

  async redemptionsByType(): Promise<LoyaltyRedemptionsByTypeResponse> {
    const groups = await this.prisma.client.loyaltyRedemption.groupBy({
      by: ['rewardType'],
      where: { status: { not: 'cancelled' } },
      _sum: { pointsSpent: true },
      _count: { _all: true },
    });

    const data = groups
      .map((g) => ({
        type: g.rewardType,
        label: rewardTypeLabel(g.rewardType),
        points: g._sum.pointsSpent ?? 0,
        count: g._count._all,
      }))
      .sort((a, b) => b.points - a.points);

    return { data };
  }

  async topEarners(limit: number): Promise<LoyaltyTopEarnersResponse> {
    const groups = await this.prisma.client.loyaltyLedgerEntry.groupBy({
      by: ['memberId'],
      _sum: { delta: true },
      orderBy: { _sum: { delta: 'desc' } },
      take: limit,
    });

    const ranked = groups
      .map((g) => ({ memberId: g.memberId, points: g._sum.delta ?? 0 }))
      .filter((g) => g.points > 0);
    if (ranked.length === 0) {
      return { data: [] };
    }

    const members = await this.prisma.client.gymMember.findMany({
      where: { id: { in: ranked.map((r) => r.memberId) } },
      select: { id: true, user: { select: { name: true, email: true } } },
    });
    const identity = new Map(members.map((m) => [m.id, m.user] as const));

    const data: LoyaltyTopEarnerRow[] = ranked.map((r) => {
      const user = identity.get(r.memberId);
      return {
        memberId: r.memberId,
        name: user?.name ?? user?.email ?? 'Unknown member',
        email: user?.email ?? '',
        points: r.points,
      };
    });
    return { data };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** A member's authoritative balance — `SUM(delta)` over their ledger entries. */
  private async memberBalance(memberId: string): Promise<number> {
    const agg = await this.prisma.client.loyaltyLedgerEntry.aggregate({
      where: { memberId },
      _sum: { delta: true },
    });
    return agg._sum.delta ?? 0;
  }

  /**
   * Resolve a `MEMBER`-role membership in the caller's gym or throw 404. `GymMember`
   * is auto-scoped by the tenant extension, so a cross-tenant id never matches.
   */
  private async requireMember(id: string): Promise<void> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id, role: Role.MEMBER },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }
  }

  private async requireReward(id: string): Promise<RewardRecord> {
    const reward = await this.prisma.client.loyaltyReward.findFirst({
      where: { id },
      select: REWARD_SELECT,
    });
    if (!reward) {
      throw new NotFoundException({
        message: 'Reward not found',
        code: 'LOYALTY_REWARD_NOT_FOUND',
      });
    }
    return reward;
  }

  private toProgramResponse(row: {
    enabled: boolean;
    pointsPerCheckIn: number;
    pointsPerCurrencyUnit: number;
    signupBonus: number;
    updatedAt: Date;
  }): LoyaltyProgramResponse {
    return {
      enabled: row.enabled,
      pointsPerCheckIn: row.pointsPerCheckIn,
      pointsPerCurrencyUnit: row.pointsPerCurrencyUnit,
      signupBonus: row.signupBonus,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toRewardRow(row: RewardRecord): LoyaltyRewardRow {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      pointsCost: row.pointsCost,
      type: row.type,
      active: row.active,
      stock: row.stock,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toLedgerRow(row: LedgerRecord): LoyaltyLedgerEntryRow {
    return {
      id: row.id,
      memberId: row.memberId,
      delta: row.delta,
      reason: row.reason,
      refId: row.refId,
      balanceAfter: row.balanceAfter,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toRedemptionRow(row: RedemptionRecord): RedemptionRow {
    return {
      id: row.id,
      memberId: row.memberId,
      memberName: row.member.user.name ?? row.member.user.email,
      rewardId: row.rewardId,
      rewardName: row.rewardName,
      rewardType: row.rewardType,
      pointsSpent: row.pointsSpent,
      status: row.status,
      redeemedAt: row.redeemedAt.toISOString(),
    };
  }
}

/** `YYYY-MM` bucket key for a date, in the server's local zone. */
function monthKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

/** The human label for a reward type, from the shared catalog. */
function rewardTypeLabel(type: LoyaltyRewardType): string {
  return LOYALTY_REWARD_TYPE_CATALOG.find((meta) => meta.value === type)?.label ?? type;
}
