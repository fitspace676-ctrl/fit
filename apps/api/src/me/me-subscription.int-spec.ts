import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GymStatus, InvoiceStatus, Role, SubscriptionStatus } from '@fit/db';
import { MeSubscriptionService } from './me-subscription.service';
import { TenantContext, type TenantState } from '../common/tenant/tenant.context';
import { asTenant, disconnect, prisma, resetDb, tenantPrisma } from '../test/integration-db';

/**
 * The member billing-history read proven against a real Postgres (T5.9): `GET
 * /me/subscription` used to hardcode `invoices: []`; it now returns the caller's own
 * invoices, newest first, mapped to the wire shape — and, via the tenant-scoped client,
 * never another member's or gym's rows.
 */
const service = new MeSubscriptionService({ client: tenantPrisma }, new TenantContext());

function member(gymId: string, userId: string): TenantState {
  return { userId, gymId, role: Role.MEMBER, allowCrossTenant: false };
}

describe('MeSubscriptionService billing history (integration)', () => {
  let gymId: string;
  let userId: string;
  let memberId: string;

  beforeEach(async () => {
    await resetDb();
    const gym = await prisma.gym.create({
      data: { name: 'Alpha Gym', slug: 'alpha-gym', status: GymStatus.ACTIVE },
    });
    gymId = gym.id;
    const user = await prisma.user.create({ data: { email: 'member@example.com' } });
    userId = user.id;
    const membership = await prisma.gymMember.create({
      data: { userId, gymId, role: Role.MEMBER },
    });
    memberId = membership.id;
  });

  afterAll(disconnect);

  it('returns the caller’s invoices newest-first, mapped to the wire shape', async () => {
    await prisma.invoice.create({
      data: {
        gymId,
        memberId,
        number: '2026-0001',
        year: 2026,
        seq: 1,
        amount: 5000,
        currency: 'USD',
        status: InvoiceStatus.PAID,
        issuedAt: new Date('2026-05-01T00:00:00.000Z'),
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    });
    await prisma.invoice.create({
      data: {
        gymId,
        memberId,
        number: '2026-0002',
        year: 2026,
        seq: 2,
        amount: 5000,
        currency: 'USD',
        status: InvoiceStatus.PAID,
        issuedAt: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    });

    const result = await asTenant(member(gymId, userId), () => service.getMySubscription());

    // Newest first, and each row mapped id/date(issuedAt)/amount/currency/status.
    expect(result.invoices).toHaveLength(2);
    expect(result.invoices.map((i) => i.date)).toEqual([
      '2026-06-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    ]);
    for (const invoice of result.invoices) {
      expect(invoice).toMatchObject({ amount: 5000, currency: 'USD', status: 'PAID' });
      expect(typeof invoice.id).toBe('string');
      expect(invoice.id.length).toBeGreaterThan(0);
    }
  });

  it('surfaces billing history even when the member has no live subscription', async () => {
    await prisma.invoice.create({
      data: {
        gymId,
        memberId,
        number: '2026-0001',
        year: 2026,
        seq: 1,
        amount: 9000,
        currency: 'GEL',
        status: InvoiceStatus.REFUNDED,
      },
    });

    const result = await asTenant(member(gymId, userId), () => service.getMySubscription());

    expect(result.subscription).toBeNull();
    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0]).toMatchObject({ amount: 9000, currency: 'GEL', status: 'REFUNDED' });
    expect(typeof result.invoices[0]?.date).toBe('string');
  });

  it('never returns another member’s invoices', async () => {
    const otherUser = await prisma.user.create({ data: { email: 'other@example.com' } });
    const otherMember = await prisma.gymMember.create({
      data: { userId: otherUser.id, gymId, role: Role.MEMBER },
    });
    await prisma.invoice.create({
      data: {
        gymId,
        memberId: otherMember.id,
        number: '2026-0001',
        year: 2026,
        seq: 1,
        amount: 7000,
        currency: 'USD',
        status: InvoiceStatus.PAID,
      },
    });

    const result = await asTenant(member(gymId, userId), () => service.getMySubscription());
    expect(result.invoices).toEqual([]);
  });

  it('reflects a live subscription alongside the history', async () => {
    await prisma.subscription.create({
      data: {
        gymId,
        memberId,
        status: SubscriptionStatus.ACTIVE,
        priceAmount: 5000,
        currency: 'USD',
        interval: 'MONTH',
        currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
    await prisma.invoice.create({
      data: {
        gymId,
        memberId,
        number: '2026-0001',
        year: 2026,
        seq: 1,
        amount: 5000,
        currency: 'USD',
        status: InvoiceStatus.PAID,
      },
    });

    const result = await asTenant(member(gymId, userId), () => service.getMySubscription());
    expect(result.subscription).toMatchObject({ status: 'ACTIVE', priceAmount: 5000 });
    expect(result.invoices).toHaveLength(1);
  });
});
