ALTER TABLE "trainers" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "trainers_gymId_archivedAt_idx" ON "trainers"("gymId", "archivedAt");
