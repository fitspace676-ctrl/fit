-- The Settings > Email templates screen and its API were removed: the twenty
-- editable system emails were never wired to a trigger, so no gym's overrides
-- were ever sent. Drop the table that held them.

-- DropForeignKey
ALTER TABLE "email_template_overrides" DROP CONSTRAINT "email_template_overrides_gymId_fkey";

-- DropTable
DROP TABLE "email_template_overrides";
