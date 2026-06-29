-- CreateTable
CREATE TABLE "member_goals" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "current" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "target" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_goals_gymId_idx" ON "member_goals"("gymId");

-- CreateIndex
CREATE INDEX "member_goals_memberId_idx" ON "member_goals"("memberId");

-- AddForeignKey
ALTER TABLE "member_goals" ADD CONSTRAINT "member_goals_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_goals" ADD CONSTRAINT "member_goals_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A goal's target must be positive and its current value non-negative. Prisma can't
-- express CHECK constraints, so they are added here in raw SQL as a backstop.
ALTER TABLE "member_goals" ADD CONSTRAINT "member_goals_target_positive" CHECK ("target" > 0);
ALTER TABLE "member_goals" ADD CONSTRAINT "member_goals_current_nonneg" CHECK ("current" >= 0);
