-- CreateEnum
CREATE TYPE "TimeOffStatus" AS ENUM ('pending', 'approved', 'denied');

-- CreateTable
CREATE TABLE "staff_notes" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_tasks" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "assignedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_off_requests" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "TimeOffStatus" NOT NULL DEFAULT 'pending',
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_off_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_specialties" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "staff_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_slots" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_notes_gymId_staffId_createdAt_idx" ON "staff_notes"("gymId", "staffId", "createdAt");

-- CreateIndex
CREATE INDEX "staff_tasks_gymId_staffId_completed_idx" ON "staff_tasks"("gymId", "staffId", "completed");

-- CreateIndex
CREATE INDEX "staff_tasks_gymId_dueDate_idx" ON "staff_tasks"("gymId", "dueDate");

-- CreateIndex
CREATE INDEX "time_off_requests_gymId_status_idx" ON "time_off_requests"("gymId", "status");

-- CreateIndex
CREATE INDEX "time_off_requests_gymId_staffId_startDate_idx" ON "time_off_requests"("gymId", "staffId", "startDate");

-- CreateIndex
CREATE INDEX "staff_specialties_gymId_staffId_idx" ON "staff_specialties"("gymId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_specialties_gymId_staffId_name_key" ON "staff_specialties"("gymId", "staffId", "name");

-- CreateIndex
CREATE INDEX "shift_slots_gymId_staffId_dayOfWeek_idx" ON "shift_slots"("gymId", "staffId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_specialties" ADD CONSTRAINT "staff_specialties_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_specialties" ADD CONSTRAINT "staff_specialties_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_slots" ADD CONSTRAINT "shift_slots_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_slots" ADD CONSTRAINT "shift_slots_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
