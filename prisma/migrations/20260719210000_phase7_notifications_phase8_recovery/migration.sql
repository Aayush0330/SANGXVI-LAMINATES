ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'ALERT_ACKNOWLEDGED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'ALERT_RESOLVED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'DAILY_ARCHIVE_GENERATED';

-- Phase 7: internal notification priority, acknowledgement, resolution and escalation.
ALTER TABLE public."Notification"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT,
  ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acknowledgedById" TEXT,
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedById" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionNote" TEXT,
  ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

UPDATE public."Notification"
SET "priority" = CASE
  WHEN "priority" IN ('URGENT', 'BLOCKER') THEN 'BLOCKER'
  WHEN "priority" IN ('HIGH', 'HIGH_ALERT') THEN 'HIGH_ALERT'
  WHEN "priority" = 'CRITICAL' THEN 'CRITICAL'
  ELSE 'NORMAL'
END;

ALTER TABLE public."Notification"
  DROP CONSTRAINT IF EXISTS "Notification_priority_check",
  DROP CONSTRAINT IF EXISTS "Notification_status_check";

ALTER TABLE public."Notification"
  ADD CONSTRAINT "Notification_priority_check"
    CHECK ("priority" IN ('NORMAL', 'HIGH_ALERT', 'BLOCKER', 'CRITICAL')),
  ADD CONSTRAINT "Notification_status_check"
    CHECK ("status" IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'EXPIRED'));

CREATE UNIQUE INDEX IF NOT EXISTS "Notification_dedupeKey_key"
  ON public."Notification"("dedupeKey");
CREATE INDEX IF NOT EXISTS "Notification_priority_idx" ON public."Notification"("priority");
CREATE INDEX IF NOT EXISTS "Notification_status_idx" ON public."Notification"("status");
CREATE INDEX IF NOT EXISTS "Notification_acknowledgedAt_idx" ON public."Notification"("acknowledgedAt");
CREATE INDEX IF NOT EXISTS "Notification_resolvedAt_idx" ON public."Notification"("resolvedAt");
CREATE INDEX IF NOT EXISTS "Notification_escalatedAt_idx" ON public."Notification"("escalatedAt");
CREATE INDEX IF NOT EXISTS "Notification_expiresAt_idx" ON public."Notification"("expiresAt");

-- Phase 8: auditable backup, restore and daily business archive records.
CREATE TABLE IF NOT EXISTS public."BackupRecord" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'MANUAL',
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "fileName" TEXT,
  "filePath" TEXT,
  "sizeBytes" BIGINT,
  "sha256" TEXT,
  "manifestPath" TEXT,
  "retentionDays" INTEGER,
  "triggeredById" TEXT,
  "triggeredBy" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackupRecord_kind_check" CHECK ("kind" IN ('MANUAL', 'AUTOMATIC', 'RESTORE_POINT')),
  CONSTRAINT "BackupRecord_status_check" CHECK ("status" IN ('RUNNING', 'SUCCESS', 'FAILED', 'DELETED'))
);
CREATE INDEX IF NOT EXISTS "BackupRecord_kind_idx" ON public."BackupRecord"("kind");
CREATE INDEX IF NOT EXISTS "BackupRecord_status_idx" ON public."BackupRecord"("status");
CREATE INDEX IF NOT EXISTS "BackupRecord_startedAt_idx" ON public."BackupRecord"("startedAt");
CREATE INDEX IF NOT EXISTS "BackupRecord_completedAt_idx" ON public."BackupRecord"("completedAt");
CREATE INDEX IF NOT EXISTS "BackupRecord_verifiedAt_idx" ON public."BackupRecord"("verifiedAt");

CREATE TABLE IF NOT EXISTS public."RestoreAudit" (
  "id" TEXT NOT NULL,
  "backupRecordId" TEXT,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "sha256" TEXT,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "triggeredById" TEXT,
  "triggeredBy" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestoreAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestoreAudit_status_check" CHECK ("status" IN ('STARTED', 'SUCCESS', 'FAILED'))
);
CREATE INDEX IF NOT EXISTS "RestoreAudit_backupRecordId_idx" ON public."RestoreAudit"("backupRecordId");
CREATE INDEX IF NOT EXISTS "RestoreAudit_status_idx" ON public."RestoreAudit"("status");
CREATE INDEX IF NOT EXISTS "RestoreAudit_startedAt_idx" ON public."RestoreAudit"("startedAt");

CREATE TABLE IF NOT EXISTS public."DailyBusinessArchive" (
  "id" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'GENERATING',
  "fileName" TEXT,
  "filePath" TEXT,
  "sha256" TEXT,
  "summary" JSONB,
  "errorMessage" TEXT,
  "generatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyBusinessArchive_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyBusinessArchive_businessDate_key" UNIQUE ("businessDate"),
  CONSTRAINT "DailyBusinessArchive_status_check" CHECK ("status" IN ('GENERATING', 'SUCCESS', 'FAILED'))
);
CREATE INDEX IF NOT EXISTS "DailyBusinessArchive_status_idx" ON public."DailyBusinessArchive"("status");
CREATE INDEX IF NOT EXISTS "DailyBusinessArchive_generatedAt_idx" ON public."DailyBusinessArchive"("generatedAt");
