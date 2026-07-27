-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('MEMBERSHIP', 'PERSONAL_TRAINING', 'CLASS', 'PRODUCT', 'SERVICE', 'OTHER');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "type" "InvoiceType" NOT NULL DEFAULT 'OTHER';

-- Backfill: every existing invoice predates the column, so classify it from the
-- relation that produced it. A subscription charge is a membership; an order is the
-- POS/checkout sale of a product. Anything else keeps the 'OTHER' default.
UPDATE "invoices" SET "type" = 'MEMBERSHIP' WHERE "subscriptionId" IS NOT NULL;
UPDATE "invoices" SET "type" = 'PRODUCT' WHERE "subscriptionId" IS NULL AND "orderId" IS NOT NULL;
