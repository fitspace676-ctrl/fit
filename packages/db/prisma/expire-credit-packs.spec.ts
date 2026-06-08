// T8.5 — credit-pack expiry job unit tests.
//
// Exercises the set-based expiry pass (`expireCreditPacks`) against a lightweight
// in-memory Prisma double whose `updateMany` honours the same `status` /
// `remainingCredits` / `expiresAt` predicate Postgres would. Everything is
// anchored in UTC, matching how `expiresAt` is stored.

import { describe, expect, it } from 'vitest';
import { CreditPackStatus } from '../generated/client';
import { expireCreditPacks, type ExpireCreditPacksPrisma } from './expire-credit-packs';

/** A UTC instant from calendar parts, keeping the tests readable. */
function utc(year: number, month: number, day: number, hour = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour));
}

/** A credit-pack row as the job's `updateMany` filter sees it. */
interface PackRow {
  id: string;
  status: CreditPackStatus;
  remainingCredits: number;
  expiresAt: Date | null;
}

/** Args for the single `updateMany` shape the job issues. */
interface UpdateManyArgs {
  where: {
    status: CreditPackStatus;
    remainingCredits: { gt: number };
    expiresAt: { lt: Date };
  };
  data: { status: CreditPackStatus };
}

/**
 * Build a Prisma double over a fixed set of credit packs whose `creditPack.
 * updateMany` applies the job's `{ status, remainingCredits: { gt }, expiresAt:
 * { lt } }` predicate and flips the matched rows in place — so a test can assert
 * both the returned count and which rows actually changed.
 */
function makePrisma(packs: PackRow[]): { prisma: ExpireCreditPacksPrisma; rows: PackRow[] } {
  const prisma = {
    creditPack: {
      updateMany: (args: UpdateManyArgs) => {
        const { where, data } = args;
        let count = 0;
        for (const row of packs) {
          const isMatch =
            row.status === where.status &&
            row.remainingCredits > where.remainingCredits.gt &&
            row.expiresAt !== null &&
            row.expiresAt.getTime() < where.expiresAt.lt.getTime();
          if (isMatch) {
            row.status = data.status;
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    },
  } as unknown as ExpireCreditPacksPrisma;

  return { prisma, rows: packs };
}

describe('expireCreditPacks', () => {
  const now = utc(2026, 6, 8, 12);

  it('flips a lapsed, still-usable pack to EXPIRED', async () => {
    const { prisma, rows } = makePrisma([
      {
        id: 'lapsed',
        status: CreditPackStatus.ACTIVE,
        remainingCredits: 3,
        expiresAt: utc(2026, 6, 8, 11),
      },
    ]);

    const result = await expireCreditPacks(prisma, { now });

    expect(result.packsExpired).toBe(1);
    expect(result.now).toBe(now.toISOString());
    expect(rows[0]?.status).toBe(CreditPackStatus.EXPIRED);
  });

  it('leaves a pack expiring in the future ACTIVE', async () => {
    const { prisma, rows } = makePrisma([
      {
        id: 'future',
        status: CreditPackStatus.ACTIVE,
        remainingCredits: 5,
        expiresAt: utc(2026, 6, 9),
      },
    ]);

    const result = await expireCreditPacks(prisma, { now });

    expect(result.packsExpired).toBe(0);
    expect(rows[0]?.status).toBe(CreditPackStatus.ACTIVE);
  });

  it('never expires a pack with no expiresAt (never-expiring pack)', async () => {
    const { prisma, rows } = makePrisma([
      { id: 'forever', status: CreditPackStatus.ACTIVE, remainingCredits: 5, expiresAt: null },
    ]);

    const result = await expireCreditPacks(prisma, { now });

    expect(result.packsExpired).toBe(0);
    expect(rows[0]?.status).toBe(CreditPackStatus.ACTIVE);
  });

  it('leaves a fully-spent lapsed pack ACTIVE (kept as a spent record)', async () => {
    const { prisma, rows } = makePrisma([
      {
        id: 'spent',
        status: CreditPackStatus.ACTIVE,
        remainingCredits: 0,
        expiresAt: utc(2026, 6, 1),
      },
    ]);

    const result = await expireCreditPacks(prisma, { now });

    expect(result.packsExpired).toBe(0);
    expect(rows[0]?.status).toBe(CreditPackStatus.ACTIVE);
  });

  it('is idempotent — an already-EXPIRED pack is not re-counted', async () => {
    const { prisma } = makePrisma([
      {
        id: 'done',
        status: CreditPackStatus.EXPIRED,
        remainingCredits: 2,
        expiresAt: utc(2026, 6, 1),
      },
    ]);

    const result = await expireCreditPacks(prisma, { now });

    expect(result.packsExpired).toBe(0);
  });

  it('expires only the lapsed packs in a mixed set', async () => {
    const { prisma, rows } = makePrisma([
      { id: 'a', status: CreditPackStatus.ACTIVE, remainingCredits: 1, expiresAt: utc(2026, 6, 7) },
      {
        id: 'b',
        status: CreditPackStatus.ACTIVE,
        remainingCredits: 4,
        expiresAt: utc(2026, 6, 30),
      },
      { id: 'c', status: CreditPackStatus.ACTIVE, remainingCredits: 2, expiresAt: null },
      { id: 'd', status: CreditPackStatus.ACTIVE, remainingCredits: 2, expiresAt: utc(2026, 5, 1) },
    ]);

    const result = await expireCreditPacks(prisma, { now });

    expect(result.packsExpired).toBe(2);
    expect(rows.find((r) => r.id === 'a')?.status).toBe(CreditPackStatus.EXPIRED);
    expect(rows.find((r) => r.id === 'd')?.status).toBe(CreditPackStatus.EXPIRED);
    expect(rows.find((r) => r.id === 'b')?.status).toBe(CreditPackStatus.ACTIVE);
    expect(rows.find((r) => r.id === 'c')?.status).toBe(CreditPackStatus.ACTIVE);
  });

  it('defaults `now` to the current time when omitted', async () => {
    const { prisma } = makePrisma([
      {
        id: 'old',
        status: CreditPackStatus.ACTIVE,
        remainingCredits: 1,
        expiresAt: utc(2000, 1, 1),
      },
    ]);

    const result = await expireCreditPacks(prisma);

    expect(result.packsExpired).toBe(1);
  });
});
