-- CreateEnum
CREATE TYPE "LoyaltyReason" AS ENUM ('check_in', 'purchase', 'manual', 'redemption', 'signup');

-- CreateEnum
CREATE TYPE "LoyaltyRewardType" AS ENUM ('pt_session', 'day_pass', 'guest_pass', 'merchandise', 'drink', 'discount', 'other');

-- CreateEnum
CREATE TYPE "LoyaltyRedemptionStatus" AS ENUM ('pending', 'fulfilled', 'cancelled');

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "pointsPerCheckIn" INTEGER NOT NULL DEFAULT 0,
    "pointsPerCurrencyUnit" INTEGER NOT NULL DEFAULT 0,
    "signupBonus" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_ledger_entries" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "LoyaltyReason" NOT NULL,
    "refId" TEXT,
    "balanceAfter" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_rewards" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "pointsCost" INTEGER NOT NULL,
    "type" "LoyaltyRewardType" NOT NULL DEFAULT 'other',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stock" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_redemptions" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "rewardId" TEXT,
    "rewardName" TEXT NOT NULL,
    "rewardType" "LoyaltyRewardType" NOT NULL,
    "pointsSpent" INTEGER NOT NULL,
    "status" "LoyaltyRedemptionStatus" NOT NULL DEFAULT 'fulfilled',
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_programs_gymId_key" ON "loyalty_programs"("gymId");

-- CreateIndex
CREATE INDEX "loyalty_ledger_entries_gymId_createdAt_idx" ON "loyalty_ledger_entries"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_ledger_entries_gymId_memberId_createdAt_idx" ON "loyalty_ledger_entries"("gymId", "memberId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_ledger_entries_gymId_reason_idx" ON "loyalty_ledger_entries"("gymId", "reason");

-- CreateIndex
CREATE INDEX "loyalty_rewards_gymId_createdAt_idx" ON "loyalty_rewards"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_rewards_gymId_active_idx" ON "loyalty_rewards"("gymId", "active");

-- CreateIndex
CREATE INDEX "loyalty_redemptions_gymId_redeemedAt_idx" ON "loyalty_redemptions"("gymId", "redeemedAt");

-- CreateIndex
CREATE INDEX "loyalty_redemptions_gymId_memberId_redeemedAt_idx" ON "loyalty_redemptions"("gymId", "memberId", "redeemedAt");

-- CreateIndex
CREATE INDEX "loyalty_redemptions_gymId_rewardType_idx" ON "loyalty_redemptions"("gymId", "rewardType");

-- CreateIndex
CREATE INDEX "loyalty_redemptions_rewardId_idx" ON "loyalty_redemptions"("rewardId");

-- AddForeignKey
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "loyalty_rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
