import { Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@fit/db';
import {
  SALES_GRANULARITY_RANGE,
  SALES_TOP_SELLERS_LIMIT,
  type DashboardSalesQuery,
  type DashboardSalesResponse,
  type SalesChannel,
  type SalesMethodSlice,
  type SalesPaymentMethod,
  type SalesProductType,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { GymLocaleService } from '../gyms/gym-locale.service';
import { bucketKey, emptyBuckets, resolveWindow } from '../reports/report-window.util';

/** `Payment.provider` for a till sale; anything else settled through a gateway. */
const POS_PROVIDER = 'pos';

/** The wire form of each settlement method. */
const METHOD_KEYS: Record<PaymentMethod, SalesPaymentMethod> = {
  [PaymentMethod.CASH]: 'cash',
  [PaymentMethod.CARD]: 'card',
  [PaymentMethod.BANK_TRANSFER]: 'bank-transfer',
  [PaymentMethod.MEMBER_ACCOUNT]: 'member-account',
};

/** The order fields both reads select, and the only ones classification needs. */
interface ClassifiableOrder {
  packageId: string | null;
  creditPack: { id: string } | null;
}

/** A running per-label tally for the ranked top-sellers list. */
interface SellerTally {
  orders: number;
  value: number;
}

/**
 * Read side of the hand-built Sales dashboard tab.
 *
 * Produces the whole tab in one round trip — four KPIs, two trends, a payment
 * breakdown and a ranked top-sellers list — so its two controls (granularity and
 * product type) can never leave one card showing a different window from its
 * neighbour. Everything is a REAL aggregation over captured {@link Payment} and
 * {@link Refund} rows (same honesty contract as {@link ReportDrilldownService});
 * only the time series are densely zero-filled, because a bucket with no sales is
 * a real zero and omitting it would misdraw the trend.
 *
 * Scoped by {@link TenantPrismaService}'s extension, so no query passes or trusts
 * a `gymId`. Window and bucket math is delegated entirely to
 * `report-window.util.ts` via {@link SALES_GRANULARITY_RANGE} — this service
 * contains no date arithmetic of its own.
 *
 * **Why two reads.** `Payment.refundedAmount` is a running total mutated in place
 * with no timestamp, so bucketing a refund by it would file the refund in the
 * SALE's bucket. The refunds series therefore reads {@link Refund} rows, which
 * carry their own `createdAt`. The `refunded` KPI still sums `refundedAmount`
 * over the window's payments, matching the existing drill-downs — so the two can
 * legitimately differ (a sale refunded after the window counts in the KPI but not
 * the trend, and vice versa). They answer different questions and the UI captions
 * each accordingly; collapsing them to one number would mean either wrong buckets
 * or a moving historical figure.
 */
@Injectable()
export class DashboardSalesService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly locales: GymLocaleService,
  ) {}

  /** Build the whole Sales tab for one granularity + product-type combination. */
  async get(query: DashboardSalesQuery): Promise<DashboardSalesResponse> {
    // The gym's own calendar. Fetched BEFORE the aggregates because the window
    // itself is a calendar question: `resolveWindow` has to know where midnight
    // is before it can say which days the chart covers.
    const locale = await this.locales.get();
    const zone = locale.timezone;
    const win = resolveWindow(SALES_GRANULARITY_RANGE[query.granularity], zone);

    const [payments, refunds] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
        select: {
          amount: true,
          refundedAmount: true,
          currency: true,
          method: true,
          provider: true,
          createdAt: true,
          order: {
            select: {
              packageId: true,
              creditPack: { select: { id: true } },
              items: { select: { label: true, amount: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.refund.findMany({
        where: { createdAt: { gte: win.start, lt: win.end } },
        select: {
          amount: true,
          createdAt: true,
          order: { select: { packageId: true, creditPack: { select: { id: true } } } },
        },
      }),
    ]);

    const kept = payments.filter((payment) => matches(payment.order, query.productType));

    const netByBucket = emptyBuckets(win, zone);
    const salesByBucket = emptyBuckets(win, zone);
    const refundsByBucket = emptyBuckets(win, zone);
    const byMethod = new Map<string, number>();
    const bySeller = new Map<string, SellerTally>();
    let gross = 0;
    let refunded = 0;

    for (const payment of kept) {
      const net = payment.amount - payment.refundedAmount;
      gross += payment.amount;
      refunded += payment.refundedAmount;

      const key = bucketKey(payment.createdAt, win.bucket, zone);
      if (netByBucket.has(key)) {
        netByBucket.set(key, (netByBucket.get(key) ?? 0) + net);
        salesByBucket.set(key, (salesByBucket.get(key) ?? 0) + payment.amount);
      }

      const methodKey = `${channelOf(payment.provider)}|${METHOD_KEYS[payment.method]}`;
      byMethod.set(methodKey, (byMethod.get(methodKey) ?? 0) + net);

      // One order counts ONCE per label even if it carries two lines with the
      // same label, so `orders` stays a distinct-order count.
      const counted = new Set<string>();
      for (const item of payment.order.items) {
        // Negative lines are promo / discount adjustments — never a "top seller".
        if (item.amount <= 0) continue;
        const tally = bySeller.get(item.label) ?? { orders: 0, value: 0 };
        if (!counted.has(item.label)) {
          tally.orders += 1;
          counted.add(item.label);
        }
        tally.value += item.amount;
        bySeller.set(item.label, tally);
      }
    }

    for (const refund of refunds) {
      if (!matches(refund.order, query.productType)) continue;
      const key = bucketKey(refund.createdAt, win.bucket, zone);
      if (refundsByBucket.has(key)) {
        refundsByBucket.set(key, (refundsByBucket.get(key) ?? 0) + refund.amount);
      }
    }

    const transactions = kept.length;
    const net = gross - refunded;

    return {
      granularity: query.granularity,
      productType: query.productType,
      currency: locale.currency,
      kpis: {
        netSales: net,
        refunded,
        avgSale: transactions === 0 ? 0 : Math.round(net / transactions),
      },
      revenueOverTime: [...netByBucket.entries()].map(([label, value]) => ({ label, value })),
      salesVsRefunds: [...salesByBucket.entries()].map(([label, sales]) => ({
        label,
        sales,
        refunds: refundsByBucket.get(label) ?? 0,
      })),
      byPaymentMethod: [...byMethod.entries()]
        .map(([key, value]): SalesMethodSlice => {
          const [channel, method] = key.split('|') as [SalesChannel, SalesPaymentMethod];
          return { channel, method, value };
        })
        .sort((a, b) => b.value - a.value),
      topSellers: [...bySeller.entries()]
        .map(([label, tally]) => ({ label, orders: tally.orders, value: tally.value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, SALES_TOP_SELLERS_LIMIT),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What kind of sale an order is, from its shape alone. A credit pack is checked
 * FIRST because a session-pass order also names a `PackagePlan` — testing
 * `packageId` first would classify every pass as a membership.
 */
function classify(order: ClassifiableOrder): Exclude<SalesProductType, 'all'> {
  if (order.creditPack !== null) return 'session-packs';
  if (order.packageId !== null) return 'memberships';
  return 'retail';
}

/** Whether an order survives the tab's product-type filter. */
function matches(order: ClassifiableOrder, filter: SalesProductType): boolean {
  return filter === 'all' || classify(order) === filter;
}

/** The sales channel a payment settled through — the admin order roster's rule. */
function channelOf(provider: string): SalesChannel {
  return provider === POS_PROVIDER ? 'pos' : 'online';
}
