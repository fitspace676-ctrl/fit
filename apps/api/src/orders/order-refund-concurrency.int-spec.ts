import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GymMemberStatus, GymStatus, OrderStatus, PaymentStatus, Role } from '@fit/db';
import { OrdersService } from './orders.service';
import { TenantContext, type TenantState } from '../common/tenant/tenant.context';
import { asTenant, disconnect, prisma, resetDb, tenantPrisma } from '../test/integration-db';

/**
 * Refund accounting proven against a real Postgres.
 *
 * A refund advances two records that the rest of the product reads *separately*:
 * `Payment.refundedAmount` (a running total the dashboard sums —
 * `dashboard-sales.service.ts`) and the {@link Refund} rows themselves (which the
 * revenue reports sum instead, deliberately — see `reports.service.ts`). Nothing
 * in the schema ties the two together, so the only thing keeping the gym's two
 * refund figures equal is that every refund advances the column by exactly what
 * it wrote as a row.
 *
 * That is a claim about concurrency, and it cannot be made against a mock: a unit
 * spec calling `refundOrder` twice in sequence sees the second read observe the
 * first write and passes either way. What follows fires simultaneous refunds at
 * one capture, through the real transactions, and asserts the two figures still
 * agree — and that the capture was never refunded past its own total.
 */
const tenant = new TenantContext();
/**
 * A collaborator `refundOrder` is not meant to reach. Any call through it names
 * itself and fails the spec, rather than surfacing as a bare `TypeError` from an
 * `undefined` three frames down — so if the refund path ever grows a dependency,
 * this says which one.
 */
function unreached<T>(name: string): T {
  return new Proxy(
    {},
    {
      get: () => () => {
        throw new Error(`refundOrder reached ${name}, which it is not meant to use`);
      },
    },
  ) as T;
}

const service = new OrdersService(
  unreached('EmailService'),
  tenant,
  { client: tenantPrisma },
  unreached('LoyaltyPointsService'),
  unreached('SubscriptionEnrollmentService'),
  unreached('PromoRedemptionService'),
);

/** The captured total every case refunds against, in minor units. */
const CAPTURED = 10_000;

function owner(gymId: string, userId: string): TenantState {
  return { userId, gymId, role: Role.OWNER, allowCrossTenant: false };
}

describe('Order refunds (integration)', () => {
  let gymId: string;
  let userId: string;
  let orderId: string;
  let paymentId: string;

  beforeEach(async () => {
    await resetDb();
    const gym = await prisma.gym.create({
      data: { name: 'Refund Gym', slug: 'refund-gym', status: GymStatus.ACTIVE },
    });
    gymId = gym.id;

    const user = await prisma.user.create({ data: { email: 'desk@example.com' } });
    userId = user.id;
    await prisma.gymMember.create({
      data: { userId, gymId, role: Role.OWNER, status: GymMemberStatus.ACTIVE },
    });

    const order = await prisma.order.create({
      data: {
        gymId,
        total: CAPTURED,
        currency: 'USD',
        status: OrderStatus.PAID,
        customerName: 'Walk-in',
        customerEmail: 'walkin@example.com',
      },
    });
    orderId = order.id;

    const payment = await prisma.payment.create({
      data: {
        gymId,
        orderId: order.id,
        amount: CAPTURED,
        currency: 'USD',
        status: PaymentStatus.CAPTURED,
      },
    });
    paymentId = payment.id;
  });

  afterAll(disconnect);

  /** Issue one refund as the gym's owner would, without restocking. */
  function refund(amount: number): Promise<{ refundId: string }> {
    return asTenant(owner(gymId, userId), () =>
      service.refundOrder(orderId, { amount, reason: 'concurrent test', restockItems: false }),
    );
  }

  /** The capture and the refund rows written against it, read back raw. */
  async function settled(): Promise<{ refunded: number; rows: number; status: PaymentStatus }> {
    const [payment, sum] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      prisma.refund.aggregate({ where: { paymentId }, _sum: { amount: true } }),
    ]);
    return {
      refunded: payment.refundedAmount,
      rows: sum._sum.amount ?? 0,
      status: payment.status,
    };
  }

  it('advances both figures together for a sequential partial refund', async () => {
    await refund(3_000);
    await refund(2_000);

    const { refunded, rows, status } = await settled();
    expect(refunded).toBe(5_000);
    expect(rows).toBe(5_000);
    expect(status).toBe(PaymentStatus.CAPTURED);
  });

  it('flips the capture and the order to REFUNDED once fully reversed', async () => {
    await refund(CAPTURED);

    const { refunded, status } = await settled();
    expect(refunded).toBe(CAPTURED);
    expect(status).toBe(PaymentStatus.REFUNDED);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.REFUNDED);
  });

  it('refuses a refund beyond the capture’s remaining net', async () => {
    await refund(8_000);
    await expect(refund(3_000)).rejects.toMatchObject({ status: 422 });
  });

  it('keeps the column and the rows equal under concurrent refunds', async () => {
    // Eight simultaneous quarter-refunds against a capture with room for four.
    // Every one of them reads the same starting figure, so a refund that computes
    // its own new total from that read spends headroom another has already taken.
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => refund(CAPTURED / 4)));
    const accepted = results.filter((r) => r.status === 'fulfilled').length;

    const { refunded, rows } = await settled();

    // The invariant the product depends on: the dashboard (which sums the column)
    // and the revenue reports (which sum the rows) must never disagree.
    expect(refunded).toBe(rows);
    // And neither figure may exceed what was actually captured.
    expect(refunded).toBeLessThanOrEqual(CAPTURED);
    expect(rows).toBeLessThanOrEqual(CAPTURED);
    // Exactly the four that fit are admitted; the rest lose the race and are told so.
    expect(accepted).toBe(4);
  });

  it('never over-refunds when concurrent requests each ask for the full amount', async () => {
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => refund(CAPTURED)));
    const accepted = results.filter((r) => r.status === 'fulfilled').length;

    const { refunded, rows, status } = await settled();
    expect(accepted).toBe(1);
    expect(refunded).toBe(CAPTURED);
    expect(rows).toBe(CAPTURED);
    expect(status).toBe(PaymentStatus.REFUNDED);
  });
});
