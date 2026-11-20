CREATE TYPE "BookingBlockReason" AS ENUM ('NO_SHOW_LIMIT');
CREATE TYPE "BookingBlockLiftReason" AS ENUM ('STAFF', 'CORRECTION');
CREATE TABLE "booking_blocks" (
 "id" TEXT NOT NULL,
 "gymId" TEXT NOT NULL,
 "memberId" TEXT NOT NULL,
 "reason" "BookingBlockReason" NOT NULL,
 "noShowCount" INTEGER NOT NULL,
 "startsAt" TIMESTAMP(3) NOT NULL,
 "endsAt" TIMESTAMP(3) NOT NULL,
 "liftedAt" TIMESTAMP(3),
 "liftedByUserId" TEXT,
 "liftReason" "BookingBlockLiftReason",
 "expiryNotifiedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "booking_blocks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "booking_blocks_gymId_memberId_idx" ON "booking_blocks"("gymId", "memberId");
CREATE INDEX "booking_blocks_endsAt_idx" ON "booking_blocks"("endsAt");
ALTER TABLE "booking_blocks" ADD CONSTRAINT "booking_blocks_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_blocks" ADD CONSTRAINT "booking_blocks_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_blocks" ADD CONSTRAINT "booking_blocks_liftedByUserId_fkey" FOREIGN KEY ("liftedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
