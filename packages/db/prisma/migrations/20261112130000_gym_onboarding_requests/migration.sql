ALTER TABLE "gym_onboardings"
  ADD COLUMN "gymName" TEXT,
  ADD COLUMN "subdomainSlug" TEXT,
  ADD COLUMN "ownerEmail" TEXT,
  ADD COLUMN "ownerName" TEXT,
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "draft" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "codeHash" TEXT,
  ADD COLUMN "codeExpiresAt" TIMESTAMP(3),
  ADD COLUMN "codeAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "codeSentAt" TIMESTAMP(3),
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedByUserId" TEXT,
  ADD COLUMN "rejectionReason" TEXT;

UPDATE "gym_onboardings" o SET
  "gymName" = g."name", "subdomainSlug" = g."slug",
  "ownerEmail" = COALESCE(u."email", ''), "ownerName" = u."name",
  "approvedAt" = COALESCE(o."completedAt", o."createdAt")
FROM "gyms" g LEFT JOIN "users" u ON u."id" = g."ownerId"
WHERE o."gymId" = g."id";

ALTER TABLE "gym_onboardings"
  ALTER COLUMN "gymName" SET NOT NULL,
  ALTER COLUMN "subdomainSlug" SET NOT NULL,
  ALTER COLUMN "ownerEmail" SET NOT NULL,
  ALTER COLUMN "gymId" DROP NOT NULL;
CREATE UNIQUE INDEX "gym_onboardings_subdomainSlug_key" ON "gym_onboardings"("subdomainSlug");
