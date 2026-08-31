import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma, ReviewStatus } from '@fit/db';
import { ReviewsService } from './reviews.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const GYM_ID = 'gym-1';
const USER_ID = 'user-1';
const MEMBER_ID = 'gm-1';
const INSTANCE_ID = 'ci-1';
const TRAINER_ID = 'tr-1';
const REVIEW_ID = 'rv-1';

interface QueryArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

/** A staff-projection review row as ADMIN_REVIEW_SELECT shapes it. */
const adminRow = (over?: Record<string, unknown>) => ({
  id: REVIEW_ID,
  rating: 5,
  comment: 'Great class',
  status: ReviewStatus.VISIBLE,
  classInstanceId: INSTANCE_ID,
  createdAt: new Date('2026-01-02T10:00:00.000Z'),
  member: { user: { name: 'Ada Lovelace', email: 'ada@example.com' } },
  classInstance: { template: { title: 'Spin' } },
  ...over,
});

function setup(opts?: { userId?: string | null }) {
  const review = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    findFirstOrThrow: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    count: vi.fn<(args: QueryArgs) => Promise<number>>(),
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    update: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    aggregate: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
  };
  const booking = { findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>() };
  const classInstance = { findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>() };
  const trainer = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    update: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
  };
  const gymMember = { findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>() };
  const auditLog = { create: vi.fn<(args: QueryArgs) => Promise<unknown>>() };
  /** The `SELECT … FOR NO KEY UPDATE` the recompute serialises on. */
  const $queryRaw = vi.fn<
    (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
  >(() => Promise.resolve([]));
  const $transaction = vi.fn<(cb: (tx: unknown) => unknown) => unknown>();
  const client = {
    review,
    booking,
    classInstance,
    trainer,
    gymMember,
    auditLog,
    $queryRaw,
    $transaction,
  };
  $transaction.mockImplementation((cb) => cb(client));

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = {
    get gymId() {
      return GYM_ID;
    },
    get userId() {
      return opts?.userId === undefined ? USER_ID : opts.userId;
    },
  } as unknown as TenantContext;

  return {
    service: new ReviewsService(prisma, tenant),
    review,
    booking,
    classInstance,
    trainer,
    gymMember,
    auditLog,
    queryRaw: $queryRaw,
    transaction: $transaction,
  };
}

describe('ReviewsService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('create', () => {
    const body = { classInstanceId: INSTANCE_ID, rating: 5, comment: 'Great class' };

    /** Wire up the happy-path mocks: member resolves, occurrence + attended
     * booking exist, no prior review, insert + recompute succeed. */
    function happyPath() {
      ctx.gymMember.findFirst.mockResolvedValueOnce({ id: MEMBER_ID });
      ctx.classInstance.findFirst.mockResolvedValueOnce({
        id: INSTANCE_ID,
        template: { trainerId: TRAINER_ID },
      });
      ctx.booking.findFirst.mockResolvedValueOnce({ id: 'bk-1' });
      ctx.review.findFirst.mockResolvedValueOnce(null);
      ctx.review.create.mockResolvedValueOnce({ id: REVIEW_ID });
      ctx.review.aggregate.mockResolvedValueOnce({ _avg: { rating: 4.5 }, _count: { _all: 2 } });
      ctx.trainer.update.mockResolvedValueOnce({});
    }

    it('accepts an attendee review and recomputes the trainer aggregate', async () => {
      happyPath();

      const result = await ctx.service.create(body);

      expect(result).toEqual({ id: REVIEW_ID });
      // The review is stamped with the resolved member + the trainer derived from
      // the occurrence's template — never values off the wire.
      expect(ctx.review.create.mock.calls[0]?.[0]?.data).toMatchObject({
        gymId: GYM_ID,
        memberId: MEMBER_ID,
        trainerId: TRAINER_ID,
        classInstanceId: INSTANCE_ID,
        rating: 5,
        comment: 'Great class',
      });
      // The aggregate is recomputed over VISIBLE reviews and rounded to 1 decimal.
      expect(ctx.review.aggregate.mock.calls[0]?.[0]?.where).toMatchObject({
        trainerId: TRAINER_ID,
        status: ReviewStatus.VISIBLE,
      });
      expect(ctx.trainer.update).toHaveBeenCalledWith({
        where: { id: TRAINER_ID },
        data: { rating: 4.5, reviewCount: 2 },
      });
    });

    /**
     * `rating` / `reviewCount` are written whole from the aggregate, which is only
     * correct while this transaction is the sole writer of the pair. The row lock is
     * what makes that true, and it only works *before* the aggregate is taken:
     * locking after the read would let a concurrent reviewer's aggregate miss ours
     * and store `N + 1` over our `N + 1`. The ordering is therefore the invariant,
     * and it is what this asserts. `FOR NO KEY UPDATE` rather than `FOR UPDATE`
     * because the review just inserted holds a key-share on the same row —
     * `trainer-rating-concurrency.int-spec.ts` deadlocks on the stronger mode.
     */
    it('locks the trainer row before reading the aggregate it projects', async () => {
      happyPath();

      await ctx.service.create(body);

      const [strings, ...values] = ctx.queryRaw.mock.calls[0] ?? [];
      expect(strings?.join('?')).toMatch(/FOR NO KEY UPDATE/);
      expect(values).toEqual([TRAINER_ID]);
      expect(ctx.queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(
        ctx.review.aggregate.mock.invocationCallOrder[0]!,
      );
    });

    it('persists a bare star rating as a null comment', async () => {
      ctx.gymMember.findFirst.mockResolvedValueOnce({ id: MEMBER_ID });
      ctx.classInstance.findFirst.mockResolvedValueOnce({
        id: INSTANCE_ID,
        template: { trainerId: TRAINER_ID },
      });
      ctx.booking.findFirst.mockResolvedValueOnce({ id: 'bk-1' });
      ctx.review.findFirst.mockResolvedValueOnce(null);
      ctx.review.create.mockResolvedValueOnce({ id: REVIEW_ID });
      ctx.review.aggregate.mockResolvedValueOnce({ _avg: { rating: 5 }, _count: { _all: 1 } });
      ctx.trainer.update.mockResolvedValueOnce({});

      await ctx.service.create({ classInstanceId: INSTANCE_ID, rating: 5 });

      expect(ctx.review.create.mock.calls[0]?.[0]?.data).toMatchObject({ comment: null });
    });

    it('403s a caller who is not a member of the gym (NOT_A_MEMBER)', async () => {
      ctx.gymMember.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service.create(body).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'NOT_A_MEMBER' });
      expect(ctx.review.create).not.toHaveBeenCalled();
    });

    it('403s with MEMBER_SESSION_REQUIRED when there is no session user', async () => {
      ctx = setup({ userId: null });

      const error = await ctx.service.create(body).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'MEMBER_SESSION_REQUIRED',
      });
    });

    it('404s an unknown / cross-tenant occurrence (CLASS_INSTANCE_NOT_FOUND)', async () => {
      ctx.gymMember.findFirst.mockResolvedValueOnce({ id: MEMBER_ID });
      ctx.classInstance.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service.create(body).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'CLASS_INSTANCE_NOT_FOUND',
      });
      expect(ctx.review.create).not.toHaveBeenCalled();
    });

    it('403s a member with no ATTENDED booking for the occurrence (NOT_ATTENDED)', async () => {
      ctx.gymMember.findFirst.mockResolvedValueOnce({ id: MEMBER_ID });
      ctx.classInstance.findFirst.mockResolvedValueOnce({
        id: INSTANCE_ID,
        template: { trainerId: TRAINER_ID },
      });
      ctx.booking.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service.create(body).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'NOT_ATTENDED' });
      // The attendance gate queries specifically for an ATTENDED booking.
      expect(ctx.booking.findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
        classInstanceId: INSTANCE_ID,
        memberId: MEMBER_ID,
        status: BookingStatus.ATTENDED,
      });
      expect(ctx.review.create).not.toHaveBeenCalled();
    });

    it('409s a second review for the same occurrence (ALREADY_REVIEWED) via the pre-check', async () => {
      ctx.gymMember.findFirst.mockResolvedValueOnce({ id: MEMBER_ID });
      ctx.classInstance.findFirst.mockResolvedValueOnce({
        id: INSTANCE_ID,
        template: { trainerId: TRAINER_ID },
      });
      ctx.booking.findFirst.mockResolvedValueOnce({ id: 'bk-1' });
      ctx.review.findFirst.mockResolvedValueOnce({ id: 'rv-existing' });

      const error = await ctx.service.create(body).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'ALREADY_REVIEWED',
      });
      expect(ctx.review.create).not.toHaveBeenCalled();
    });

    it('maps a unique-violation race on insert back to ALREADY_REVIEWED', async () => {
      ctx.gymMember.findFirst.mockResolvedValueOnce({ id: MEMBER_ID });
      ctx.classInstance.findFirst.mockResolvedValueOnce({
        id: INSTANCE_ID,
        template: { trainerId: TRAINER_ID },
      });
      ctx.booking.findFirst.mockResolvedValueOnce({ id: 'bk-1' });
      ctx.review.findFirst.mockResolvedValueOnce(null);
      ctx.review.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const error = await ctx.service.create(body).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'ALREADY_REVIEWED',
      });
      expect(ctx.trainer.update).not.toHaveBeenCalled();
    });

    it('skips the aggregate recompute when the occurrence has no trainer', async () => {
      ctx.gymMember.findFirst.mockResolvedValueOnce({ id: MEMBER_ID });
      ctx.classInstance.findFirst.mockResolvedValueOnce({
        id: INSTANCE_ID,
        template: { trainerId: null },
      });
      ctx.booking.findFirst.mockResolvedValueOnce({ id: 'bk-1' });
      ctx.review.findFirst.mockResolvedValueOnce(null);
      ctx.review.create.mockResolvedValueOnce({ id: REVIEW_ID });

      await ctx.service.create(body);

      expect(ctx.review.create.mock.calls[0]?.[0]?.data).toMatchObject({ trainerId: null });
      expect(ctx.trainer.update).not.toHaveBeenCalled();
    });
  });

  describe('hide / unhide', () => {
    it('hides a visible review, recomputes the aggregate, and audit-logs the action', async () => {
      ctx.review.findFirst.mockResolvedValueOnce({
        id: REVIEW_ID,
        trainerId: TRAINER_ID,
        status: ReviewStatus.VISIBLE,
        rating: 1,
      });
      ctx.review.update.mockResolvedValueOnce({});
      ctx.review.aggregate.mockResolvedValueOnce({ _avg: { rating: 4 }, _count: { _all: 3 } });
      ctx.trainer.update.mockResolvedValueOnce({});
      ctx.auditLog.create.mockResolvedValueOnce({});
      ctx.review.findFirstOrThrow.mockResolvedValueOnce(adminRow({ status: ReviewStatus.HIDDEN }));

      const result = await ctx.service.hide(REVIEW_ID);

      expect(ctx.review.update).toHaveBeenCalledWith({
        where: { id: REVIEW_ID },
        data: { status: ReviewStatus.HIDDEN },
      });
      // Hiding drops the review from the VISIBLE aggregate (recompute fires).
      expect(ctx.trainer.update).toHaveBeenCalledWith({
        where: { id: TRAINER_ID },
        data: { rating: 4, reviewCount: 3 },
      });
      // The moderation leaves an audit trail naming the actor + target review.
      expect(ctx.auditLog.create.mock.calls[0]?.[0]?.data).toMatchObject({
        action: 'review.hide',
        actorId: USER_ID,
        targetId: REVIEW_ID,
      });
      expect(result.status).toBe(ReviewStatus.HIDDEN);
    });

    it('is idempotent — re-hiding an already-hidden review writes nothing', async () => {
      ctx.review.findFirst.mockResolvedValueOnce({
        id: REVIEW_ID,
        trainerId: TRAINER_ID,
        status: ReviewStatus.HIDDEN,
        rating: 1,
      });
      ctx.review.findFirstOrThrow.mockResolvedValueOnce(adminRow({ status: ReviewStatus.HIDDEN }));

      await ctx.service.hide(REVIEW_ID);

      expect(ctx.review.update).not.toHaveBeenCalled();
      expect(ctx.trainer.update).not.toHaveBeenCalled();
      expect(ctx.auditLog.create).not.toHaveBeenCalled();
    });

    it('404s an unknown / cross-tenant review (REVIEW_NOT_FOUND)', async () => {
      ctx.review.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service.hide(REVIEW_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'REVIEW_NOT_FOUND',
      });
    });

    it('unhide restores a hidden review to VISIBLE and audit-logs review.unhide', async () => {
      ctx.review.findFirst.mockResolvedValueOnce({
        id: REVIEW_ID,
        trainerId: TRAINER_ID,
        status: ReviewStatus.HIDDEN,
        rating: 5,
      });
      ctx.review.update.mockResolvedValueOnce({});
      ctx.review.aggregate.mockResolvedValueOnce({ _avg: { rating: 5 }, _count: { _all: 1 } });
      ctx.trainer.update.mockResolvedValueOnce({});
      ctx.auditLog.create.mockResolvedValueOnce({});
      ctx.review.findFirstOrThrow.mockResolvedValueOnce(adminRow({ status: ReviewStatus.VISIBLE }));

      const result = await ctx.service.unhide(REVIEW_ID);

      expect(ctx.review.update).toHaveBeenCalledWith({
        where: { id: REVIEW_ID },
        data: { status: ReviewStatus.VISIBLE },
      });
      expect(ctx.auditLog.create.mock.calls[0]?.[0]?.data).toMatchObject({
        action: 'review.unhide',
      });
      expect(result.status).toBe(ReviewStatus.VISIBLE);
    });
  });

  describe('listForModeration', () => {
    it('404s an unknown / cross-tenant trainer (TRAINER_NOT_FOUND)', async () => {
      ctx.trainer.findFirst.mockResolvedValueOnce(null);

      const error = await ctx.service
        .listForModeration(TRAINER_ID, { page: 1, limit: 20 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'TRAINER_NOT_FOUND',
      });
      expect(ctx.review.findMany).not.toHaveBeenCalled();
    });

    it('returns every review by default and projects the staff row shape', async () => {
      ctx.trainer.findFirst.mockResolvedValueOnce({ id: TRAINER_ID });
      ctx.review.findMany.mockResolvedValueOnce([adminRow()]);
      ctx.review.count.mockResolvedValueOnce(1);

      const result = await ctx.service.listForModeration(TRAINER_ID, { page: 1, limit: 20 });

      // No status filter → the where is the trainer alone (visible + hidden).
      expect(ctx.review.findMany.mock.calls[0]?.[0]?.where).toEqual({ trainerId: TRAINER_ID });
      expect(result).toMatchObject({ total: 1, page: 1, limit: 20 });
      expect(result.data[0]).toEqual({
        id: REVIEW_ID,
        rating: 5,
        comment: 'Great class',
        status: ReviewStatus.VISIBLE,
        authorName: 'Ada Lovelace',
        authorEmail: 'ada@example.com',
        classInstanceId: INSTANCE_ID,
        classTitle: 'Spin',
        createdAt: '2026-01-02T10:00:00.000Z',
      });
    });

    it('narrows by status when one is supplied', async () => {
      ctx.trainer.findFirst.mockResolvedValueOnce({ id: TRAINER_ID });
      ctx.review.findMany.mockResolvedValueOnce([]);
      ctx.review.count.mockResolvedValueOnce(0);

      await ctx.service.listForModeration(TRAINER_ID, {
        page: 2,
        limit: 10,
        status: ReviewStatus.HIDDEN,
      });

      expect(ctx.review.findMany.mock.calls[0]?.[0]?.where).toEqual({
        trainerId: TRAINER_ID,
        status: ReviewStatus.HIDDEN,
      });
      // Page 2 of 10 skips the first page.
      expect(ctx.review.findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 10, take: 10 });
    });
  });
});
