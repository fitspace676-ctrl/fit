ALTER TABLE "automation_rules" ADD COLUMN "conditions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "automation_runs" ADD COLUMN "scheduledFor" TIMESTAMP(3);
CREATE INDEX "automation_runs_status_scheduledFor_idx" ON "automation_runs"("status", "scheduledFor");
ALTER TABLE "automation_rules" ALTER COLUMN "timingOffset" SET DEFAULT '0d';
UPDATE "automation_rules" SET "timingOffset" = CASE "timingOffset"
  WHEN '7_days_before' THEN '-7d'
  WHEN '4_days_before' THEN '-4d'
  WHEN '2_days_before' THEN '-2d'
  WHEN 'day_of' THEN '0d'
  WHEN '1_day_after' THEN '1d'
  WHEN '3_days_after' THEN '3d'
END WHERE "timingOffset" IN ('7_days_before', '4_days_before', '2_days_before', 'day_of', '1_day_after', '3_days_after');
