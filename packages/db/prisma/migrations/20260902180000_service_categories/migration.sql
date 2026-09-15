-- Service categories: a gym files its services under names of its own
-- ("Boxing", "Pilates") instead of creating a second, hand-named kind of
-- service. Owner's decision, 2026-09-02.

-- CreateTable
CREATE TABLE "service_categories" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_gymId_name_key" ON "service_categories"("gymId", "name");
CREATE INDEX "service_categories_gymId_idx" ON "service_categories"("gymId");

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "services" ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "services_gymId_categoryId_idx" ON "services"("gymId", "categoryId");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
