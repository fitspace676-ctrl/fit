import { ForbiddenException, Injectable } from '@nestjs/common';
import { DEFAULT_FREEZE_DAYS_PER_PERIOD } from '@fit/db';
import type { GetMeSubscriptionResponse } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/**
 * Member-facing read of the caller's own membership (`GET /me/subscription`).
 *
 * Runs on the tenant-scoped Prisma client, so the `gymMember` / `subscription`
 * lookups are auto-constrained to the caller's gym; the subscription is pinned to
 * the caller's resolved membership, never an id off the wire (mirroring
 * {@link SubscriptionFreezeService}). A member with no subscription is a normal
 * `200 { subscription: null, invoices: [] }`.
 */
@Injectable()
export class MeSubscriptionService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** The caller's current membership + billing history (most recent first). */
  async getMySubscription(): Promise<GetMeSubscriptionResponse> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required',
        code: 'MEMBER_SESSION_REQUIRED',
      });
    }

    const member = await this.prisma.client.gymMember.findFirst({
      where: { userId },
      select: { id: true, joinedAt: true },
    });
    if (!member) {
      return { subscription: null, invoices: [] };
    }

    const subscription = await this.prisma.client.subscription.findFirst({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true, freezeDaysPerPeriod: true } } },
    });
    if (!subscription) {
      return { subscription: null, invoices: [] };
    }

    // The plan's freeze allowance and this period's committed usage, so the
    // Membership screen can show "N days remaining" and pre-empt the server's
    // 422 EXCEEDS_FREEZE_ALLOWANCE. A plan-less subscription falls back to the
    // schema default the freeze service also assumes.
    const freezeDaysPerPeriod =
      subscription.plan?.freezeDaysPerPeriod ?? DEFAULT_FREEZE_DAYS_PER_PERIOD;
    const freezeDaysUsed = subscription.freezeDaysUsed;
    const freezeDaysRemaining = Math.max(0, freezeDaysPerPeriod - freezeDaysUsed);

    return {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        planName: subscription.plan?.name ?? null,
        priceAmount: subscription.priceAmount,
        currency: subscription.currency,
        interval: subscription.interval,
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        frozenAt: subscription.frozenAt ? subscription.frozenAt.toISOString() : null,
        frozenUntil: subscription.frozenUntil ? subscription.frozenUntil.toISOString() : null,
        freezeDaysPerPeriod,
        freezeDaysUsed,
        freezeDaysRemaining,
        memberSince: member.joinedAt.toISOString(),
      },
      // Recurring-billing payments aren't recorded yet (provider="stub", T8.8), so
      // there is no subscription invoice history to surface — an empty list, not an
      // error. Shop payments live under Orders, not here.
      invoices: [],
    };
  }
}
