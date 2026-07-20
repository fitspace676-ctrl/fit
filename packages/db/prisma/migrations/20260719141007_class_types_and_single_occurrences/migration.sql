-- CreateEnum
CREATE TYPE "ClassTypeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "class_instances" ADD COLUMN     "classTypeId" TEXT,
ADD COLUMN     "locationId" TEXT,
ADD COLUMN     "room" TEXT,
ADD COLUMN     "trainerId" TEXT,
ALTER COLUMN "templateId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "class_types" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "minAttendance" INTEGER,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "pricingRule" "ClassPricingRule" NOT NULL DEFAULT 'FREE',
    "priceMinor" INTEGER,
    "includedPlanIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ClassTypeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_types_gymId_idx" ON "class_types"("gymId");

-- CreateIndex
CREATE INDEX "class_instances_classTypeId_idx" ON "class_instances"("classTypeId");

-- AddForeignKey
ALTER TABLE "class_types" ADD CONSTRAINT "class_types_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "class_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
