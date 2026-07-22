-- Adds Jira-style task classification, blocker notes and Google Calendar sync metadata.
ALTER TABLE "WorkTask"
  ADD COLUMN IF NOT EXISTS "taskType" TEXT NOT NULL DEFAULT 'TASK',
  ADD COLUMN IF NOT EXISTS "blockerReason" TEXT,
  ADD COLUMN IF NOT EXISTS "calendarStatus" TEXT NOT NULL DEFAULT 'NOT_SYNCED',
  ADD COLUMN IF NOT EXISTS "calendarEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "calendarReminderAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "calendarNotes" TEXT;

CREATE INDEX IF NOT EXISTS "WorkTask_taskType_idx" ON "WorkTask"("taskType");
CREATE INDEX IF NOT EXISTS "WorkTask_relatedModule_idx" ON "WorkTask"("relatedModule");
CREATE INDEX IF NOT EXISTS "WorkTask_calendarStatus_idx" ON "WorkTask"("calendarStatus");
CREATE INDEX IF NOT EXISTS "WorkTask_calendarReminderAt_idx" ON "WorkTask"("calendarReminderAt");
