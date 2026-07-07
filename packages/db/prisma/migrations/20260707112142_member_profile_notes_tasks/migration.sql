-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "MemberTaskStatus" AS ENUM ('PENDING', 'DONE');

-- AlterTable
ALTER TABLE "gym_members" ADD COLUMN     "address" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "medicalNotes" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "member_notes" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_tasks" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "assignee" TEXT,
    "status" "MemberTaskStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_notes_gymId_idx" ON "member_notes"("gymId");

-- CreateIndex
CREATE INDEX "member_notes_memberId_createdAt_idx" ON "member_notes"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "member_tasks_gymId_idx" ON "member_tasks"("gymId");

-- CreateIndex
CREATE INDEX "member_tasks_memberId_status_idx" ON "member_tasks"("memberId", "status");

-- AddForeignKey
ALTER TABLE "member_notes" ADD CONSTRAINT "member_notes_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_notes" ADD CONSTRAINT "member_notes_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_tasks" ADD CONSTRAINT "member_tasks_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_tasks" ADD CONSTRAINT "member_tasks_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
