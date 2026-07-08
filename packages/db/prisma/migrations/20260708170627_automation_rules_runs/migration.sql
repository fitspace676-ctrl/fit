-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('member_joined', 'membership_expiring', 'membership_expired', 'membership_renewed', 'membership_frozen', 'membership_cancelled', 'birthday', 'no_checkin', 'checkin_milestone', 'plan_upgraded', 'plan_downgraded', 'lead_created', 'lead_stage_changed', 'lead_won', 'lead_lost', 'lead_no_activity', 'class_booked', 'class_cancelled_member', 'class_full', 'attendance_marked', 'pt_session_booked', 'pt_session_cancelled', 'payment_received', 'payment_failed', 'invoice_overdue', 'refund_issued', 'purchase_completed', 'product_stock_low', 'task_assigned', 'task_completed', 'timeoff_approved');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('email', 'sms', 'push_notification', 'create_task');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('QUEUED', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" "AutomationTriggerType" NOT NULL,
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "timingOffset" TEXT NOT NULL DEFAULT 'day_of',
    "actionType" "AutomationActionType" NOT NULL,
    "actionConfig" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "triggerType" "AutomationTriggerType" NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "entityId" TEXT,
    "entityType" TEXT,
    "detail" TEXT NOT NULL DEFAULT '',
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_rules_gymId_createdAt_idx" ON "automation_rules"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "automation_rules_gymId_active_triggerType_idx" ON "automation_rules"("gymId", "active", "triggerType");

-- CreateIndex
CREATE INDEX "automation_rules_gymId_isTemplate_idx" ON "automation_rules"("gymId", "isTemplate");

-- CreateIndex
CREATE INDEX "automation_runs_gymId_ranAt_idx" ON "automation_runs"("gymId", "ranAt");

-- CreateIndex
CREATE INDEX "automation_runs_ruleId_ranAt_idx" ON "automation_runs"("ruleId", "ranAt");

-- CreateIndex
CREATE INDEX "automation_runs_ruleId_entityId_ranAt_idx" ON "automation_runs"("ruleId", "entityId", "ranAt");

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
