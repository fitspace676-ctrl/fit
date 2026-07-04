import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { GymStatus, Role, SubscriptionPlanStatus, SubscriptionStatus } from '@fit/db';
import { SubscriptionEnrollmentService } from './subscription-enrollment.service';
import { InvoiceService } from '../billing/invoice.service';
import { TenantContext, type TenantState } from '../common/tenant/tenant.context';
import { asTenant, disconnect, prisma, resetDb, tenantPrisma } from '../test/integration-db';

/**
 * Subscription enrolment proven against a real Postgres (T5.3): the create runs
 * through the actual tenant-scoping extension and the migration's partial unique
 * index, so this exercises what the unit spec can only fake — the row is written
 * scoped to the caller's gym, a cross-tenant plan is invisible, and the
 * one-live-subscription invariant is enforced by the DB index, not just the
 * pre-check.
 */
// `tenantPrisma` is the same `$extends(tenantExtension())` client the production
// `TenantPrismaService` exposes, so the shape satisfies the service's dependency
// directly — the extension applies scoping from the ALS store exactly as in a
// request.
const service = new SubscriptionEnrollmentService(
  { client: tenantPrisma },
  new TenantContext(),
  new InvoiceService(),
);

function member(gymId: string, userId: string): TenantState {
  return { userId, gymId, role: Role.MEMBER, allowCrossTenant: false };
}

describe('SubscriptionEnrollmentService (integration)', () => {
  let gymAId: string;
  let gymBId: string;
  let userId: string;
  let memberId: string;
  let planAId: string;
  let planBId: string;

  beforeEach(async () => {
    await resetDb();

    const gymA = await prisma.gym.create({
      data: { name: 'Alpha Gym', slug: 'alpha-gym', status: GymStatus.ACTIVE },
    });
    gymAId = gymA.id;
    const gymB = await prisma.gym.create({
      data: { name: 'Beta Gym', slug: 'beta-gym', status: GymStatus.ACTIVE },
    });
    gymBId = gymB.id;

    const user = await prisma.user.create({ data: { email: 'member@example.com' } });
    userId = user.id;
    const membership = await prisma.gymMember.create({
      data: { userId, gymId: gymAId, role: Role.MEMBER },
    });
    memberId = membership.id;

    const planA = await prisma.subscriptionPlan.create({
      data: {
        gymId: gymAId,
        name: 'Premium',
        priceAmount: 12000,
        currency: 'GEL',
        interval: 'MONTH',
        status: SubscriptionPlanStatus.ACTIVE,
      },
    });
    planAId = planA.id;
    const planB = await prisma.subscriptionPlan.create({
      data: { gymId: gymBId, name: 'Other Gym Plan', priceAmount: 9000, currency: 'GEL' },
    });
    planBId = planB.id;
  });

  afterAll(disconnect);

  it('enrols the member, persisting a live subscription scoped to their gym', async () => {
    const result = await asTenant(member(gymAId, userId), () => service.enrollSelf(planAId));

    expect(result.subscription).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      planId: planAId,
      planName: 'Premium',
      priceAmount: 12000,
      currency: 'GEL',
      interval: 'MONTH',
    });

    // The period is one month long and the terms are snapshotted onto the row.
    const start = new Date(result.subscription.currentPeriodStart);
    const end = new Date(result.subscription.currentPeriodEnd);
    expect(end.getTime()).toBeGreaterThan(start.getTime());

    const stored = await prisma.subscription.findUniqueOrThrow({
      where: { id: result.subscription.id },
    });
    expect(stored).toMatchObject({
      gymId: gymAId,
      memberId,
      status: SubscriptionStatus.ACTIVE,
      priceAmount: 12000,
      provider: 'stub',
    });

    // A paid enrolment mints a numbered invoice for the first period (T5.9), scoped to
    // the member's gym and linked to the new subscription, so the billing history is
    // populated from day one.
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { subscriptionId: result.subscription.id },
    });
    expect(invoice).toMatchObject({
      gymId: gymAId,
      memberId,
      amount: 12000,
      currency: 'GEL',
      status: 'PAID',
    });
    expect(invoice.number).toMatch(/^\d{4}-\d{4}$/);
  });

  it('rejects a second enrolment while a live subscription exists (DB uniqueness backstop)', async () => {
    await asTenant(member(gymAId, userId), () => service.enrollSelf(planAId));

    const error = await asTenant(member(gymAId, userId), () =>
      service.enrollSelf(planAId).catch((e: unknown) => e),
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    // Exactly one subscription row exists for the member.
    const count = await prisma.subscription.count({ where: { memberId } });
    expect(count).toBe(1);
  });

  it('allows a fresh enrolment after the prior subscription is canceled (terminal frees the slot)', async () => {
    const first = await asTenant(member(gymAId, userId), () => service.enrollSelf(planAId));
    await prisma.subscription.update({
      where: { id: first.subscription.id },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
    });

    const second = await asTenant(member(gymAId, userId), () => service.enrollSelf(planAId));
    expect(second.subscription.id).not.toBe(first.subscription.id);
    expect(second.subscription.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('cannot enrol on another gym’s plan — it is invisible under tenant scoping (404)', async () => {
    const error = await asTenant(member(gymAId, userId), () =>
      service.enrollSelf(planBId).catch((e: unknown) => e),
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'SUBSCRIPTION_PLAN_NOT_FOUND',
    });
    // Cross-check: nothing was written into gym B either.
    expect(await prisma.subscription.count({ where: { gymId: gymBId } })).toBe(0);
  });
});
