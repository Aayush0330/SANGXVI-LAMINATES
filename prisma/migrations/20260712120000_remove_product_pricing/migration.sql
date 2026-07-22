ALTER TABLE public."Product"
  DROP COLUMN IF EXISTS "costPrice",
  DROP COLUMN IF EXISTS "sellingPrice",
  DROP COLUMN IF EXISTS "dealerPrice",
  DROP COLUMN IF EXISTS "gstPercent";

ALTER TABLE public."Order"
  DROP COLUMN IF EXISTS "subtotalAmount",
  DROP COLUMN IF EXISTS "taxAmount",
  DROP COLUMN IF EXISTS "discountAmount",
  DROP COLUMN IF EXISTS "freightAmount";

ALTER TABLE public."OrderItem"
  DROP COLUMN IF EXISTS "unitPrice",
  DROP COLUMN IF EXISTS "gstPercent",
  DROP COLUMN IF EXISTS "subtotalAmount",
  DROP COLUMN IF EXISTS "taxAmount",
  DROP COLUMN IF EXISTS "totalAmount";
