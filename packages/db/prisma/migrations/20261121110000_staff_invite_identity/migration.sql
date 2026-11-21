ALTER TABLE "staff_invites" ADD COLUMN "firstName" TEXT, ADD COLUMN "lastName" TEXT, ADD COLUMN "locationIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
