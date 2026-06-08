-- T8.3 — add the FROZEN state to the subscription lifecycle.
--
-- A frozen subscription is a deliberately paused membership (a member- or
-- staff-requested hold) that still occupies the member's single live slot but
-- grants no access until resumed. Postgres forbids using a freshly added enum
-- value in the SAME transaction that adds it, so widening the live-uniqueness
-- index to include FROZEN is split into the next migration.
ALTER TYPE "SubscriptionStatus" ADD VALUE 'FROZEN';
