import {
  InvoiceType,
  LIVE_SUBSCRIPTION_STATUSES,
  MS_PER_DAY,
  Prisma,
  SubscriptionStatus,
  addInterval,
  applyEvent,
  initialBillingPeriod,
  subscriptionInvoiceDescription,
  trialBillingPeriod,
  type SubscriptionInterval,
} from '@fit/db';
import type { InvoiceService, InvoiceTxClient, IssuedInvoice } from '../billing/invoice.service';

/**
 * The two subscription writes that more than one path performs, as plain
 * transaction-callable functions so every path runs the same code:
 *
 * - {@link startSubscription} — enrol a member on a plan. Called by the stub
 *   enrolment (`SubscriptionEnrollmentService`, tenant-scoped transaction) and by
 *   the Flitt capture of a `subscription_start` order (`OnlinePaymentsService`,
 *   unscoped transaction) — so a paid-online subscription is created exactly as a
 *   stub-paid one is, only later.
 * - {@link applyRenewal} — persist one successfully paid period. Called by the
 *   renewal job after a gateway charge succeeds and by the Flitt capture of a
 *   `subscription_renewal` order (the member paid the period by hand).
 *
 * Plain functions rather than a service so `PaymentsModule` (a leaf module) can
 * call them without importing `SubscriptionsModule`.
 */

/**
 * The provider key of a subscription the member pays by hand, each period, on the
 * gym's own Flitt hosted checkout. No card is stored and nothing is charged
 * automatically: the renewal job treats such a subscription's period end as an
 * unpaid charge (PAST_DUE → grace → expiry) without calling any gateway.
 */
export const MANUAL_PAY_PROVIDER = 'flitt';

/**
 * How close to its period end a manually paid subscription may pay for the next
 * period (`POST /me/subscription/pay`). A PAST_DUE subscription may always pay.
 */
export const SUBSCRIPTION_PAY_WINDOW_DAYS = 7;

/**
 * How many days before its period end a manually paid subscription's member is
 * reminded to pay ("your membership ends on <date> — pay to continue").
 */
export const MANUAL_RENEWAL_REMINDER_DAYS = 3;

/** Statuses a manually paid subscription can pay its next period from. */
const PAYABLE_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

/** Thrown by {@link startSubscription} when the member already holds a live subscription. */
export class AlreadySubscribedError extends Error {
  constructor() {
    super('The member already holds a live subscription');
    this.name = 'AlreadySubscribedError';
  }
}

/**
 * The slice of a transaction client {@link startSubscription} needs — structural so
 * both the tenant-scoped enrolment transaction and the unscoped capture
 * transaction satisfy it (the {@link InvoiceTxClient} pattern).
 */
export interface SubscriptionStartClient extends InvoiceTxClient {
  subscription: {
    findFirst(args: {
      where: { gymId: string; memberId: string; status: { in: SubscriptionStatus[] } };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: Prisma.SubscriptionUncheckedCreateInput;
      select: { id: true };
    }): Promise<{ id: string }>;
  };
}

export interface StartSubscriptionInput {
  gymId: string;
  memberId: string;
  /** The plan enrolled on; `null` when it was deleted between payment and capture. */
  planId: string | null;
  planName: string | null;
  /** Snapshotted terms: the price per period in MINOR units, currency and cadence. */
  priceAmount: number;
  currency: string;
  interval: SubscriptionInterval;
  /** How many `interval`s one period lasts; `1` when absent. */
  intervalCount?: number;
  /** A plan sold once: the subscription ends with its period instead of renewing. */
  oneTime?: boolean;
  /** `> 0` starts a free TRIAL (no invoice); `0` starts a paid ACTIVE period. */
  trialDays: number;
  /** `Subscription.provider` — `stub` (instant path) or {@link MANUAL_PAY_PROVIDER}. */
  provider: string;
  /** The paid order the first-period invoice belongs to (Flitt path), else none. */
  orderId?: string | null;
  /** The period start — enrolment time, or the moment the payment was confirmed. */
  now: Date;
}

/**
 * Create a member's subscription inside the caller's transaction: the single live
 * slot is checked (and backstopped by the partial unique index — a racing insert's
 * `P2002` is mapped to the same {@link AlreadySubscribedError}), the first period
 * (or the trial) is computed from `now`, the plan's terms are snapshotted, and a
 * paid start mints the numbered first-period invoice in the same transaction.
 * The caller announces the invoice (`InvoiceService.announcePaid`) after commit.
 */
export async function startSubscription(
  tx: SubscriptionStartClient,
  invoices: Pick<InvoiceService, 'issue'>,
  input: StartSubscriptionInput,
): Promise<{ subscriptionId: string; invoice: IssuedInvoice | null }> {
  const existingLive = await tx.subscription.findFirst({
    where: {
      gymId: input.gymId,
      memberId: input.memberId,
      status: { in: [...LIVE_SUBSCRIPTION_STATUSES] },
    },
    select: { id: true },
  });
  if (existingLive) throw new AlreadySubscribedError();

  const isTrial = input.trialDays > 0;
  const { currentPeriodStart, currentPeriodEnd } = isTrial
    ? trialBillingPeriod(input.now, input.trialDays)
    : initialBillingPeriod(input.now, input.interval, input.intervalCount ?? 1);

  let subscriptionId: string;
  try {
    const created = await tx.subscription.create({
      data: {
        gymId: input.gymId,
        planId: input.planId,
        memberId: input.memberId,
        status: isTrial ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE,
        priceAmount: input.priceAmount,
        currency: input.currency,
        interval: input.interval,
        intervalCount: input.intervalCount ?? 1,
        cancelAtPeriodEnd: input.oneTime ?? false,
        currentPeriodStart,
        currentPeriodEnd,
        provider: input.provider,
      },
      select: { id: true },
    });
    subscriptionId = created.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AlreadySubscribedError();
    }
    throw error;
  }

  // A trial charges nothing yet (the renewal job — or the member's manual payment —
  // raises the first invoice when it converts), so none is minted for it.
  const invoice = isTrial
    ? null
    : await invoices.issue(tx, {
        gymId: input.gymId,
        memberId: input.memberId,
        subscriptionId,
        orderId: input.orderId ?? null,
        amount: input.priceAmount,
        currency: input.currency,
        type: InvoiceType.MEMBERSHIP,
        description: subscriptionInvoiceDescription(
          input.planName,
          input.interval,
          'enrolment',
          input.intervalCount ?? 1,
        ),
        issuedAt: currentPeriodStart,
      });

  return { subscriptionId, invoice };
}

/** The slice of a transaction client {@link applyRenewal} needs. */
export interface RenewalClient extends InvoiceTxClient {
  subscription: {
    updateMany(args: {
      where: { id: string; currentPeriodEnd: Date; status: SubscriptionStatus };
      data: Prisma.SubscriptionUpdateManyMutationInput;
    }): Promise<{ count: number }>;
  };
}

/** The observed subscription a renewal applies to; `(currentPeriodEnd, status)` is the guard. */
export interface RenewableSubscription {
  id: string;
  gymId: string;
  memberId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  priceAmount: number;
  currency: string;
  interval: SubscriptionInterval;
  intervalCount?: number;
  planName: string | null;
}

/**
 * Persist one successfully paid period, inside the caller's transaction: `RENEW`
 * the status (`PAST_DUE`/`TRIAL` → `ACTIVE`, or the `ACTIVE` self-loop), roll the
 * period forward contiguously, reset the per-period freeze allowance, clear the
 * dunning ladder, stamp the provider that settled it, and mint the renewal
 * invoice. The update is conditional on the OBSERVED `(currentPeriodEnd, status)`,
 * so a period is advanced at most once however many runners (the job, a replica,
 * two paid orders for the same period) try: the loser matches nothing and gets
 * `null` — no advance, no invoice.
 */
export async function applyRenewal(
  tx: RenewalClient,
  invoices: Pick<InvoiceService, 'issue'>,
  input: {
    sub: RenewableSubscription;
    nextPeriodStart: Date;
    nextPeriodEnd: Date;
    provider: string;
    /** Overwrites `Subscription.providerRef` only when defined (the stub returns none). */
    providerRef?: string | null;
    /** The paid order this period belongs to (manual payment), else none. */
    orderId?: string | null;
  },
): Promise<IssuedInvoice | null> {
  const { sub } = input;
  const data: Prisma.SubscriptionUpdateManyMutationInput = {
    status: applyEvent(sub.status, 'RENEW'),
    currentPeriodStart: input.nextPeriodStart,
    currentPeriodEnd: input.nextPeriodEnd,
    freezeDaysUsed: 0,
    paymentRetries: 0,
    provider: input.provider,
  };
  if (input.providerRef !== undefined) data.providerRef = input.providerRef;

  const { count } = await tx.subscription.updateMany({
    where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd, status: sub.status },
    data,
  });
  if (count === 0) return null;

  return invoices.issue(tx, {
    gymId: sub.gymId,
    memberId: sub.memberId,
    subscriptionId: sub.id,
    orderId: input.orderId ?? null,
    amount: sub.priceAmount,
    currency: sub.currency,
    type: InvoiceType.MEMBERSHIP,
    description: subscriptionInvoiceDescription(
      sub.planName,
      sub.interval,
      'renewal',
      sub.intervalCount ?? 1,
    ),
    issuedAt: input.nextPeriodStart,
  });
}

/** The period a manual payment opened against `periodEnd` buys (contiguous, as in the job). */
export function nextManualPeriod(
  periodEnd: Date,
  interval: SubscriptionInterval,
  intervalCount = 1,
): { nextPeriodStart: Date; nextPeriodEnd: Date } {
  return {
    nextPeriodStart: periodEnd,
    nextPeriodEnd: addInterval(periodEnd, interval, intervalCount),
  };
}

/**
 * Whether a subscription can pay its next period by hand right now:
 *
 * - `due` — a {@link MANUAL_PAY_PROVIDER} subscription in TRIAL/ACTIVE/PAST_DUE,
 *   not cancelling at period end, whose period ends within
 *   {@link SUBSCRIPTION_PAY_WINDOW_DAYS} (or has ended), or that is PAST_DUE.
 * - `not_due` — payable, but the period end is further away than the window.
 * - `not_payable` — not paid by hand (another provider), frozen, cancelling or over.
 */
export function manualPaymentWindow(
  sub: {
    provider: string;
    status: SubscriptionStatus;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date;
  },
  now: Date,
): 'due' | 'not_due' | 'not_payable' {
  if (sub.provider !== MANUAL_PAY_PROVIDER) return 'not_payable';
  if (!PAYABLE_STATUSES.includes(sub.status)) return 'not_payable';
  if (sub.cancelAtPeriodEnd) return 'not_payable';
  if (sub.status === SubscriptionStatus.PAST_DUE) return 'due';
  const opensAt = sub.currentPeriodEnd.getTime() - SUBSCRIPTION_PAY_WINDOW_DAYS * MS_PER_DAY;
  return now.getTime() >= opensAt ? 'due' : 'not_due';
}
