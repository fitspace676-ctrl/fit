import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { BookingStatus, GymStatus, ReviewStatus, Role } from '@fit/db';
import { ReviewsService } from './reviews.service';
import { TenantContext, type TenantState } from '../common/tenant/tenant.context';
import { asTenant, disconnect, prisma, resetDb, tenantPrisma } from '../test/integration-db';

/**
 * The trainer rating projection proven against a real Postgres.
 *
 * `Trainer.rating` / `Trainer.reviewCount` are a denormalised cache of an aggregate
 * over the trainer's `VISIBLE` reviews — the figure every trainer card and the public
 * profile render instead of a COUNT/AVG join. Nothing in the schema keeps the pair
 * equal to the rows it summarises; the only thing that does is that each review write
 * recomputes it inside its own transaction.
 *
 * Which is not enough on its own, and that is what this suite exists to hold. Under
 * READ COMMITTED an aggregate cannot see a concurrent transaction's uncommitted
 * insert, so two members reviewing the same trainer at the same instant both compute
 * `N + 1` and the trainer is left one review short — silently, and until some
 * unrelated later review happens to recompute it. `recomputeTrainerRating` therefore
 * takes the trainer row's lock *before* reading the aggregate; this fires simultaneous
 * reviews at one trainer through the real transactions and asserts the cache still
 * equals the rows.
 */
const tenant = new TenantContext();
const service = new ReviewsService({ client: tenantPrisma }, tenant);

/** How many members review the same occurrence at once. */
const REVIEWERS = 4;

describe('Trainer rating projection (integration)', () => {
  let gymId: string;
  let trainerId: string;
  let instanceId: string;
  /** One tenant state per reviewing member, all in the same gym. */
  let callers: TenantState[];

  beforeEach(async () => {
    await resetDb();

    const gym = await prisma.gym.create({
      data: { name: 'Review Gym', slug: 'review-gym', status: GymStatus.ACTIVE },
    });
    gymId = gym.id;

    const trainer = await prisma.trainer.create({ data: { gymId, name: 'Coach Ada' } });
    trainerId = trainer.id;

    const instance = await prisma.classInstance.create({
      data: {
        gymId,
        trainerId,
        startsAt: new Date('2026-06-01T09:00:00.000Z'),
        endsAt: new Date('2026-06-01T10:00:00.000Z'),
      },
    });
    instanceId = instance.id;

    callers = [];
    for (let i = 0; i < REVIEWERS; i += 1) {
      const user = await prisma.user.create({ data: { email: `member-${i}@example.com` } });
      const membership = await prisma.gymMember.create({
        data: { userId: user.id, gymId, role: Role.MEMBER },
      });
      // Only an attendee may review, so each reviewer needs an ATTENDED booking.
      await prisma.booking.create({
        data: {
          gymId,
          classInstanceId: instanceId,
          memberId: membership.id,
          status: BookingStatus.ATTENDED,
          idempotencyKey: `attended-${i}`,
        },
      });
      callers.push({ userId: user.id, gymId, role: Role.MEMBER, allowCrossTenant: false });
    }
  });

  afterAll(disconnect);

  /** Post one review as `caller`, through the tenant-scoped service. */
  function postReview(caller: TenantState, rating: number): Promise<{ id: string }> {
    return asTenant(caller, () => service.create({ classInstanceId: instanceId, rating }));
  }

  /** The cached pair and the rows it is supposed to summarise. */
  async function projection(): Promise<{
    cached: { rating: number; reviewCount: number };
    actual: { rating: number; reviewCount: number };
  }> {
    const [trainer, agg] = await Promise.all([
      prisma.trainer.findUniqueOrThrow({ where: { id: trainerId } }),
      prisma.review.aggregate({
        where: { trainerId, status: ReviewStatus.VISIBLE },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);
    return {
      cached: { rating: trainer.rating, reviewCount: trainer.reviewCount },
      actual: {
        rating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        reviewCount: agg._count._all,
      },
    };
  }

  it('keeps the cached pair equal to the rows for a sequential review', async () => {
    await postReview(callers[0]!, 5);

    const { cached, actual } = await projection();
    expect(cached).toEqual(actual);
    expect(cached).toEqual({ rating: 5, reviewCount: 1 });
  });

  it('keeps the cached pair equal to the rows under simultaneous reviews', async () => {
    // A cold pool staggers the first requests enough that they stop overlapping, so
    // warm it before the racers go out.
    await Promise.all(
      callers.map((caller) =>
        asTenant(caller, () => tenantPrisma.classInstance.findFirst({ where: { id: instanceId } })),
      ),
    );

    const ratings = [5, 4, 3, 2];
    const results = await Promise.allSettled(
      callers.map((caller, i) => postReview(caller, ratings[i]!)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(REVIEWERS);

    const { cached, actual } = await projection();
    // The invariant: what the trainer card shows is what the reviews say. Without the
    // row lock the count lands short of `REVIEWERS` and the mean is computed over the
    // wrong set.
    expect(cached).toEqual(actual);
    expect(cached.reviewCount).toBe(REVIEWERS);
    expect(cached.rating).toBe(3.5);
  });
});
