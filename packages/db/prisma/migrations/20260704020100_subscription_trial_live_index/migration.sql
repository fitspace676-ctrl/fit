-- T5.6 — widen the live-subscription uniqueness invariant to include TRIAL.
--
-- A member may hold at most ONE live subscription per gym. A trialing membership
-- still occupies that slot — a member on a free trial must let it convert, or
-- cancel, before enrolling again — so TRIAL joins ACTIVE / PAST_DUE / FROZEN in the
-- partial unique predicate. Runs in its own migration because the 'TRIAL' enum
-- value (added in 20260704020000) must be committed before it can appear in this
-- index's WHERE clause. The live set mirrors `LIVE_SUBSCRIPTION_STATUSES` in the
-- state machine.
DROP INDEX "subscriptions_gymId_memberId_live_key";

CREATE UNIQUE INDEX "subscriptions_gymId_memberId_live_key"
    ON "subscriptions"("gymId", "memberId")
    WHERE "status" IN ('ACTIVE', 'PAST_DUE', 'FROZEN', 'TRIAL');
