-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('QR', 'MANUAL');

-- CreateTable
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "gymMemberId" TEXT NOT NULL,
    "method" "CheckInMethod" NOT NULL DEFAULT 'MANUAL',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locationId" TEXT,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "check_ins_gymId_checkedInAt_idx" ON "check_ins"("gymId", "checkedInAt");

-- CreateIndex
CREATE INDEX "check_ins_gymMemberId_idx" ON "check_ins"("gymMemberId");

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_gymMemberId_fkey" FOREIGN KEY ("gymMemberId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
