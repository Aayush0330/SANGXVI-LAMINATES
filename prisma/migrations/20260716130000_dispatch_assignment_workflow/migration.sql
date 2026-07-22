CREATE TYPE public."WorkTeamType" AS ENUM (
  'GENERAL',
  'DISPATCH',
  'PHYSICAL_DISPATCH'
);
CREATE TYPE public."DispatchAssignmentStatus" AS ENUM (
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'PROBLEM_FOUND',
  'READY_FOR_QC',
  'REWORK_REQUIRED',
  'REWORK_IN_PROGRESS',
  'COMPLETED'
);
CREATE TYPE public."OrderSource" AS ENUM (
  'DEALER_PORTAL',
  'WALK_IN',
  'PHONE',
  'WHATSAPP',
  'MANUAL_ENTRY'
);

ALTER TABLE public."WorkTeam"
  ADD COLUMN "teamType" public."WorkTeamType" NOT NULL DEFAULT 'GENERAL';

UPDATE public."WorkTeam" team
SET "teamType" = 'DISPATCH'
WHERE
  LOWER(team."name") LIKE '%dispatch%'
  OR EXISTS (
    SELECT 1
    FROM public."WorkTeamMember" member
    INNER JOIN public."User" app_user ON app_user."id" = member."userId"
    WHERE member."teamId" = team."id"
      AND app_user."role" = 'DISPATCH_TEAM'
  );

ALTER TABLE public."Order"
  ADD COLUMN "source" public."OrderSource" NOT NULL DEFAULT 'DEALER_PORTAL',
  ADD COLUMN "enteredById" TEXT,
  ADD COLUMN "enteredByName" TEXT,
  ADD COLUMN "enteredByRole" TEXT,
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "requiredBy" TIMESTAMP(3);

CREATE TABLE public."DispatchAssignment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "status" public."DispatchAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "instructions" TEXT,
  "issueType" TEXT,
  "issueReason" TEXT,
  "acceptedById" TEXT,
  "acceptedByName" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "startedById" TEXT,
  "startedByName" TEXT,
  "startedAt" TIMESTAMP(3),
  "readyById" TEXT,
  "readyByName" TEXT,
  "readyAt" TIMESTAMP(3),
  "reworkCount" INTEGER NOT NULL DEFAULT 0,
  "qcRejectedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."DispatchAssignmentItem" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "assignedQuantity" INTEGER NOT NULL,
  "verifiedQuantity" INTEGER NOT NULL DEFAULT 0,
  "issueQuantity" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchAssignmentItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DispatchAssignmentItem_quantity_check"
    CHECK (
      "assignedQuantity" > 0
      AND "verifiedQuantity" >= 0
      AND "issueQuantity" >= 0
      AND "verifiedQuantity" <= "assignedQuantity"
      AND "issueQuantity" <= "assignedQuantity"
    )
);

ALTER TABLE public."DispatchAssignment"
  ADD CONSTRAINT "DispatchAssignment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES public."Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DispatchAssignment_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES public."WorkTeam"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public."DispatchAssignmentItem"
  ADD CONSTRAINT "DispatchAssignmentItem_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES public."DispatchAssignment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DispatchAssignmentItem_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES public."OrderItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "DispatchAssignment_orderId_teamId_key"
  ON public."DispatchAssignment"("orderId", "teamId");
CREATE INDEX "DispatchAssignment_orderId_idx" ON public."DispatchAssignment"("orderId");
CREATE INDEX "DispatchAssignment_teamId_idx" ON public."DispatchAssignment"("teamId");
CREATE INDEX "DispatchAssignment_status_idx" ON public."DispatchAssignment"("status");
CREATE INDEX "DispatchAssignment_priority_idx" ON public."DispatchAssignment"("priority");
CREATE INDEX "DispatchAssignment_createdAt_idx" ON public."DispatchAssignment"("createdAt");
CREATE UNIQUE INDEX "DispatchAssignmentItem_assignmentId_orderItemId_key"
  ON public."DispatchAssignmentItem"("assignmentId", "orderItemId");
CREATE INDEX "DispatchAssignmentItem_assignmentId_idx"
  ON public."DispatchAssignmentItem"("assignmentId");
CREATE INDEX "DispatchAssignmentItem_orderItemId_idx"
  ON public."DispatchAssignmentItem"("orderItemId");
CREATE INDEX "WorkTeam_teamType_idx" ON public."WorkTeam"("teamType");
CREATE INDEX "Order_source_idx" ON public."Order"("source");
CREATE INDEX "Order_priority_idx" ON public."Order"("priority");
CREATE INDEX "Order_requiredBy_idx" ON public."Order"("requiredBy");
