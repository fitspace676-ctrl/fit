import { ForbiddenException, Injectable } from '@nestjs/common';
import { DEFAULT_FREEZE_DAYS_PER_PERIOD, Prisma } from '@fit/db';
import type { GetMeSubscriptionResponse, MeInvoice } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** How many of the member's most recent invoices the billing-history read returns. */
const INVOICE_HISTORY_LIMIT = 50;

/** The columns projected off an {@link Invoice} for the member's billing-history row. */
const ME_INVOICE_SELECT = {
  id: true,
  issuedAt: true,
  amount: true,
  currency: true,
  status: true,
} satisfies Prisma.InvoiceSelect;

type MeInvoiceRecord = Prisma.InvoiceGetPayload<{ select: typeof ME_INVOICE_SELECT }>;

/**
 * Member-facing read of the caller's own membership (`GET /me/subscription`).
 *
 * Runs on the tenant-scoped Prisma client, so the `gymMember` / `subscription` /
 * `invoice` lookups are auto-constrained to the caller's gym; the subscription is
 * pinned to the caller's resolved membership, never an id off the wire (mirroring
 * {@link SubscriptionFreezeService}). The response pairs the current membership (or
 * `null`) with the caller's billing history (their {@link Invoice}s, newest first, T5.9)
 * — so a member with no live subscription still sees what they were charged, and one
 * who never subscribed is the empty `{ subscription: null, invoices: [] }`.
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

    // The member's billing history (T5.9) — every invoice raised for them, newest
    // first — surfaced whether or not they currently hold a live subscription, so a
    // lapsed/cancelled member still sees what they were charged.
    const invoices = await this.listInvoices(member.id);

    const subscription = await this.prisma.client.subscription.findFirst({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true, freezeDaysPerPeriod: true } } },
    });
    if (!subscription) {
      return { subscription: null, invoices };
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
      invoices,
    };
  }

  /**
   * The caller's subscription invoices (T5.9), most recent first, capped at
   * {@link INVOICE_HISTORY_LIMIT}. Scoped to the member (and, by the tenant client, to
   * their gym); shop payments live under Orders, not here.
   */
  private async listInvoices(memberId: string): Promise<MeInvoice[]> {
    const rows = await this.prisma.client.invoice.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      take: INVOICE_HISTORY_LIMIT,
      select: ME_INVOICE_SELECT,
    });
    return rows.map(toMeInvoice);
  }
}

/** Project an {@link Invoice} row to the member-facing {@link MeInvoice} wire shape. */
function toMeInvoice(row: MeInvoiceRecord): MeInvoice {
  return {
    id: row.id,
    date: row.issuedAt.toISOString(),
    amount: row.amount,
    currency: row.currency,
    // The Prisma `InvoiceStatus` enum shares its member-relevant values with the wire
    // schema, so the settlement state passes straight through.
    status: row.status,
  };
}
