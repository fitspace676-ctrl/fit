-- CreateTable
CREATE TABLE "pt_sessions" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "InstanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pt_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pt_sessions_gymId_trainerId_startsAt_idx" ON "pt_sessions"("gymId", "trainerId", "startsAt");

-- CreateIndex
CREATE INDEX "pt_sessions_memberId_idx" ON "pt_sessions"("memberId");

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

