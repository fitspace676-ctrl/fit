import { Injectable, Logger } from '@nestjs/common';
import type { LoyaltyReason } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The loyalty program's automatic earn hooks (T12.10).
 *
 * Unlike {@link LoyaltyService} — which runs on the request-scoped, tenant-pinned
 * client — this service runs on the **cross-tenant** {@link PrismaService} and
 * takes `gymId` explicitly on every call. That is deliberate: the earn hooks are
 * dispatched **fire-and-forget** from the check-in, POS, and member-signup flows
 * (see `CheckInService`, `OrdersService`, `MembersService`), so the awarding work
 * may run after the originating request's tenant context has been torn down. By
 * carrying `gymId` in the arguments and scoping every query with it, the hook is
 * safe to run detached and can never touch another gym's ledger.
 *
 * Every method is best-effort and swallows its own errors: a loyalty award must
 * never fail — or even be observable to — the check-in / sale / signup that
 * triggered it. Awards are idempotent per source event (`reason` + `refId`), so a
 * retried dispatch never double-credits.
 */
@Injectable()
export class LoyaltyPointsService {
  private readonly logger = new Logger(LoyaltyPointsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Award the per-check-in points for a recorded arrival, if the program is enabled. */
  async awardForCheckIn(gymId: string, memberId: string, checkInId: string): Promise<void> {
    try {
      const program = await this.loadProgram(gymId);
      if (!program?.enabled || program.pointsPerCheckIn <= 0) {
        return;
      }
      await this.award(gymId, memberId, program.pointsPerCheckIn, 'check_in', checkInId);
    } catch (error) {
      this.warn('check-in', memberId, error);
    }
  }

  /**
   * Award purchase points for a paid order. `totalMinor` is the order total in the
   * currency's MINOR units (cents/tetri); `pointsPerCurrencyUnit` is points per one
   * MAJOR unit, so the award is `floor(totalMinor * pointsPerCurrencyUnit / 100)`.
   */
  async awardForPurchase(
    gymId: string,
    memberId: string,
    orderId: string,
    totalMinor: number,
  ): Promise<void> {
    try {
      const program = await this.loadProgram(gymId);
      if (!program?.enabled || program.pointsPerCurrencyUnit <= 0 || totalMinor <= 0) {
        return;
      }
      const points = Math.floor((totalMinor * program.pointsPerCurrencyUnit) / 100);
      if (points <= 0) {
        return;
      }
      await this.award(gymId, memberId, points, 'purchase', orderId);
    } catch (error) {
      this.warn('purchase', memberId, error);
    }
  }

  /** Award the one-time signup bonus when a member joins, if the program is enabled. */
  async awardSignupBonus(gymId: string, memberId: string): Promise<void> {
    try {
      const program = await this.loadProgram(gymId);
      if (!program?.enabled || program.signupBonus <= 0) {
        return;
      }
      await this.award(gymId, memberId, program.signupBonus, 'signup', null);
    } catch (error) {
      this.warn('signup', memberId, error);
    }
  }

  private loadProgram(gymId: string) {
    return this.prisma.client.loyaltyProgram.findUnique({
      where: { gymId },
      select: {
        enabled: true,
        pointsPerCheckIn: true,
        pointsPerCurrencyUnit: true,
        signupBonus: true,
      },
    });
  }

  /**
   * Append a positive earn entry, computing `balanceAfter` from the member's
   * current `SUM(delta)`. Idempotent per `(gymId, memberId, reason, refId)` — a
   * repeated dispatch for the same source event is a no-op. The signup bonus has
   * no `refId`, so its idempotency key is `(gymId, memberId, reason)` — once ever.
   */
  private async award(
    gymId: string,
    memberId: string,
    delta: number,
    reason: LoyaltyReason,
    refId: string | null,
  ): Promise<void> {
    const duplicate = await this.prisma.client.loyaltyLedgerEntry.findFirst({
      where: { gymId, memberId, reason, refId },
      select: { id: true },
    });
    if (duplicate) {
      return;
    }

    const agg = await this.prisma.client.loyaltyLedgerEntry.aggregate({
      where: { gymId, memberId },
      _sum: { delta: true },
    });
    const balanceAfter = (agg._sum.delta ?? 0) + delta;

    await this.prisma.client.loyaltyLedgerEntry.create({
      data: { gymId, memberId, delta, reason, refId, balanceAfter },
    });
  }

  private warn(hook: string, memberId: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Loyalty ${hook} award failed for member ${memberId}: ${message}`);
  }
}
