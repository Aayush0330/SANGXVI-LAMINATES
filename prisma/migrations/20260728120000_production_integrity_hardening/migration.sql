-- Production integrity hardening.
-- Preserve historical status/audit rows, normalize contradictory terminal
-- counters, and reject future partial or resurrected fulfillment states.

ALTER TYPE public."SecurityEventType"
  ADD VALUE IF NOT EXISTS 'INVENTORY_STOCK_UPDATED';

-- Terminal status is authoritative for the legacy counters. This repairs old
-- rows where cancellation and delivery counters were both left at full value.
UPDATE public."OrderItem" AS item
SET
  "blockedQuantity" = 0,
  "deliveredQuantity" = item."requestedQuantity",
  "cancelledQuantity" = 0,
  "updatedAt" = CURRENT_TIMESTAMP
FROM public."Order" AS orders
WHERE orders."id" = item."orderId"
  AND orders."status" IN (
    'DELIVERED'::public."OrderStatus",
    'INVOICE_UPLOADED'::public."OrderStatus"
  )
  AND (
    item."blockedQuantity" <> 0
    OR item."deliveredQuantity" <> item."requestedQuantity"
    OR item."cancelledQuantity" <> 0
  );

UPDATE public."OrderItem" AS item
SET
  "blockedQuantity" = 0,
  "deliveredQuantity" = 0,
  "cancelledQuantity" = item."requestedQuantity",
  "updatedAt" = CURRENT_TIMESTAMP
FROM public."Order" AS orders
WHERE orders."id" = item."orderId"
  AND orders."status" = 'CANCELLED'::public."OrderStatus"
  AND (
    item."blockedQuantity" <> 0
    OR item."deliveredQuantity" <> 0
    OR item."cancelledQuantity" <> item."requestedQuantity"
  );

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."OrderItem" AS item
    INNER JOIN public."Order" AS orders ON orders."id" = item."orderId"
    WHERE orders."status" NOT IN (
      'DELIVERED'::public."OrderStatus",
      'INVOICE_UPLOADED'::public."OrderStatus",
      'CANCELLED'::public."OrderStatus"
    )
      AND (
        item."deliveredQuantity" <> 0
        OR item."cancelledQuantity" <> 0
      )
  ) THEN
    RAISE EXCEPTION
      'Integrity hardening stopped: a non-terminal order has delivered or cancelled quantities. Review it before retrying.';
  END IF;
END
$block$;

ALTER TABLE public."OrderItem"
  DROP CONSTRAINT IF EXISTS "OrderItem_full_quantity_only",
  DROP CONSTRAINT IF EXISTS "OrderItem_fulfillment_quantities_valid";

ALTER TABLE public."OrderItem"
  ADD CONSTRAINT "OrderItem_full_quantity_only"
  CHECK (
    "requestedQuantity" > 0
    AND "quantity" = "requestedQuantity"
  ),
  ADD CONSTRAINT "OrderItem_fulfillment_quantities_valid"
  CHECK (
    "blockedQuantity" >= 0
    AND "deliveredQuantity" >= 0
    AND "cancelledQuantity" >= 0
    AND "blockedQuantity" IN (0, "requestedQuantity")
    AND "deliveredQuantity" IN (0, "requestedQuantity")
    AND "cancelledQuantity" IN (0, "requestedQuantity")
    AND (
      ("blockedQuantity" > 0)::integer
      + ("deliveredQuantity" > 0)::integer
      + ("cancelledQuantity" > 0)::integer
    ) <= 1
  );

ALTER TABLE public."Product"
  DROP CONSTRAINT IF EXISTS "Product_stock_thresholds_check";

ALTER TABLE public."Product"
  ADD CONSTRAINT "Product_stock_thresholds_check"
  CHECK (
    "quantity" >= 0
    AND "blocked" >= 0
    AND "minimumStock" >= 0
    AND "maximumStock" > 0
    AND "maximumStock" >= "minimumStock"
    AND BTRIM("unit") <> ''
  );

ALTER TABLE public."CollectionAssignment"
  DROP CONSTRAINT IF EXISTS "CollectionAssignment_amounts_valid";

ALTER TABLE public."CollectionAssignment"
  ADD CONSTRAINT "CollectionAssignment_amounts_valid"
  CHECK (
    "amountToCollect" > 0
    AND "amountCollected" >= 0
    AND "amountCollected" <= "amountToCollect"
  );

ALTER TABLE public."PurchaseRequestItem"
  DROP CONSTRAINT IF EXISTS "PurchaseRequestItem_received_not_above_ordered",
  DROP CONSTRAINT IF EXISTS "PurchaseRequestItem_quantity_progression";

ALTER TABLE public."PurchaseRequestItem"
  ADD CONSTRAINT "PurchaseRequestItem_quantity_progression"
  CHECK (
    "approvedQuantity" <= "requestedQuantity"
    AND "orderedQuantity" <= "approvedQuantity"
    AND (
      "receivedQuantity"
      + "damagedQuantity"
      + "rejectedQuantity"
    ) <= "orderedQuantity"
  );

CREATE OR REPLACE FUNCTION public."enforceOrderTerminalIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'CANCELLED'::public."OrderStatus"
       AND NEW."status" <> OLD."status" THEN
      RAISE EXCEPTION 'A cancelled order cannot be reopened.'
        USING ERRCODE = '23514';
    END IF;

    IF OLD."status" = 'INVOICE_UPLOADED'::public."OrderStatus"
       AND NEW."status" <> OLD."status" THEN
      RAISE EXCEPTION 'An invoiced order cannot be reopened.'
        USING ERRCODE = '23514';
    END IF;

    IF OLD."status" = 'DELIVERED'::public."OrderStatus"
       AND NEW."status" NOT IN (
         'DELIVERED'::public."OrderStatus",
         'INVOICE_UPLOADED'::public."OrderStatus"
       ) THEN
      RAISE EXCEPTION 'A delivered order can only advance to invoice uploaded.'
        USING ERRCODE = '23514';
    END IF;

    IF OLD."status" = 'CANCELLATION_REQUESTED'::public."OrderStatus"
       AND NEW."status" <> OLD."status"
       AND (
         NEW."cancellationDecidedAt" IS NULL
         OR NEW."cancellationDecidedById" IS NULL
         OR (
           NEW."status" <> 'CANCELLED'::public."OrderStatus"
           AND NEW."status" IS DISTINCT FROM OLD."cancellationPreviousStatus"
         )
       ) THEN
      RAISE EXCEPTION
        'A cancellation request must be explicitly approved or rejected before the workflow can continue.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."status" IN (
    'DELIVERED'::public."OrderStatus",
    'INVOICE_UPLOADED'::public."OrderStatus"
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public."OrderItem" WHERE "orderId" = NEW."id"
    ) OR EXISTS (
      SELECT 1
      FROM public."OrderItem"
      WHERE "orderId" = NEW."id"
        AND (
          "deliveredQuantity" <> "requestedQuantity"
          OR "blockedQuantity" <> 0
          OR "cancelledQuantity" <> 0
        )
    ) THEN
      RAISE EXCEPTION
        'Delivered and invoiced orders require every ordered item to be fully delivered.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."status" = 'CANCELLED'::public."OrderStatus" THEN
    IF NOT EXISTS (
      SELECT 1 FROM public."OrderItem" WHERE "orderId" = NEW."id"
    ) OR EXISTS (
      SELECT 1
      FROM public."OrderItem"
      WHERE "orderId" = NEW."id"
        AND (
          "cancelledQuantity" <> "requestedQuantity"
          OR "blockedQuantity" <> 0
          OR "deliveredQuantity" <> 0
        )
    ) THEN
      RAISE EXCEPTION
        'Cancelled orders require every ordered item to be fully cancelled.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "Order_terminal_integrity" ON public."Order";
CREATE TRIGGER "Order_terminal_integrity"
BEFORE INSERT OR UPDATE OF "status"
ON public."Order"
FOR EACH ROW
EXECUTE FUNCTION public."enforceOrderTerminalIntegrity"();

CREATE OR REPLACE FUNCTION public."enforceTerminalOrderItemIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  parent_status public."OrderStatus";
BEGIN
  SELECT "status"
  INTO parent_status
  FROM public."Order"
  WHERE "id" = NEW."orderId";

  IF parent_status IN (
    'DELIVERED'::public."OrderStatus",
    'INVOICE_UPLOADED'::public."OrderStatus"
  ) AND (
    NEW."deliveredQuantity" <> NEW."requestedQuantity"
    OR NEW."blockedQuantity" <> 0
    OR NEW."cancelledQuantity" <> 0
  ) THEN
    RAISE EXCEPTION 'Delivered order item counters are immutable.'
      USING ERRCODE = '23514';
  ELSIF parent_status = 'CANCELLED'::public."OrderStatus"
    AND (
      NEW."cancelledQuantity" <> NEW."requestedQuantity"
      OR NEW."blockedQuantity" <> 0
      OR NEW."deliveredQuantity" <> 0
    ) THEN
    RAISE EXCEPTION 'Cancelled order item counters are immutable.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "OrderItem_terminal_integrity"
ON public."OrderItem";
CREATE TRIGGER "OrderItem_terminal_integrity"
BEFORE INSERT OR UPDATE OF
  "orderId",
  "requestedQuantity",
  "quantity",
  "blockedQuantity",
  "deliveredQuantity",
  "cancelledQuantity"
ON public."OrderItem"
FOR EACH ROW
EXECUTE FUNCTION public."enforceTerminalOrderItemIntegrity"();

CREATE OR REPLACE FUNCTION public."preventTerminalOrderItemDelete"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  parent_status public."OrderStatus";
BEGIN
  SELECT "status"
  INTO parent_status
  FROM public."Order"
  WHERE "id" = OLD."orderId";

  IF parent_status IN (
    'DELIVERED'::public."OrderStatus",
    'INVOICE_UPLOADED'::public."OrderStatus",
    'CANCELLED'::public."OrderStatus"
  ) THEN
    RAISE EXCEPTION 'Items cannot be deleted from a terminal order.'
      USING ERRCODE = '23514';
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS "OrderItem_terminal_delete_guard"
ON public."OrderItem";
CREATE TRIGGER "OrderItem_terminal_delete_guard"
BEFORE DELETE ON public."OrderItem"
FOR EACH ROW
EXECUTE FUNCTION public."preventTerminalOrderItemDelete"();
