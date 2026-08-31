-- Stage 3 of multi-branch: a check-in gets a REAL branch.
--
-- `check_ins.locationId` has existed for a long time as a decoy: a bare TEXT
-- column with no foreign key, no back-relation on `locations` and no index. You
-- could not write `where: { location: … }` or `include: { location: true }`, a
-- deleted branch left stale ids behind with none of the `SetNull` protection the
-- four real branch columns get, and — decisively — nothing in `apps/api` ever
-- wrote it. Only the seed did. So in production the column is entirely NULL,
-- which is why the roadmap's exemption register lists occupancy, the check-in
-- KPIs and the member-check-in-log report as gym-wide "unblocked by Stage 3", and
-- why `dashboard.service.ts` folds unattributed arrivals into `areas[0]`.
--
-- Check-ins are the most branch-relevant dataset in the product — footfall, peak
-- hours, occupancy are all questions about a *place*.
--
-- This differs from 20260830130000_gym_member_home_branch in one way: the column
-- already exists, so there is no ALTER TABLE … ADD COLUMN. What is being added is
-- the relation, the index and the constraint — to a column that has spent its
-- whole life unpoliced and may therefore already contain values a foreign key
-- would reject. Step 1 exists for exactly that.
--
-- Statement order is deliberate and not Prisma's default draft order: the data is
-- repaired, then settled, and only then does the constraint that polices it go on.
-- Every step is re-runnable.
--
-- The column stays NULLABLE, on the same expand/contract terms as Stages 0 and 2:
-- tightening to NOT NULL waits until every check-in write path requires a branch.

-- ---------------------------------------------------------------------------
-- 1. Repair ids no foreign key was ever there to prevent.
--
--    Two classes of bad value are possible, because the column has never had a
--    constraint:
--
--      (a) an id matching NO location at all — a branch deleted at some point in
--          the past, whose check-ins kept pointing at the gap;
--      (b) an id matching a location of a DIFFERENT gym — never legitimate, and
--          a tenant leak: one gym's footfall counted at another gym's branch. A
--          foreign key would happily accept this one, so it must be caught here
--          or it is never caught at all.
--
--    Both are set to NULL, so step 2 sweeps them onto the gym's own default
--    branch. The alternatives were rejected:
--
--      - Aborting (which is what adding the constraint first would do): a
--        migration that fails on production data at deploy time, leaving the
--        release half-applied, is not an option. The whole point of ordering the
--        repair first is that the constraint in step 4 CANNOT fail.
--      - Deleting the offending check-ins: they are the footfall history this
--        stage exists to make queryable, and an arrival at an unknown branch is
--        still an arrival. Losing visits to fix an id is the wrong trade.
--      - Leaving them and using NOT VALID on the constraint: it would defer the
--        problem to whoever next runs VALIDATE, and case (b) would survive
--        validation anyway.
--
--    Reattributing to the default branch is lossy — that visit did not happen at
--    the default branch, it happened at a branch we can no longer name — but it
--    is the same loss the NULL rows already take in step 2, it keeps per-branch
--    footfall summing to the gym total, and it is the only outcome that neither
--    destroys data nor breaks the deploy. The NOTICE makes it visible rather than
--    silent: a non-zero count is worth an operator's attention, because it means
--    some branch's history has been folded into the default's.
--
--    `updatedAt` is not touched anywhere in this migration — `check_ins` is
--    append-only and has no such column, which is itself a reason a check-in must
--    never be silently rewritten without saying so.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  repaired BIGINT;
BEGIN
  WITH fixed AS (
    UPDATE "check_ins" c
    SET "locationId" = NULL
    WHERE c."locationId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "locations" l
        WHERE l."id" = c."locationId"
          AND l."gymId" = c."gymId"
      )
    RETURNING 1
  )
  SELECT count(*) INTO repaired FROM fixed;

  IF repaired > 0 THEN
    RAISE NOTICE
      'check_ins: % row(s) pointed at a missing or cross-tenant location; reattributed to the gym default branch',
      repaired;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Backfill every unattributed arrival onto its gym's default branch.
--
--    20260830120000_location_default_branch_backfill guaranteed every gym has
--    exactly one `isDefault` branch — creating a "Main" one for gyms that had
--    none — so this always has somewhere to point.
--
--    `IS NULL` keeps the statement re-runnable: a check-in that already names a
--    branch is never dragged back to the default. The join on `d."gymId" =
--    c."gymId"` is what makes cross-tenant attribution impossible, and is why
--    step 1 checks the gym as well as the existence of the location.
--
--    Every row, however old. A check-in is the raw material of every historical
--    footfall comparison; leaving the archive null would half-populate the column
--    the NOT NULL follow-up has to tighten, and would make "arrivals at this
--    branch last year" answer zero rather than an estimate.
-- ---------------------------------------------------------------------------
UPDATE "check_ins" c
SET "locationId" = d."id"
FROM "locations" d
WHERE d."gymId" = c."gymId"
  AND d."isDefault"
  AND c."locationId" IS NULL;

-- ---------------------------------------------------------------------------
-- 3. The branch-filter index.
--
--    `gymId` leads because the tenant Prisma extension always injects it into the
--    `where`; `checkedInAt` trails so one branch's arrivals come back already in
--    time order for the today-feed and the peak-hour buckets.
--
--    This ADDS to `check_ins_gymId_checkedInAt_idx` rather than replacing it —
--    unlike `class_templates_locationId_idx`, which Stage 0 dropped. That one was
--    a bare `(locationId)`, a shape no query in this codebase can use. This one is
--    `(gymId, checkedInAt)`, and it is not a prefix of the new composite:
--    `locationId` sits between the two columns it uses, so an all-branches query
--    would have to walk every branch's slice to satisfy the time range. "All
--    locations" is the console's default state, so that is the hotter path of the
--    two and keeps its own index. Same reasoning that kept
--    `gym_members_gymId_role_status_idx` in Stage 2.
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX "check_ins_gymId_locationId_checkedInAt_idx" ON "check_ins"("gymId", "locationId", "checkedInAt");

-- ---------------------------------------------------------------------------
-- 4. The foreign key — the point of the whole migration.
--
--    ON DELETE SET NULL, never CASCADE: closing a branch must not delete the
--    record of everyone who ever trained there. The arrivals fall back to
--    unattributed; the footfall history that justifies (or indicts) the closure
--    survives it. A cascade here would mean the act of shutting a branch erases
--    the evidence about that branch.
--
--    By this point every value in the column is either NULL or a live location of
--    the same gym, so this cannot fail.
-- ---------------------------------------------------------------------------

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
