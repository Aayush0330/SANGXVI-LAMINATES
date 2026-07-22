ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'WORK_TASK_REMINDER_SWEEP';

ALTER TABLE "WorkTask"
  ADD COLUMN "calendarSyncedAt" TIMESTAMP(3),
  ADD COLUMN "googleSyncError" TEXT,
  ADD COLUMN "calendarReminderSentAt" TIMESTAMP(3),
  ADD COLUMN "dueReminderSentAt" TIMESTAMP(3),
  ADD COLUMN "overdueReminderSentAt" TIMESTAMP(3),
  ADD COLUMN "lastReviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewNotes" TEXT;

CREATE INDEX "WorkTask_calendarSyncedAt_idx" ON "WorkTask"("calendarSyncedAt");
CREATE INDEX "WorkTask_calendarReminderSentAt_idx" ON "WorkTask"("calendarReminderSentAt");
CREATE INDEX "WorkTask_dueReminderSentAt_idx" ON "WorkTask"("dueReminderSentAt");
CREATE INDEX "WorkTask_overdueReminderSentAt_idx" ON "WorkTask"("overdueReminderSentAt");
CREATE INDEX "WorkTask_lastReviewedAt_idx" ON "WorkTask"("lastReviewedAt");
CREATE INDEX "WorkTask_reviewedById_idx" ON "WorkTask"("reviewedById");
