-- Stage 7 of multi-branch: CATALOGUE AND MARKETING EXCLUSIVITY.
--
-- ## Read this before the SQL: the meaning of NULL is INVERTED here
--
-- Stages 0 through 6 all asked one question — *which branch does this row belong
-- to* — and every one of them treated a NULL `locationId` as a gap. An order with
-- no branch was an unattributed sale, a member with no branch was un-homed, a
-- check-in with no branch had lost the door it came through. So every stage
-- shipped a backfill, and the roadmap's policy was explicit: backfill to the
-- gym's default branch, then require a branch on write, then tighten to NOT NULL.
--
-- **This migration asks the opposite question and therefore does the opposite
-- thing.** The six columns below answer *which branches is this catalogue item
-- OFFERED at*. A membership plan, a PT package, a retail product, a class type, a
-- promo code and a loyalty reward are all gym-wide by nature and only occasionally
-- exclusive to one site. So:
--
--   * **NULL means "available at every branch."** It is the normal, correct and
--     permanent state of very nearly every row, not a gap.
--   * **NOTHING IS BACKFILLED, and nothing ever should be.** An existing plan
--     really is sold at every branch; stamping the default branch onto it — the
--     thing every prior stage did — would silently WITHDRAW it from every other
--     branch. There is no data-repair step in this file for the same reason.
--   * **There is no NOT NULL to tighten to.** This is not expand/contract with the
--     contract still to come. The nullability is the feature; a follow-up
--     migration that "finishes the job" would break the product.
--
-- The filtering consequence is the one thing a reader must carry away: a branch
-- filter over these columns is **not equality**. "What can I sell at Saburtalo" is
--
--     WHERE "locationId" IS NULL OR "locationId" = :branch
--
-- (`availableAtLocation()` in `apps/api/src/common/location-filter.util.ts`).
-- Using the Stage 0–6 fragment `atLocation()` here would hide every gym-wide item
-- the instant a branch was selected — emptying the catalogue instead of narrowing
-- it, and doing so silently.
--
-- ## What deliberately got NOTHING
--
-- The roadmap named ten models. Four are absent from this file on purpose, and the
-- omissions are decisions rather than a shortfall:
--
--   * `campaigns`, `audience_segments`, `message_templates`, `automation_rules` —
--     a campaign is not *offered at* a branch, it is *sent to people*. What
--     determines its reach is the audience, and the audience has no branch
--     dimension at all today (`AudienceSegment.criteria` filters on plan, status,
--     join date, recency, spend and attendance). A `locationId` on those tables
--     would narrow the LIST an operator browses while the blast still went to the
--     whole gym — a column that looks like a filter and is not one. The honest fix
--     is a branch predicate inside the audience criteria (and inside the
--     automation executor's entity scan), reading `gym_members."locationId"`
--     through the PERSON half of the attribution rule. That is targeting, not
--     exclusivity, and it belongs in its own change.
--   * `product_categories` — a category is a taxonomy label, not a thing sold.
--     A branch-exclusive shelf is already implied by its products being exclusive,
--     and filtering the shelf list would hide the "Supplements" heading at a
--     branch that stocks one supplement.
--
-- `promo_redemptions` also stays untouched, and is the one exemption-register row
-- Stage 7 does NOT clear: the discounts-and-promotions report is gym-wide because
-- a redemption has no branch, and giving it one is an ATTRIBUTION column (NULL =
-- unattributable) with exactly the semantics this migration inverts. It belongs
-- with Stage 5's money work, not here.
--
-- ## Statement order and re-runnability
--
-- Structure, then constraints, following Stages 3 and 6. There is no data step
-- between them because there is no data step at all — every new column is NULL on
-- every existing row and stays that way, so no foreign key here can fail on
-- production data. `IF NOT EXISTS` / duplicate-object guards throughout so a
-- partially applied run can simply be repeated.

-- ---------------------------------------------------------------------------
-- 1. The six exclusivity columns.
--
--    Every one is nullable with no default, which is the whole design: a row that
--    says nothing about branches is offered at all of them.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "locationId" TEXT;
ALTER TABLE "package_plans"      ADD COLUMN IF NOT EXISTS "locationId" TEXT;
ALTER TABLE "products"           ADD COLUMN IF NOT EXISTS "locationId" TEXT;
ALTER TABLE "class_types"        ADD COLUMN IF NOT EXISTS "locationId" TEXT;
ALTER TABLE "promo_codes"        ADD COLUMN IF NOT EXISTS "locationId" TEXT;
ALTER TABLE "loyalty_rewards"    ADD COLUMN IF NOT EXISTS "locationId" TEXT;

-- ---------------------------------------------------------------------------
-- 2. Foreign keys, all `ON DELETE SET NULL`.
--
--    SetNull is not the lazy default here, it is the only non-destructive answer.
--    Under the inverted semantics, nulling an exclusive item's branch makes it
--    GYM-WIDE again — so retiring a branch widens its exclusive plans, packages,
--    products, class types, codes and rewards back to the whole gym rather than
--    deleting a plan people are subscribed to or a product with stock on a shelf.
--
--    Contrast Stage 6's `location_staff`, which cascades: a row there is nothing
--    but the pair, so an orphan carries no information. A plan is a real catalogue
--    entry that outlives any one site.
--
--    Note what SetNull CANNOT do to these columns that it can do to every earlier
--    stage's: it cannot create a residual "no location" class needing a bucket in
--    a report. A NULL here was always a legal, meaningful value.
-- ---------------------------------------------------------------------------

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "package_plans" ADD CONSTRAINT "package_plans_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "class_types" ADD CONSTRAINT "class_types_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Indexes: four SWAPS, and two deliberate non-additions.
--
--    Four of the six tables carried a bare `(gymId)` index. `(gymId, locationId)`
--    strictly subsumes it — Postgres serves any `gymId`-only lookup from the
--    leading prefix — so this is a replacement, not an addition: same count, same
--    write cost, strictly more information. `gymId` leads because the tenant
--    Prisma extension injects it into every `where`, exactly as in every prior
--    stage.
--
--    What it buys is honestly small and worth stating rather than overselling. The
--    availability predicate is `locationId IS NULL OR locationId = :branch`, which
--    a btree can satisfy as a BitmapOr of two scans (NULLs are indexed), but which
--    cannot then serve the roster's `ORDER BY name`. On a catalogue of tens of
--    rows per gym that is a wash against `(gymId)` plus a heap filter; on a few
--    thousand SKUs it is not. Since the swap is free, it is taken.
--
--    `promo_codes` and `loyalty_rewards` get NOTHING. Neither has a bare `(gymId)`
--    index to upgrade — every index they carry already leads on `gymId` — so a
--    branch composite would be a genuine addition, paying write cost on every
--    insert to save a heap filter over the tens of codes and rewards a gym
--    curates. That is the "column nobody sets" mistake in index form.
--
--    Plain `CREATE INDEX`, not `CONCURRENTLY`: Prisma runs a migration in one
--    transaction and these tables are small, matching Stages 3, 4 and 6.
--
--    The new index is created BEFORE the old one is dropped so no window exists
--    with neither.
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscription_plans_gymId_locationId_idx" ON "subscription_plans"("gymId", "locationId");
CREATE INDEX IF NOT EXISTS "package_plans_gymId_locationId_idx"      ON "package_plans"("gymId", "locationId");
CREATE INDEX IF NOT EXISTS "products_gymId_locationId_idx"           ON "products"("gymId", "locationId");
CREATE INDEX IF NOT EXISTS "class_types_gymId_locationId_idx"        ON "class_types"("gymId", "locationId");

-- DropIndex
--   Redundant now: each is a leading prefix of the composite created above.
--   Dropping an index can only slow a query, never break one, so this is safe
--   against an old API image still serving during the deploy window.
DROP INDEX IF EXISTS "subscription_plans_gymId_idx";
DROP INDEX IF EXISTS "package_plans_gymId_idx";
DROP INDEX IF EXISTS "products_gymId_idx";
DROP INDEX IF EXISTS "class_types_gymId_idx";
