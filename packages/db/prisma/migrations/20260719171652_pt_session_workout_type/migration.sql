-- A PT session is now a trainer + a workout type (class type), not a member.
-- Drop the member link and add an optional class-type link (SET NULL so deleting
-- a type keeps the session's history).

-- DropForeignKey
ALTER TABLE "pt_sessions" DROP CONSTRAINT "pt_sessions_memberId_fkey";

-- DropIndex
DROP INDEX "pt_sessions_memberId_idx";

-- AlterTable
ALTER TABLE "pt_sessions" DROP COLUMN "memberId",
ADD COLUMN     "classTypeId" TEXT;

-- CreateIndex
CREATE INDEX "pt_sessions_classTypeId_idx" ON "pt_sessions"("classTypeId");

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "class_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
