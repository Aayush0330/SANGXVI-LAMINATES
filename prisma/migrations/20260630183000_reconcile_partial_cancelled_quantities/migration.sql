-- Return any still-blocked quantity on closed partial cancellations to available stock.
WITH "releaseByProduct" AS (
  SELECT
    oi."productId",
    SUM(oi."blockedQuantity")::integer AS "quantity"
  FROM "OrderItem" oi
  INNER JOIN "Order" o ON o."id" = oi."orderId"
  WHERE o."status" = 'PARTIALLY_CANCELLED'
    AND oi."blockedQuantity" > 0
  GROUP BY oi."productId"
)
UPDATE "Product" p
SET
  "quantity" = p."quantity" + release."quantity",
  "blocked" = GREATEST(0, p."blocked" - release."quantity"),
  "status" = (
    CASE
      WHEN p."quantity" + release."quantity" <= 0 THEN 'OUT_OF_STOCK'
      WHEN p."quantity" + release."quantity" <= p."minimumStock" THEN 'LOW_STOCK'
      ELSE 'AVAILABLE'
    END
  )::"ProductStatus",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "releaseByProduct" release
WHERE p."id" = release."productId";

-- Close timeline rows for the stock returned above. Delivered timeline rows remain CONSUMED.
UPDATE "StockBlockTimeline" sbt
SET
  "status" = 'RELEASED',
  "releaseReason" = 'PARTIAL_CANCELLATION_RECONCILED',
  "releasedAt" = COALESCE(sbt."releasedAt", CURRENT_TIMESTAMP),
  "notes" = CASE
    WHEN sbt."notes" IS NULL OR sbt."notes" = ''
      THEN 'Active blocked stock released while reconciling a partially cancelled order.'
    ELSE sbt."notes" || ' Active blocked stock released while reconciling a partially cancelled order.'
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "OrderItem" oi, "Order" o
WHERE sbt."orderItemId" = oi."id"
  AND oi."orderId" = o."id"
  AND o."status" = 'PARTIALLY_CANCELLED'
  AND sbt."status" = 'ACTIVE';

-- Delivered/consumed quantity stays delivered. Everything else originally requested is closed.
UPDATE "OrderItem" oi
SET
  "quantity" = GREATEST(oi."quantity", COALESCE(NULLIF(oi."requestedQuantity", 0), oi."quantity")),
  "cancelledQuantity" = GREATEST(
    0,
    COALESCE(NULLIF(oi."requestedQuantity", 0), oi."quantity") - COALESCE(oi."deliveredQuantity", 0)
  ),
  "blockedQuantity" = 0
FROM "Order" o
WHERE oi."orderId" = o."id"
  AND o."status" = 'PARTIALLY_CANCELLED';
