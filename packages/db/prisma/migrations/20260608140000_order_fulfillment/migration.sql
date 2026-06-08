-- CreateEnum
CREATE TYPE "Fulfillment" AS ENUM ('PICKUP', 'DELIVERY');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "fulfillment" "Fulfillment" NOT NULL DEFAULT 'PICKUP';
