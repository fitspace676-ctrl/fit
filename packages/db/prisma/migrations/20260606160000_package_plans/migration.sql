-- CreateEnum
CREATE TYPE "PackagePlanStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PackageBillingInterval" AS ENUM ('MONTH', 'YEAR', 'ONE_TIME');

-- CreateTable
CREATE TABLE "package_plans" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingInterval" "PackageBillingInterval" NOT NULL DEFAULT 'MONTH',
    "sessionCount" INTEGER,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "status" "PackagePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "package_plans_gymId_idx" ON "package_plans"("gymId");

-- AddForeignKey
ALTER TABLE "package_plans" ADD CONSTRAINT "package_plans_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
