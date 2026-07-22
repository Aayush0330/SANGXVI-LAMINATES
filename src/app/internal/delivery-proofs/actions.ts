"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  DeliveryProofAssistanceStatus,
  DeliveryProofUploadMode,
  OrderStatus,
} from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  DELIVERY_PROOF_MIN_REPLACEMENT_REASON_LENGTH,
  readAndValidateDeliveryProof,
} from "@/lib/delivery-proof";
import { createWorkflowNotification } from "@/lib/notifications";
import {
  recordOrderStatusHistory,
  type HistoryClient,
} from "@/lib/order-status-history";
import { createSecurityAuditLog } from "@/lib/security-audit";
import { setAutomatedTaskStatus, workflowTaskKeys } from "@/lib/workflow-tasks";

function pageUrl(type: "error" | "success", value: string) {
  return `/internal/delivery-proofs?${type}=${encodeURIComponent(value)}`;
}

type LockedProofOrder = {
  id: string;
  orderNumber: string;
  dealerId: string;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  deliveredByName: string | null;
  status: string;
  signedInvoiceStatus: string;
  deliveryProofAssistanceStatus: string;
};

type ActiveProofRow = {
  id: string;
  fileSha256: string | null;
  fileDataUrl: string;
  uploadMode: string;
  deliveredByName: string | null;
};

class DeliveryProofManagementError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

async function getLockedProofOrder(
  tx: Pick<typeof prisma, "$queryRaw">,
  orderId: string,
) {
  const rows = await tx.$queryRaw<LockedProofOrder[]>`
    SELECT
      o."id",
      o."orderNumber",
      o."dealerId",
      o."assignedDriverId",
      driver."name" AS "assignedDriverName",
      o."deliveredByName",
      o."status"::text AS "status",
      o."signedInvoiceStatus",
      o."deliveryProofAssistanceStatus"::text AS "deliveryProofAssistanceStatus"
    FROM public."Order" o
    LEFT JOIN public."User" driver ON driver."id" = o."assignedDriverId"
    WHERE o."id" = ${orderId}
    FOR UPDATE OF o
  `;

  return rows[0] ?? null;
}

async function getLockedActiveProof(
  tx: Pick<typeof prisma, "$queryRaw">,
  orderId: string,
) {
  const rows = await tx.$queryRaw<ActiveProofRow[]>`
    SELECT
      "id",
      "fileSha256",
      "fileDataUrl",
      "uploadMode"::text AS "uploadMode",
      "deliveredByName"
    FROM public."DeliveryProof"
    WHERE "orderId" = ${orderId}
      AND "proofType" = 'SIGNED_DUPLICATE_INVOICE'
      AND "isActive" = TRUE
    ORDER BY "uploadedAt" DESC
    LIMIT 1
    FOR UPDATE
  `;

  return rows[0] ?? null;
}

function assertProofStatusAllowed(status: string) {
  if (status !== OrderStatus.DELIVERED && status !== OrderStatus.INVOICE_UPLOADED) {
    throw new DeliveryProofManagementError("proof-not-allowed");
  }
}

function redirectManagementError(error: unknown): never {
  if (error instanceof DeliveryProofManagementError) {
    redirect(pageUrl("error", error.code));
  }

  throw error;
}

export async function uploadManagerAssistedDeliveryProofAction(
  formData: FormData,
) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_delivery_proofs",
    "/internal/delivery-proofs",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const orderId = String(formData.get("orderId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const file = formData.get("signedInvoice") as File | null;

  if (!orderId) {
    redirect(pageUrl("error", "missing-order"));
  }

  const validatedProof = await readAndValidateDeliveryProof(file, note);

  if ("error" in validatedProof && validatedProof.error) {
    redirect(pageUrl("error", validatedProof.error));
  }

  let orderNumber = orderId;
  let deliveredByName = "Assigned Driver";
  let assignedDriverId: string | null = null;
  let dealerId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await getLockedProofOrder(tx, orderId);

      if (!order) {
        throw new DeliveryProofManagementError("order-not-found");
      }

      orderNumber = order.orderNumber;
      assignedDriverId = order.assignedDriverId;
      dealerId = order.dealerId;
      deliveredByName =
        order.deliveredByName || order.assignedDriverName || "Assigned Driver";

      assertProofStatusAllowed(order.status);

      if (
        order.deliveryProofAssistanceStatus !==
        DeliveryProofAssistanceStatus.REQUESTED
      ) {
        throw new DeliveryProofManagementError("assistance-not-requested");
      }

      if (
        order.signedInvoiceStatus === "UPLOADED" ||
        (await getLockedActiveProof(tx, order.id))
      ) {
        throw new DeliveryProofManagementError("proof-already-uploaded");
      }

      const proofId = randomUUID();
      const insertedRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO public."DeliveryProof" (
          "id",
          "orderId",
          "uploadedById",
          "proofType",
          "uploadMode",
          "deliveredByName",
          "fileName",
          "mimeType",
          "fileDataUrl",
          "fileSizeBytes",
          "fileSha256",
          "note",
          "isActive",
          "uploadedAt"
        )
        VALUES (
          ${proofId},
          ${order.id},
          ${currentUser.id},
          'SIGNED_DUPLICATE_INVOICE',
          ${DeliveryProofUploadMode.MANAGER_ASSISTED}::public."DeliveryProofUploadMode",
          ${deliveredByName},
          ${validatedProof.fileName},
          ${validatedProof.mimeType},
          ${validatedProof.fileDataUrl},
          ${validatedProof.fileSizeBytes},
          ${validatedProof.fileSha256},
          ${note || null},
          TRUE,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT DO NOTHING
        RETURNING "id"
      `;

      if (insertedRows.length === 0) {
        throw new DeliveryProofManagementError("proof-already-uploaded");
      }

      const nextStatus =
        order.status === OrderStatus.DELIVERED
          ? OrderStatus.INVOICE_UPLOADED
          : (order.status as OrderStatus);
      const completedAt = new Date();

      await tx.order.update({
        where: { id: order.id },
        data: {
          signedInvoiceStatus: "UPLOADED",
          signedInvoiceUploadedAt: completedAt,
          status: nextStatus,
          deliveryProofAssistanceStatus:
            DeliveryProofAssistanceStatus.COMPLETED,
          deliveryProofCompletedById: currentUser.id,
          deliveryProofCompletedByName: currentUser.name,
          deliveryProofCompletedAt: completedAt,
        },
      });

      await recordOrderStatusHistory({
        client: tx as unknown as HistoryClient,
        orderId: order.id,
        fromStatus: order.status as OrderStatus,
        toStatus: nextStatus,
        title: "Manager-Assisted Delivery Proof Uploaded",
        description: `${currentUser.name} uploaded delivery proof on behalf of ${deliveredByName}${
          note ? ` with note: ${note}` : "."
        }`,
        currentUser,
      });

      await setAutomatedTaskStatus({
        client: tx,
        automationKey: workflowTaskKeys.proofAssistance(order.id),
        status: "DONE",
        actor: currentUser,
        message: `${currentUser.name} completed manager-assisted proof upload for ${order.orderNumber}.`,
      });

      if (order.assignedDriverId) {
        await createWorkflowNotification({
          client: tx,
          title: "Manager uploaded delivery proof",
          message: `${currentUser.name} uploaded proof for ${order.orderNumber} on your behalf.`,
          module: "DELIVERY",
          href: "/field/deliveries",
          orderId: order.id,
          actor: currentUser,
          recipientUserIds: [order.assignedDriverId],
          priority: "HIGH",
        });
      }

      await createWorkflowNotification({
        client: tx,
        title: "Manager-assisted proof completed",
        message: `${order.orderNumber} manager-assisted delivery proof is ready.`,
        module: "DELIVERY",
        href: "/internal/orders",
        orderId: order.id,
        actor: currentUser,
        recipientRoles: ["owner", "manager", "dispatch_team"],
        priority: "HIGH",
      });

      await createWorkflowNotification({
        client: tx,
        title: "Signed invoice available for reporting",
        message: `${order.orderNumber} manager-assisted delivery proof is available in the order report.`,
        module: "ACCOUNTS",
        href: `/internal/reports?report=orders&q=${encodeURIComponent(order.orderNumber)}`,
        orderId: order.id,
        actor: currentUser,
        recipientRoles: ["accountant"],
        priority: "HIGH",
      });

      await createWorkflowNotification({
        client: tx,
        title: "Delivery proof recorded",
        message: `${order.orderNumber} delivery proof has been recorded.`,
        module: "DELIVERY",
        href: "/dealer/orders",
        orderId: order.id,
        actor: currentUser,
        recipientUserIds: [order.dealerId],
      });
    });
  } catch (error) {
    redirectManagementError(error);
  }

  await createSecurityAuditLog({
    eventType: "DELIVERY_PROOF_ASSISTANCE_COMPLETED",
    user: currentUser,
    path: "/internal/delivery-proofs",
    description: `${currentUser.name} uploaded manager-assisted proof for ${orderNumber}; delivered by ${deliveredByName}; assigned driver ${assignedDriverId ?? "not available"}; dealer ${dealerId ?? "not available"}.`,
  });

  revalidatePath("/internal/delivery-proofs");
  revalidatePath("/field/deliveries");
  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/orders");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");
  revalidatePath("/internal/security");

  redirect(pageUrl("success", "manager-proof-uploaded"));
}

export async function replaceDeliveryProofAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_delivery_proofs",
    "/internal/delivery-proofs",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const orderId = String(formData.get("orderId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const replacementReason = String(
    formData.get("replacementReason") ?? "",
  ).trim();
  const file = formData.get("signedInvoice") as File | null;

  if (!orderId) {
    redirect(pageUrl("error", "missing-order"));
  }

  if (
    replacementReason.length < DELIVERY_PROOF_MIN_REPLACEMENT_REASON_LENGTH
  ) {
    redirect(pageUrl("error", "replacement-reason-required"));
  }

  if (replacementReason.length > 500) {
    redirect(pageUrl("error", "replacement-reason-too-long"));
  }

  const validatedProof = await readAndValidateDeliveryProof(file, note);

  if ("error" in validatedProof && validatedProof.error) {
    redirect(pageUrl("error", validatedProof.error));
  }

  let orderNumber = orderId;
  let assignedDriverId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await getLockedProofOrder(tx, orderId);

      if (!order) {
        throw new DeliveryProofManagementError("order-not-found");
      }

      orderNumber = order.orderNumber;
      assignedDriverId = order.assignedDriverId;
      assertProofStatusAllowed(order.status);

      const activeProof = await getLockedActiveProof(tx, order.id);

      if (!activeProof || order.signedInvoiceStatus !== "UPLOADED") {
        throw new DeliveryProofManagementError("proof-not-found-for-replacement");
      }

      if (
        activeProof.fileSha256 === validatedProof.fileSha256 ||
        activeProof.fileDataUrl === validatedProof.fileDataUrl
      ) {
        throw new DeliveryProofManagementError("replacement-file-unchanged");
      }

      const replacedAt = new Date();

      await tx.$executeRaw`
        UPDATE public."DeliveryProof"
        SET
          "isActive" = FALSE,
          "replacedAt" = ${replacedAt},
          "replacedById" = ${currentUser.id},
          "replacedByName" = ${currentUser.name},
          "replacementReason" = ${replacementReason}
        WHERE "id" = ${activeProof.id}
          AND "isActive" = TRUE
      `;

      const proofId = randomUUID();
      const insertedRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO public."DeliveryProof" (
          "id",
          "orderId",
          "uploadedById",
          "proofType",
          "uploadMode",
          "deliveredByName",
          "fileName",
          "mimeType",
          "fileDataUrl",
          "fileSizeBytes",
          "fileSha256",
          "note",
          "isActive",
          "uploadedAt"
        )
        VALUES (
          ${proofId},
          ${order.id},
          ${currentUser.id},
          'SIGNED_DUPLICATE_INVOICE',
          ${DeliveryProofUploadMode.INTERNAL_UPLOAD}::public."DeliveryProofUploadMode",
          ${activeProof.deliveredByName || order.deliveredByName || order.assignedDriverName || "Assigned Driver"},
          ${validatedProof.fileName},
          ${validatedProof.mimeType},
          ${validatedProof.fileDataUrl},
          ${validatedProof.fileSizeBytes},
          ${validatedProof.fileSha256},
          ${note || null},
          TRUE,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT DO NOTHING
        RETURNING "id"
      `;

      if (insertedRows.length === 0) {
        throw new DeliveryProofManagementError("replacement-upload-conflict");
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          signedInvoiceStatus: "UPLOADED",
          signedInvoiceUploadedAt: replacedAt,
          status: OrderStatus.INVOICE_UPLOADED,
        },
      });

      await recordOrderStatusHistory({
        client: tx as unknown as HistoryClient,
        orderId: order.id,
        fromStatus: order.status as OrderStatus,
        toStatus: OrderStatus.INVOICE_UPLOADED,
        title: "Delivery Proof Replaced",
        description: `${currentUser.name} replaced the active delivery proof. Reason: ${replacementReason}${
          note ? ` New proof note: ${note}` : ""
        }`,
        currentUser,
      });

      if (order.assignedDriverId) {
        await createWorkflowNotification({
          client: tx,
          title: "Delivery proof replaced",
          message: `${order.orderNumber} proof was replaced by ${currentUser.name}.`,
          module: "DELIVERY",
          href: "/field/deliveries",
          orderId: order.id,
          actor: currentUser,
          recipientUserIds: [order.assignedDriverId],
          priority: "HIGH",
        });
      }

      await createWorkflowNotification({
        client: tx,
        title: "Delivery proof replaced",
        message: `${order.orderNumber} active proof was replaced with an audit reason.`,
        module: "DELIVERY",
        href: "/internal/orders",
        orderId: order.id,
        actor: currentUser,
        recipientRoles: ["owner", "manager", "dispatch_team"],
        priority: "HIGH",
      });

      await createWorkflowNotification({
        client: tx,
        title: "Updated signed invoice available",
        message: `${order.orderNumber} has an updated signed delivery proof for reporting.`,
        module: "ACCOUNTS",
        href: `/internal/reports?report=orders&q=${encodeURIComponent(order.orderNumber)}`,
        orderId: order.id,
        actor: currentUser,
        recipientRoles: ["accountant"],
        priority: "HIGH",
      });
    });
  } catch (error) {
    redirectManagementError(error);
  }

  await createSecurityAuditLog({
    eventType: "DELIVERY_PROOF_REPLACED",
    user: currentUser,
    path: "/internal/delivery-proofs",
    description: `${currentUser.name} replaced delivery proof for ${orderNumber}. Reason: ${replacementReason}. Assigned driver: ${assignedDriverId ?? "not available"}.`,
  });

  revalidatePath("/internal/delivery-proofs");
  revalidatePath("/field/deliveries");
  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/orders");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");
  revalidatePath("/internal/security");

  redirect(pageUrl("success", "proof-replaced"));
}
