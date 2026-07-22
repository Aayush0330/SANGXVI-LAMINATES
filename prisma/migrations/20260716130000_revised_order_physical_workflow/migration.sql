-- Revised order workflow: Order Receiving -> Physical Dispatch Teams -> QC -> Transport/Delivery.
-- Legacy stock statuses remain in the enum for historical compatibility, but new orders use the new stages.

ALTER TYPE public."OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_TEAM_ASSIGNMENT';
ALTER TYPE public."OrderStatus" ADD VALUE IF NOT EXISTS 'PHYSICAL_CHECK_ASSIGNED';
ALTER TYPE public."OrderStatus" ADD VALUE IF NOT EXISTS 'PHYSICAL_CHECK_IN_PROGRESS';
ALTER TYPE public."OrderStatus" ADD VALUE IF NOT EXISTS 'PHYSICAL_CHECK_ISSUE';
ALTER TYPE public."OrderStatus" ADD VALUE IF NOT EXISTS 'QC_REWORK';

ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_OWNER_UNAVAILABLE_RECORDED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PHYSICAL_TEAM_ASSIGNED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PHYSICAL_CHECK_STARTED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PHYSICAL_CHECK_COMPLETED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PHYSICAL_CHECK_ISSUE_REPORTED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'QC_REWORK_REQUESTED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'QC_REWORK_COMPLETED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'QC_APPROVED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkTeamType') THEN
    CREATE TYPE public."WorkTeamType" AS ENUM ('GENERAL', 'PHYSICAL_DISPATCH');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PhysicalCheckStatus') THEN
    CREATE TYPE public."PhysicalCheckStatus" AS ENUM (
      'ASSIGNED',
      'IN_PROGRESS',
      'READY_FOR_QC',
      'ISSUE_REPORTED',
      'QC_REWORK',
      'COMPLETED',
      'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PhysicalCheckIssueType') THEN
    CREATE TYPE public."PhysicalCheckIssueType" AS ENUM (
      'SHORT_QUANTITY',
      'DAMAGED_PRODUCT',
      'WRONG_PRODUCT',
      'QUANTITY_MISMATCH',
      'PRODUCT_UNAVAILABLE',
      'OTHER'
    );
  END IF;
END $$;

-- WorkTeamType may already exist from the dispatch-assignment migration with
-- only GENERAL and DISPATCH. Add the revised workflow value before using it.
ALTER TYPE public."WorkTeamType"
  ADD VALUE IF NOT EXISTS 'PHYSICAL_DISPATCH';

ALTER TABLE public."WorkTeam"
  ADD COLUMN IF NOT EXISTS "teamType" public."WorkTeamType" NOT NULL DEFAULT 'GENERAL';

UPDATE public."WorkTeam"
SET "teamType" = 'PHYSICAL_DISPATCH'::public."WorkTeamType"
WHERE "teamType" = 'GENERAL'::public."WorkTeamType"
  AND (
    lower("name") LIKE '%dispatch%'
    OR lower("name") LIKE '%physical%'
    OR lower("name") LIKE '%stock team%'
  );

CREATE INDEX IF NOT EXISTS "WorkTeam_teamType_idx" ON public."WorkTeam"("teamType");

CREATE TABLE IF NOT EXISTS public."OrderPhysicalAssignment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "status" public."PhysicalCheckStatus" NOT NULL DEFAULT 'ASSIGNED',
  "assignedById" TEXT,
  "assignedByName" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedById" TEXT,
  "startedByName" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedById" TEXT,
  "completedByName" TEXT,
  "completedAt" TIMESTAMP(3),
  "issueType" public."PhysicalCheckIssueType",
  "issueNotes" TEXT,
  "qcRejectedById" TEXT,
  "qcRejectedByName" TEXT,
  "qcRejectedAt" TIMESTAMP(3),
  "qcNotes" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderPhysicalAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."OrderPhysicalAssignmentItem" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "assignedQuantity" INTEGER NOT NULL,
  "verifiedQuantity" INTEGER,
  "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
  "shortQuantity" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "checkedById" TEXT,
  "checkedByName" TEXT,
  "checkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderPhysicalAssignmentItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderPhysicalAssignment_orderId_teamId_key"
  ON public."OrderPhysicalAssignment"("orderId", "teamId");
CREATE INDEX IF NOT EXISTS "OrderPhysicalAssignment_orderId_idx"
  ON public."OrderPhysicalAssignment"("orderId");
CREATE INDEX IF NOT EXISTS "OrderPhysicalAssignment_teamId_idx"
  ON public."OrderPhysicalAssignment"("teamId");
CREATE INDEX IF NOT EXISTS "OrderPhysicalAssignment_status_idx"
  ON public."OrderPhysicalAssignment"("status");
CREATE INDEX IF NOT EXISTS "OrderPhysicalAssignment_assignedAt_idx"
  ON public."OrderPhysicalAssignment"("assignedAt");
CREATE INDEX IF NOT EXISTS "OrderPhysicalAssignment_startedAt_idx"
  ON public."OrderPhysicalAssignment"("startedAt");
CREATE INDEX IF NOT EXISTS "OrderPhysicalAssignment_completedAt_idx"
  ON public."OrderPhysicalAssignment"("completedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "OrderPhysicalAssignmentItem_orderItemId_key"
  ON public."OrderPhysicalAssignmentItem"("orderItemId");
CREATE INDEX IF NOT EXISTS "OrderPhysicalAssignmentItem_assignmentId_idx"
  ON public."OrderPhysicalAssignmentItem"("assignmentId");
CREATE INDEX IF NOT EXISTS "OrderPhysicalAssignmentItem_checkedById_idx"
  ON public."OrderPhysicalAssignmentItem"("checkedById");
CREATE INDEX IF NOT EXISTS "OrderPhysicalAssignmentItem_checkedAt_idx"
  ON public."OrderPhysicalAssignmentItem"("checkedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderPhysicalAssignment_orderId_fkey') THEN
    ALTER TABLE public."OrderPhysicalAssignment"
      ADD CONSTRAINT "OrderPhysicalAssignment_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES public."Order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderPhysicalAssignment_teamId_fkey') THEN
    ALTER TABLE public."OrderPhysicalAssignment"
      ADD CONSTRAINT "OrderPhysicalAssignment_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES public."WorkTeam"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderPhysicalAssignment_assignedById_fkey') THEN
    ALTER TABLE public."OrderPhysicalAssignment"
      ADD CONSTRAINT "OrderPhysicalAssignment_assignedById_fkey"
      FOREIGN KEY ("assignedById") REFERENCES public."User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderPhysicalAssignment_startedById_fkey') THEN
    ALTER TABLE public."OrderPhysicalAssignment"
      ADD CONSTRAINT "OrderPhysicalAssignment_startedById_fkey"
      FOREIGN KEY ("startedById") REFERENCES public."User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderPhysicalAssignment_completedById_fkey') THEN
    ALTER TABLE public."OrderPhysicalAssignment"
      ADD CONSTRAINT "OrderPhysicalAssignment_completedById_fkey"
      FOREIGN KEY ("completedById") REFERENCES public."User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderPhysicalAssignment_qcRejectedById_fkey') THEN
    ALTER TABLE public."OrderPhysicalAssignment"
      ADD CONSTRAINT "OrderPhysicalAssignment_qcRejectedById_fkey"
      FOREIGN KEY ("qcRejectedById") REFERENCES public."User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderPhysicalAssignmentItem_assignmentId_fkey') THEN
    ALTER TABLE public."OrderPhysicalAssignmentItem"
      ADD CONSTRAINT "OrderPhysicalAssignmentItem_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES public."OrderPhysicalAssignment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderPhysicalAssignmentItem_orderItemId_fkey') THEN
    ALTER TABLE public."OrderPhysicalAssignmentItem"
      ADD CONSTRAINT "OrderPhysicalAssignmentItem_orderItemId_fkey"
      FOREIGN KEY ("orderItemId") REFERENCES public."OrderItem"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderPhysicalAssignmentItem_checkedById_fkey') THEN
    ALTER TABLE public."OrderPhysicalAssignmentItem"
      ADD CONSTRAINT "OrderPhysicalAssignmentItem_checkedById_fkey"
      FOREIGN KEY ("checkedById") REFERENCES public."User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderPhysicalAssignmentItem_quantity_check') THEN
    ALTER TABLE public."OrderPhysicalAssignmentItem"
      ADD CONSTRAINT "OrderPhysicalAssignmentItem_quantity_check"
      CHECK (
        "assignedQuantity" > 0
        AND ("verifiedQuantity" IS NULL OR "verifiedQuantity" >= 0)
        AND "damagedQuantity" >= 0
        AND "shortQuantity" >= 0
      );
  END IF;
END $$;
