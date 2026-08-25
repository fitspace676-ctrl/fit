-- CreateEnum
CREATE TYPE "ServiceSessionStatus" AS ENUM ('OPEN', 'BOOKED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "service_sessions" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "memberId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "ServiceSessionStatus" NOT NULL DEFAULT 'OPEN',
    "invoiceId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_sessions_gymId_startsAt_idx" ON "service_sessions"("gymId", "startsAt");

-- CreateIndex
CREATE INDEX "service_sessions_gymId_staffId_startsAt_idx" ON "service_sessions"("gymId", "staffId", "startsAt");

-- CreateIndex
CREATE INDEX "service_sessions_gymId_memberId_startsAt_idx" ON "service_sessions"("gymId", "memberId", "startsAt");

-- CreateIndex
CREATE INDEX "service_sessions_serviceId_idx" ON "service_sessions"("serviceId");

-- CreateIndex
CREATE INDEX "service_sessions_invoiceId_idx" ON "service_sessions"("invoiceId");

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "gym_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

