-- CreateEnum
CREATE TYPE "ClassTemplateStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "InstanceStatus" AS ENUM ('SCHEDULED', 'CANCELED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'WAITLIST', 'ATTENDED', 'NO_SHOW', 'CANCELED');

-- CreateTable
CREATE TABLE "class_templates" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "trainerId" TEXT,
    "locationId" TEXT,
    "room" TEXT,
    "capacity" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "rrule" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "status" "ClassTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_instances" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacityOverride" INTEGER,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "InstanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "detachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "classInstanceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "waitlistPosition" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_templates_gymId_idx" ON "class_templates"("gymId");

-- CreateIndex
CREATE INDEX "class_templates_trainerId_idx" ON "class_templates"("trainerId");

-- CreateIndex
CREATE INDEX "class_templates_locationId_idx" ON "class_templates"("locationId");

-- CreateIndex
CREATE INDEX "class_instances_gymId_startsAt_idx" ON "class_instances"("gymId", "startsAt");

-- CreateIndex
CREATE INDEX "class_instances_templateId_idx" ON "class_instances"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_idempotencyKey_key" ON "bookings"("idempotencyKey");

-- CreateIndex
CREATE INDEX "bookings_classInstanceId_status_idx" ON "bookings"("classInstanceId", "status");

-- CreateIndex
CREATE INDEX "bookings_gymId_idx" ON "bookings"("gymId");

-- CreateIndex
CREATE INDEX "bookings_memberId_idx" ON "bookings"("memberId");

-- AddForeignKey
ALTER TABLE "class_templates" ADD CONSTRAINT "class_templates_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_templates" ADD CONSTRAINT "class_templates_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_templates" ADD CONSTRAINT "class_templates_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "class_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_classInstanceId_fkey" FOREIGN KEY ("classInstanceId") REFERENCES "class_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce the 500-char ceiling on RRULE strings at the DB level (T5.1 constraint).
-- Prisma cannot express a CHECK constraint in the schema, so it is added here and
-- must be kept in sync with any future change to the rrule column.
ALTER TABLE "class_templates" ADD CONSTRAINT "rrule_max_len" CHECK (length("rrule") <= 500);

-- A member may hold at most ONE non-canceled booking per class occurrence. A
-- plain @@unique would also block re-booking after a cancellation, so this is a
-- PARTIAL unique index excluding CANCELED rows — not expressible in the Prisma
-- schema, hence raw SQL here.
CREATE UNIQUE INDEX "bookings_classInstanceId_memberId_active_key"
    ON "bookings"("classInstanceId", "memberId")
    WHERE "status" != 'CANCELED';
