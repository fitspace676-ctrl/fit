-- T5.5 — Past-due dunning & retries.
--
-- Track how many scheduled retry charges have failed in the current past-due
-- episode, so the billing job can drive the +2/+5/+7-day retry ladder and expire
-- a subscription once the ladder is exhausted. Resets to 0 on a successful renewal.
ALTER TABLE "subscriptions" ADD COLUMN "paymentRetries" INTEGER NOT NULL DEFAULT 0;
