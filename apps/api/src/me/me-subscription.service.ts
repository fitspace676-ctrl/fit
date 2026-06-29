import { ForbiddenException, Injectable } from '@nestjs/common';
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
      include: { plan: { select: { name: true } } },
    });
    if (!subscription) {
      return { subscription: null, invoices: [] };
    }

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
        frozenUntil: subscription.frozenUntil ? subscription.frozenUntil.toISOString() : null,
        memberSince: member.joinedAt.toISOString(),
      },
      // Recurring-billing payments aren't recorded yet (provider="stub", T8.8), so
      // there is no subscription invoice history to surface — an empty list, not an
      // error. Shop payments live under Orders, not here.
      invoices: [],
    };
  }
}
