-- T5.6 — Free-trial support.
--
-- Adds the TRIAL lifecycle state and the per-plan trial length. A member enrolling
-- on a plan with `trialDays > 0` starts in TRIAL (entitled, uncharged) until the
-- trial-end period boundary, when the recurring-billing job charges the first
-- renewal and auto-converts the subscription to ACTIVE (or PAST_DUE on failure).
--
-- Postgres forbids USING a freshly added enum value in the same transaction that
-- adds it, so widening the live-uniqueness index to include TRIAL is split into the
-- next migration (mirrors how FROZEN was added). The `trialDays` column does not
-- reference the new value, so it is safe to add here alongside it.
ALTER TYPE "SubscriptionStatus" ADD VALUE 'TRIAL';

ALTER TABLE "subscription_plans" ADD COLUMN "trialDays" INTEGER NOT NULL DEFAULT 0;
