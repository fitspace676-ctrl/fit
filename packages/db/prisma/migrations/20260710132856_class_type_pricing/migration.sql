-- CreateEnum
CREATE TYPE "ClassPricingRule" AS ENUM ('FREE', 'INCLUDED', 'PAID');

-- AlterTable
ALTER TABLE "class_templates" ADD COLUMN     "includedPlanIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "minAttendance" INTEGER,
ADD COLUMN     "priceMinor" INTEGER,
ADD COLUMN     "pricingRule" "ClassPricingRule" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "pt30Minor" INTEGER,
ADD COLUMN     "pt45Minor" INTEGER,
ADD COLUMN     "pt60Minor" INTEGER;
