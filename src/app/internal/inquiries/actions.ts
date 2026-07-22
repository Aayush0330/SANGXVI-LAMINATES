"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";
import { createWorkflowNotification } from "@/lib/notifications";

const inquiryStatuses = [
  "NEW_INQUIRY",
  "FOLLOW_UP",
  "ORDER_PLACED",
  "NOT_IN_STOCK",
  "MISSED_SALE",
  "CLOSED",
] as const;
const inquirySources = new Set([
  "CALL",
  "WHATSAPP",
  "WALK_IN",
  "DEALER",
  "FIELD_TEAM",
  "OTHER",
]);
type InquiryStatus = (typeof inquiryStatuses)[number];

type ProductSnapshot = {
  id: string;
  name: string;
  quantity: number;
};

type InquirySnapshot = {
  inquiryNumber: string;
  status: InquiryStatus;
  description: string | null;
  nextFollowUpAt: Date | string | null;
  orderNumber: string | null;
};

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function optionalText(value: FormDataEntryValue | null) {
  return text(value) || null;
}

function statusValue(value: FormDataEntryValue | null): InquiryStatus | null {
  const candidate = text(value);
  return inquiryStatuses.includes(candidate as InquiryStatus)
    ? (candidate as InquiryStatus)
    : null;
}

function parseIndiaDateTime(value: FormDataEntryValue | null) {
  const candidate = text(value);
  if (!candidate) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(candidate)) return undefined;

  const parsed = new Date(`${candidate}:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function inquiryNumber(id: string) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");

  return `INQ-${date}-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function validateLengths(values: Record<string, string | null>) {
  return (
    (values.productName?.length ?? 0) <= 160 &&
    (values.customerName?.length ?? 0) <= 120 &&
    (values.customerPhone?.length ?? 0) <= 20 &&
    (values.dealerName?.length ?? 0) <= 160 &&
    (values.description?.length ?? 0) <= 1000 &&
    (values.orderNumber?.length ?? 0) <= 80
  );
}

export async function createInventoryInquiryAction(formData: FormData) {
  const { hasAccess, currentUser } = await checkPermission(
    "manage_inventory_inquiries",
    "/internal/inquiries",
  );
  if (!hasAccess) redirect("/internal/inquiries?error=permission-denied");

  const productId = optionalText(formData.get("productId"));
  const manualProductName = text(formData.get("productName"));
  const quantityAsked = Number(formData.get("quantityAsked"));
  const customerName = optionalText(formData.get("customerName"));
  const customerPhone =
    text(formData.get("customerPhone")).replace(/[^0-9+]/g, "") || null;
  const dealerName = optionalText(formData.get("dealerName"));
  const description = optionalText(formData.get("description"));
  const orderNumber = optionalText(formData.get("orderNumber"));
  const selectedStatus = statusValue(formData.get("status"));
  const source = text(formData.get("source")).toUpperCase();
  const nextFollowUpAt = parseIndiaDateTime(formData.get("nextFollowUpAt"));

  if (!selectedStatus) redirect("/internal/inquiries?error=invalid-status");
  if (!inquirySources.has(source)) redirect("/internal/inquiries?error=invalid-source");
  if (!Number.isInteger(quantityAsked) || quantityAsked < 1 || quantityAsked > 1_000_000) {
    redirect("/internal/inquiries?error=invalid-quantity");
  }
  if (nextFollowUpAt === undefined) redirect("/internal/inquiries?error=invalid-date");

  let product: ProductSnapshot | null = null;
  if (productId) {
    const products = await prisma.$queryRaw<ProductSnapshot[]>`
      SELECT "id", "name", "quantity"
      FROM public."Product"
      WHERE "id" = ${productId}
        AND "isActive" = TRUE
      LIMIT 1
    `;
    product = products[0] ?? null;
    if (!product) redirect("/internal/inquiries?error=product-not-found");
  }

  const productName = product?.name ?? manualProductName;
  if (!productName) redirect("/internal/inquiries?error=missing-product-name");
  if (
    !validateLengths({
      productName,
      customerName,
      customerPhone,
      dealerName,
      description,
      orderNumber,
    })
  ) {
    redirect("/internal/inquiries?error=input-too-long");
  }

  const finalStatus =
    selectedStatus === "NEW_INQUIRY" &&
    product &&
    quantityAsked > product.quantity
      ? "NOT_IN_STOCK"
      : selectedStatus;
  if (finalStatus === "ORDER_PLACED" && !orderNumber) {
    redirect("/internal/inquiries?error=missing-order-number");
  }

  const id = randomUUID();
  const number = inquiryNumber(id);
  await prisma.$executeRaw`
    INSERT INTO public."InventoryInquiry" (
      "id", "inquiryNumber", "productId", "productName", "quantityAsked",
      "customerName", "customerPhone", "dealerName", "source", "status",
      "description", "nextFollowUpAt", "orderNumber", "createdById",
      "createdByName", "createdByEmail", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${number}, ${product?.id ?? null}, ${productName}, ${quantityAsked},
      ${customerName}, ${customerPhone}, ${dealerName}, ${source},
      ${finalStatus}::public."InventoryInquiryStatus", ${description}, ${nextFollowUpAt},
      ${orderNumber}, ${currentUser.id}, ${currentUser.name}, ${currentUser.email},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;

  await createSecurityAuditLog({
    eventType: "INVENTORY_INQUIRY_CREATED",
    user: currentUser,
    path: "/internal/inquiries",
    description: `${number} created for ${productName}. Quantity: ${quantityAsked}. Status: ${finalStatus}.`,
  });

  if (finalStatus === "NOT_IN_STOCK" || finalStatus === "MISSED_SALE") {
    await createWorkflowNotification({
      title: finalStatus === "MISSED_SALE" ? "Missed sale tagged" : "Stock not available",
      message: `${productName} demand recorded. Asked quantity: ${quantityAsked}. Status: ${finalStatus.replaceAll("_", " ")}.`,
      module: "INVENTORY",
      href: "/internal/inquiries",
      actor: currentUser,
      recipientRoles: ["owner", "manager", "sales_field_team"],
      priority: finalStatus === "MISSED_SALE" ? "URGENT" : "HIGH",
    });
  }
  revalidatePath("/internal/inquiries");
  revalidatePath("/internal/dashboard");
  redirect("/internal/inquiries?success=inquiry-created");
}

export async function updateInventoryInquiryStatusAction(formData: FormData) {
  const { hasAccess, currentUser } = await checkPermission(
    "manage_inventory_inquiries",
    "/internal/inquiries",
  );
  if (!hasAccess) redirect("/internal/inquiries?error=permission-denied");

  const inquiryId = text(formData.get("inquiryId"));
  const status = statusValue(formData.get("status"));
  const orderNumber = optionalText(formData.get("orderNumber"));
  const nextFollowUpAt = parseIndiaDateTime(formData.get("nextFollowUpAt"));

  if (!inquiryId) redirect("/internal/inquiries?error=missing-inquiry");
  if (!status) redirect("/internal/inquiries?error=invalid-status");
  if (nextFollowUpAt === undefined) redirect("/internal/inquiries?error=invalid-date");
  if ((orderNumber?.length ?? 0) > 80) redirect("/internal/inquiries?error=input-too-long");
  if (status === "ORDER_PLACED" && !orderNumber) {
    redirect("/internal/inquiries?error=missing-order-number");
  }

  const rows = await prisma.$queryRaw<InquirySnapshot[]>`
    SELECT "inquiryNumber", "status", "description", "nextFollowUpAt", "orderNumber"
    FROM public."InventoryInquiry"
    WHERE "id" = ${inquiryId}
    LIMIT 1
  `;
  const existing = rows[0];
  if (!existing) redirect("/internal/inquiries?error=inquiry-not-found");

  await prisma.$executeRaw`
    UPDATE public."InventoryInquiry"
    SET
      "status" = ${status}::public."InventoryInquiryStatus",
      "orderNumber" = ${orderNumber},
      "nextFollowUpAt" = ${nextFollowUpAt},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${inquiryId}
  `;

  await createSecurityAuditLog({
    eventType: "INVENTORY_INQUIRY_UPDATED",
    user: currentUser,
    path: "/internal/inquiries",
    description: `${existing.inquiryNumber} updated from ${existing.status} to ${status}.`,
  });

  if ((status === "NOT_IN_STOCK" || status === "MISSED_SALE") && existing.status !== status) {
    await createWorkflowNotification({
      title: status === "MISSED_SALE" ? "Inquiry marked missed sale" : "Inquiry marked not in stock",
      message: `${existing.inquiryNumber} updated from ${existing.status.replaceAll("_", " ")} to ${status.replaceAll("_", " ")}.`,
      module: "INVENTORY",
      href: "/internal/inquiries",
      actor: currentUser,
      recipientRoles: ["owner", "manager", "sales_field_team"],
      priority: status === "MISSED_SALE" ? "URGENT" : "HIGH",
    });
  }
  revalidatePath("/internal/inquiries");
  revalidatePath("/internal/dashboard");
  redirect("/internal/inquiries?success=inquiry-updated");
}
