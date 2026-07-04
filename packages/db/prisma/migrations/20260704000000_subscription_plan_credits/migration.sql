-- Class-credit allowance a subscription plan grants each billing period (T5.2).
-- `0` = unlimited classes (the recurring-membership default); a finite value is
-- the per-period class cap surfaced on the billing-plans board and plan card.
ALTER TABLE "subscription_plans" ADD COLUMN "includedCredits" INTEGER NOT NULL DEFAULT 0;
