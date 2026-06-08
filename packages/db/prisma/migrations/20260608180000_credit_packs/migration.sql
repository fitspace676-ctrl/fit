-- CreateEnum
CREATE TYPE "CreditPackStatus" AS ENUM ('ACTIVE', 'EXPIRED');

-- AlterTable: a finite-sessionCount package plan doubles as a credit-pack catalogue
-- entry; creditValidityDays is the purchased pack's lifetime (null = never expires).
ALTER TABLE "package_plans" ADD COLUMN "creditValidityDays" INTEGER;

-- AlterTable: which credit pack a booking drew its seat credit from (null when the
-- seat was subscription-covered or predates credit packs), for a refund on cancel.
ALTER TABLE "bookings" ADD COLUMN "creditPackId" TEXT;

-- CreateTable
CREATE TABLE "credit_packs" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "planId" TEXT,
    "orderId" TEXT,
    "name" TEXT NOT NULL,
    "totalCredits" INTEGER NOT NULL,
    "remainingCredits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" "CreditPackStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_packs_orderId_key" ON "credit_packs"("orderId");

-- CreateIndex
CREATE INDEX "credit_packs_gymId_idx" ON "credit_packs"("gymId");

-- CreateIndex
CREATE INDEX "credit_packs_memberId_idx" ON "credit_packs"("memberId");

-- CreateIndex
CREATE INDEX "credit_packs_gymId_memberId_status_idx" ON "credit_packs"("gymId", "memberId", "status");

-- CreateIndex
CREATE INDEX "credit_packs_gymId_expiresAt_idx" ON "credit_packs"("gymId", "expiresAt");

-- CreateIndex
CREATE INDEX "bookings_creditPackId_idx" ON "bookings"("creditPackId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_creditPackId_fkey" FOREIGN KEY ("creditPackId") REFERENCES "credit_packs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_packs" ADD CONSTRAINT "credit_packs_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_packs" ADD CONSTRAINT "credit_packs_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_packs" ADD CONSTRAINT "credit_packs_planId_fkey" FOREIGN KEY ("planId") REFERENCES "package_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_packs" ADD CONSTRAINT "credit_packs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A credit pack's live balance can never go negative. Prisma can't express a CHECK
-- constraint, so it is added here in raw SQL — the booking deduction guards the
-- decrement (`WHERE remainingCredits > 0`), and this is the database-level backstop.
ALTER TABLE "credit_packs" ADD CONSTRAINT "credit_packs_remaining_nonneg" CHECK ("remainingCredits" >= 0);
