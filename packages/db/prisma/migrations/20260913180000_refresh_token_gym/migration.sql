-- Pin a refresh token to the gym its session was issued for.
--
-- Until now a refresh re-scoped every session to the user's primary gym, so a
-- member signed in on one gym's subdomain was silently moved to another after the
-- first refresh. `gymId` records the session's gym so the refresh can stay there
-- (and refuse, rather than move, once that membership is gone).
--
-- Nullable and without a backfill: existing rows keep the old primary-gym
-- behaviour until they rotate, and a platform session has no gym. No foreign key —
-- the refresh path treats a gym that no longer exists as an invalid token.

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "gymId" TEXT;

-- CreateIndex
CREATE INDEX "refresh_tokens_gymId_idx" ON "refresh_tokens"("gymId");
