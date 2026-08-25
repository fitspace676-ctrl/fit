-- Services catalogue (stage 1).
--
-- A gym sells staff-delivered services — a personal-training hour, a massage —
-- that were neither a product, a plan nor a class. `services` is the catalogue;
-- `order_items.serviceId` lets a POS line record which service it sold, the way
-- `productVariantId` records a stock position. `ON DELETE SET NULL` on the sale
-- side keeps history; `ON DELETE RESTRICT` on the staff side means a staff member
-- with services must be reassigned before being removed.

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('PERSONAL_TRAINING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "serviceId" TEXT;

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "name" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "description" TEXT NOT NULL DEFAULT '',
    "schedule" JSONB,
    "status" "ServiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "services_gymId_status_type_idx" ON "services"("gymId", "status", "type");

-- CreateIndex
CREATE INDEX "services_gymId_staffId_idx" ON "services"("gymId", "staffId");

-- CreateIndex
CREATE INDEX "order_items_serviceId_idx" ON "order_items"("serviceId");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "gym_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
