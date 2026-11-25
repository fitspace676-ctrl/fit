-- A membership period becomes `intervalCount` × `interval`, and the unit gains
-- DAY and WEEK: a one-day pass, a week, ten days, three months. Existing plans
-- and subscriptions keep their one month / one year (`intervalCount` 1).
-- `oneTime` marks a plan that is sold once and does not renew.
ALTER TYPE "SubscriptionInterval" ADD VALUE IF NOT EXISTS 'DAY' BEFORE 'MONTH';
ALTER TYPE "SubscriptionInterval" ADD VALUE IF NOT EXISTS 'WEEK' BEFORE 'MONTH';

ALTER TABLE "subscription_plans"
  ADD COLUMN "intervalCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "oneTime" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "subscriptions"
  ADD COLUMN "intervalCount" INTEGER NOT NULL DEFAULT 1;
