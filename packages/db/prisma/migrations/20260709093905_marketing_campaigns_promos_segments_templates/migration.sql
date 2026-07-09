-- CreateEnum
CREATE TYPE "MarketingChannel" AS ENUM ('email', 'sms', 'push');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'scheduled', 'sent', 'paused', 'active');

-- CreateEnum
CREATE TYPE "CampaignScheduleType" AS ENUM ('now', 'scheduled');

-- CreateEnum
CREATE TYPE "PromoDiscountType" AS ENUM ('percentage', 'fixed');

-- CreateEnum
CREATE TYPE "PromoStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "MarketingChannel" NOT NULL,
    "audienceSegmentId" TEXT,
    "inlineCriteria" JSONB,
    "subject" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "scheduleType" "CampaignScheduleType" NOT NULL DEFAULT 'now',
    "scheduledAt" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "audienceSize" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "discountType" "PromoDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "minPurchase" INTEGER,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiryDate" TIMESTAMP(3),
    "status" "PromoStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_segments" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audience_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "MarketingChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_gymId_createdAt_idx" ON "campaigns"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "campaigns_gymId_status_idx" ON "campaigns"("gymId", "status");

-- CreateIndex
CREATE INDEX "campaigns_audienceSegmentId_idx" ON "campaigns"("audienceSegmentId");

-- CreateIndex
CREATE INDEX "promo_codes_gymId_createdAt_idx" ON "promo_codes"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "promo_codes_gymId_status_idx" ON "promo_codes"("gymId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_gymId_code_key" ON "promo_codes"("gymId", "code");

-- CreateIndex
CREATE INDEX "audience_segments_gymId_createdAt_idx" ON "audience_segments"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "message_templates_gymId_createdAt_idx" ON "message_templates"("gymId", "createdAt");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_audienceSegmentId_fkey" FOREIGN KEY ("audienceSegmentId") REFERENCES "audience_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
