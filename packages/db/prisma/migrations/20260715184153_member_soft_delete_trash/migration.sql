-- AlterTable
ALTER TABLE "gym_members" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "gym_members_gymId_deletedAt_idx" ON "gym_members"("gymId", "deletedAt");
