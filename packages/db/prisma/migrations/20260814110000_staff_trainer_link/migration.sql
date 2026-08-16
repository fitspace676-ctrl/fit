-- Staff ⇄ Trainer link.
--
-- A coach used to exist twice with no connection between the halves: as a
-- `TRAINER`-role `gym_members` row (the person on the staff roster) and as a
-- `trainers` row (the profile classes are actually assigned to). Staff added
-- through the console never got a coach profile, so they could not be picked as a
-- class trainer; coaches created for the schedule never appeared on the staff
-- roster. This makes the two one record with two faces.

-- AlterTable
ALTER TABLE "trainers" ADD COLUMN     "staffId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "trainers_staffId_key" ON "trainers"("staffId");

-- AddForeignKey
-- SET NULL, not CASCADE: class templates, occurrences, PT sessions and reviews
-- all reference `trainers`, so removing someone from the staff directory must
-- never delete the gym's teaching history. The staff service deactivates the
-- orphaned profile instead.
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "gym_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill, both directions, so existing gyms open on a roster that already
-- agrees with itself rather than on two half-populated lists.
-- ---------------------------------------------------------------------------

-- 1. Every coach profile without a staff record gets one: a login-less directory
--    staff member, exactly what `POST /staff` creates when no email is given
--    (null passwordHash + a unique placeholder address on the no-login host, which
--    the API blanks back to '' on the wire). The name is split on the first space,
--    matching how the roster renders First/Last.
WITH orphan AS (
  SELECT t."id" AS trainer_id,
         t."gymId" AS gym_id,
         NULLIF(TRIM(t."name"), '') AS full_name,
         gen_random_uuid()::text AS user_id,
         gen_random_uuid()::text AS member_id
  FROM "trainers" t
  WHERE t."staffId" IS NULL
),
new_user AS (
  INSERT INTO "users" ("id", "email", "name", "createdAt", "updatedAt")
  SELECT o.user_id,
         'staff-' || o.user_id || '@no-login.fit.local',
         o.full_name,
         NOW(),
         NOW()
  FROM orphan o
  RETURNING "id"
),
new_member AS (
  INSERT INTO "gym_members" ("id", "userId", "gymId", "role", "status", "joinedAt", "firstName", "lastName")
  SELECT o.member_id,
         o.user_id,
         o.gym_id,
         'TRAINER',
         'ACTIVE',
         NOW(),
         COALESCE(NULLIF(SPLIT_PART(o.full_name, ' ', 1), ''), 'Trainer'),
         -- A single-word name has no surname: POSITION() returns 0 for "no space",
         -- and SUBSTRING FROM 1 would otherwise copy the whole name into lastName.
         CASE
           WHEN POSITION(' ' IN o.full_name) > 0
             THEN NULLIF(TRIM(SUBSTRING(o.full_name FROM POSITION(' ' IN o.full_name) + 1)), '')
           ELSE NULL
         END
  FROM orphan o
  WHERE EXISTS (SELECT 1 FROM new_user u WHERE u."id" = o.user_id)
  RETURNING "id"
)
UPDATE "trainers" t
SET "staffId" = o.member_id
FROM orphan o
WHERE t."id" = o.trainer_id
  AND EXISTS (SELECT 1 FROM new_member m WHERE m."id" = o.member_id);

-- 2. Every `TRAINER`-role staff member without a coach profile gets one, so they
--    become selectable as a class/PT trainer. Name falls back through the split
--    directory name → the user's single `name` → 'Trainer', because `name` is
--    NOT NULL on `trainers`.
INSERT INTO "trainers" ("id", "gymId", "name", "headline", "bio", "specialties", "availability", "status", "rating", "reviewCount", "staffId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       m."gymId",
       COALESCE(
         NULLIF(TRIM(CONCAT_WS(' ', m."firstName", m."lastName")), ''),
         NULLIF(TRIM(u."name"), ''),
         'Trainer'
       ),
       '',
       '',
       ARRAY[]::text[],
       '{}'::jsonb,
       'ACTIVE',
       0,
       0,
       m."id",
       NOW(),
       NOW()
FROM "gym_members" m
JOIN "users" u ON u."id" = m."userId"
WHERE m."role" = 'TRAINER'
  AND m."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "trainers" t WHERE t."staffId" = m."id");
