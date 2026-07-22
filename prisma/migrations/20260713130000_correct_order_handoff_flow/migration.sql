ALTER TYPE public."OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_STOCK_CHECK' AFTER 'NEW_ORDER';
ALTER TYPE public."OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_QC' AFTER 'BACKORDERED';

UPDATE public."Order"
SET "status" = 'PENDING_STOCK_CHECK'::public."OrderStatus"
WHERE "status" = 'NEW_ORDER'::public."OrderStatus"
  AND "receivedAt" IS NOT NULL;

UPDATE public."Order"
SET "status" = 'PENDING_QC'::public."OrderStatus"
WHERE "status" = 'READY_FOR_DISPATCH'::public."OrderStatus";

UPDATE public."OrderStatusHistory"
SET "toStatus" = 'PENDING_STOCK_CHECK'::public."OrderStatus"
WHERE "title" = 'Order passed to Inventory'
  AND "fromStatus" = 'NEW_ORDER'::public."OrderStatus"
  AND "toStatus" = 'NEW_ORDER'::public."OrderStatus";

UPDATE public."OrderStatusHistory"
SET
  "toStatus" = 'PENDING_QC'::public."OrderStatus",
  "title" = 'Sent to QC'
WHERE "toStatus" = 'READY_FOR_DISPATCH'::public."OrderStatus"
  AND "title" = 'Ready for Dispatch';
