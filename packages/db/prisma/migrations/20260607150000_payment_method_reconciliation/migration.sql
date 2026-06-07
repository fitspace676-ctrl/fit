-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'MEMBER_ACCOUNT');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "method" "PaymentMethod" NOT NULL DEFAULT 'CARD';

-- CreateIndex
CREATE INDEX "payments_gymId_createdAt_idx" ON "payments"("gymId", "createdAt");
