-- Stage 6 of multi-branch: PEOPLE AND SCHEDULING get a real branch.
--
-- The last structural gap. Stage 2 gave a member a home branch, Stage 3 gave a
-- check-in the door it came through, Stage 4 gave stock a shelf, Stage 5 froze
-- money where it was taken. What is left is everyone who WORKS at a branch and
-- everything they are scheduled to do there — the population behind the roadmap's
-- longest run of gym-wide exemptions (`GET /dashboard/staff`, the Classes tab's
-- `ptSessionsOverTime`, the pt-sessions report, the trainer-performance report).
--
-- ## The shape question this migration answers
--
-- A person can work at SEVERAL branches. A shift, a PT session and a service
-- booking each happen at exactly ONE place. Those are different shapes and are
-- deliberately not collapsed into one mechanism just because a coach appears in
-- all four:
--
--   * `location_staff` (new join table) — the many. Which branches someone CAN be
--     rostered at. Replaces `gym_members.assignedLocationIds`.
--   * `shift_slots.locationId`, `pt_sessions.locationId`,
--     `service_sessions.locationId` (new single FKs) — the one. Where a scheduled
--     thing actually happens.
--   * `trainers` and `services` get NOTHING, and the schema argues both at length:
--     a trainer is a profile of a person who already carries two branch facts, and
--     a service is deliverable exactly where its staff member is rostered. A third
--     column would be a third answer free to disagree with the other two.
--
-- `gym_members.locationId` keeps its Stage 2 meaning and gains a second one on a
-- staff row: the person's BASE branch. That is what preserves the attribution
-- rule's partition property — `location_staff` is many-to-many and cannot
-- partition, so a head-count reads the column and an availability question reads
-- the table.
--
-- ## Two things this migration deliberately does NOT do
--
--  1. **It does not drop `gym_members.assignedLocationIds`.** Expand/contract, as
--     every stage since 0 — but for a sharper reason than a nullable column.
--     `staff.service.ts` SELECTs that column (`STAFF_SELECT`), writes it on create
--     and patches it on update. Dropping it here would 500 every staff list in the
--     window between this migration running and the new API image serving. It is
--     copied FROM and left alone; the follow-up migration that drops it ships with
--     the service change that stops reading it.
--
--  2. **It does not backfill `shift_slots.locationId` to the default branch**,
--     unlike every other branch column this roadmap has added. See step 7.
--
-- Statement order follows Stage 3 exactly and not Prisma's draft order: structure,
-- then data, then the constraints that police it — so no foreign key can fail on
-- production data at deploy time. Every step is re-runnable.

-- ---------------------------------------------------------------------------
-- 1. The join table, its indexes, and its foreign keys.
--
--    Created complete (constraints included) rather than data-first, because it is
--    a NEW table: there is no pre-existing data for a constraint to reject, and
--    inserting through the foreign keys is what guarantees step 2 cannot carry a
--    bad id across. The opposite of the `check_ins` case in Stage 3, where the
--    column already held years of unpoliced values.
--
--    `ON DELETE CASCADE` on BOTH sides — the opposite of every other branch
--    relation in this schema, and right for the same reason `product_stock`
--    cascades: a row here is nothing but the pair. `SetNull` would leave "somebody
--    is assigned somewhere", a fact worth nothing. Unlike an un-homed member, an
--    un-placed order or a check-in that lost its door, all of which still record
--    that something happened.
--
--    Ids are `gen_random_uuid()::text`: `cuid()` is application-side and has no
--    SQL equivalent, and this is the pattern the Stage 4 migration already set.
--    Ids are opaque TEXT everywhere; nothing parses their shape.
--
--    `IF NOT EXISTS` throughout so a partially-applied run can be repeated.
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE IF NOT EXISTS "location_staff" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
--   The pair, once. Also the integrity `assignedLocationIds` could never have: a
--   duplicate id inside that array was silently legal and doubled the person in
--   anything counted off it.
CREATE UNIQUE INDEX IF NOT EXISTS "location_staff_staffId_locationId_key" ON "location_staff"("staffId", "locationId");

-- CreateIndex
--   "Who works at branch X" — the reverse query that did not exist. Against the
--   array it was a `has` over an unindexed `String[]`: a scan of every membership
--   in the gym, customers included. `gymId` leads because the tenant Prisma
--   extension injects it into every `where`.
--
--   No `(gymId, staffId)` twin, deliberately: the unique above already leads on
--   `staffId`, and `gymId` is a heap filter over the handful of rows one person
--   can have.
CREATE INDEX IF NOT EXISTS "location_staff_gymId_locationId_idx" ON "location_staff"("gymId", "locationId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "location_staff" ADD CONSTRAINT "location_staff_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "location_staff" ADD CONSTRAINT "location_staff_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "location_staff" ADD CONSTRAINT "location_staff_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Carry every valid `assignedLocationIds` entry across.
--
--    The array has never had a constraint, so exactly the two classes of bad value
--    Stage 3 had to repair on `check_ins.locationId` can be sitting in it, plus a
--    third the array shape invents:
--
--      (a) an id matching NO location at all — a branch deleted at some point,
--          whose id stayed in every staff row because a `String[]` gets none of the
--          `SetNull` protection a real column gets;
--      (b) an id matching a location of a DIFFERENT GYM — a tenant leak, and the
--          one a plain foreign key would happily accept because that location
--          really does exist. Caught here by joining on id AND `gymId`, or it is
--          never caught at all;
--      (c) the same id twice in one array — legal in a `String[]`, and it doubled
--          the person in anything counted off the column. `DISTINCT` plus the
--          unique index end it.
--
--    All three are DROPPED rather than repaired to the default branch, which is the
--    opposite of what Stage 3 did with check-ins — and the difference is the point.
--    A check-in is a past event: it happened somewhere, so attributing it to the
--    default is lossy but keeps a real arrival in the totals. An assignment is a
--    STANDING CLAIM about where someone works. Repairing a broken one to the
--    default would assert that a named human works at a named branch, on no
--    evidence, and the rota would then act on it. Dropping it is the honest
--    outcome, the array column is not being dropped so nothing is destroyed, and
--    step 3 gives the person a default assignment anyway if they end up with none.
--
--    `role <> 'MEMBER'` because this table means "works here". A customer with a
--    stray assignment id is bad data either way; carrying it across would put them
--    on the roster where "who works at branch X" would list them. Their array is
--    left untouched and inspectable.
--
--    Soft-deleted staff DO get their explicit entries carried across — the record
--    of where a departing employee worked is worth keeping, and every reader
--    filters `deletedAt` anyway — but step 3 does not synthesise anything for them.
-- ---------------------------------------------------------------------------
INSERT INTO "location_staff" ("id", "gymId", "staffId", "locationId", "createdAt")
SELECT gen_random_uuid()::text, x."gymId", x."staffId", x."locationId", NOW()
FROM (
  SELECT DISTINCT
    m."gymId" AS "gymId",
    m."id"    AS "staffId",
    l."id"    AS "locationId"
  FROM "gym_members" m
  CROSS JOIN LATERAL unnest(m."assignedLocationIds") AS a("locationId")
  JOIN "locations" l
    ON l."id" = a."locationId"
   AND l."gymId" = m."gymId"
  WHERE m."role" <> 'MEMBER'
) x
ON CONFLICT ("staffId", "locationId") DO NOTHING;

-- ---------------------------------------------------------------------------
--    Report what could not be carried. A non-zero count means some branch's roster
--    has quietly been wrong for as long as the id has been stale, and an operator
--    should know rather than discover it from an empty page.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  unresolved BIGINT;
  on_members BIGINT;
BEGIN
  SELECT count(*) INTO unresolved
  FROM "gym_members" m
  CROSS JOIN LATERAL unnest(m."assignedLocationIds") AS a("locationId")
  WHERE m."role" <> 'MEMBER'
    AND NOT EXISTS (
      SELECT 1 FROM "locations" l
      WHERE l."id" = a."locationId"
        AND l."gymId" = m."gymId"
    );

  SELECT count(*) INTO on_members
  FROM "gym_members" m
  WHERE m."role" = 'MEMBER'
    AND cardinality(m."assignedLocationIds") > 0;

  IF unresolved > 0 THEN
    RAISE NOTICE
      'location_staff: dropped % staff assignment(s) naming a missing or cross-tenant location; the array column keeps them for inspection',
      unresolved;
  END IF;

  IF on_members > 0 THEN
    RAISE NOTICE
      'location_staff: skipped % MEMBER-role row(s) carrying work assignments; a customer is not on the work roster',
      on_members;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Give every live employee who ended up with NO assignment one on their gym's
--    default branch.
--
--    **This is the step that decides whether Stage 6 ships working or ships
--    empty.** `assignedLocationIds` defaults to `[]` and almost nothing ever wrote
--    it, so carrying across only what the array held would leave most employees
--    assigned nowhere. "Who works at branch X" would then answer nobody, at every
--    branch — the exact `returns "nobody came here"` failure Stage 3 named — and
--    it would cascade: a `Service` is bookable where its staff is rostered, so
--    every service would vanish from every branch too, and a `Trainer` reaches a
--    branch only through their staff row.
--
--    So the same stance Stage 4 took with stock: put it all on the default branch
--    and say so loudly, because the true split is not derivable from anything we
--    hold and any "smart" split would be invented. The alternative is not a more
--    honest state, it is a blank product.
--
--    Live employees only. Soft-deleted rows get nothing synthesised (step 2 kept
--    whatever they explicitly had), and `MEMBER` rows get nothing at all.
--
--    `NOT EXISTS` makes this re-runnable and, more importantly, non-destructive
--    after the fact: once an operator has assigned somebody to the satellite, a
--    re-run never drags them back onto the default.
-- ---------------------------------------------------------------------------
INSERT INTO "location_staff" ("id", "gymId", "staffId", "locationId", "createdAt")
SELECT
  gen_random_uuid()::text,
  m."gymId",
  m."id",
  d."id",
  NOW()
FROM "gym_members" m
JOIN "locations" d
  ON d."gymId" = m."gymId"
 AND d."isDefault"
WHERE m."role" <> 'MEMBER'
  AND m."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "location_staff" ls WHERE ls."staffId" = m."id"
  )
ON CONFLICT ("staffId", "locationId") DO NOTHING;

-- ---------------------------------------------------------------------------
--    ⚠️ Name the gyms whose roster is now provably a placeholder, in the deploy
--    log — the same warning Stage 4 raised over misplaced stock, and it needs the
--    same manual follow-up: a roster review per branch.
--
--    Single-branch gyms are silent: the default branch is the only branch, so
--    nothing was guessed.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  row_ RECORD;
BEGIN
  FOR row_ IN
    SELECT
      g."slug"     AS gym_slug,
      d."name"     AS branch_name,
      count(*)     AS synthesised
    FROM "location_staff" ls
    JOIN "gym_members" m ON m."id" = ls."staffId"
    JOIN "gyms" g        ON g."id" = ls."gymId"
    JOIN "locations" d   ON d."id" = ls."locationId" AND d."isDefault"
    -- A synthesised row is one where the person never NAMED this branch — either
    -- their array was empty, or everything in it was dropped as stale or
    -- cross-tenant. Somebody who explicitly listed the default branch is not a
    -- guess and is not warned about.
    WHERE NOT (ls."locationId" = ANY (m."assignedLocationIds"))
      -- Only while the default is still their ONLY branch: once somebody has been
      -- rostered somewhere real, the guess has been reviewed and the warning stops.
      AND NOT EXISTS (
        SELECT 1 FROM "location_staff" other
        WHERE other."staffId" = ls."staffId"
          AND other."locationId" <> ls."locationId"
      )
      AND (SELECT count(*) FROM "locations" l2 WHERE l2."gymId" = ls."gymId") > 1
    GROUP BY g."slug", d."name"
  LOOP
    RAISE WARNING
      'location_staff: gym % has % employee(s) rostered onto "%" only, because no work assignment was ever recorded. The real split is not derivable — review the roster per branch.',
      row_.gym_slug, row_.synthesised, row_.branch_name;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. `trainers`: replace the bare tenant index with a composite. No column.
--
--    `(gymId)` is a strict PREFIX of `(gymId, status, name)`, so this supersedes it
--    outright rather than adding to it — the Stage 0 `class_templates_locationId_idx`
--    shape, not the Stage 3 "both earn their keep" one. Every trainer roster read
--    is `WHERE gymId = ? AND status = ? ORDER BY name`
--    (`admin-trainers.service.ts`, `trainers.service.ts`), so the composite serves
--    the filter and returns the page already sorted.
--
--    It matters more now than before: with no `locationId` of its own, "coaches at
--    branch X" is a hop through `location_staff`, and this table becomes the side
--    being probed. The schema carries the argument for why there is no column.
-- ---------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trainers_gymId_status_name_idx" ON "trainers"("gymId", "status", "name");

-- DropIndex
DROP INDEX IF EXISTS "trainers_gymId_idx";

-- ---------------------------------------------------------------------------
-- 5. `pt_sessions.locationId` — the column three gym-wide exemptions were waiting
--    on.
--
--    Backfilled to the gym's default branch, every row however old, on the Stage 3
--    reasoning: a PT session HAPPENED, and leaving the archive NULL would make
--    "coaching delivered at this branch last year" answer zero rather than an
--    estimate.
--
--    **The tempting backfill is the trainer's base branch, and it is refused.**
--    Two reasons, and the second is decisive. First, the attribution rule: a figure
--    about a PLACE is not attributed by a person's home branch — a coach based at
--    the flagship who covers a Tuesday at the satellite delivered that hour at the
--    satellite, and hopping through the person is how utilisation stops
--    reconciling with occupancy. Second, `gym_members.locationId` on a staff row is
--    itself a Stage 2 backfill artefact pointing the whole payroll at the default
--    branch, so the hop would produce the default branch anyway — wearing a
--    derivation's clothes, which a future reader would mistake for a recorded fact.
--    Writing the default plainly is the same answer without the disguise.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "pt_sessions" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

UPDATE "pt_sessions" s
SET "locationId" = d."id"
FROM "locations" d
WHERE d."gymId" = s."gymId"
  AND d."isDefault"
  AND s."locationId" IS NULL;

-- CreateIndex
--   One branch's PT calendar, in time order. ADDS to `(gymId, trainerId, startsAt)`:
--   that one answers a single coach's diary, its second column is `trainerId`, and
--   neither composite is a prefix of the other.
CREATE INDEX IF NOT EXISTS "pt_sessions_gymId_locationId_startsAt_idx" ON "pt_sessions"("gymId", "locationId", "startsAt");

-- AddForeignKey
--   SET NULL, never CASCADE: closing a branch must not erase the coaching it
--   hosted. By this point every value is NULL or a live location of the same gym,
--   so this cannot fail.
DO $$
BEGIN
  ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. `service_sessions.locationId` — same treatment, and NOT on the roadmap's
--    Stage 6 list.
--
--    The roadmap named `Trainer`, `Service` and `PtSession`. The honest reading of
--    "a service booking happens at exactly one place" points at THIS model rather
--    than at the catalogue, and the PT calendar renders `pt_sessions` and
--    `service_sessions` side by side. Give one a branch and not the other and a
--    branch-filtered calendar is assembled from two populations — the same defect
--    the exemption register already records against the trainer-performance report,
--    which adds a filterable class column to an unfilterable PT one and ranks by
--    the sum. Adding a nullable column with an index breaks nothing; leaving it out
--    ships a half-filter.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "service_sessions" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

UPDATE "service_sessions" s
SET "locationId" = d."id"
FROM "locations" d
WHERE d."gymId" = s."gymId"
  AND d."isDefault"
  AND s."locationId" IS NULL;

-- CreateIndex
--   ADDS to `(gymId, startsAt)` for the reason Stage 3 kept
--   `check_ins_gymId_checkedInAt_idx`: `locationId` sits between the two columns
--   the all-branches calendar uses, so neither is a prefix of the other, and "All
--   locations" is the console's default state.
CREATE INDEX IF NOT EXISTS "service_sessions_gymId_locationId_startsAt_idx" ON "service_sessions"("gymId", "locationId", "startsAt");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- 7. `shift_slots.location` (free text) becomes `shift_slots.locationId` (an FK).
--
--    The trap the roadmap flagged: a column that LOOKS like a branch and is not
--    one. Staff typed a name into a `varchar` (`z.string().trim().max(120)`);
--    nothing constrained it to a real location, nothing followed a rename, nothing
--    stopped two spellings of one site, and no query could join it to anything.
--
--    **Matching rule.** Case- and whitespace-insensitively, because a difference in
--    either is a typo and not a different branch. Restricted to locations of the
--    SAME GYM: a string matching a branch of ANOTHER gym must not be adopted, for
--    the reason Stage 3 had to catch the same class on `check_ins.locationId` — a
--    foreign key would accept it, because that location really does exist. Branch
--    status is not consulted: a shift at a now-INACTIVE branch of this gym was
--    still worked at a real branch of this gym.
--
--    **Ambiguity refuses to guess.** Nothing stops a gym having two branches whose
--    trimmed, lower-cased names collide, so the adoption requires EXACTLY ONE
--    match. Two matches leaves the row unresolved, which is the only truthful
--    outcome — picking the older or the first would be a coin toss recorded as a
--    fact.
--
--    **The unmatched string is KEPT, and the matched one is CLEARED.** Both halves
--    are deliberate:
--      - matched → the FK carries the answer, so the text is set to NULL. Keeping
--        both would let a later rename leave a stale name sitting beside a correct
--        id, which is the drift this column is being removed for.
--      - unmatched → the FK stays NULL and the text SURVIVES. It is the only
--        evidence of where that shift was; deleting it to tidy the column would
--        destroy information no backfill can reconstruct. The console can render it
--        as an unresolved label and ask somebody to pick a branch.
--    After this migration `shift_slots.location IS NOT NULL` means exactly: this
--    string named no branch of this gym.
--
--    **No default-branch backfill — the one place Stage 6 breaks with Stages 0–5,
--    on purpose.** Those stages backfilled orders, members, arrivals, stock and
--    money onto the default because each is a record of something that HAPPENED:
--    the attribution is lossy but a real event stays in the totals. A shift is a
--    PLAN. Writing a branch onto one asserts that a named person will be standing
--    at a named door, and the rota UI and "who is working now" will then act on it.
--    A wrong past attribution makes a report imprecise; a wrong plan staffs the
--    wrong site. So an unresolvable shift stays branchless and visible.
--
--    Note the Prisma-side rename with no SQL: the model now calls this column
--    `locationName` via `@map("location")`, so that `location` means "the branch"
--    on this model as it does on every other. No data moves.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "shift_slots" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

UPDATE "shift_slots" s
SET "locationId" = (
  SELECT l."id"
  FROM "locations" l
  WHERE l."gymId" = s."gymId"
    AND lower(btrim(l."name")) = lower(btrim(s."location"))
)
WHERE s."location" IS NOT NULL
  AND btrim(s."location") <> ''
  AND s."locationId" IS NULL
  -- Exactly one branch of THIS GYM answers to this name, or the row is left
  -- unresolved. The guard is what makes the scalar subquery above safe: Postgres
  -- evaluates SET only for rows that pass WHERE, so it can never see two rows.
  AND (
    SELECT count(*)
    FROM "locations" l2
    WHERE l2."gymId" = s."gymId"
      AND lower(btrim(l2."name")) = lower(btrim(s."location"))
  ) = 1;

-- Resolved rows drop the free text; unresolved rows keep it. A blank-but-present
-- string carries nothing and goes with the resolved ones.
UPDATE "shift_slots"
SET "location" = NULL
WHERE "location" IS NOT NULL
  AND ("locationId" IS NOT NULL OR btrim("location") = '');

-- ---------------------------------------------------------------------------
--    Report the residual. Every row still holding a string is one somebody has to
--    look at; the count is the size of that queue.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  resolved   BIGINT;
  unresolved BIGINT;
BEGIN
  SELECT count(*) INTO resolved FROM "shift_slots" WHERE "locationId" IS NOT NULL;
  SELECT count(*) INTO unresolved FROM "shift_slots" WHERE "location" IS NOT NULL;

  IF resolved > 0 THEN
    RAISE NOTICE 'shift_slots: % shift(s) resolved from a typed name to a real branch', resolved;
  END IF;

  IF unresolved > 0 THEN
    RAISE WARNING
      'shift_slots: % shift(s) name a branch this gym does not have (typo, room, closed site, or another gym''s branch). Left branchless with the original text intact — a shift is a plan, and defaulting it would staff the wrong door.',
      unresolved;
  END IF;
END
$$;

-- CreateIndex
--   "Who is working at branch X on day D". `dayOfWeek` trails because the rota is
--   recurring and carries no dates, so the day is the only time key there is. ADDS
--   to `(gymId, staffId, dayOfWeek)`, which answers one person's weekly grid;
--   neither is a prefix of the other.
CREATE INDEX IF NOT EXISTS "shift_slots_gymId_locationId_dayOfWeek_idx" ON "shift_slots"("gymId", "locationId", "dayOfWeek");

-- AddForeignKey
--   SET NULL: closing a branch un-places its rota rather than deleting the record
--   of who was rostered. By this point every value is NULL or a live location of
--   the same gym, so this cannot fail.
DO $$
BEGIN
  ALTER TABLE "shift_slots" ADD CONSTRAINT "shift_slots_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;
