-- Permanently remove the Meta WhatsApp Control Center and its stored data.
-- The original foundation migration remains in history so existing and fresh
-- databases converge through the same forward-only migration chain.

DROP TABLE IF EXISTS public."WhatsAppWebhookEvent";
DROP TABLE IF EXISTS public."WhatsAppMessage";
DROP TABLE IF EXISTS public."WhatsAppTemplate";
DROP TABLE IF EXISTS public."WhatsAppConfiguration";

DELETE FROM public."SecurityAuditLog"
WHERE "eventType"::text IN (
  'WHATSAPP_SETTINGS_UPDATED',
  'WHATSAPP_TEST_SENT',
  'WHATSAPP_MESSAGE_RETRIED'
);

ALTER TYPE public."SecurityEventType"
  RENAME TO "SecurityEventType_with_whatsapp";

DO $$
DECLARE
  enum_values TEXT;
BEGIN
  SELECT string_agg(quote_literal(enumlabel), ', ' ORDER BY enumsortorder)
  INTO enum_values
  FROM pg_enum
  INNER JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
  INNER JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
  WHERE pg_namespace.nspname = 'public'
    AND pg_type.typname = 'SecurityEventType_with_whatsapp'
    AND enumlabel NOT IN (
      'WHATSAPP_SETTINGS_UPDATED',
      'WHATSAPP_TEST_SENT',
      'WHATSAPP_MESSAGE_RETRIED'
    );

  EXECUTE
    'CREATE TYPE public."SecurityEventType" AS ENUM (' || enum_values || ')';
END
$$;

ALTER TABLE public."SecurityAuditLog"
  ALTER COLUMN "eventType" TYPE public."SecurityEventType"
  USING ("eventType"::text::public."SecurityEventType");

DROP TYPE public."SecurityEventType_with_whatsapp";
