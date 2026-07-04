-- CreateEnum
CREATE TYPE "PlatformLeadType" AS ENUM ('TRIAL', 'DEMO');

-- CreateTable
CREATE TABLE "platform_leads" (
    "id" TEXT NOT NULL,
    "type" "PlatformLeadType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "business" TEXT,
    "phone" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_leads_createdAt_idx" ON "platform_leads"("createdAt");

-- CreateIndex
CREATE INDEX "platform_leads_type_createdAt_idx" ON "platform_leads"("type", "createdAt");
