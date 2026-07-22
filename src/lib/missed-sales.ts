import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { AppUser } from "@/lib/current-user";
import { createWorkflowNotification } from "@/lib/notifications";
import { createSecurityAuditLog } from "@/lib/security-audit";

export type ProductForMissedSale = {
  id: string;
  code: string;
  name: string;
  stack: string;
  quantity: number;
};

type CreateMissedSaleInput = {
  product: ProductForMissedSale;
  quantityAsked: number;
  dealerName: string;
  dealerPhone?: string | null;
  dealerEmail?: string | null;
  note?: string | null;
  currentUser: AppUser;
  path: string;
  status?: "NOT_IN_STOCK" | "MISSED_SALE";
};

function buildInquiryNumber(id: string) {
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

function compactText(value: string | null | undefined, maxLength: number) {
  const cleanValue = String(value ?? "").replace(/\s+/g, " ").trim();

  if (cleanValue.length <= maxLength) {
    return cleanValue;
  }

  return `${cleanValue.slice(0, maxLength - 1).trim()}…`;
}

export function getMissingQuantity({
  quantityAsked,
  availableQuantity,
}: {
  quantityAsked: number;
  availableQuantity: number;
}) {
  return Math.max(quantityAsked - Math.max(availableQuantity, 0), 0);
}

export async function createMissedSaleInquiry({
  product,
  quantityAsked,
  dealerName,
  dealerPhone,
  dealerEmail,
  note,
  currentUser,
  path,
  status = "MISSED_SALE",
}: CreateMissedSaleInput) {
  const inquiryId = randomUUID();
  const inquiryNumber = buildInquiryNumber(inquiryId);
  const availableQuantity = Math.max(product.quantity, 0);
  const missingQuantity = getMissingQuantity({
    quantityAsked,
    availableQuantity,
  });
  const finalStatus = missingQuantity > 0 ? status : "NOT_IN_STOCK";
  const description = compactText(
    [
      `Dealer requested quantity ${quantityAsked}.`,
      `Available stock: ${availableQuantity}.`,
      `Missing quantity: ${missingQuantity}.`,
      note ? `Note: ${note}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    1000,
  );

  await prisma.$executeRaw`
    INSERT INTO public."InventoryInquiry" (
      "id",
      "inquiryNumber",
      "productId",
      "productName",
      "quantityAsked",
      "customerName",
      "customerPhone",
      "dealerName",
      "source",
      "status",
      "description",
      "nextFollowUpAt",
      "orderNumber",
      "createdById",
      "createdByName",
      "createdByEmail",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${inquiryId},
      ${inquiryNumber},
      ${product.id},
      ${`${product.name} (${product.code})`},
      ${quantityAsked},
      ${dealerName},
      ${dealerPhone ?? null},
      ${dealerName},
      ${"DEALER"},
      ${finalStatus}::public."InventoryInquiryStatus",
      ${description},
      NULL,
      NULL,
      ${currentUser.id},
      ${currentUser.name},
      ${dealerEmail ?? currentUser.email},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `;

  await createWorkflowNotification({
    title:
      finalStatus === "MISSED_SALE"
        ? "Missed sale / stock needed"
        : "Stock not available request",
    message: `${dealerName} needs ${quantityAsked} qty of ${product.name}. Available: ${availableQuantity}. Missing: ${missingQuantity}.`,
    module: "INVENTORY",
    href: "/internal/inquiries",
    actor: currentUser,
    recipientRoles: ["owner", "manager", "sales_field_team"],
    priority: finalStatus === "MISSED_SALE" ? "URGENT" : "HIGH",
  });

  await createSecurityAuditLog({
    eventType: "INVENTORY_INQUIRY_CREATED",
    user: currentUser,
    path,
    description: `${inquiryNumber} created from dealer stock request. Product: ${product.name}. Asked: ${quantityAsked}. Available: ${availableQuantity}. Missing: ${missingQuantity}. Status: ${finalStatus}.`,
  });

  return {
    inquiryId,
    inquiryNumber,
    status: finalStatus,
    missingQuantity,
    availableQuantity,
  };
}
