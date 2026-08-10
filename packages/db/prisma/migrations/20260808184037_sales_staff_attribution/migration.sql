-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "soldById" TEXT;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "processedById" TEXT;

-- CreateIndex
CREATE INDEX "orders_gymId_soldById_createdAt_idx" ON "orders"("gymId", "soldById", "createdAt");

-- CreateIndex
CREATE INDEX "refunds_gymId_createdAt_idx" ON "refunds"("gymId", "createdAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "gym_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "gym_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
