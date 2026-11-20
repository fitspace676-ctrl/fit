import { CreditPackStatus, MS_PER_DAY, SubscriptionInterval } from '@fit/db';

/**
 * What paying for an order grants, shared by the instant stub purchase and the
 * provider-settled one so both grant exactly the same thing.
 *
 * - `package` — a plain plan: the PAID order (+ captured payment) IS the grant.
 * - `credit_pack` — a {@link CreditPack} of `credits` is minted against the order.
 * - `shop` — the stock was already drawn down when the order was placed; paying
 *   only flips the order.
 * - `subscription_start` — the first paid period of a plan: paying enrols the
 *   member (subscription ACTIVE, provider `flitt`, first-period invoice tied to
 *   the order) on the snapshotted terms. See `subscriptions/subscription-periods.ts`.
 * - `subscription_renewal` — one manually paid period of an existing
 *   subscription: paying advances it from `periodEnd` exactly as a successful
 *   renewal charge does. `periodEnd` is the period end the order was opened
 *   against (ISO) — the guard that makes a second paid order for the same period
 *   advance nothing.
 *
 * Stored as a JSON snapshot on each `PaymentAttempt` so a later catalogue edit
 * (a pack's credit count, its validity) cannot change what was bought.
 */
export type OrderFulfilment =
  | { kind: 'package'; planId: string }
  | {
      kind: 'credit_pack';
      planId: string;
      name: string;
      credits: number;
      validityDays: number | null;
    }
  | { kind: 'shop' }
  | {
      kind: 'subscription_start';
      planId: string;
      planName: string;
      /** The plan's price per period (MINOR units) — snapshotted onto the subscription. */
      priceAmount: number;
      currency: string;
      interval: SubscriptionInterval;
    }
  | { kind: 'subscription_renewal'; subscriptionId: string; periodEnd: string };

/** The slice of a transaction client {@link mintCreditPack} needs (tenant-scoped or base). */
export interface CreditPackMintClient {
  creditPack: {
    create(args: {
      data: {
        gymId: string;
        memberId: string;
        planId: string;
        orderId: string;
        name: string;
        totalCredits: number;
        remainingCredits: number;
        expiresAt: Date | null;
        status: typeof CreditPackStatus.ACTIVE;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
}

/**
 * Mint the credit pack an order bought, inside the caller's transaction. The
 * expiry runs from `now` — the moment of purchase on the stub path, the moment
 * the payment was confirmed on the provider path (a buyer does not lose validity
 * days to a slow bank).
 */
export async function mintCreditPack(
  tx: CreditPackMintClient,
  input: {
    gymId: string;
    memberId: string;
    orderId: string;
    planId: string;
    name: string;
    credits: number;
    validityDays: number | null;
    now?: Date;
  },
): Promise<string> {
  const now = input.now ?? new Date();
  const expiresAt =
    input.validityDays !== null ? new Date(now.getTime() + input.validityDays * MS_PER_DAY) : null;
  const pack = await tx.creditPack.create({
    data: {
      gymId: input.gymId,
      memberId: input.memberId,
      planId: input.planId,
      orderId: input.orderId,
      name: input.name,
      totalCredits: input.credits,
      remainingCredits: input.credits,
      expiresAt,
      status: CreditPackStatus.ACTIVE,
    },
    select: { id: true },
  });
  return pack.id;
}

/** Parse a stored snapshot defensively — an unknown shape grants nothing extra. */
export function parseFulfilment(value: unknown): OrderFulfilment | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  switch (record.kind) {
    case 'package':
      return typeof record.planId === 'string' ? { kind: 'package', planId: record.planId } : null;
    case 'shop':
      return { kind: 'shop' };
    case 'credit_pack':
      if (
        typeof record.planId === 'string' &&
        typeof record.name === 'string' &&
        typeof record.credits === 'number' &&
        Number.isInteger(record.credits) &&
        record.credits > 0 &&
        (record.validityDays === null || typeof record.validityDays === 'number')
      ) {
        return {
          kind: 'credit_pack',
          planId: record.planId,
          name: record.name,
          credits: record.credits,
          validityDays: record.validityDays,
        };
      }
      return null;
    case 'subscription_start':
      if (
        typeof record.planId === 'string' &&
        typeof record.planName === 'string' &&
        typeof record.priceAmount === 'number' &&
        Number.isInteger(record.priceAmount) &&
        record.priceAmount >= 0 &&
        typeof record.currency === 'string' &&
        (record.interval === SubscriptionInterval.MONTH ||
          record.interval === SubscriptionInterval.YEAR)
      ) {
        return {
          kind: 'subscription_start',
          planId: record.planId,
          planName: record.planName,
          priceAmount: record.priceAmount,
          currency: record.currency,
          interval: record.interval,
        };
      }
      return null;
    case 'subscription_renewal':
      if (
        typeof record.subscriptionId === 'string' &&
        typeof record.periodEnd === 'string' &&
        !Number.isNaN(Date.parse(record.periodEnd))
      ) {
        return {
          kind: 'subscription_renewal',
          subscriptionId: record.subscriptionId,
          periodEnd: record.periodEnd,
        };
      }
      return null;
    default:
      return null;
  }
}
