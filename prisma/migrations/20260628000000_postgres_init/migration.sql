-- PostgreSQL baseline schema for Sangxvi ERP demo deployment.
-- Use this on a clean Postgres database. Delete old SQLite migrations before deploying to Vercel.

CREATE TYPE "UserRole" AS ENUM (
  'OWNER', 'MANAGER', 'ACCOUNTANT', 'INVENTORY_TEAM', 'DISPATCH_TEAM', 'QC_TEAM',
  'DRIVER_TRANSPORT', 'COLLECTION_TEAM', 'SALES_FIELD_TEAM', 'DEALER'
);

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TYPE "ProductStatus" AS ENUM ('AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK');

CREATE TYPE "OrderStatus" AS ENUM (
  'NEW_ORDER', 'STOCK_CHECKED', 'STOCK_BLOCKED', 'PARTIALLY_BLOCKED', 'BACKORDERED',
  'READY_FOR_DISPATCH', 'QC_APPROVED', 'CANCELLATION_REQUESTED', 'TRANSPORT_ASSIGNED',
  'ON_THE_WAY', 'PARTIALLY_DELIVERED', 'DELIVERED', 'INVOICE_UPLOADED',
  'PARTIALLY_CANCELLED', 'CANCELLED'
);

CREATE TYPE "SecurityEventType" AS ENUM (
  'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'ACCESS_DENIED',
  'PASSWORD_RESET', 'PASSWORD_CHANGED', 'FIRST_OWNER_CREATED'
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "passwordHash" TEXT,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  "role" "UserRole" NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityAuditLog" (
  "id" TEXT NOT NULL,
  "eventType" "SecurityEventType" NOT NULL,
  "userId" TEXT,
  "userName" TEXT,
  "userEmail" TEXT,
  "userRole" TEXT,
  "path" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "stack" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "blocked" INTEGER NOT NULL DEFAULT 0,
  "minimumStock" INTEGER NOT NULL DEFAULT 0,
  "status" "ProductStatus" NOT NULL DEFAULT 'AVAILABLE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "assignedDriverId" TEXT,
  "status" "OrderStatus" NOT NULL DEFAULT 'NEW_ORDER',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "requestedQuantity" INTEGER NOT NULL DEFAULT 0,
  "quantity" INTEGER NOT NULL,
  "blockedQuantity" INTEGER NOT NULL DEFAULT 0,
  "deliveredQuantity" INTEGER NOT NULL DEFAULT 0,
  "cancelledQuantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderStatusHistory" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fromStatus" "OrderStatus",
  "toStatus" "OrderStatus" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "changedByName" TEXT NOT NULL,
  "changedByEmail" TEXT NOT NULL,
  "changedByRole" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "SecurityAuditLog_eventType_idx" ON "SecurityAuditLog"("eventType");
CREATE INDEX "SecurityAuditLog_userId_idx" ON "SecurityAuditLog"("userId");
CREATE INDEX "SecurityAuditLog_userEmail_idx" ON "SecurityAuditLog"("userEmail");
CREATE INDEX "SecurityAuditLog_createdAt_idx" ON "SecurityAuditLog"("createdAt");
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_dealerId_idx" ON "Order"("dealerId");
CREATE INDEX "Order_assignedDriverId_idx" ON "Order"("assignedDriverId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE INDEX "OrderStatusHistory_orderId_idx" ON "OrderStatusHistory"("orderId");
CREATE INDEX "OrderStatusHistory_createdAt_idx" ON "OrderStatusHistory"("createdAt");

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityAuditLog" ADD CONSTRAINT "SecurityAuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_dealerId_fkey"
  FOREIGN KEY ("dealerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedDriverId_fkey"
  FOREIGN KEY ("assignedDriverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
