-- ZKTeco turnstiles per gym. Expand only: new nullable columns and new tables,
-- nothing existing is rewritten or dropped.

-- AlterTable
ALTER TABLE "gym_integrations" ADD COLUMN "settings" JSONB;

-- AlterTable
ALTER TABLE "gym_members" ADD COLUMN "accessCardNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "gym_members_gymId_accessCardNumber_key" ON "gym_members"("gymId", "accessCardNumber");

-- CreateTable
CREATE TABLE "zkteco_members" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "gymMemberId" TEXT,
    "pin" TEXT NOT NULL,
    "deviceUid" INTEGER,
    "state" TEXT NOT NULL DEFAULT 'none',
    "dirty" BOOLEAN NOT NULL DEFAULT true,
    "photoRef" TEXT,
    "syncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "zkteco_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zkteco_sync_states" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "eventCursor" TEXT,
    "lastImportAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "lastChangeScanAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastReconcileAt" TIMESTAMP(3),
    "eventsImported" INTEGER NOT NULL DEFAULT 0,
    "eventsIgnored" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "zkteco_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zkteco_events" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "checkInId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zkteco_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zkteco_members_gymMemberId_key" ON "zkteco_members"("gymMemberId");

-- CreateIndex
CREATE INDEX "zkteco_members_gymId_dirty_idx" ON "zkteco_members"("gymId", "dirty");

-- CreateIndex
CREATE UNIQUE INDEX "zkteco_members_gymId_pin_key" ON "zkteco_members"("gymId", "pin");

-- CreateIndex
CREATE UNIQUE INDEX "zkteco_members_gymId_deviceUid_key" ON "zkteco_members"("gymId", "deviceUid");

-- CreateIndex
CREATE UNIQUE INDEX "zkteco_sync_states_gymId_key" ON "zkteco_sync_states"("gymId");

-- CreateIndex
CREATE INDEX "zkteco_events_gymId_occurredAt_idx" ON "zkteco_events"("gymId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "zkteco_events_gymId_eventKey_key" ON "zkteco_events"("gymId", "eventKey");

-- AddForeignKey
ALTER TABLE "zkteco_members" ADD CONSTRAINT "zkteco_members_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zkteco_members" ADD CONSTRAINT "zkteco_members_gymMemberId_fkey" FOREIGN KEY ("gymMemberId") REFERENCES "gym_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zkteco_sync_states" ADD CONSTRAINT "zkteco_sync_states_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zkteco_events" ADD CONSTRAINT "zkteco_events_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
