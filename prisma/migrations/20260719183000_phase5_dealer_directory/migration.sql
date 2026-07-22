-- Phase 5: central dealer directory, operational account profile, and controlled internal order sources.
-- This migration preserves every existing dealer, order, collection, and audit record.

ALTER TYPE public."OrderSource" ADD VALUE IF NOT EXISTS 'SALES_FIELD';

ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'DEALER_PROFILE_CREATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'DEALER_PROFILE_UPDATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'DEALER_ARCHIVED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'DEALER_REACTIVATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'INTERNAL_DEALER_ORDER_CREATED';

CREATE TABLE public."DealerProfile" (
  "id" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "contactPerson" TEXT,
  "gstNumber" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "internalNotes" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealerProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DealerProfile_creditLimit_nonnegative" CHECK ("creditLimit" >= 0)
);

CREATE UNIQUE INDEX "DealerProfile_dealerId_key" ON public."DealerProfile"("dealerId");
CREATE UNIQUE INDEX "DealerProfile_gstNumber_key" ON public."DealerProfile"("gstNumber");
CREATE INDEX "DealerProfile_businessName_idx" ON public."DealerProfile"("businessName");
CREATE INDEX "DealerProfile_city_idx" ON public."DealerProfile"("city");
CREATE INDEX "DealerProfile_state_idx" ON public."DealerProfile"("state");
CREATE INDEX "DealerProfile_updatedAt_idx" ON public."DealerProfile"("updatedAt");

ALTER TABLE public."DealerProfile"
  ADD CONSTRAINT "DealerProfile_dealerId_fkey"
  FOREIGN KEY ("dealerId") REFERENCES public."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill profiles for every user who currently owns the Dealer role, including
-- dealers whose Dealer role is stored as an additional role assignment.
INSERT INTO public."DealerProfile" (
  "id",
  "dealerId",
  "businessName",
  "contactPerson",
  "createdAt",
  "updatedAt"
)
SELECT
  'dprof_' || SUBSTRING(MD5(u."id" || ':phase5') FROM 1 FOR 24),
  u."id",
  COALESCE(NULLIF(BTRIM(u."name"), ''), u."email"),
  NULLIF(BTRIM(u."name"), ''),
  u."createdAt",
  CURRENT_TIMESTAMP
FROM public."User" u
WHERE (
  u."role" = 'DEALER'::public."UserRole"
  OR EXISTS (
    SELECT 1
    FROM public."UserRoleAssignment" ura
    WHERE ura."userId" = u."id"
      AND ura."role" = 'DEALER'::public."UserRole"
  )
)
ON CONFLICT ("dealerId") DO NOTHING;

-- A DealerProfile must always point to a user who actually owns the Dealer role.
CREATE OR REPLACE FUNCTION public.enforce_dealer_profile_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public."User" u
    WHERE u."id" = NEW."dealerId"
      AND (
        u."role" = 'DEALER'::public."UserRole"
        OR EXISTS (
          SELECT 1
          FROM public."UserRoleAssignment" ura
          WHERE ura."userId" = u."id"
            AND ura."role" = 'DEALER'::public."UserRole"
        )
      )
  ) THEN
    RAISE EXCEPTION 'DealerProfile dealerId % does not belong to a Dealer user', NEW."dealerId";
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "DealerProfile_role_guard"
BEFORE INSERT OR UPDATE OF "dealerId"
ON public."DealerProfile"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_dealer_profile_role();
