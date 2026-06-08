-- T8.4 — freeze / pause flow with policy.
--
-- Adds the per-plan freeze allowance and the per-subscription freeze bookkeeping
-- the pause flow needs:
--   • subscription_plans.freezeDaysPerPeriod — the policy cap: the most days a
--     member may freeze a subscription on this plan within one billing period
--     (0 disables freezing). Defaults to 30.
--   • subscriptions.frozenAt / frozenUntil — the active hold's start and scheduled
--     auto-resume; both null whenever the subscription is not FROZEN.
--   • subscriptions.freezeDaysUsed — cumulative days committed to freezes in the
--     current period, checked against the plan allowance; resets on renewal.
ALTER TABLE "subscription_plans"
    ADD COLUMN "freezeDaysPerPeriod" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "subscriptions"
    ADD COLUMN "frozenAt" TIMESTAMP(3),
    ADD COLUMN "frozenUntil" TIMESTAMP(3),
    ADD COLUMN "freezeDaysUsed" INTEGER NOT NULL DEFAULT 0;
