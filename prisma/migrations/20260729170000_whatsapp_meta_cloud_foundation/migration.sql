-- Direct Meta WhatsApp Cloud API foundation.
-- Secrets remain in server environment variables; this migration stores only
-- non-secret configuration, approved template mappings, outbox history and
-- idempotent webhook receipts.

ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'WHATSAPP_SETTINGS_UPDATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'WHATSAPP_TEST_SENT';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'WHATSAPP_MESSAGE_RETRIED';

CREATE TABLE IF NOT EXISTS public."WhatsAppConfiguration" (
  "id" TEXT NOT NULL DEFAULT 'primary',
  "provider" TEXT NOT NULL DEFAULT 'META_CLOUD',
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "businessDisplayName" TEXT NOT NULL DEFAULT 'Sanghvi ERP',
  "defaultCountryCode" TEXT NOT NULL DEFAULT '91',
  "lastWebhookAt" TIMESTAMP(3),
  "lastWebhookEventType" TEXT,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."WhatsAppTemplate" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "templateName" TEXT NOT NULL,
  "languageCode" TEXT NOT NULL DEFAULT 'en_US',
  "parameterKeys" JSONB NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."WhatsAppMessage" (
  "id" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
  "eventKey" TEXT,
  "senderPhone" TEXT,
  "recipientPhone" TEXT,
  "recipientName" TEXT,
  "templateName" TEXT,
  "languageCode" TEXT,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "dedupeKey" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "relatedEntityType" TEXT,
  "relatedEntityId" TEXT,
  "relatedNotificationId" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."WhatsAppWebhookEvent" (
  "id" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "eventType" TEXT,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppTemplate_eventKey_key"
  ON public."WhatsAppTemplate"("eventKey");
CREATE INDEX IF NOT EXISTS "WhatsAppTemplate_isEnabled_idx"
  ON public."WhatsAppTemplate"("isEnabled");
CREATE INDEX IF NOT EXISTS "WhatsAppTemplate_templateName_idx"
  ON public."WhatsAppTemplate"("templateName");
CREATE INDEX IF NOT EXISTS "WhatsAppTemplate_updatedAt_idx"
  ON public."WhatsAppTemplate"("updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessage_providerMessageId_key"
  ON public."WhatsAppMessage"("providerMessageId");
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessage_dedupeKey_key"
  ON public."WhatsAppMessage"("dedupeKey");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_direction_idx"
  ON public."WhatsAppMessage"("direction");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_eventKey_idx"
  ON public."WhatsAppMessage"("eventKey");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_recipientPhone_idx"
  ON public."WhatsAppMessage"("recipientPhone");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_status_idx"
  ON public."WhatsAppMessage"("status");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_nextAttemptAt_idx"
  ON public."WhatsAppMessage"("nextAttemptAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_relatedEntityType_relatedEntityId_idx"
  ON public."WhatsAppMessage"("relatedEntityType", "relatedEntityId");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_relatedNotificationId_idx"
  ON public."WhatsAppMessage"("relatedNotificationId");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_createdAt_idx"
  ON public."WhatsAppMessage"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppWebhookEvent_payloadHash_key"
  ON public."WhatsAppWebhookEvent"("payloadHash");
CREATE INDEX IF NOT EXISTS "WhatsAppWebhookEvent_eventType_idx"
  ON public."WhatsAppWebhookEvent"("eventType");
CREATE INDEX IF NOT EXISTS "WhatsAppWebhookEvent_processedAt_idx"
  ON public."WhatsAppWebhookEvent"("processedAt");
CREATE INDEX IF NOT EXISTS "WhatsAppWebhookEvent_createdAt_idx"
  ON public."WhatsAppWebhookEvent"("createdAt");

CREATE INDEX IF NOT EXISTS "WhatsAppConfiguration_isEnabled_idx"
  ON public."WhatsAppConfiguration"("isEnabled");
CREATE INDEX IF NOT EXISTS "WhatsAppConfiguration_updatedAt_idx"
  ON public."WhatsAppConfiguration"("updatedAt");

DO $$ BEGIN
  ALTER TABLE public."WhatsAppConfiguration"
    ADD CONSTRAINT "WhatsAppConfiguration_defaultCountryCode_check"
    CHECK ("defaultCountryCode" ~ '^[0-9]{1,4}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."WhatsAppTemplate"
    ADD CONSTRAINT "WhatsAppTemplate_templateName_check"
    CHECK ("templateName" ~ '^[a-z0-9_]+$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."WhatsAppTemplate"
    ADD CONSTRAINT "WhatsAppTemplate_languageCode_check"
    CHECK ("languageCode" ~ '^[a-z]{2,3}(_[A-Z]{2})?$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."WhatsAppMessage"
    ADD CONSTRAINT "WhatsAppMessage_direction_check"
    CHECK ("direction" IN ('OUTBOUND', 'INBOUND'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."WhatsAppMessage"
    ADD CONSTRAINT "WhatsAppMessage_attempts_check"
    CHECK ("attempts" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO public."WhatsAppConfiguration" (
  "id",
  "provider",
  "isEnabled",
  "businessDisplayName",
  "defaultCountryCode",
  "createdAt",
  "updatedAt"
)
VALUES (
  'primary',
  'META_CLOUD',
  false,
  'Sanghvi ERP',
  '91',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO public."WhatsAppTemplate" (
  "id",
  "eventKey",
  "displayName",
  "templateName",
  "languageCode",
  "parameterKeys",
  "isEnabled",
  "createdAt",
  "updatedAt"
)
VALUES
  ('wa-template-test', 'TEST_MESSAGE', 'Connection test', 'hello_world', 'en_US', '[]'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('wa-template-order-received', 'ORDER_RECEIVED', 'Order received', 'sanghvi_order_received', 'en', '["orderNumber", "customerName"]'::jsonb, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('wa-template-stock-blocked', 'STOCK_BLOCKED', 'Stock blocked', 'sanghvi_stock_blocked', 'en', '["orderNumber"]'::jsonb, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('wa-template-qc-approved', 'QC_APPROVED', 'QC approved', 'sanghvi_qc_approved', 'en', '["orderNumber"]'::jsonb, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('wa-template-transport-assigned', 'TRANSPORT_ASSIGNED', 'Transport assigned', 'sanghvi_transport_assigned', 'en', '["orderNumber", "driverName"]'::jsonb, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('wa-template-order-on-way', 'ORDER_ON_THE_WAY', 'Order on the way', 'sanghvi_order_on_the_way', 'en', '["orderNumber"]'::jsonb, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('wa-template-order-delivered', 'ORDER_DELIVERED', 'Order delivered', 'sanghvi_order_delivered', 'en', '["orderNumber"]'::jsonb, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('wa-template-low-stock', 'LOW_STOCK', 'Low stock alert', 'sanghvi_low_stock', 'en', '["productName", "availableQuantity"]'::jsonb, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('wa-template-blocker', 'BLOCKER', 'Workflow blocker', 'sanghvi_workflow_blocker', 'en', '["reference", "reason"]'::jsonb, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("eventKey") DO NOTHING;
