import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  DEFAULT_FREEZE_DAYS_PER_PERIOD,
  LIVE_SUBSCRIPTION_STATUSES,
  MS_PER_DAY,
  Prisma,
  isLiveStatus,
  subscriptionInvoiceDescription,
  type SubscriptionStatus,
} from '@fit/db';
import {
  ONLINE_PAYMENTS_UNAVAILABLE_CODE,
  SUBSCRIPTION_NOT_DUE_CODE,
  SUBSCRIPTION_NOT_PAYABLE_CODE,
  type GetMeSubscriptionResponse,
  type MeInvoice,
  type MeSubscriptionPayment,
  type PaySubscriptionResponse,
  type PaymentReturnTarget,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import {
  FulfilmentConflictError,
  OnlinePaymentsService,
} from '../payments/online-payments.service';
import type { OrderFulfilment } from '../payments/order-fulfilment';
import {
  MANUAL_PAY_PROVIDER,
  SUBSCRIPTION_PAY_WINDOW_DAYS,
  manualPaymentWindow,
} from '../subscriptions/subscription-periods';

/** How many of the member's most recent invoices the billing-history read returns. */
const INVOICE_HISTORY_LIMIT = 50;

/** The columns projected off an {@link Invoice} for the member's billing-history row. */
const ME_INVOICE_SELECT = {
  id: true,
  number: true,
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
    // Optional so the specs that build this by hand need not pass it; provided by
    // `PaymentsModule` in the running app. Without it nothing is payable online.
    @Optional() private readonly payments?: OnlinePaymentsService,
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
    const memberId = member.id;

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
        payment: await this.paymentState(memberId, subscription),
      },
      invoices,
    };
  }

  /**
   * `POST /me/subscription/pay` — open (or hand back) a hosted checkout for the
   * caller's NEXT period of a manually paid subscription. The amount is the
   * subscription's own snapshotted price; the grant (advancing the period) happens
   * only when the payment is captured, through the shared renewal write, guarded
   * on the period end this order is opened for.
   *
   * Failure modes: `403` no member session / not a member; `404
   * SUBSCRIPTION_NOT_FOUND` no live subscription; `409 SUBSCRIPTION_NOT_PAYABLE`
   * not paid by hand, frozen or cancelling; `409 SUBSCRIPTION_NOT_DUE` the window
   * ({@link SUBSCRIPTION_PAY_WINDOW_DAYS} days before period end) is not open yet
   * and it is not past due; `409 ONLINE_PAYMENTS_UNAVAILABLE` the gym's Flitt is
   * off; `503 PAYMENT_PROVIDER_UNAVAILABLE` Flitt could not open the checkout.
   */
  async payNextPeriod(returnTo: PaymentReturnTarget): Promise<PaySubscriptionResponse> {
    const memberId = await this.requireCallerMembership();
    const gymId = this.tenant.gymId;

    const sub = await this.prisma.client.subscription.findFirst({
      where: { memberId, status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        provider: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
        priceAmount: true,
        currency: true,
        interval: true,
        plan: { select: { name: true } },
      },
    });
    if (!sub) {
      throw new NotFoundException({
        message: 'You have no membership to pay for',
        code: 'SUBSCRIPTION_NOT_FOUND',
      });
    }

    const window = manualPaymentWindow(sub, new Date());
    if (window === 'not_payable') {
      throw new ConflictException({
        message: 'This membership cannot be paid online right now',
        code: SUBSCRIPTION_NOT_PAYABLE_CODE,
      });
    }
    if (window === 'not_due') {
      const opensAt = new Date(
        sub.currentPeriodEnd.getTime() - SUBSCRIPTION_PAY_WINDOW_DAYS * MS_PER_DAY,
      );
      throw new ConflictException({
        message: 'The next period cannot be paid yet',
        code: SUBSCRIPTION_NOT_DUE_CODE,
        details: [`opensAt=${opensAt.toISOString()}`],
      });
    }

    const payments = this.payments;
    const mode = payments ? await payments.purchaseMode(gymId) : null;
    if (!payments || mode?.mode !== 'flitt') {
      throw new ConflictException({
        message: 'This gym does not accept online payments right now',
        code: ONLINE_PAYMENTS_UNAVAILABLE_CODE,
      });
    }

    // One unpaid order per period: an open one is resumed (a live checkout handed
    // back, or a fresh attempt on the same order) — exactly the retry behaviour.
    const open = await payments.findOpenOrder(gymId, memberId, (fulfilment) =>
      isRenewalOf(fulfilment, sub.id, sub.currentPeriodEnd),
    );
    if (open) {
      return { payment: await payments.retry({ gymId, orderId: open, memberId, returnTo }) };
    }

    const member = await this.prisma.client.gymMember.findFirst({
      where: { id: memberId },
      select: { locationId: true },
    });
    const locationId = member?.locationId ?? null;
    const label = subscriptionInvoiceDescription(sub.plan?.name ?? null, sub.interval, 'renewal');
    try {
      const { payment } = await payments.begin(
        {
          gymId,
          memberId,
          purpose: 'subscription_renewal',
          fulfilment: {
            kind: 'subscription_renewal',
            subscriptionId: sub.id,
            periodEnd: sub.currentPeriodEnd.toISOString(),
          },
          description: label,
          returnTo,
          order: {
            locationId,
            total: sub.priceAmount,
            currency: sub.currency,
            items: [{ label, amount: sub.priceAmount }],
          },
          paymentLocationId: locationId,
          promo: null,
        },
        mode.credentials,
      );
      return { payment };
    } catch (error) {
      // Only reachable for a 0-priced period, fulfilled inside `begin`.
      if (error instanceof FulfilmentConflictError) {
        throw new ConflictException({
          message: 'This membership cannot be paid online right now',
          code: SUBSCRIPTION_NOT_PAYABLE_CODE,
        });
      }
      throw error;
    }
  }

  /** The `payment` block of `GET /me/subscription` — see `MeSubscriptionPayment`. */
  private async paymentState(
    memberId: string,
    sub: {
      id: string;
      status: SubscriptionStatus;
      provider: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: Date;
      priceAmount: number;
      currency: string;
    },
  ): Promise<MeSubscriptionPayment> {
    const live = isLiveStatus(sub.status);
    const manual = live && sub.provider === MANUAL_PAY_PROVIDER;
    const base = {
      amount: sub.priceAmount,
      currency: sub.currency,
      dueAt: live ? sub.currentPeriodEnd.toISOString() : null,
    };
    if (!manual || !this.payments) {
      return {
        ...base,
        mode: manual ? 'manual' : live ? 'auto' : 'none',
        canPayNow: false,
        pendingOrderId: null,
      };
    }
    const gymId = this.tenant.gymId;
    const [credentials, pendingOrderId] = await Promise.all([
      this.payments.shopCredentials(gymId),
      this.payments.findOpenOrder(gymId, memberId, (fulfilment) =>
        isRenewalOf(fulfilment, sub.id, sub.currentPeriodEnd),
      ),
    ]);
    return {
      ...base,
      mode: 'manual',
      canPayNow: credentials !== null && manualPaymentWindow(sub, new Date()) === 'due',
      pendingOrderId,
    };
  }

  /** The caller's own `GymMember` id: `403` without a member session / membership here. */
  private async requireCallerMembership(): Promise<string> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required',
        code: 'MEMBER_SESSION_REQUIRED',
      });
    }
    const member = await this.prisma.client.gymMember.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException({
        message: 'You are not a member of this gym',
        code: 'NOT_A_MEMBER',
      });
    }
    return member.id;
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

/** Whether `fulfilment` pays the period of `subscriptionId` that ends at `periodEnd`. */
function isRenewalOf(
  fulfilment: OrderFulfilment,
  subscriptionId: string,
  periodEnd: Date,
): boolean {
  return (
    fulfilment.kind === 'subscription_renewal' &&
    fulfilment.subscriptionId === subscriptionId &&
    new Date(fulfilment.periodEnd).getTime() === periodEnd.getTime()
  );
}

/** Project an {@link Invoice} row to the member-facing {@link MeInvoice} wire shape. */
function toMeInvoice(row: MeInvoiceRecord): MeInvoice {
  return {
    id: row.id,
    number: row.number,
    date: row.issuedAt.toISOString(),
    amount: row.amount,
    currency: row.currency,
    // The Prisma `InvoiceStatus` enum shares its member-relevant values with the wire
    // schema, so the settlement state passes straight through.
    status: row.status,
  };
}
