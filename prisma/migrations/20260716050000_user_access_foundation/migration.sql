-- Multi-role users, former employee archival, optional geofencing, and legacy Inventory Team removal.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'FORMER_EMPLOYEE';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GeofenceMode') THEN CREATE TYPE "GeofenceMode" AS ENUM ('OFFICE_REQUIRED', 'ANYWHERE'); END IF; END $$;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "geofenceMode" "GeofenceMode" NOT NULL DEFAULT 'OFFICE_REQUIRED', ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "archivedById" TEXT, ADD COLUMN IF NOT EXISTS "archivedByName" TEXT, ADD COLUMN IF NOT EXISTS "exitReason" TEXT;
UPDATE "User" SET "role" = 'DISPATCH_TEAM' WHERE "role"::text = 'INVENTORY_TEAM';
UPDATE "NotificationRecipient" SET "roleSnapshot" = 'DISPATCH_TEAM' WHERE "roleSnapshot"::text = 'INVENTORY_TEAM';
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('OWNER','MANAGER','ACCOUNTANT','DISPATCH_TEAM','ORDER_TEAM','QC_TEAM','DRIVER_TRANSPORT','COLLECTION_TEAM','SALES_FIELD_TEAM','DEALER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
ALTER TABLE "NotificationRecipient" ALTER COLUMN "roleSnapshot" TYPE "UserRole" USING ("roleSnapshot"::text::"UserRole");
DROP TYPE "UserRole_old";
CREATE TABLE IF NOT EXISTS "UserRoleAssignment" ("id" TEXT NOT NULL,"userId" TEXT NOT NULL,"role" "UserRole" NOT NULL,"isPrimary" BOOLEAN NOT NULL DEFAULT false,"assignedById" TEXT,"assignedByName" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "UserRoleAssignment_userId_role_key" ON "UserRoleAssignment"("userId","role");
CREATE INDEX IF NOT EXISTS "UserRoleAssignment_userId_idx" ON "UserRoleAssignment"("userId");
CREATE INDEX IF NOT EXISTS "UserRoleAssignment_role_idx" ON "UserRoleAssignment"("role");
CREATE UNIQUE INDEX IF NOT EXISTS "UserRoleAssignment_one_primary_per_user" ON "UserRoleAssignment"("userId") WHERE "isPrimary"=true;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='UserRoleAssignment_userId_fkey') THEN ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='UserRoleAssignment_assignedById_fkey') THEN ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;
INSERT INTO "UserRoleAssignment" ("id","userId","role","isPrimary","assignedByName","createdAt","updatedAt") SELECT 'ura_'||md5("id"||':'||"role"::text),"id","role",true,'System migration',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "User" ON CONFLICT ("userId","role") DO UPDATE SET "isPrimary"=true,"updatedAt"=CURRENT_TIMESTAMP;
