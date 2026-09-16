-- Stage 5 of multi-branch: the money tables get their own branch column.
--
-- `payments`, `refunds` and `invoices` can ALREADY be narrowed to a branch. Stage
-- 2 gave both a path — payments and refunds through `orderAtLocation`
-- (`order.is.locationId`), invoices through `memberAtLocation`
-- (`member.is.locationId`) — and every revenue read in `apps/api` uses one of
-- them today. **So this migration is not a correctness fix.** It is a
-- PERFORMANCE change: a relation filter plans as a join plus a heap filter and
-- can never use `orders(gymId, locationId, createdAt)` or
-- `gym_members(gymId, locationId, status)`, and the revenue aggregates issue one
-- in a loop. Denormalising collapses every one of those call sites to `atLocation`
-- against an index built for exactly that shape.
--
-- The attribution each column copies is the rule in
-- `apps/api/src/common/location-filter.util.ts`, unchanged:
--
--   > A figure about a PLACE is attributed by the order's branch. A figure about
--   > a PERSON is attributed by that person's home branch.
--
-- `payments` and `refunds` are money taken at a till, so they take the PLACE
-- half and are backfilled from their order. `invoices` take the PERSON half and
-- are backfilled from their member — never from `orderId`, even where one
-- exists. `Invoice.orderId` is nullable and subscription billing (the recurring
-- majority) leaves it null, so a hybrid rule would attribute the one-off minority
-- one way and the rest another, and `outstanding` would mean something different
-- row by row. One rule for every invoice, whatever raised it.
--
-- ---------------------------------------------------------------------------
-- THE ONE BEHAVIOUR CHANGE, STATED UP FRONT
-- ---------------------------------------------------------------------------
--
-- A relation filter is LIVE — it re-reads the related row on every query. A
-- denormalised column is FROZEN — a snapshot taken at write time. They agree
-- until the related row changes.
--
-- For `payments` and `refunds` nothing changes today: no path in `apps/api` ever
-- updates an order's branch after checkout.
--
-- For `invoices` it changes something real. `GymMember.locationId` IS editable —
-- a branch move rides with the profile write in `members.service.ts` — so under
-- the live member hop, transferring a member silently moves their ENTIRE billing
-- history to the new branch, retrospectively rewriting both branches' figures for
-- months already closed. After this migration it does not. An invoice was issued
-- to a member as they stood then; a past event does not move because a person
-- later did. A transferred member's history stays with the branch that earned it,
-- and only invoices issued after the move land at the new one.
--
-- That is the intended outcome, recorded here so it is not later mistaken for a
-- bug. The equivalent for a MEMBERSHIP — should a transferred member's recurring
-- revenue follow them or stay put — is a live product question, which is why
-- `Subscription` deliberately gets NO column in this migration and keeps its live
-- member hop.
--
-- ---------------------------------------------------------------------------
-- ORDERING AND RE-RUNNABILITY
-- ---------------------------------------------------------------------------
--
-- Statement order is deliberate and not Prisma's default draft order, following
-- 20260830130000_gym_member_home_branch and 20260831120000_check_in_location_branch:
-- the columns are added, the data is settled, and only then do the index and the
-- constraint that polices it go on. By the time each foreign key is added, every
-- value in its column is either NULL or a live location of the SAME gym, so none
-- of them can fail.
--
-- Every backfill is guarded on `IS NULL`, so re-running the file is a no-op
-- rather than a re-attribution: a row that already names a branch is never
-- dragged anywhere.
--
-- Unlike Stage 3 there is no repair step. These three columns are brand new, so
-- they cannot hold the stale or cross-tenant ids an unpoliced column accumulates.
-- What CAN be wrong is the source: `payments.gymId`, `refunds.gymId` and
-- `invoices.gymId` are each denormalised from their parent, so every join below
-- pins the gym as well as the id. Copying a branch across a gymId disagreement
-- would mint exactly the cross-tenant row Stage 3 had to clean up — and a foreign
-- key would happily accept it, because that location does exist. Prevented here
-- rather than repaired later.
--
-- The columns stay NULLABLE, on the same expand/contract terms as Stages 0, 2, 3
-- and 4. Tightening waits until every write path stamps a branch — and, for
-- invoices, it may never be reachable at all: see step 3.

-- ---------------------------------------------------------------------------
-- 0. The columns.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "locationId" TEXT;

-- ---------------------------------------------------------------------------
-- 1. Backfill `payments` from the order that was settled.
--
--    `payments.orderId` is `String @unique` and NOT NULL, and the relation is
--    `onDelete: Cascade`, so every payment has exactly one live order. There is
--    no missing-parent case here.
--
--    NOTE THE ABSENCE OF A DEFAULT-BRANCH FALLBACK, which is where this migration
--    departs from Stages 2 and 3. Those columns had no attribution at all before
--    them, so sweeping NULLs onto the gym's default branch invented the only
--    answer available. This column has an attribution already, applied live on
--    every read, and the whole promise of Stage 5 is that it makes the filter
--    index-served WITHOUT MOVING A SINGLE FIGURE BETWEEN BRANCHES. An order with
--    no branch is invisible to `orderAtLocation` today; defaulting its payment to
--    the main branch would credit that branch with takings the console has never
--    shown there, and the API half would then disagree with the numbers it
--    replaced. So `o."locationId" IS NOT NULL` is a fidelity guard, not an
--    oversight — and it also keeps the statement from rewriting rows to the same
--    NULL they already hold.
-- ---------------------------------------------------------------------------
UPDATE "payments" p
SET "locationId" = o."locationId"
FROM "orders" o
WHERE o."id" = p."orderId"
  AND o."gymId" = p."gymId"
  AND o."locationId" IS NOT NULL
  AND p."locationId" IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Backfill `refunds` from the same order the payment was taken on.
--
--    `refunds.orderId` is NOT NULL and `onDelete: Cascade`, exactly like
--    `payments.orderId`, so the same reasoning applies verbatim.
--
--    Deliberately the ORDER's branch, not the branch the refund was keyed at —
--    which nothing records anyway. Netting takings against reversals is the point
--    of the figure, so both halves must land in the same bucket; splitting them
--    would leave the selling branch showing revenue it no longer holds and the
--    refunding branch a negative it never earned.
-- ---------------------------------------------------------------------------
UPDATE "refunds" r
SET "locationId" = o."locationId"
FROM "orders" o
WHERE o."id" = r."orderId"
  AND o."gymId" = r."gymId"
  AND o."locationId" IS NOT NULL
  AND r."locationId" IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Backfill `invoices` from the BILLED MEMBER's home branch.
--
--    Through `memberId`, never `orderId` — the reason is in the header, and it
--    is the same rule `memberAtLocation` already applies on every invoice read.
--
--    Two classes of row cannot be backfilled, and both are LEFT NULL on purpose:
--
--      (a) `memberId IS NULL` — the member was hard-deleted. `Invoice.member` is
--          `SetNull` precisely so a financial record survives a purge, and the
--          invoice is all that is left of who was billed. There is nothing to read
--          a branch from and nothing to guess from.
--      (b) the member exists but is itself unattributed — `GymMember.location` is
--          `SetNull`, so retiring a branch un-homes its members.
--
--    Both are already invisible to `memberAtLocation`: the relation filter drops a
--    null-member invoice by construction, and a branch-less member matches no
--    branch. So leaving them NULL reproduces today's behaviour exactly, which is
--    the entire point. They stay in the gym-wide roll-up and fall out of every
--    per-branch figure — the residual class the reports' `NO_LOCATION_LABEL`
--    bucket exists to catch, and the same one `memberAtLocation`'s doc comment
--    already names.
--
--    Class (a) is also why this column may never be tightened to NOT NULL, unlike
--    the others: a purge can null it at any time, long after every write path has
--    started stamping a branch.
-- ---------------------------------------------------------------------------
UPDATE "invoices" i
SET "locationId" = m."locationId"
FROM "gym_members" m
WHERE m."id" = i."memberId"
  AND m."gymId" = i."gymId"
  AND m."locationId" IS NOT NULL
  AND i."locationId" IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Report what could not be attributed.
--
--    Every count below is a row that stays out of per-branch revenue while
--    remaining in the gym-wide total. On a healthy database, seeded or
--    production, all of them are zero: Stage 0 backfilled every order onto a
--    branch and Stage 2 every member, and neither has a path back to NULL short
--    of a branch being retired.
--
--    A non-zero count is therefore worth an operator's eye, and each line says
--    what it means rather than just how many. The `cross_tenant` lines should be
--    zero under any circumstances — a payment whose `gymId` disagrees with its
--    order's is a corrupt denormalisation, not a branch problem, and it is
--    reported rather than silently repaired because the correct repair depends on
--    which of the two columns is wrong.
--
--    RAISE NOTICE, never RAISE EXCEPTION. None of these are reasons to fail a
--    deploy: they are pre-existing gaps in older data that this migration
--    faithfully carries forward instead of papering over.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n BIGINT;
BEGIN
  SELECT count(*) INTO n FROM "payments" WHERE "locationId" IS NULL;
  IF n > 0 THEN
    RAISE NOTICE 'payments: % row(s) left unattributed — their order carries no branch (retired location). They stay in the gym-wide total and out of every per-branch one, exactly as the order-relation filter already treated them.', n;
  END IF;

  SELECT count(*) INTO n
  FROM "payments" p JOIN "orders" o ON o."id" = p."orderId"
  WHERE o."gymId" <> p."gymId";
  IF n > 0 THEN
    RAISE WARNING 'payments: % row(s) disagree with their order on gymId. NOT backfilled — this is a corrupt denormalisation, not a branch gap, and copying a branch across it would mint a cross-tenant row a foreign key cannot catch.', n;
  END IF;

  SELECT count(*) INTO n FROM "refunds" WHERE "locationId" IS NULL;
  IF n > 0 THEN
    RAISE NOTICE 'refunds: % row(s) left unattributed — their order carries no branch (retired location).', n;
  END IF;

  SELECT count(*) INTO n
  FROM "refunds" r JOIN "orders" o ON o."id" = r."orderId"
  WHERE o."gymId" <> r."gymId";
  IF n > 0 THEN
    RAISE WARNING 'refunds: % row(s) disagree with their order on gymId. NOT backfilled — see the payments warning.', n;
  END IF;

  SELECT count(*) INTO n FROM "invoices" WHERE "memberId" IS NULL;
  IF n > 0 THEN
    RAISE NOTICE 'invoices: % row(s) have no member (hard-deleted / purged) and therefore no branch to read. Left NULL; the member-relation filter already dropped them from every branch figure.', n;
  END IF;

  SELECT count(*) INTO n
  FROM "invoices" i JOIN "gym_members" m ON m."id" = i."memberId" AND m."gymId" = i."gymId"
  WHERE m."locationId" IS NULL;
  IF n > 0 THEN
    RAISE NOTICE 'invoices: % row(s) belong to a member with no home branch (retired location). Left NULL; re-home the member and re-run step 3 to attribute them.', n;
  END IF;

  SELECT count(*) INTO n
  FROM "invoices" i JOIN "gym_members" m ON m."id" = i."memberId"
  WHERE m."gymId" <> i."gymId";
  IF n > 0 THEN
    RAISE WARNING 'invoices: % row(s) disagree with their member on gymId. NOT backfilled — see the payments warning.', n;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. The branch-filter indexes.
--
--    `gymId` leads because the tenant Prisma extension always injects it into the
--    `where` — a `locationId`-first index is a shape no query in this codebase can
--    issue. `createdAt` trails so one branch's money comes back already in the
--    date order every revenue window, reconciliation and report reads it in.
--
--    Each ADDS to the existing `(gymId, createdAt)` rather than replacing it, for
--    the reason Stage 3 gave on `check_ins`: `locationId` sits BETWEEN the two
--    columns an all-branches query uses, so `(gymId, createdAt)` is not a prefix
--    of the new composite and an unfiltered read would have to walk every
--    branch's slice to satisfy the time range. "All locations" is the console's
--    default state and the hotter of the two paths.
--
--    Nothing is dropped. Unlike Stage 0 — which retired `class_templates`' bare
--    `(locationId)` because it was a shape nothing could use — every index on
--    these three tables is still the best available plan for a query that runs:
--    `(gymId, createdAt)` for the all-branches windows, `(orderId)` /
--    `(paymentId)` / `(subscriptionId)` / `(memberId)` for the point lookups, and
--    `(gymId, number)` for the invoice reference. The bare `(gymId)` on each is a
--    prefix of `(gymId, createdAt)` and so is already redundant, but it was
--    redundant before this migration and is the house style across ~50 models —
--    not Stage 5's to sweep.
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX "payments_gymId_locationId_createdAt_idx" ON "payments"("gymId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "refunds_gymId_locationId_createdAt_idx" ON "refunds"("gymId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "invoices_gymId_locationId_createdAt_idx" ON "invoices"("gymId", "locationId", "createdAt");

-- ---------------------------------------------------------------------------
-- 6. The foreign keys.
--
--    ON DELETE SET NULL, never CASCADE — the same stance every `location`
--    relation in this schema takes, and it matters most here. Closing a branch
--    must not delete the money it took, the reversals against it, or the invoices
--    raised at it. A cascade would mean the act of shutting a branch destroys the
--    financial record of that branch: the evidence that justifies (or indicts) the
--    closure, and in the invoices' case a document a tax authority expects to
--    outlive the premises.
--
--    Those rows fall back to unattributed and drop out of per-branch figures while
--    staying in the gym-wide roll-up — the trade the whole location filter is
--    built on.
-- ---------------------------------------------------------------------------

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
