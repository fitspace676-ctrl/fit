-- CreateEnum
CREATE TYPE "PromoScope" AS ENUM ('all', 'products', 'packages', 'subscriptions');

-- AlterTable
ALTER TABLE "promo_codes" ADD COLUMN     "appliesTo" "PromoScope" NOT NULL DEFAULT 'all',
ADD COLUMN     "oncePerMember" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "promo_redemptions" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "memberId" TEXT,
    "orderId" TEXT,
    "discountAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promo_redemptions_gymId_createdAt_idx" ON "promo_redemptions"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "promo_redemptions_promoCodeId_idx" ON "promo_redemptions"("promoCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "promo_redemptions_promoCodeId_memberId_key" ON "promo_redemptions"("promoCodeId", "memberId");

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
