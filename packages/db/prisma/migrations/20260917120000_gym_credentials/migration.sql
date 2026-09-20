-- Per-gym credentials (T1.25).
--
-- One email used to be one password everywhere: `users.passwordHash` answered
-- for every gym the person belonged to, a reset on one gym changed it for all of
-- them, and a second gym could not onboard an address that already existed
-- (`409 EMAIL_TAKEN`). `gym_credentials` holds what a person proves at ONE gym's
-- door — that gym's password, whether the address was verified for that gym, and
-- the name / phone the gym knows them by — one row per (user, gym).
--
-- Additive and idempotent: `users` keeps every column it has (a platform account
-- — super-admin, a bare register — still signs in with them, and the previous
-- build keeps working against this schema). Re-running the backfill is a no-op.
-- Rollback is `DROP TABLE "gym_credentials"`.

-- CreateTable
CREATE TABLE IF NOT EXISTS "gym_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "name" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gym_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "gym_credentials_userId_gymId_key" ON "gym_credentials"("userId", "gymId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "gym_credentials_gymId_idx" ON "gym_credentials"("gymId");

-- AddForeignKey
ALTER TABLE "gym_credentials" DROP CONSTRAINT IF EXISTS "gym_credentials_userId_fkey";
ALTER TABLE "gym_credentials" ADD CONSTRAINT "gym_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_credentials" DROP CONSTRAINT IF EXISTS "gym_credentials_gymId_fkey";
ALTER TABLE "gym_credentials" ADD CONSTRAINT "gym_credentials_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill: every existing membership — any status, trashed ones included, so a
-- restored member can still sign in — gets a credential carrying the password,
-- verification stamp, name and phone the person had on `users` at this moment.
-- From here on the two diverge per gym; this is the last time they agree.
-- ---------------------------------------------------------------------------
INSERT INTO "gym_credentials" ("id", "userId", "gymId", "passwordHash", "emailVerifiedAt", "name", "phone", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       m."userId",
       m."gymId",
       u."passwordHash",
       u."emailVerifiedAt",
       u."name",
       u."phone",
       NOW(),
       NOW()
FROM "gym_members" m
JOIN "users" u ON u."id" = m."userId"
ON CONFLICT ("userId", "gymId") DO NOTHING;
