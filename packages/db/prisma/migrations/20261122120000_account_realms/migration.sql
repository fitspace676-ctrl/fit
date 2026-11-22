-- Account realms: staff accounts and member accounts, separate per gym.
--
-- A `users` row used to be one person everywhere: the same row signed in to every
-- gym the address belonged to, and to both the admin console and the member
-- portal of each. From here on every row belongs to exactly ONE realm:
--
--   'platform'          a super-admin, or a bare account with no gym
--   '<gymId>:staff'     one gym's staff account (owner, manager, receptionist, trainer)
--   '<gymId>:member'    one gym's member account
--
-- and holds exactly one `gym_members` row, in its own gym (none for 'platform').
-- The address is unique per realm (`users_email_realm_key`), not globally; the
-- same for the Google and Apple subject ids. The realm format is built and read
-- only by `packages/db/prisma/account-realm.ts`; this file spells it out once in
-- SQL because a migration cannot import it.
--
-- Backfill rules:
--
--   * A user with no membership stays 'platform'.
--   * A super-admin stays 'platform' and keeps its own row (the platform
--     credential `users.passwordHash`, `isSuperAdmin`, its social ids, its
--     tenant-less sessions). EVERY membership it holds moves to a new row of that
--     gym's realm. Today a super-admin signs in to a gym with that gym's own
--     credential and gets that membership's role, exactly what the new row does,
--     while the platform sign-in stays a super-admin session.
--   * Anyone else keeps the row for the membership with the earliest `joinedAt`
--     (ties broken by membership id) and gets that gym's realm; every other
--     membership moves to a new row (new id; same email, name, phone,
--     passwordHash, emailVerifiedAt, tokenVersion, createdAt; no social ids, not
--     a super-admin) of its own gym's realm.
--   * When a membership moves, every row that belongs to that person AT THAT GYM
--     moves with it (listed table by table below). Rows keyed by user with no gym
--     scope stay on the original row.
--
-- Nothing is deleted, no membership is created or dropped: each `gym_members` row
-- keeps its id and only its "userId" may change, so bookings, orders, invoices,
-- subscriptions and everything else hanging off the membership are untouched.
-- The checks at the end abort the whole migration if any invariant fails.
--
-- Runs in one transaction. Not idempotent (the column add fails on a re-run,
-- before anything else is touched).

BEGIN;

-- 1. The column, defaulting every existing row to 'platform'.
ALTER TABLE "users" ADD COLUMN "realm" TEXT NOT NULL DEFAULT 'platform';

-- 2. Swap the unique indexes before any duplicate address can exist. While every
--    row is still 'platform' the composite indexes are exactly as strict as the
--    old ones, and they then guard the backfill below.
DROP INDEX IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "users_googleId_key";
DROP INDEX IF EXISTS "users_appleId_key";
CREATE UNIQUE INDEX "users_email_realm_key" ON "users"("email", "realm");
CREATE UNIQUE INDEX "users_googleId_realm_key" ON "users"("googleId", "realm");
CREATE UNIQUE INDEX "users_appleId_realm_key" ON "users"("appleId", "realm");

-- 3. One line per membership: who owns it now, who will own it, and its realm.
CREATE TEMP TABLE "_realm_split" (
    "memberId"   TEXT PRIMARY KEY,
    "oldUserId"  TEXT NOT NULL,
    "newUserId"  TEXT NOT NULL,
    "gymId"      TEXT NOT NULL,
    "realm"      TEXT NOT NULL,
    "superAdmin" BOOLEAN NOT NULL
) ON COMMIT DROP;

INSERT INTO "_realm_split" ("memberId", "oldUserId", "newUserId", "gymId", "realm", "superAdmin")
SELECT ranked."id",
       ranked."userId",
       CASE
         WHEN ranked."rank" = 1 AND NOT ranked."isSuperAdmin" THEN ranked."userId"
         ELSE 'c' || replace(gen_random_uuid()::text, '-', '')
       END,
       ranked."gymId",
       ranked."gymId" || CASE WHEN ranked."role" = 'MEMBER' THEN ':member' ELSE ':staff' END,
       ranked."isSuperAdmin"
FROM (
    SELECT m."id",
           m."userId",
           m."gymId",
           m."role",
           u."isSuperAdmin",
           ROW_NUMBER() OVER (PARTITION BY m."userId" ORDER BY m."joinedAt", m."id") AS "rank"
    FROM "gym_members" m
    JOIN "users" u ON u."id" = m."userId"
) ranked;

-- 4. Rows that keep their membership take its realm.
UPDATE "users" u
SET "realm" = s."realm"
FROM "_realm_split" s
WHERE s."newUserId" = s."oldUserId"
  AND u."id" = s."oldUserId";

-- 5. One new row per moved membership. Social ids stay on the original row only.
INSERT INTO "users" ("id", "email", "realm", "name", "phone", "passwordHash", "emailVerifiedAt",
                     "googleId", "appleId", "isSuperAdmin", "tokenVersion", "createdAt", "updatedAt")
SELECT s."newUserId", u."email", s."realm", u."name", u."phone", u."passwordHash", u."emailVerifiedAt",
       NULL, NULL, FALSE, u."tokenVersion", u."createdAt", NOW()
FROM "_realm_split" s
JOIN "users" u ON u."id" = s."oldUserId"
WHERE s."newUserId" <> s."oldUserId";

-- 6. Re-point everything that belongs to the person at the moved membership's gym.
--    `moved` is the subset of `_realm_split` whose owner changes.
CREATE TEMP VIEW "_realm_moved" AS
SELECT * FROM "_realm_split" WHERE "newUserId" <> "oldUserId";

-- gym_members (userId, gymId): the membership itself, by its own id.
UPDATE "gym_members" t SET "userId" = s."newUserId"
FROM "_realm_moved" s WHERE t."id" = s."memberId";

-- gym_credentials (userId, gymId): that gym's password, name, phone, verification.
UPDATE "gym_credentials" t SET "userId" = s."newUserId", "updatedAt" = NOW()
FROM "_realm_moved" s WHERE t."userId" = s."oldUserId" AND t."gymId" = s."gymId";

-- refresh_tokens (userId, gymId): sessions pinned to that gym keep working, now as
-- the new account. Tokens with gymId NULL (platform / pre-pin sessions) stay.
UPDATE "refresh_tokens" t SET "userId" = s."newUserId"
FROM "_realm_moved" s WHERE t."userId" = s."oldUserId" AND t."gymId" = s."gymId";

-- carts (userId, gymId)
UPDATE "carts" t SET "userId" = s."newUserId"
FROM "_realm_moved" s WHERE t."userId" = s."oldUserId" AND t."gymId" = s."gymId";

-- notifications (userId, gymId): the inbox of that gym.
UPDATE "notifications" t SET "userId" = s."newUserId"
FROM "_realm_moved" s WHERE t."userId" = s."oldUserId" AND t."gymId" = s."gymId";

-- notification_preferences (userId, gymId)
UPDATE "notification_preferences" t SET "userId" = s."newUserId"
FROM "_realm_moved" s WHERE t."userId" = s."oldUserId" AND t."gymId" = s."gymId";

-- agent_chat_sessions (userId, gymId)
UPDATE "agent_chat_sessions" t SET "userId" = s."newUserId"
FROM "_realm_moved" s WHERE t."userId" = s."oldUserId" AND t."gymId" = s."gymId";

-- leads.assignedToId, opportunities.assignedToId (gymId)
UPDATE "leads" t SET "assignedToId" = s."newUserId"
FROM "_realm_moved" s WHERE t."assignedToId" = s."oldUserId" AND t."gymId" = s."gymId";
UPDATE "opportunities" t SET "assignedToId" = s."newUserId"
FROM "_realm_moved" s WHERE t."assignedToId" = s."oldUserId" AND t."gymId" = s."gymId";

-- crm_activities.staffUserId (gymId)
UPDATE "crm_activities" t SET "staffUserId" = s."newUserId"
FROM "_realm_moved" s WHERE t."staffUserId" = s."oldUserId" AND t."gymId" = s."gymId";

-- automation_rules.createdById, campaigns.createdById (gymId)
UPDATE "automation_rules" t SET "createdById" = s."newUserId"
FROM "_realm_moved" s WHERE t."createdById" = s."oldUserId" AND t."gymId" = s."gymId";
UPDATE "campaigns" t SET "createdById" = s."newUserId"
FROM "_realm_moved" s WHERE t."createdById" = s."oldUserId" AND t."gymId" = s."gymId";

-- booking_blocks.liftedByUserId (gymId)
UPDATE "booking_blocks" t SET "liftedByUserId" = s."newUserId"
FROM "_realm_moved" s WHERE t."liftedByUserId" = s."oldUserId" AND t."gymId" = s."gymId";

-- stock_movements.actorId (gymId; a bare scalar user id)
UPDATE "stock_movements" t SET "actorId" = s."newUserId"
FROM "_realm_moved" s WHERE t."actorId" = s."oldUserId" AND t."gymId" = s."gymId";

-- member_notes.authorId, staff_notes.authorId (gymId; bare scalar user ids)
UPDATE "member_notes" t SET "authorId" = s."newUserId"
FROM "_realm_moved" s WHERE t."authorId" = s."oldUserId" AND t."gymId" = s."gymId";
UPDATE "staff_notes" t SET "authorId" = s."newUserId"
FROM "_realm_moved" s WHERE t."authorId" = s."oldUserId" AND t."gymId" = s."gymId";

-- staff_tasks.assignedById, time_off_requests.decidedById (gymId; bare scalar user ids)
UPDATE "staff_tasks" t SET "assignedById" = s."newUserId"
FROM "_realm_moved" s WHERE t."assignedById" = s."oldUserId" AND t."gymId" = s."gymId";
UPDATE "time_off_requests" t SET "decidedById" = s."newUserId"
FROM "_realm_moved" s WHERE t."decidedById" = s."oldUserId" AND t."gymId" = s."gymId";

-- payment_reversals.actor (gymId; bare scalar user id). processedById there and on
-- refunds is a gym_members id, which does not change.
UPDATE "payment_reversals" t SET "actor" = s."newUserId"
FROM "_realm_moved" s WHERE t."actor" = s."oldUserId" AND t."gymId" = s."gymId";

-- order_status_events.actor (bare scalar user id; gym scope through its order).
UPDATE "order_status_events" t SET "actor" = s."newUserId"
FROM "_realm_moved" s, "orders" o
WHERE t."orderId" = o."id" AND o."gymId" = s."gymId" AND t."actor" = s."oldUserId";

-- gyms.ownerId: the owner is the gym's staff account, so impersonation and owner
-- look-ups land on the account that holds the OWNER membership.
UPDATE "gyms" t SET "ownerId" = s."newUserId"
FROM "_realm_moved" s WHERE t."ownerId" = s."oldUserId" AND t."id" = s."gymId";

-- gyms.createdByUserId: moved only for an owner who provisioned their own gym. A
-- super-admin who provisioned a gym stays its creator on the platform row.
UPDATE "gyms" t SET "createdByUserId" = s."newUserId"
FROM "_realm_moved" s
WHERE t."createdByUserId" = s."oldUserId" AND t."id" = s."gymId" AND NOT s."superAdmin";

-- audit_logs.actorId / targetId (gymId; bare scalar ids): moved for gym staff
-- actions. A super-admin's entries are operator-console actions on the platform
-- identity and stay where they are.
UPDATE "audit_logs" t SET "actorId" = s."newUserId"
FROM "_realm_moved" s
WHERE t."actorId" = s."oldUserId" AND t."gymId" = s."gymId" AND NOT s."superAdmin";
UPDATE "audit_logs" t SET "targetId" = s."newUserId"
FROM "_realm_moved" s
WHERE t."targetId" = s."oldUserId" AND t."gymId" = s."gymId" AND NOT s."superAdmin";

-- Deliberately NOT moved (no gym scope, or not a user of a gym):
--   push_tokens          person-level device tokens: stay on the original row; a
--                        device re-registers for an account when it signs in to it
--   gym_onboardings.*ByUserId, blog_posts.authorId   platform (super-admin) actors
--   refunds.processedById, payment_reversals.processedById, orders.soldById,
--   staff_* / location_staff / services .staffId     gym_members ids, unchanged
--   gym_credentials of a gym where the user holds NO membership (left behind by
--   a removed staff member or a purged member): stay on the original row. No
--   sign-in reads them any more (a password is only checked for the account's
--   own gym), and keeping them loses nothing.

DROP VIEW "_realm_moved";

-- 7. Invariants. Any failure raises and rolls the whole migration back.
DO $$
DECLARE
  bad INTEGER;
BEGIN
  -- No membership lost or duplicated.
  SELECT COUNT(*) INTO bad FROM "_realm_split" s
  LEFT JOIN "gym_members" m ON m."id" = s."memberId" AND m."userId" = s."newUserId"
  WHERE m."id" IS NULL;
  IF bad > 0 THEN RAISE EXCEPTION 'account realms: % memberships not on their new account', bad; END IF;

  -- Every user holds at most one membership.
  SELECT COUNT(*) INTO bad FROM (
    SELECT "userId" FROM "gym_members" GROUP BY "userId" HAVING COUNT(*) > 1
  ) multi;
  IF bad > 0 THEN RAISE EXCEPTION 'account realms: % users still hold several memberships', bad; END IF;

  -- Every membership sits in its user's realm, and the realm names its role.
  SELECT COUNT(*) INTO bad FROM "gym_members" m JOIN "users" u ON u."id" = m."userId"
  WHERE u."realm" <> m."gymId" || CASE WHEN m."role" = 'MEMBER' THEN ':member' ELSE ':staff' END;
  IF bad > 0 THEN RAISE EXCEPTION 'account realms: % memberships outside their realm', bad; END IF;

  -- Every gym-realm user has its membership; platform users have none.
  SELECT COUNT(*) INTO bad FROM "users" u
  WHERE u."realm" <> 'platform'
    AND NOT EXISTS (SELECT 1 FROM "gym_members" m WHERE m."userId" = u."id");
  IF bad > 0 THEN RAISE EXCEPTION 'account realms: % gym accounts without a membership', bad; END IF;

  -- Every moved membership's credential moved with it (none left on the old row).
  SELECT COUNT(*) INTO bad FROM "gym_credentials" c
  JOIN "_realm_split" s ON s."oldUserId" = c."userId" AND s."gymId" = c."gymId"
  WHERE s."newUserId" <> s."oldUserId";
  IF bad > 0 THEN RAISE EXCEPTION 'account realms: % credentials left behind', bad; END IF;

  -- Super-admins stayed on the platform.
  SELECT COUNT(*) INTO bad FROM "users" WHERE "isSuperAdmin" AND "realm" <> 'platform';
  IF bad > 0 THEN RAISE EXCEPTION 'account realms: % super-admins left the platform', bad; END IF;
END $$;

COMMIT;
