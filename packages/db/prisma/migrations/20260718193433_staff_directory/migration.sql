-- AlterTable
ALTER TABLE "gym_members" ADD COLUMN     "assignedLocationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;

-- CreateTable
CREATE TABLE "specialty_tags" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specialty_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "specialty_tags_gymId_idx" ON "specialty_tags"("gymId");

-- CreateIndex
CREATE UNIQUE INDEX "specialty_tags_gymId_name_key" ON "specialty_tags"("gymId", "name");

-- AddForeignKey
ALTER TABLE "specialty_tags" ADD CONSTRAINT "specialty_tags_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
