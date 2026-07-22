ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'DEALER_MEMBER_CREATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'DEALER_MEMBER_UPDATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'DEALER_MEMBER_DELETED';

CREATE TABLE IF NOT EXISTS "DealerMember" (
  "id" TEXT NOT NULL,
  "memberName" TEXT NOT NULL,
  "dealerName" TEXT NOT NULL,
  "contactNumber" TEXT NOT NULL,
  "createdById" TEXT,
  "createdByName" TEXT,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DealerMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DealerMember_dealerName_idx" ON "DealerMember"("dealerName");
CREATE INDEX IF NOT EXISTS "DealerMember_contactNumber_idx" ON "DealerMember"("contactNumber");
CREATE INDEX IF NOT EXISTS "DealerMember_createdAt_idx" ON "DealerMember"("createdAt");
