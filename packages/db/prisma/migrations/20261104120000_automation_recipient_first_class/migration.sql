ALTER TYPE "AutomationTriggerType" ADD VALUE 'first_class_attended';
CREATE TYPE "AutomationRecipient" AS ENUM ('member', 'trainer');
ALTER TABLE "automation_rules" ADD COLUMN "recipient" "AutomationRecipient" NOT NULL DEFAULT 'member';
