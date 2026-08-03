-- CreateEnum
CREATE TYPE "MemberKind" AS ENUM ('MEMBER', 'GUEST', 'INACTIVE');

-- AlterTable
ALTER TABLE "gym_members" ADD COLUMN     "kindOverride" "MemberKind";
