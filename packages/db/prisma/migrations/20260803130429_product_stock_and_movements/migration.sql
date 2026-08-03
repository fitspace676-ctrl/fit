-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('RECEIVE', 'ADJUSTMENT', 'RECOUNT', 'WRITE_OFF', 'SALE', 'REFUND_RESTOCK');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "lowStockThreshold" INTEGER,
ADD COLUMN     "stock" INTEGER;

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantIndex" INTEGER,
    "variantLabel" TEXT NOT NULL DEFAULT '',
    "delta" INTEGER NOT NULL,
    "resultingStock" INTEGER NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_gymId_createdAt_idx" ON "stock_movements"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_productId_createdAt_idx" ON "stock_movements"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
