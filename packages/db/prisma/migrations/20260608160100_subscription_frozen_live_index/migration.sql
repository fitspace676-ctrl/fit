-- T8.3 — widen the live-subscription uniqueness invariant to include FROZEN.
--
-- A member may hold at most ONE live subscription per gym. With the new FROZEN
-- state, a paused membership still occupies that slot — a frozen member must
-- resume or cancel before enrolling again — so FROZEN joins ACTIVE / PAST_DUE in
-- the partial unique predicate. Runs in its own migration because the 'FROZEN'
-- enum value (added in 20260608160000) must be committed before it can appear in
-- this index's WHERE clause. The live set mirrors `LIVE_SUBSCRIPTION_STATUSES` in
-- the state machine.
DROP INDEX "subscriptions_gymId_memberId_live_key";

CREATE UNIQUE INDEX "subscriptions_gymId_memberId_live_key"
    ON "subscriptions"("gymId", "memberId")
    WHERE "status" IN ('ACTIVE', 'PAST_DUE', 'FROZEN');
