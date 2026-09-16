-- The contract step of multi-branch for the two columns that can take it:
-- `class_templates.locationId` and `check_ins.locationId` become NOT NULL.
--
-- Stage 0 (20260830120000_location_default_branch_backfill) and Stage 3
-- (20260831120000_check_in_location_branch) were the expand half — backfill every
-- NULL onto the gym's default branch, and leave the column nullable until every
-- write path requires a branch. Both write paths now do: a class template is
-- created with a branch, and `CheckInService.recordCheckIn` resolves an unstated
-- branch to the gym's default rather than writing NULL.
--
-- Only these two. Every other `locationId` stays nullable ON PURPOSE, because NULL
-- is a permanent, meaningful value there rather than a gap waiting for a backfill:
-- orders/payments/refunds placed from the member app with no desk, invoices whose
-- member was purged, PT/service sessions with an ambiguous roster, stock movements,
-- class instances, shift slots.
--
-- Statement order is deliberate: the backfill runs again first, so a NULL written
-- by an older build between the expand deploy and this one cannot fail the
-- `SET NOT NULL` and leave the release half-applied. Every step is re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Make sure every gym that has a branch has a default to point at.
--
--    Stage 0 already guaranteed this, and the partial unique index
--    `locations_gymId_default_key` keeps it at most one. It is repeated here only
--    so this migration does not depend on nobody having cleared a flag by hand
--    since. Same election as Stage 0 — oldest ACTIVE branch, an INACTIVE one only
--    when the gym has nothing else — and the NOT EXISTS guard leaves a gym that
--    already has a default alone. `updatedAt` is not touched: a system backfill,
--    not an edit.
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
-- 2. A gym with NULL rows and no branch at all gets a 'Main' one.
--
--    Narrower than Stage 0's equivalent on purpose: only a gym that actually has a
--    NULL template or check-in needs a branch for this migration to succeed, so a
--    branch-less gym with nothing to attribute is left exactly as it is. Ids are
--    uuids for the same reason as Stage 0 — `cuid()` is application-side.
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
WHERE NOT EXISTS (SELECT 1 FROM "locations" l WHERE l."gymId" = g."id")
  AND (
    EXISTS (SELECT 1 FROM "class_templates" t WHERE t."gymId" = g."id" AND t."locationId" IS NULL)
    OR EXISTS (SELECT 1 FROM "check_ins" c WHERE c."gymId" = g."id" AND c."locationId" IS NULL)
  );

-- ---------------------------------------------------------------------------
-- 3. Backfill any NULL that slipped in since the expand deploy.
--
--    Expected to touch nothing. The join on `d."gymId"` keeps attribution inside
--    the tenant; `IS NULL` never drags a row that names a branch back to the
--    default. The NOTICE makes a non-zero count visible in the deploy log, because
--    it means an older build was still writing branch-less rows.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  templates BIGINT;
  arrivals  BIGINT;
BEGIN
  WITH fixed AS (
    UPDATE "class_templates" t
    SET "locationId" = d."id"
    FROM "locations" d
    WHERE d."gymId" = t."gymId"
      AND d."isDefault"
      AND t."locationId" IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO templates FROM fixed;

  WITH fixed AS (
    UPDATE "check_ins" c
    SET "locationId" = d."id"
    FROM "locations" d
    WHERE d."gymId" = c."gymId"
      AND d."isDefault"
      AND c."locationId" IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO arrivals FROM fixed;

  IF templates > 0 OR arrivals > 0 THEN
    RAISE NOTICE
      'late NULL backfill onto the default branch: % class_templates, % check_ins',
      templates, arrivals;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Tighten. `SET NOT NULL` on a column that already is one is a no-op, so this
--    is re-runnable as written. By this point nothing NULL is left to reject.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "class_templates" ALTER COLUMN "locationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "check_ins" ALTER COLUMN "locationId" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. ON DELETE SET NULL → RESTRICT on both foreign keys.
--
--    SET NULL cannot stand on a required column: deleting a branch would fail with
--    a NOT NULL violation instead of a foreign-key one. RESTRICT says the real
--    rule — a branch with a schedule or with arrivals is not hard-deleted, it is
--    retired to INACTIVE, which is the only thing the API does to a branch anyway.
--    Deleting a whole gym still cascades: its templates and check-ins go through
--    their own `gymId` cascade in the same statement, before the check runs.
--
--    Dropped and re-added under the exact names Prisma expects, so the migration
--    history and schema.prisma do not drift.
-- ---------------------------------------------------------------------------

-- DropForeignKey
ALTER TABLE "class_templates" DROP CONSTRAINT IF EXISTS "class_templates_locationId_fkey";

-- DropForeignKey
ALTER TABLE "check_ins" DROP CONSTRAINT IF EXISTS "check_ins_locationId_fkey";

-- AddForeignKey
ALTER TABLE "class_templates" ADD CONSTRAINT "class_templates_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
