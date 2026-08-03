-- CreateTable
CREATE TABLE "email_template_overrides" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_template_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_template_overrides_gymId_idx" ON "email_template_overrides"("gymId");

-- CreateIndex
CREATE UNIQUE INDEX "email_template_overrides_gymId_key_key" ON "email_template_overrides"("gymId", "key");

-- AddForeignKey
ALTER TABLE "email_template_overrides" ADD CONSTRAINT "email_template_overrides_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
