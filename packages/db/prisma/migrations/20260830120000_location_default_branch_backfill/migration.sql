-- Stage 0 of multi-branch: every gym gets a DEFAULT branch, and every
-- unattributed row is backfilled onto it.
--
-- `locationId` is nullable on `class_templates`, `class_instances`, `orders` and
-- `leads`, and most rows are null. Once the console's location switcher becomes
-- a real filter, a null row would silently vanish from every per-branch view and
-- the branch totals would stop reconciling with the gym total. The chosen policy
-- is expand/contract: backfill the nulls to an elected default branch now, make
-- the write paths require a branch next, and only then tighten the columns to
-- NOT NULL in a follow-up migration. Nothing here is made NOT NULL.
--
-- Statement order matters and is not Prisma's default draft order: the elected
-- defaults are settled BEFORE the partial unique index that polices them is
-- created, so the index can never be violated mid-flight; and the `locationId`
-- backfill runs after every gym is guaranteed to have a default to point at.

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 1. Elect one default branch per gym that already has branches.
--
--    Oldest ACTIVE branch wins; a gym whose branches are all INACTIVE still gets
--    one (its oldest), because "no default" is not a state anything downstream
--    can cope with. `id` is the final tiebreak so the election is deterministic
--    for two branches created in the same millisecond.
--
--    The NOT EXISTS guard makes the statement re-runnable: a gym that already
--    has a default is left alone rather than gaining a second one.
--
--    `updatedAt` is deliberately NOT touched — this is a system backfill, not an
--    edit somebody made, and every branch showing as "just modified" would be a
--    lie in the console's audit column.
-- ---------------------------------------------------------------------------
WITH elected AS (
  SELECT DISTINCT ON (l."gymId") l."id"
  FROM "locations" l
  WHERE NOT EXISTS (
    SELECT 1 FROM "locations" d
    WHERE d."gymId" = l."gymId" AND d."isDefault"
  )
  ORDER BY l."gymId", (l."status" = 'ACTIVE') DESC, l."createdAt", l."id"
)
UPDATE "locations"
SET "isDefault" = true
WHERE "id" IN (SELECT "id" FROM elected);

-- ---------------------------------------------------------------------------
-- 2. A gym with NO branch at all gets one called 'Main', active and default.
--
--    Ids here are uuids, not the cuids Prisma mints — `cuid()` is generated
--    application-side and has no SQL equivalent, and `gen_random_uuid()::text`
--    is what this repo's earlier data migrations already use (see
--    20260814110000_staff_trainer_link and 20260806160910_dashboard_widgets_...).
--    Harmless: ids are opaque `TEXT` everywhere, nothing parses their shape.
--
--    `updatedAt` has no database default (Prisma's `@updatedAt` is app-side), so
--    it must be supplied explicitly.
-- ---------------------------------------------------------------------------
INSERT INTO "locations" ("id", "gymId", "name", "address", "amenities", "hours", "status", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       g."id",
       'Main',
       '',
       ARRAY[]::TEXT[],
       '{}'::jsonb,
       'ACTIVE',
       true,
       NOW(),
       NOW()
FROM "gyms" g
WHERE NOT EXISTS (SELECT 1 FROM "locations" l WHERE l."gymId" = g."id");

-- ---------------------------------------------------------------------------
-- 3. At most one default per gym, enforced by the database.
--
--    PARTIAL unique index, so it constrains only the `true` rows — a gym may of
--    course have many non-default branches. Prisma's schema language cannot
--    express a partial index, so this constraint exists ONLY here, in SQL; the
--    `isDefault` doc comment in schema.prisma says so, to stop a future reader
--    "fixing" its absence with a `@@unique([gymId, isDefault])` that would forbid
--    a second ordinary branch.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "locations_gymId_default_key"
    ON "locations"("gymId")
    WHERE "isDefault";

-- ---------------------------------------------------------------------------
-- 4. Backfill every unattributed row onto its gym's default branch.
--
--    These are the four tables that carry `locationId` today. `check_ins` also
--    has the column, but it is a dangling scalar with no relation and no write
--    path — it is left alone here and promoted to a real FK in Stage 3.
-- ---------------------------------------------------------------------------
UPDATE "class_templates" t
SET "locationId" = d."id"
FROM "locations" d
WHERE d."gymId" = t."gymId"
  AND d."isDefault"
  AND t."locationId" IS NULL;

UPDATE "class_instances" i
SET "locationId" = d."id"
FROM "locations" d
WHERE d."gymId" = i."gymId"
  AND d."isDefault"
  AND i."locationId" IS NULL;

UPDATE "orders" o
SET "locationId" = d."id"
FROM "locations" d
WHERE d."gymId" = o."gymId"
  AND d."isDefault"
  AND o."locationId" IS NULL;

UPDATE "leads" le
SET "locationId" = d."id"
FROM "locations" d
WHERE d."gymId" = le."gymId"
  AND d."isDefault"
  AND le."locationId" IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Branch-filter indexes.
--
--    Every one leads with `gymId` because the tenant Prisma extension always
--    injects it into the `where` — a bare `locationId` index is a shape no query
--    in this codebase can use, which is why the `class_templates` one is
--    REPLACED rather than kept alongside its composite.
-- ---------------------------------------------------------------------------

-- DropIndex
DROP INDEX "class_templates_locationId_idx";

-- CreateIndex
CREATE INDEX "class_templates_gymId_locationId_idx" ON "class_templates"("gymId", "locationId");

-- CreateIndex
CREATE INDEX "class_instances_gymId_locationId_startsAt_idx" ON "class_instances"("gymId", "locationId", "startsAt");

-- CreateIndex
CREATE INDEX "orders_gymId_locationId_createdAt_idx" ON "orders"("gymId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_gymId_locationId_status_idx" ON "orders"("gymId", "locationId", "status");

-- CreateIndex
CREATE INDEX "leads_gymId_locationId_status_idx" ON "leads"("gymId", "locationId", "status");
