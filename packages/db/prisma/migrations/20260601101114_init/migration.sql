-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'TRAINER', 'MEMBER');

-- CreateTable
CREATE TABLE "gyms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gymId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gyms_slug_key" ON "gyms"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_gymId_idx" ON "users"("gymId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
