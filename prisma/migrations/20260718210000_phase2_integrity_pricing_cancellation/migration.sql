-- Phase 2 integrity patch:
-- 1) immutable order-time price snapshots,
-- 2) exact cancellation status restoration,
-- 3) current physical-team roster constraints,
-- 4) safe archival of legacy DispatchAssignment tables,
-- 5) Prisma schema / migration-history alignment.
--
-- This migration is intentionally fail-closed. If legacy records cannot be
-- mapped without guessing, it raises an exception instead of deleting data.

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'OrderItemPriceSource'
  ) THEN
    CREATE TYPE public."OrderItemPriceSource" AS ENUM (
      'DEALER_PRICE',
      'SELLING_PRICE',
      'MANUAL_PRICE',
      'LEGACY_BACKFILL'
    );
  END IF;
END
$block$;

ALTER TABLE public."OrderItem"
  ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "gstRate" DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS "lineSubtotal" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "taxAmount" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "lineTotal" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "priceSource" public."OrderItemPriceSource";

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."OrderItem" AS item
    INNER JOIN public."Product" AS product
      ON product."id" = item."productId"
    WHERE item."unitPrice" IS NULL
      AND product."dealerPrice" IS NULL
      AND product."sellingPrice" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Legacy price snapshot backfill stopped: one or more ordered products have neither dealerPrice nor sellingPrice. Add a reviewed Product Master price before retrying.';
  END IF;
END
$block$;

-- Historical orders did not retain their original price. Freeze a one-time
-- legacy snapshot from the reviewed Product Master price and mark it clearly.
UPDATE public."OrderItem" AS item
SET
  "unitPrice" = ROUND(COALESCE(product."dealerPrice", product."sellingPrice")::numeric, 2),
  "gstRate" = ROUND(COALESCE(product."gstRate", 0)::numeric, 2),
  "lineSubtotal" = ROUND(
    COALESCE(product."dealerPrice", product."sellingPrice")::numeric
    * item."requestedQuantity",
    2
  ),
  "taxAmount" = ROUND(
    (
      COALESCE(product."dealerPrice", product."sellingPrice")::numeric
      * item."requestedQuantity"
    ) * COALESCE(product."gstRate", 0)::numeric / 100,
    2
  ),
  "lineTotal" = ROUND(
    (
      COALESCE(product."dealerPrice", product."sellingPrice")::numeric
      * item."requestedQuantity"
    ) + (
      (
        COALESCE(product."dealerPrice", product."sellingPrice")::numeric
        * item."requestedQuantity"
      ) * COALESCE(product."gstRate", 0)::numeric / 100
    ),
    2
  ),
  "priceSource" = 'LEGACY_BACKFILL'::public."OrderItemPriceSource"
FROM public."Product" AS product
WHERE product."id" = item."productId"
  AND (
    item."unitPrice" IS NULL
    OR item."gstRate" IS NULL
    OR item."lineSubtotal" IS NULL
    OR item."taxAmount" IS NULL
    OR item."lineTotal" IS NULL
    OR item."priceSource" IS NULL
  );

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."OrderItem"
    WHERE "unitPrice" IS NULL
      OR "gstRate" IS NULL
      OR "lineSubtotal" IS NULL
      OR "taxAmount" IS NULL
      OR "lineTotal" IS NULL
      OR "priceSource" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Order price snapshot backfill is incomplete. Check OrderItem product references before retrying.';
  END IF;
END
$block$;

ALTER TABLE public."OrderItem"
  ALTER COLUMN "unitPrice" SET NOT NULL,
  ALTER COLUMN "gstRate" SET NOT NULL,
  ALTER COLUMN "lineSubtotal" SET NOT NULL,
  ALTER COLUMN "taxAmount" SET NOT NULL,
  ALTER COLUMN "lineTotal" SET NOT NULL,
  ALTER COLUMN "priceSource" SET NOT NULL;

ALTER TABLE public."OrderItem"
  DROP CONSTRAINT IF EXISTS "OrderItem_price_snapshot_non_negative",
  DROP CONSTRAINT IF EXISTS "OrderItem_price_snapshot_arithmetic";

ALTER TABLE public."OrderItem"
  ADD CONSTRAINT "OrderItem_price_snapshot_non_negative"
  CHECK (
    "unitPrice" >= 0
    AND "gstRate" >= 0
    AND "gstRate" <= 100
    AND "lineSubtotal" >= 0
    AND "taxAmount" >= 0
    AND "lineTotal" >= 0
  ),
  ADD CONSTRAINT "OrderItem_price_snapshot_arithmetic"
  CHECK (
    "lineSubtotal" = ROUND(("unitPrice" * "requestedQuantity")::numeric, 2)
    AND "taxAmount" = ROUND(("lineSubtotal" * "gstRate" / 100)::numeric, 2)
    AND "lineTotal" = ROUND(("lineSubtotal" + "taxAmount")::numeric, 2)
  );

CREATE OR REPLACE FUNCTION public."preventOrderItemPriceSnapshotChanges"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."unitPrice" IS DISTINCT FROM OLD."unitPrice"
     OR NEW."gstRate" IS DISTINCT FROM OLD."gstRate"
     OR NEW."lineSubtotal" IS DISTINCT FROM OLD."lineSubtotal"
     OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount"
     OR NEW."lineTotal" IS DISTINCT FROM OLD."lineTotal"
     OR NEW."priceSource" IS DISTINCT FROM OLD."priceSource" THEN
    RAISE EXCEPTION
      'OrderItem price snapshots are immutable after order creation.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "OrderItem_price_snapshot_immutable"
ON public."OrderItem";
CREATE TRIGGER "OrderItem_price_snapshot_immutable"
BEFORE UPDATE OF "unitPrice", "gstRate", "lineSubtotal", "taxAmount", "lineTotal", "priceSource"
ON public."OrderItem"
FOR EACH ROW
EXECUTE FUNCTION public."preventOrderItemPriceSnapshotChanges"();

ALTER TABLE public."Order"
  ADD COLUMN IF NOT EXISTS "cancellationPreviousStatus" public."OrderStatus",
  ADD COLUMN IF NOT EXISTS "cancellationRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellationRequestedById" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationRequestedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationRequestReason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationDecidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellationDecidedById" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationDecidedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationDecisionReason" TEXT;

WITH latest_cancellation_request AS (
  SELECT DISTINCT ON (status_history."orderId")
    status_history."orderId",
    status_history."fromStatus",
    status_history."createdAt",
    status_history."changedByName",
    status_history."description"
  FROM public."OrderStatusHistory" AS status_history
  WHERE status_history."toStatus" = 'CANCELLATION_REQUESTED'::public."OrderStatus"
  ORDER BY status_history."orderId", status_history."createdAt" DESC
)
UPDATE public."Order" AS orders
SET
  "cancellationPreviousStatus" = history."fromStatus",
  "cancellationRequestedAt" = COALESCE(orders."cancellationRequestedAt", history."createdAt"),
  "cancellationRequestedByName" = COALESCE(orders."cancellationRequestedByName", history."changedByName"),
  "cancellationRequestReason" = COALESCE(orders."cancellationRequestReason", history."description")
FROM latest_cancellation_request AS history
WHERE history."orderId" = orders."id"
  AND orders."status" = 'CANCELLATION_REQUESTED'::public."OrderStatus"
  AND orders."cancellationPreviousStatus" IS NULL;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."Order"
    WHERE "status" = 'CANCELLATION_REQUESTED'::public."OrderStatus"
      AND "cancellationPreviousStatus" IS NULL
  ) THEN
    RAISE EXCEPTION
      'A legacy cancellation request has no recoverable previous status. Add or fix its OrderStatusHistory before retrying.';
  END IF;
END
$block$;

CREATE INDEX IF NOT EXISTS "Order_cancellationPreviousStatus_idx"
  ON public."Order"("cancellationPreviousStatus");
CREATE INDEX IF NOT EXISTS "Order_cancellationRequestedAt_idx"
  ON public."Order"("cancellationRequestedAt");
CREATE INDEX IF NOT EXISTS "Order_source_idx" ON public."Order"("source");
CREATE INDEX IF NOT EXISTS "Order_priority_idx" ON public."Order"("priority");
CREATE INDEX IF NOT EXISTS "Order_requiredBy_idx" ON public."Order"("requiredBy");

-- Audit the legacy assignment tables before removing them from the active model.
DO $block$
DECLARE
  missing_assignments INTEGER := 0;
  missing_items INTEGER := 0;
BEGIN
  IF to_regclass('public."DispatchAssignment"') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO missing_assignments
    FROM public."DispatchAssignment" AS legacy_assignment
    LEFT JOIN public."OrderPhysicalAssignment" AS current_assignment
      ON current_assignment."orderId" = legacy_assignment."orderId"
      AND current_assignment."teamId" = legacy_assignment."teamId"
    WHERE current_assignment."id" IS NULL;

    IF missing_assignments > 0 THEN
      RAISE EXCEPTION
        'Legacy DispatchAssignment audit failed: % assignment(s) are not represented in OrderPhysicalAssignment.',
        missing_assignments;
    END IF;
  END IF;

  IF to_regclass('public."DispatchAssignmentItem"') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO missing_items
    FROM public."DispatchAssignmentItem" AS legacy_item
    INNER JOIN public."DispatchAssignment" AS legacy_assignment
      ON legacy_assignment."id" = legacy_item."assignmentId"
    LEFT JOIN public."OrderPhysicalAssignmentItem" AS current_item
      ON current_item."orderItemId" = legacy_item."orderItemId"
    LEFT JOIN public."OrderPhysicalAssignment" AS current_assignment
      ON current_assignment."id" = current_item."assignmentId"
      AND current_assignment."orderId" = legacy_assignment."orderId"
      AND current_assignment."teamId" = legacy_assignment."teamId"
    WHERE current_item."id" IS NULL OR current_assignment."id" IS NULL;

    IF missing_items > 0 THEN
      RAISE EXCEPTION
        'Legacy DispatchAssignmentItem audit failed: % item(s) are not represented in the current physical workflow.',
        missing_items;
    END IF;
  END IF;
END
$block$;

-- Preserve audited legacy data as archive tables instead of deleting history.
DO $block$
BEGIN
  IF to_regclass('public."DispatchAssignmentItem"') IS NOT NULL THEN
    IF to_regclass('public."LegacyDispatchAssignmentItem"') IS NOT NULL THEN
      RAISE EXCEPTION
        'Cannot archive DispatchAssignmentItem because LegacyDispatchAssignmentItem already exists.';
    END IF;
    ALTER TABLE public."DispatchAssignmentItem"
      RENAME TO "LegacyDispatchAssignmentItem";
  END IF;

  IF to_regclass('public."DispatchAssignment"') IS NOT NULL THEN
    IF to_regclass('public."LegacyDispatchAssignment"') IS NOT NULL THEN
      RAISE EXCEPTION
        'Cannot archive DispatchAssignment because LegacyDispatchAssignment already exists.';
    END IF;
    ALTER TABLE public."DispatchAssignment"
      RENAME TO "LegacyDispatchAssignment";
  END IF;
END
$block$;

DROP TRIGGER IF EXISTS "WorkTeamMember_physical_roster_integrity"
ON public."WorkTeamMember";
DROP FUNCTION IF EXISTS public."enforcePhysicalTeamRosterIntegrity"();

UPDATE public."WorkTeam"
SET
  "teamType" = 'PHYSICAL_DISPATCH'::public."WorkTeamType",
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "teamType"::text = 'DISPATCH';

DO $block$
BEGIN
  IF EXISTS (
    SELECT member."userId"
    FROM public."WorkTeamMember" AS member
    INNER JOIN public."WorkTeam" AS team ON team."id" = member."teamId"
    WHERE team."teamType"::text = 'PHYSICAL_DISPATCH'
      AND team."isActive" = true
    GROUP BY member."userId"
    HAVING COUNT(DISTINCT member."teamId") > 1
  ) THEN
    RAISE EXCEPTION
      'Physical roster audit failed: a worker belongs to more than one active Physical Dispatch Team.';
  END IF;

  IF EXISTS (
    SELECT member."teamId"
    FROM public."WorkTeamMember" AS member
    INNER JOIN public."WorkTeam" AS team ON team."id" = member."teamId"
    WHERE team."teamType"::text = 'PHYSICAL_DISPATCH'
      AND team."isActive" = true
      AND member."role" = 'LEAD'::public."WorkTeamMemberRole"
    GROUP BY member."teamId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Physical roster audit failed: an active Physical Dispatch Team has more than one lead.';
  END IF;
END
$block$;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    INNER JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'WorkTeamType'
      AND enum_value.enumlabel = 'DISPATCH'
  ) THEN
    ALTER TABLE public."WorkTeam" ALTER COLUMN "teamType" DROP DEFAULT;
    ALTER TYPE public."WorkTeamType" RENAME TO "WorkTeamType_legacy";
    CREATE TYPE public."WorkTeamType" AS ENUM ('GENERAL', 'PHYSICAL_DISPATCH');
    ALTER TABLE public."WorkTeam"
      ALTER COLUMN "teamType" TYPE public."WorkTeamType"
      USING ("teamType"::text::public."WorkTeamType");
    ALTER TABLE public."WorkTeam"
      ALTER COLUMN "teamType" SET DEFAULT 'GENERAL'::public."WorkTeamType";
    DROP TYPE public."WorkTeamType_legacy";
  END IF;
END
$block$;

CREATE OR REPLACE FUNCTION public."enforcePhysicalTeamRosterIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  target_team_type public."WorkTeamType";
  target_team_active BOOLEAN;
BEGIN
  SELECT team."teamType", team."isActive"
  INTO target_team_type, target_team_active
  FROM public."WorkTeam" AS team
  WHERE team."id" = NEW."teamId";

  IF target_team_type = 'PHYSICAL_DISPATCH'::public."WorkTeamType"
     AND target_team_active = true THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('physical-team-worker:' || NEW."userId")
    );

    IF EXISTS (
      SELECT 1
      FROM public."WorkTeamMember" AS existing_member
      INNER JOIN public."WorkTeam" AS existing_team
        ON existing_team."id" = existing_member."teamId"
      WHERE existing_member."userId" = NEW."userId"
        AND existing_member."id" <> NEW."id"
        AND existing_team."teamType" = 'PHYSICAL_DISPATCH'::public."WorkTeamType"
        AND existing_team."isActive" = true
    ) THEN
      RAISE EXCEPTION
        'A worker can belong to only one active Physical Dispatch Team.'
        USING ERRCODE = '23505';
    END IF;

    IF NEW."role" = 'LEAD'::public."WorkTeamMemberRole" THEN
      PERFORM pg_advisory_xact_lock(
        hashtext('physical-team-lead:' || NEW."teamId")
      );

      IF EXISTS (
        SELECT 1
        FROM public."WorkTeamMember" AS existing_lead
        WHERE existing_lead."teamId" = NEW."teamId"
          AND existing_lead."id" <> NEW."id"
          AND existing_lead."role" = 'LEAD'::public."WorkTeamMemberRole"
      ) THEN
        RAISE EXCEPTION
          'A Physical Dispatch Team can have only one lead.'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER "WorkTeamMember_physical_roster_integrity"
BEFORE INSERT OR UPDATE OF "teamId", "userId", "role"
ON public."WorkTeamMember"
FOR EACH ROW
EXECUTE FUNCTION public."enforcePhysicalTeamRosterIntegrity"();

CREATE OR REPLACE FUNCTION public."enforcePhysicalTeamActivationIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."teamType" = 'PHYSICAL_DISPATCH'::public."WorkTeamType"
     AND NEW."isActive" = true THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('physical-team-activation:' || NEW."id")
    );

    IF EXISTS (
      SELECT 1
      FROM public."WorkTeamMember" AS target_member
      INNER JOIN public."WorkTeamMember" AS other_member
        ON other_member."userId" = target_member."userId"
       AND other_member."teamId" <> NEW."id"
      INNER JOIN public."WorkTeam" AS other_team
        ON other_team."id" = other_member."teamId"
      WHERE target_member."teamId" = NEW."id"
        AND other_team."teamType" = 'PHYSICAL_DISPATCH'::public."WorkTeamType"
        AND other_team."isActive" = true
    ) THEN
      RAISE EXCEPTION
        'This Physical Dispatch Team cannot be activated because a worker already belongs to another active Physical Dispatch Team.'
        USING ERRCODE = '23505';
    END IF;

    IF (
      SELECT COUNT(*)
      FROM public."WorkTeamMember" AS team_member
      WHERE team_member."teamId" = NEW."id"
        AND team_member."role" = 'LEAD'::public."WorkTeamMemberRole"
    ) > 1 THEN
      RAISE EXCEPTION
        'A Physical Dispatch Team can have only one lead.'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "WorkTeam_physical_activation_integrity"
ON public."WorkTeam";
CREATE TRIGGER "WorkTeam_physical_activation_integrity"
BEFORE INSERT OR UPDATE OF "isActive", "teamType"
ON public."WorkTeam"
FOR EACH ROW
EXECUTE FUNCTION public."enforcePhysicalTeamActivationIntegrity"();
