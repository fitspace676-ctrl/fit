-- CreateTable
CREATE TABLE "dashboard_pins" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_pins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboard_pins_gymId_userId_idx" ON "dashboard_pins"("gymId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_pins_gymId_userId_metric_section_key" ON "dashboard_pins"("gymId", "userId", "metric", "section");

-- AddForeignKey
ALTER TABLE "dashboard_pins" ADD CONSTRAINT "dashboard_pins_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_pins" ADD CONSTRAINT "dashboard_pins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
