-- Phase 4A: workflow-aware automated tasks.
-- This migration is additive and preserves all existing manual tasks.

ALTER TABLE public."WorkTask"
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "automationKey" TEXT,
  ADD COLUMN "isAutomated" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "workflowStage" TEXT,
  ADD COLUMN "sourceEvent" TEXT,
  ADD COLUMN "statusBeforeBlock" public."WorkTaskStatus",
  ADD COLUMN "workflowPauseReason" TEXT,
  ADD COLUMN "workflowPausePreviousStatus" public."WorkTaskStatus";

CREATE UNIQUE INDEX "WorkTask_automationKey_key"
  ON public."WorkTask"("automationKey");

CREATE INDEX "WorkTask_orderId_idx"
  ON public."WorkTask"("orderId");

CREATE INDEX "WorkTask_isAutomated_idx"
  ON public."WorkTask"("isAutomated");

CREATE INDEX "WorkTask_workflowStage_idx"
  ON public."WorkTask"("workflowStage");

CREATE INDEX "WorkTask_sourceEvent_idx"
  ON public."WorkTask"("sourceEvent");

CREATE INDEX "WorkTask_workflowPauseReason_idx"
  ON public."WorkTask"("workflowPauseReason");

ALTER TABLE public."WorkTask"
  ADD CONSTRAINT "WorkTask_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES public."Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Automated tasks must have the fields needed for deterministic idempotency.
ALTER TABLE public."WorkTask"
  ADD CONSTRAINT "WorkTask_automation_metadata_check"
  CHECK (
    "isAutomated" = FALSE
    OR (
      "automationKey" IS NOT NULL
      AND "workflowStage" IS NOT NULL
      AND "orderId" IS NOT NULL
    )
  );

-- Create internal role pools used by automated workflow tasks.
INSERT INTO public."WorkTeam" (
  "id", "name", "description", "teamType", "isActive", "createdAt", "updatedAt"
)
SELECT
  'system-workflow-order-team',
  'Order Receiving Workflow Pool',
  '[SYSTEM_WORKFLOW_ROLE:ORDER_TEAM]',
  'GENERAL'::public."WorkTeamType",
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM public."WorkTeam"
  WHERE "description" = '[SYSTEM_WORKFLOW_ROLE:ORDER_TEAM]'
);

INSERT INTO public."WorkTeam" (
  "id", "name", "description", "teamType", "isActive", "createdAt", "updatedAt"
)
SELECT
  'system-workflow-qc-team',
  'QC Workflow Pool',
  '[SYSTEM_WORKFLOW_ROLE:QC_TEAM]',
  'GENERAL'::public."WorkTeamType",
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM public."WorkTeam"
  WHERE "description" = '[SYSTEM_WORKFLOW_ROLE:QC_TEAM]'
);

INSERT INTO public."WorkTeam" (
  "id", "name", "description", "teamType", "isActive", "createdAt", "updatedAt"
)
SELECT
  'system-workflow-manager-team',
  'Manager Workflow Pool',
  '[SYSTEM_WORKFLOW_ROLE:MANAGER]',
  'GENERAL'::public."WorkTeamType",
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM public."WorkTeam"
  WHERE "description" = '[SYSTEM_WORKFLOW_ROLE:MANAGER]'
);

-- Synchronize active users into role pools. Both primary and additional roles count.
WITH role_pool AS (
  SELECT "id", 'ORDER_TEAM'::text AS role_name
  FROM public."WorkTeam"
  WHERE "description" = '[SYSTEM_WORKFLOW_ROLE:ORDER_TEAM]'
  LIMIT 1
), eligible_users AS (
  SELECT DISTINCT u."id" AS user_id
  FROM public."User" u
  LEFT JOIN public."UserRoleAssignment" ura ON ura."userId" = u."id"
  WHERE u."status" = 'ACTIVE'::public."UserStatus"
    AND (u."role"::text = 'ORDER_TEAM' OR ura."role"::text = 'ORDER_TEAM')
)
INSERT INTO public."WorkTeamMember" (
  "id", "teamId", "userId", "role", "createdAt", "updatedAt"
)
SELECT
  md5('phase4a-order-pool:' || rp."id" || ':' || eu.user_id),
  rp."id",
  eu.user_id,
  'MEMBER'::public."WorkTeamMemberRole",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM role_pool rp
CROSS JOIN eligible_users eu
ON CONFLICT ("teamId", "userId") DO NOTHING;

WITH role_pool AS (
  SELECT "id", 'QC_TEAM'::text AS role_name
  FROM public."WorkTeam"
  WHERE "description" = '[SYSTEM_WORKFLOW_ROLE:QC_TEAM]'
  LIMIT 1
), eligible_users AS (
  SELECT DISTINCT u."id" AS user_id
  FROM public."User" u
  LEFT JOIN public."UserRoleAssignment" ura ON ura."userId" = u."id"
  WHERE u."status" = 'ACTIVE'::public."UserStatus"
    AND (u."role"::text = 'QC_TEAM' OR ura."role"::text = 'QC_TEAM')
)
INSERT INTO public."WorkTeamMember" (
  "id", "teamId", "userId", "role", "createdAt", "updatedAt"
)
SELECT
  md5('phase4a-qc-pool:' || rp."id" || ':' || eu.user_id),
  rp."id",
  eu.user_id,
  'MEMBER'::public."WorkTeamMemberRole",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM role_pool rp
CROSS JOIN eligible_users eu
ON CONFLICT ("teamId", "userId") DO NOTHING;

WITH role_pool AS (
  SELECT "id"
  FROM public."WorkTeam"
  WHERE "description" = '[SYSTEM_WORKFLOW_ROLE:MANAGER]'
  LIMIT 1
), eligible_users AS (
  SELECT DISTINCT u."id" AS user_id
  FROM public."User" u
  LEFT JOIN public."UserRoleAssignment" ura ON ura."userId" = u."id"
  WHERE u."status" = 'ACTIVE'::public."UserStatus"
    AND (
      u."role"::text IN ('OWNER', 'MANAGER')
      OR ura."role"::text IN ('OWNER', 'MANAGER')
    )
)
INSERT INTO public."WorkTeamMember" (
  "id", "teamId", "userId", "role", "createdAt", "updatedAt"
)
SELECT
  md5('phase4a-manager-pool:' || rp."id" || ':' || eu.user_id),
  rp."id",
  eu.user_id,
  'MEMBER'::public."WorkTeamMemberRole",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM role_pool rp
CROSS JOIN eligible_users eu
ON CONFLICT ("teamId", "userId") DO NOTHING;

-- Backfill receiving tasks for active orders so Phase 4A works immediately after deploy.
WITH receiving_pool AS (
  SELECT "id"
  FROM public."WorkTeam"
  WHERE "description" = '[SYSTEM_WORKFLOW_ROLE:ORDER_TEAM]'
  LIMIT 1
), candidate_orders AS (
  SELECT o."id", o."orderNumber", o."status"::text AS status_text
  FROM public."Order" o
  WHERE o."status" NOT IN (
    'CANCELLED'::public."OrderStatus",
    'DELIVERED'::public."OrderStatus",
    'INVOICE_UPLOADED'::public."OrderStatus"
  )
)
INSERT INTO public."WorkTask" (
  "id", "taskNumber", "title", "description", "teamId", "status",
  "priority", "taskType", "relatedModule", "relatedReference",
  "calendarStatus", "orderId", "automationKey", "isAutomated",
  "workflowStage", "sourceEvent", "completedAt", "createdAt", "updatedAt"
)
SELECT
  md5('phase4a-receiving-task:' || co."id"),
  'TASK-P4A-' || upper(substr(md5('receiving:' || co."id"), 1, 10)),
  'Receive and assign ' || co."orderNumber",
  'Confirm the dealer order, review quantities and assign every product line to an active Physical Team.',
  rp."id",
  CASE
    WHEN co.status_text = 'NEW_ORDER' THEN 'TODO'::public."WorkTaskStatus"
    WHEN co.status_text = 'PENDING_TEAM_ASSIGNMENT' THEN 'REVIEW'::public."WorkTaskStatus"
    ELSE 'DONE'::public."WorkTaskStatus"
  END,
  'HIGH'::public."WorkTaskPriority",
  'APPROVAL',
  'ORDER_RECEIVING',
  co."orderNumber",
  'NOT_SYNCED',
  co."id",
  'ORDER:' || co."id" || ':RECEIVING',
  TRUE,
  'ORDER_RECEIVING',
  'PHASE4A_MIGRATION_BACKFILL',
  CASE
    WHEN co.status_text NOT IN ('NEW_ORDER', 'PENDING_TEAM_ASSIGNMENT') THEN CURRENT_TIMESTAMP
    ELSE NULL
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM candidate_orders co
CROSS JOIN receiving_pool rp
ON CONFLICT ("automationKey") DO NOTHING;

-- Backfill Physical Team verification tasks from current assignment state.
INSERT INTO public."WorkTask" (
  "id", "taskNumber", "title", "description", "teamId", "status",
  "priority", "taskType", "relatedModule", "relatedReference",
  "calendarStatus", "orderId", "automationKey", "isAutomated",
  "workflowStage", "sourceEvent", "blockerReason", "completedAt",
  "createdAt", "updatedAt"
)
SELECT
  md5('phase4a-physical-task:' || a."id"),
  'TASK-P4A-' || upper(substr(md5('physical:' || a."id"), 1, 10)),
  'Verify ' || o."orderNumber" || ' · ' || t."name",
  'Verify the complete ordered quantity for every assigned product. Report a blocker when full stock or correct goods are unavailable.',
  a."teamId",
  CASE a."status"::text
    WHEN 'ASSIGNED' THEN 'TODO'::public."WorkTaskStatus"
    WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'::public."WorkTaskStatus"
    WHEN 'ISSUE_REPORTED' THEN 'BLOCKED'::public."WorkTaskStatus"
    WHEN 'QC_REWORK' THEN 'DONE'::public."WorkTaskStatus"
    WHEN 'READY_FOR_QC' THEN 'DONE'::public."WorkTaskStatus"
    WHEN 'COMPLETED' THEN 'DONE'::public."WorkTaskStatus"
    ELSE 'CANCELLED'::public."WorkTaskStatus"
  END,
  'HIGH'::public."WorkTaskPriority",
  'TASK',
  'DISPATCH',
  o."orderNumber",
  'NOT_SYNCED',
  o."id",
  'PHYSICAL:' || a."id" || ':VERIFICATION',
  TRUE,
  'PHYSICAL_VERIFICATION',
  'PHASE4A_MIGRATION_BACKFILL',
  CASE WHEN a."status"::text = 'ISSUE_REPORTED' THEN COALESCE(a."issueNotes", 'Physical verification is blocked.') ELSE NULL END,
  CASE WHEN a."status"::text IN ('QC_REWORK', 'READY_FOR_QC', 'COMPLETED') THEN CURRENT_TIMESTAMP ELSE NULL END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM public."OrderPhysicalAssignment" a
JOIN public."Order" o ON o."id" = a."orderId"
JOIN public."WorkTeam" t ON t."id" = a."teamId"
WHERE o."status" <> 'CANCELLED'::public."OrderStatus"
ON CONFLICT ("automationKey") DO NOTHING;

-- Backfill rework tasks that are currently active.
INSERT INTO public."WorkTask" (
  "id", "taskNumber", "title", "description", "teamId", "status",
  "priority", "taskType", "relatedModule", "relatedReference",
  "calendarStatus", "orderId", "automationKey", "isAutomated",
  "workflowStage", "sourceEvent", "createdAt", "updatedAt"
)
SELECT
  md5('phase4a-rework-task:' || a."id"),
  'TASK-P4A-' || upper(substr(md5('rework:' || a."id"), 1, 10)),
  'QC rework ' || o."orderNumber" || ' · ' || t."name",
  'QC returned this assignment for correction. Note: ' || COALESCE(a."qcNotes", 'Review the QC feedback and repeat complete verification.'),
  a."teamId",
  'TODO'::public."WorkTaskStatus",
  'URGENT'::public."WorkTaskPriority",
  'BLOCKER',
  'DISPATCH',
  o."orderNumber",
  'NOT_SYNCED',
  o."id",
  'PHYSICAL:' || a."id" || ':QC_REWORK',
  TRUE,
  'QC_REWORK',
  'PHASE4A_MIGRATION_BACKFILL',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM public."OrderPhysicalAssignment" a
JOIN public."Order" o ON o."id" = a."orderId"
JOIN public."WorkTeam" t ON t."id" = a."teamId"
WHERE a."status" = 'QC_REWORK'::public."PhysicalCheckStatus"
ON CONFLICT ("automationKey") DO NOTHING;

-- Backfill active QC review tasks.
WITH qc_pool AS (
  SELECT "id"
  FROM public."WorkTeam"
  WHERE "description" = '[SYSTEM_WORKFLOW_ROLE:QC_TEAM]'
  LIMIT 1
)
INSERT INTO public."WorkTask" (
  "id", "taskNumber", "title", "description", "teamId", "status",
  "priority", "taskType", "relatedModule", "relatedReference",
  "calendarStatus", "orderId", "automationKey", "isAutomated",
  "workflowStage", "sourceEvent", "blockerReason", "completedAt",
  "createdAt", "updatedAt"
)
SELECT
  md5('phase4a-qc-task:' || o."id"),
  'TASK-P4A-' || upper(substr(md5('qc:' || o."id"), 1, 10)),
  'QC review ' || o."orderNumber",
  'Inspect every fully verified product line. Approve the order or return the affected Physical Team assignment for rework.',
  qp."id",
  CASE
    WHEN o."status" = 'PENDING_QC'::public."OrderStatus" THEN 'TODO'::public."WorkTaskStatus"
    WHEN o."status" = 'QC_REWORK'::public."OrderStatus" THEN 'BLOCKED'::public."WorkTaskStatus"
    ELSE 'DONE'::public."WorkTaskStatus"
  END,
  'HIGH'::public."WorkTaskPriority",
  'APPROVAL',
  'QC',
  o."orderNumber",
  'NOT_SYNCED',
  o."id",
  'ORDER:' || o."id" || ':QC_REVIEW',
  TRUE,
  'QC_REVIEW',
  'PHASE4A_MIGRATION_BACKFILL',
  CASE WHEN o."status" = 'QC_REWORK'::public."OrderStatus" THEN 'QC rework is pending.' ELSE NULL END,
  CASE WHEN o."status" NOT IN ('PENDING_QC'::public."OrderStatus", 'QC_REWORK'::public."OrderStatus") THEN CURRENT_TIMESTAMP ELSE NULL END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM public."Order" o
CROSS JOIN qc_pool qp
WHERE o."status" IN (
  'PENDING_QC'::public."OrderStatus",
  'QC_REWORK'::public."OrderStatus",
  'QC_APPROVED'::public."OrderStatus",
  'READY_FOR_DISPATCH'::public."OrderStatus",
  'TRANSPORT_ASSIGNED'::public."OrderStatus",
  'ON_THE_WAY'::public."OrderStatus"
)
ON CONFLICT ("automationKey") DO NOTHING;

-- Backfill current manager-assisted proof requests.
WITH manager_pool AS (
  SELECT "id"
  FROM public."WorkTeam"
  WHERE "description" = '[SYSTEM_WORKFLOW_ROLE:MANAGER]'
  LIMIT 1
)
INSERT INTO public."WorkTask" (
  "id", "taskNumber", "title", "description", "teamId", "status",
  "priority", "taskType", "relatedModule", "relatedReference",
  "calendarStatus", "orderId", "automationKey", "isAutomated",
  "workflowStage", "sourceEvent", "createdAt", "updatedAt"
)
SELECT
  md5('phase4a-proof-task:' || o."id"),
  'TASK-P4A-' || upper(substr(md5('proof:' || o."id"), 1, 10)),
  'Upload proof for ' || o."orderNumber",
  COALESCE(o."deliveryProofRequestedByName", 'Assigned driver') ||
    ' requested manager assistance for delivery proof upload' ||
    CASE WHEN o."deliveryProofRequestNote" IS NOT NULL THEN ': ' || o."deliveryProofRequestNote" ELSE '.' END,
  mp."id",
  'TODO'::public."WorkTaskStatus",
  'URGENT'::public."WorkTaskPriority",
  'FOLLOW_UP',
  'DELIVERY_PROOF',
  o."orderNumber",
  'NOT_SYNCED',
  o."id",
  'ORDER:' || o."id" || ':PROOF_ASSISTANCE',
  TRUE,
  'PROOF_ASSISTANCE',
  'PHASE4A_MIGRATION_BACKFILL',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM public."Order" o
CROSS JOIN manager_pool mp
WHERE o."deliveryProofAssistanceStatus" = 'REQUESTED'::public."DeliveryProofAssistanceStatus"
ON CONFLICT ("automationKey") DO NOTHING;

-- Existing orders already waiting on a cancellation decision must pause every
-- active automated task until management approves or rejects the request.
UPDATE public."WorkTask" wt
SET
  "workflowPausePreviousStatus" = wt."status",
  "workflowPauseReason" = 'CANCELLATION_REQUESTED',
  "status" = CASE
    WHEN wt."status" = 'BLOCKED'::public."WorkTaskStatus" THEN wt."status"
    ELSE 'BLOCKED'::public."WorkTaskStatus"
  END,
  "blockerReason" = CASE
    WHEN wt."status" = 'BLOCKED'::public."WorkTaskStatus" THEN wt."blockerReason"
    ELSE 'Dealer cancellation request is awaiting management decision.'
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM public."Order" o
WHERE wt."orderId" = o."id"
  AND wt."isAutomated" = TRUE
  AND o."status" = 'CANCELLATION_REQUESTED'::public."OrderStatus"
  AND wt."status" NOT IN (
    'DONE'::public."WorkTaskStatus",
    'CANCELLED'::public."WorkTaskStatus"
  );
