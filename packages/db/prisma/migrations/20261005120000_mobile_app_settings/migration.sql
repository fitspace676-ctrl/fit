ALTER TABLE "gyms"
  ADD COLUMN "mobileAppEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mobileAppFeatures" JSONB NOT NULL DEFAULT '{}';

-- Only the existing white-label demo build has been provisioned.
UPDATE "gyms" SET "mobileAppEnabled" = true WHERE "slug" = 'demo';
