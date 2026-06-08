-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "productVariantId" TEXT,
ADD COLUMN     "qty" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refundedAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "order_status_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT,

    CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "restockItems" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_gymId_createdAt_idx" ON "orders"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "order_status_events_orderId_idx" ON "order_status_events"("orderId");

-- CreateIndex
CREATE INDEX "refunds_gymId_idx" ON "refunds"("gymId");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");

-- AddForeignKey
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
