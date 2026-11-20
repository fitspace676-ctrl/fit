CREATE TABLE "gym_integrations" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "merchantId" TEXT,
    "secretCiphertext" TEXT,
    "secretHint" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gym_integrations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "gym_integrations_gymId_provider_key" ON "gym_integrations"("gymId", "provider");
ALTER TABLE "gym_integrations" ADD CONSTRAINT "gym_integrations_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
