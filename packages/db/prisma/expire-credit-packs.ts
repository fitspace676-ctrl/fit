// T8.5 — Expire lapsed credit packs.
//
// A {@link CreditPack} carries an `expiresAt` instant (set at purchase from the
// plan's `creditValidityDays`); once it passes, the pack's remaining credits can
// no longer be spent. The booking deduction already refuses an expired pack, but
// it filters on `status = ACTIVE`, so a lapsed pack must be flipped to `EXPIRED`
// for that filter — and for the member dashboard — to reflect reality. This job
// does that flip in one set-based UPDATE.
//
// It runs system-wide (every gym, not tenant-scoped) on a schedule — see
// `expire-credit-packs.run.ts` and the `jobs:expire-credit-packs` script,
// intended for a daily Railway cron at midnight UTC — mirroring how the T5.3
// class-instance generator is wired. It is idempotent: a pack already `EXPIRED`
// is outside the `status = ACTIVE` predicate, so re-running only touches packs
// that have newly lapsed since the last pass.

import { CreditPackStatus, type PrismaClient } from '../generated/client';

/** The Prisma surface the job touches — lets tests inject a lightweight mock. */
export type ExpireCreditPacksPrisma = Pick<PrismaClient, 'creditPack'>;

/** Knobs for {@link expireCreditPacks}; `now` defaults so a bare call "just works". */
export interface ExpireCreditPacksOptions {
  /** The instant to expire against (packs with `expiresAt < now` lapse). Defaults to `new Date()`. */
  now?: Date;
}

/** Summary of one expiry pass, for logging / assertions. */
export interface ExpireCreditPacksResult {
  /** The instant packs were expired against (ISO-8601). */
  now: string;
  /** How many packs this pass flipped `ACTIVE → EXPIRED`. */
  packsExpired: number;
}

/**
 * Flip every still-usable credit pack whose `expiresAt` has passed to `EXPIRED`.
 *
 * The scan is `status = ACTIVE AND remainingCredits > 0 AND expiresAt < now`:
 * a fully-spent pack (`remainingCredits = 0`) is left `ACTIVE` as a spent
 * historical record — it can't be drawn from anyway — and a pack with no
 * `expiresAt` (never expires) is excluded automatically, since a NULL never
 * satisfies the `< now` comparison. Returns the number of packs expired.
 */
export async function expireCreditPacks(
  prisma: ExpireCreditPacksPrisma,
  options?: ExpireCreditPacksOptions,
): Promise<ExpireCreditPacksResult> {
  const now = options?.now ?? new Date();

  const { count } = await prisma.creditPack.updateMany({
    where: {
      status: CreditPackStatus.ACTIVE,
      remainingCredits: { gt: 0 },
      expiresAt: { lt: now },
    },
    data: { status: CreditPackStatus.EXPIRED },
  });

  return { now: now.toISOString(), packsExpired: count };
}
