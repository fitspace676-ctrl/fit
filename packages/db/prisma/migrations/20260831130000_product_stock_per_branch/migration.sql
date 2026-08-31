-- Stage 4 of multi-branch: STOCK BECOMES PER BRANCH.
--
-- The gym owner was asked directly and answered: each branch holds its own stock;
-- the branches are separate operating units, everything is its own. So "how many
-- do I have?" stops having a gym-wide answer. It has one answer per branch, and
-- the gym-wide figure becomes their sum.
--
-- This is the first multi-branch stage that changes how data is WRITTEN, not only
-- how it is read. Stages 0, 2 and 3 added a column and filled it in; nothing that
-- already worked started meaning something else. Here, the till stops drawing down
-- "the gym's" count and starts drawing down the selling branch's, and the column
-- every existing reader consults becomes a derived roll-up. Read the three
-- decisions below before changing anything in this file.
--
-- ===========================================================================
-- THE HONEST PART: THE PRE-SPLIT FIGURE CANNOT BE SPLIT.
-- ===========================================================================
--
-- Every product today has ONE number: 20 tees in size M, gym-wide. Nothing in this
-- database records where those 20 tees physically are. Not the orders (a sale tells
-- you where a unit LEFT from, not where the remaining stock sits), not the
-- movements (`stock_movements` has no branch — that is what step 4 fixes), not the
-- product, not the branch. There is no rule, no proportion and no heuristic that
-- recovers the split, and inventing one — splitting evenly, weighting by each
-- branch's sales, weighting by member count — would produce a number that looks
-- authoritative, reconciles perfectly with the gym total, and is wrong on the
-- shelf. A wrong count that reconciles is worse than an obviously incomplete one,
-- because nobody goes looking for it.
--
-- So: the whole figure goes to the gym's DEFAULT branch (elected by
-- 20260830120000_location_default_branch_backfill), and every other branch starts
-- with nothing recorded.
--
-- ---------------------------------------------------------------------------
-- >>> OPERATOR ACTION REQUIRED AFTER THIS DEPLOY — A PHYSICAL STOCK-TAKE. <<<
--
--   Any gym with more than one branch now shows its ENTIRE inventory at the
--   default branch and ZERO at every other branch. That is not a bug and it will
--   not correct itself: no background job can discover where the goods are.
--
--   For each gym with more than one branch, someone must walk each branch, count
--   what is on its shelves, and enter it with a `RECOUNT` movement per position
--   (`POST /admin/products/:id/stock` with the branch selected). Until that is
--   done, the per-branch inventory pages and the low-stock alerts are wrong for
--   every branch, and the till at a non-default branch will read as out of stock.
--
--   Single-branch gyms need no action whatsoever: their one branch IS the default,
--   so the whole figure lands where it already was and nothing changes for them.
--   Step 3 raises a NOTICE naming exactly which gyms are affected, so the deploy
--   log itself tells the operator whose stock-take is outstanding.
-- ---------------------------------------------------------------------------
--
-- ===========================================================================
-- THE THREE DESIGN DECISIONS, AND WHAT EACH COSTS.
-- ===========================================================================
--
-- 1. VARIANTS. A product's per-variant counts live in the `products.variants` JSON
--    today. Per-branch x per-variant is a matrix, and it could have become rows —
--    one per (product, branch, variant position). It did not, because the BASE
--    position (a product sold as-is) has no variant index, and a nullable
--    `variantIndex` inside the compound unique is unusable twice over: Postgres
--    treats NULLs as distinct so the constraint would not hold, and Prisma's
--    generated `WhereUniqueInput` cannot address a null, so `upsert` — the till's
--    natural write against a branch that has no row yet — would be unavailable. The
--    alternative, a `-1` sentinel meaning "base", would put two spellings of the
--    same idea in one domain, since `stock_movements.variantIndex` already means
--    base by NULL.
--
--    So the counts move WITH the product's shape: `product_stock` holds one row per
--    (product, branch) carrying `stock` for the base position and `variants` — a
--    flat array of integers, positionally aligned with `products.variants` — for
--    the rest. Costs, plainly: variant counts stay invisible to SQL (low stock
--    across variants is still an application-code scan, exactly as today), and the
--    positional array now exists once per branch, so editing a product's variant
--    list must fan out to every branch row in one transaction. Migrating to rows
--    later stays open; the position key `(productId, variantIndex)` does not change.
--
-- 2. `products.stock` STAYS, redefined as a DERIVED GYM-WIDE ROLL-UP. Dropping it
--    would break every reader in one commit — the member shop's "in stock?", the
--    cart's pre-checkout check, the low-stock ops alert, the mobile catalogue — and
--    all of those legitimately ask a gym-wide question. Leaving it as an unmaintained
--    legacy column would be worse than drift: it would go quietly stale.
--
--    Cost: two places hold one number, so they can disagree. The mitigation is a
--    single rule, and the `/// @counter` markers in schema.prisma exist to enforce
--    it: a branch write and the roll-up move by the SAME SIGNED DELTA, atomically,
--    in one transaction. Recomputing the sum instead would be a read-then-write and
--    would lose races; an `increment` of the same delta cannot drift under
--    concurrency, only under a write path that forgets it. To find one that did:
--
--      SELECT p."id", p."stock", SUM(s."stock") AS branches
--      FROM "products" p LEFT JOIN "product_stock" s ON s."productId" = p."id"
--      GROUP BY p."id", p."stock"
--      HAVING p."stock" IS DISTINCT FROM SUM(s."stock");
--
-- 3. `stock_movements` GETS A REAL BRANCH AND A REAL ORDER. `orderId` has been a
--    relation-less scalar since the table was created, which is exactly how branch
--    attribution got lost: nothing could join a movement back to the order that
--    caused it, so nothing could ask where the sale happened. Step 4 makes it a
--    foreign key — and, because the column has never been policed, step 4 has to
--    repair whatever a decade of no constraint let in, the same way Stage 3 had to
--    for `check_ins.locationId`.
--
-- ===========================================================================
--
-- Statement order is deliberate and not Prisma's draft order: structure first, then
-- the data settled against it, then the constraints that police it — so no foreign
-- key is ever added to a column that could reject a row.
--
-- Every step is re-runnable: `IF NOT EXISTS` on the DDL, `ON CONFLICT DO NOTHING`
-- on the insert, `IS NULL` guards on the backfills, and `DO $$` guards on the
-- foreign keys. Running this file twice against the same database is a no-op.
--
-- Nothing here is made NOT NULL. `stock_movements.locationId` stays nullable on the
-- same expand/contract terms as every earlier stage: tightening waits until every
-- stock write path requires a branch. `product_stock.locationId` is NOT NULL from
-- birth, because it is a new table with no legacy rows — a stock count that does not
-- name a branch is not a thing this stage has any use for.

-- ---------------------------------------------------------------------------
-- 1. The branch column on the ledger.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

-- ---------------------------------------------------------------------------
-- 2. The per-branch stock table.
--
--    `gymId` is denormalised from the product so the tenant Prisma client
--    extension can scope this model the way it scopes every other. Adding
--    `ProductStock` to `TENANT_SCOPED_MODELS` is part of the API half of this
--    stage — an unlisted model carrying `gymId` is precisely the cross-tenant leak
--    shape the roadmap already had to fix once, across 13 models.
--
--    The unique index is created WITH the table rather than after the data,
--    unusually for this repo's migrations, because the insert in step 3 uses it as
--    its `ON CONFLICT` target — it is what makes that step re-runnable.
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_stock" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "stock" INTEGER,
    "variants" JSONB NOT NULL DEFAULT '[]',
    "lowStockThreshold" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "product_stock_productId_locationId_key" ON "product_stock"("productId", "locationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_stock_gymId_locationId_idx" ON "product_stock"("gymId", "locationId");

-- ---------------------------------------------------------------------------
-- 3. Move each product's whole pre-split figure onto its gym's DEFAULT branch.
--
--    See the header: the split is not derivable and is not invented here.
--
--    Only the default branch gets a row. Other branches get NO ROW — deliberately,
--    rather than an explicit zero. The two are identical to every read (a missing
--    row reads as 0 on hand, which is documented on the model), but they are not
--    identical to a human: a row saying `0` asserts that somebody counted and found
--    nothing, and this migration counted nothing. Minting products x branches rows
--    of fabricated count-sheet would also make the low-stock page scream about every
--    line at every non-default branch on day one, drowning the real signal on the
--    day the operator most needs it.
--
--    Products the gym does not count at all — no base stock, no variants — get no
--    row anywhere. `products.stock` stays NULL, which is consistent with a SUM over
--    zero rows, and "untracked" stays a property of the product rather than becoming
--    a per-branch state nobody asked for.
--
--    `variants` is projected from `products.variants` as a flat array of counts in
--    array order, dropping the catalogue fields: name, SKU and price are identical
--    at every branch, and copying them per branch would invite them to diverge. The
--    extraction is defensive on purpose — this is a JSON column with no constraint,
--    so a non-array value is coerced to `[]` and a non-integer `stock` reads as 0
--    rather than aborting the deploy on one malformed row.
--
--    `createdAt`/`updatedAt` are supplied explicitly: Prisma's `@updatedAt` is
--    application-side and has no database default. Ids are `gen_random_uuid()::text`
--    — `cuid()` has no SQL equivalent, and this is the pattern the repo's earlier
--    data migrations already use. Ids are opaque TEXT everywhere; nothing parses
--    their shape.
-- ---------------------------------------------------------------------------
INSERT INTO "product_stock" (
  "id", "gymId", "productId", "locationId", "stock", "variants", "lowStockThreshold", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  p."gymId",
  p."id",
  d."id",
  p."stock",
  COALESCE(v."counts", '[]'::jsonb),
  p."lowStockThreshold",
  NOW(),
  NOW()
FROM "products" p
JOIN "locations" d
  ON d."gymId" = p."gymId"
 AND d."isDefault"
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
           CASE
             WHEN (e."value" ->> 'stock') ~ '^-?[0-9]+$'
               THEN GREATEST(0, (e."value" ->> 'stock')::int)
             ELSE 0
           END
           ORDER BY e."ord"
         ) AS "counts"
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(p."variants") = 'array' THEN p."variants" ELSE '[]'::jsonb END
       ) WITH ORDINALITY AS e("value", "ord")
) v ON TRUE
-- Nothing to record for a product the gym does not count: no base figure and no
-- variants. `jsonb_agg` over zero rows is NULL, which is what `v."counts" IS NULL`
-- tests for.
WHERE p."stock" IS NOT NULL OR v."counts" IS NOT NULL
ON CONFLICT ("productId", "locationId") DO NOTHING;

-- ---------------------------------------------------------------------------
--    Name the gyms whose stock is now provably misplaced, in the deploy log.
--
--    A migration cannot fix this and must not pretend it has. What it can do is
--    make the outstanding work impossible to miss: a WARNING per multi-branch gym
--    that actually has stock, naming the gym and the branch its whole inventory is
--    currently sitting at. Single-branch gyms are silent, because for them the
--    default branch is the only branch and nothing moved.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  affected RECORD;
  total INT := 0;
BEGIN
  FOR affected IN
    SELECT g."name" AS gym,
           d."name" AS default_branch,
           count(DISTINCT l."id") - 1 AS other_branches,
           count(DISTINCT s."productId") AS lines_held
    FROM "gyms" g
    JOIN "locations" l ON l."gymId" = g."id"
    JOIN "locations" d ON d."gymId" = g."id" AND d."isDefault"
    JOIN "product_stock" s ON s."gymId" = g."id"
    GROUP BY g."id", g."name", d."name"
    HAVING count(DISTINCT l."id") > 1
  LOOP
    total := total + 1;
    RAISE WARNING
      'STOCK-TAKE REQUIRED — gym "%": all % stocked line(s) are now recorded at "%", and its % other branch(es) start empty. Walk each branch and enter a RECOUNT per position.',
      affected.gym, affected.lines_held, affected.default_branch, affected.other_branches;
  END LOOP;

  IF total = 0 THEN
    RAISE NOTICE 'product_stock: no multi-branch gym holds stock — no manual stock-take needed.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Repair `stock_movements.orderId` before making it a foreign key.
--
--    The column has never had a constraint, so — exactly as Stage 3 found on
--    `check_ins.locationId` — two classes of bad value are possible:
--
--      (a) an id matching NO order at all: an order deleted at some point, whose
--          movements kept pointing at the gap;
--      (b) an id matching an order of a DIFFERENT gym. A plain foreign key would
--          happily accept this one, because that order does exist — so it must be
--          caught here or it is never caught at all.
--
--    Both are set to NULL: the movement itself is true (the units moved) and must
--    survive, but the order it names is not something we can stand behind. The
--    alternatives were rejected for the same reasons Stage 3 rejected them —
--    aborting means a deploy that fails on production data, and deleting the
--    movements destroys the ledger this stage exists to make queryable.
--
--    The NOTICE makes it visible rather than silent: a non-zero count means some
--    sales history lost its link to the order behind it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  repaired BIGINT;
BEGIN
  WITH fixed AS (
    UPDATE "stock_movements" m
    SET "orderId" = NULL
    WHERE m."orderId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "orders" o
        WHERE o."id" = m."orderId"
          AND o."gymId" = m."gymId"
      )
    RETURNING 1
  )
  SELECT count(*) INTO repaired FROM fixed;

  IF repaired > 0 THEN
    RAISE NOTICE
      'stock_movements: % row(s) named a missing or cross-tenant order; the link was cleared (the movement itself is kept)',
      repaired;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Attribute the existing ledger to a branch — from the ORDER where there is
--    one, from the gym's default otherwise.
--
--    This is the one place in Stage 4 where the branch IS derivable, and it would
--    be a waste not to use it. `orders.locationId` is real evidence: Stage 0
--    backfilled it and the POS has always written it, so a `SALE` or
--    `REFUND_RESTOCK` movement can be attributed to the branch that actually rang
--    the sale. Step 4 ran first precisely so this join is trustworthy — every
--    surviving `orderId` now names a real order of the same gym.
--
--    Manual movements (RECEIVE / ADJUSTMENT / RECOUNT / WRITE_OFF) carry no order
--    and get the default branch, which is where their stock now sits.
--
--    A deliberate inconsistency, recorded rather than papered over: a historical
--    sale attributed to a non-default branch will show a `resultingStock` that was
--    a GYM-WIDE figure at the time, while that branch's `product_stock` starts
--    empty. Both alternatives are worse. Rewriting `resultingStock` would fabricate
--    a per-branch history nobody recorded; sweeping every movement onto the default
--    branch would flatly contradict `orders.locationId`, which the new foreign key
--    now lets anyone join and check. The seam is one-time and is documented on
--    `StockMovement.resultingStock`: on a pre-Stage-4 row, trust the `delta` and the
--    branch, not the running total.
--
--    Both statements are guarded by `IS NULL`, so a re-run never drags a movement
--    that already names a branch back to a different one.
-- ---------------------------------------------------------------------------
UPDATE "stock_movements" m
SET "locationId" = o."locationId"
FROM "orders" o
WHERE o."id" = m."orderId"
  AND o."gymId" = m."gymId"
  AND o."locationId" IS NOT NULL
  AND m."locationId" IS NULL;

UPDATE "stock_movements" m
SET "locationId" = d."id"
FROM "locations" d
WHERE d."gymId" = m."gymId"
  AND d."isDefault"
  AND m."locationId" IS NULL;

-- ---------------------------------------------------------------------------
-- 6. The branch-filter index on the ledger.
--
--    `gymId` leads because the tenant Prisma extension always injects it; a bare
--    `locationId` index is a shape no query in this codebase can issue.
--    `createdAt` trails so one branch's movements come back already newest-first.
--
--    This ADDS to `stock_movements_gymId_createdAt_idx` rather than replacing it,
--    for the reason Stage 3 kept `check_ins_gymId_checkedInAt_idx`: `locationId`
--    sits between the two columns an all-branches ledger scan uses, so the existing
--    index is not a prefix of this one, and "All locations" is the console's
--    default state.
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_movements_gymId_locationId_createdAt_idx" ON "stock_movements"("gymId", "locationId", "createdAt");

-- ---------------------------------------------------------------------------
-- 7. The foreign keys. By this point every value they police is already valid.
--
--    `product_stock` cascades on BOTH parents, unlike every other branch relation
--    in this schema, which is `SetNull`. That is not an oversight: an on-hand count
--    with no product, or no branch, is not a thing — there is no "unattributed
--    stock" the way there is an unattributed check-in. Nothing hard-deletes a
--    `Location` today (the console retires a branch to INACTIVE), so the location
--    cascade is currently reachable only by deleting a whole gym. If branch
--    deletion is ever built, that path must zero the rows out first — writing the
--    movements — because the cascade alone would leave `products.stock` over-counting
--    by the closed branch's units.
--
--    `stock_movements` is the opposite on both of its new keys, and for the mirror
--    reason: the ledger is the evidence. Closing a branch must not delete the record
--    of what moved there, and voiding an order must not erase the units it shifted.
--    A cascade on either would mean the act of tidying up destroys the history that
--    explains today's count.
-- ---------------------------------------------------------------------------

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'product_stock_gymId_fkey') THEN
    ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_gymId_fkey"
      FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'product_stock_productId_fkey') THEN
    ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'product_stock_locationId_fkey') THEN
    ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'stock_movements_locationId_fkey') THEN
    ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'stock_movements_orderId_fkey') THEN
    ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
