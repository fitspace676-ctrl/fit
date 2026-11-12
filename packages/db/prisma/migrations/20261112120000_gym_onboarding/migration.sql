CREATE TABLE "gym_onboardings" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "completedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gym_onboardings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "gym_onboardings_gymId_key" ON "gym_onboardings"("gymId");
ALTER TABLE "gym_onboardings" ADD CONSTRAINT "gym_onboardings_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
