-- Add Jira-style team/subteam task management.

ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'WORK_TEAM_CREATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'WORK_TEAM_UPDATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'WORK_TEAM_MEMBER_UPDATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'WORK_TASK_CREATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'WORK_TASK_UPDATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'WORK_TASK_COMMENTED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'WORK_TASK_STATUS_CHANGED';

DO $$ BEGIN
  CREATE TYPE "WorkTeamMemberRole" AS ENUM ('LEAD', 'MEMBER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WorkTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WorkTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "WorkTeam" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "parentTeamId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkTeamMember" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "WorkTeamMemberRole" NOT NULL DEFAULT 'MEMBER',
  "addedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkTeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkTask" (
  "id" TEXT NOT NULL,
  "taskNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "teamId" TEXT NOT NULL,
  "assigneeId" TEXT,
  "createdById" TEXT,
  "parentTaskId" TEXT,
  "status" "WorkTaskStatus" NOT NULL DEFAULT 'TODO',
  "priority" "WorkTaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "relatedModule" TEXT,
  "relatedReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkTaskComment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "createdById" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkTaskComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkTaskActivity" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "actorId" TEXT,
  "eventType" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkTaskActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkTeam_parentTeamId_idx" ON "WorkTeam"("parentTeamId");
CREATE INDEX IF NOT EXISTS "WorkTeam_isActive_idx" ON "WorkTeam"("isActive");
CREATE INDEX IF NOT EXISTS "WorkTeam_createdAt_idx" ON "WorkTeam"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkTeamMember_teamId_userId_key" ON "WorkTeamMember"("teamId", "userId");
CREATE INDEX IF NOT EXISTS "WorkTeamMember_teamId_idx" ON "WorkTeamMember"("teamId");
CREATE INDEX IF NOT EXISTS "WorkTeamMember_userId_idx" ON "WorkTeamMember"("userId");
CREATE INDEX IF NOT EXISTS "WorkTeamMember_role_idx" ON "WorkTeamMember"("role");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkTask_taskNumber_key" ON "WorkTask"("taskNumber");
CREATE INDEX IF NOT EXISTS "WorkTask_teamId_idx" ON "WorkTask"("teamId");
CREATE INDEX IF NOT EXISTS "WorkTask_assigneeId_idx" ON "WorkTask"("assigneeId");
CREATE INDEX IF NOT EXISTS "WorkTask_createdById_idx" ON "WorkTask"("createdById");
CREATE INDEX IF NOT EXISTS "WorkTask_parentTaskId_idx" ON "WorkTask"("parentTaskId");
CREATE INDEX IF NOT EXISTS "WorkTask_status_idx" ON "WorkTask"("status");
CREATE INDEX IF NOT EXISTS "WorkTask_priority_idx" ON "WorkTask"("priority");
CREATE INDEX IF NOT EXISTS "WorkTask_dueAt_idx" ON "WorkTask"("dueAt");
CREATE INDEX IF NOT EXISTS "WorkTask_createdAt_idx" ON "WorkTask"("createdAt");

CREATE INDEX IF NOT EXISTS "WorkTaskComment_taskId_idx" ON "WorkTaskComment"("taskId");
CREATE INDEX IF NOT EXISTS "WorkTaskComment_createdById_idx" ON "WorkTaskComment"("createdById");
CREATE INDEX IF NOT EXISTS "WorkTaskComment_createdAt_idx" ON "WorkTaskComment"("createdAt");

CREATE INDEX IF NOT EXISTS "WorkTaskActivity_taskId_idx" ON "WorkTaskActivity"("taskId");
CREATE INDEX IF NOT EXISTS "WorkTaskActivity_actorId_idx" ON "WorkTaskActivity"("actorId");
CREATE INDEX IF NOT EXISTS "WorkTaskActivity_eventType_idx" ON "WorkTaskActivity"("eventType");
CREATE INDEX IF NOT EXISTS "WorkTaskActivity_createdAt_idx" ON "WorkTaskActivity"("createdAt");

DO $$ BEGIN
  ALTER TABLE "WorkTeam" ADD CONSTRAINT "WorkTeam_parentTeamId_fkey" FOREIGN KEY ("parentTeamId") REFERENCES "WorkTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTeam" ADD CONSTRAINT "WorkTeam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTeam" ADD CONSTRAINT "WorkTeam_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTeamMember" ADD CONSTRAINT "WorkTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "WorkTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTeamMember" ADD CONSTRAINT "WorkTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTeamMember" ADD CONSTRAINT "WorkTeamMember_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "WorkTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "WorkTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTaskComment" ADD CONSTRAINT "WorkTaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTaskComment" ADD CONSTRAINT "WorkTaskComment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTaskActivity" ADD CONSTRAINT "WorkTaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorkTaskActivity" ADD CONSTRAINT "WorkTaskActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

INSERT INTO "WorkTeam" ("id", "name", "description", "isActive", "createdAt", "updatedAt") VALUES
  ('workteam_inventory', 'Inventory Team', 'Stock checks, reorder planning, and inventory audits.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workteam_dispatch', 'Dispatch Team', 'Packing, dispatch coordination, and delivery handover.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workteam_qc', 'QC Team', 'Quality checks before dispatch.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workteam_collection', 'Collection Team', 'Payment and cheque collection follow-ups.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workteam_sales', 'Sales Team', 'Dealer sales, inquiries, and follow-up tasks.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workteam_field_visit', 'Field Visit Team', 'Shop visits, photos, and field updates.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workteam_accounts', 'Accounts Team', 'Invoices, ledgers, and payment reconciliation.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workteam_transport', 'Transport Team', 'Vehicle, driver, and route coordination.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workteam_order', 'Order Team', 'Order review and order-flow coordination.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workteam_design_office', 'Design / Office Team', 'Office operations and internal design/admin tasks.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
