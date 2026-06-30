"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";

type TransportOptionRow = {
  id: string;
  name: string;
  isActive: boolean;
};

function normalizeText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function validateTransportInput(
  name: string,
  description: string,
  sortOrder: number,
) {
  if (!name) return "missing-name";
  if (name.length > 80) return "name-too-long";
  if (description.length > 300) return "description-too-long";
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    return "invalid-sort-order";
  }

  return null;
}

async function assertTransportAccess() {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_transport_options",
  );

  if (!hasAccess) {
    redirect("/internal/transport?error=permission-denied");
  }

  return currentUser;
}

export async function createTransportOptionAction(formData: FormData) {
  const currentUser = await assertTransportAccess();

  const name = normalizeText(formData.get("name"));
  const description = normalizeText(formData.get("description"));
  const sortOrder = Number(formData.get("sortOrder") ?? 0);

  const validationError = validateTransportInput(name, description, sortOrder);

  if (validationError) {
    redirect(`/internal/transport?error=${validationError}`);
  }

  const existing = await prisma.$queryRaw<TransportOptionRow[]>`
    SELECT "id", "name", "isActive"
    FROM "TransportOption"
    WHERE lower("name") = lower(${name})
    LIMIT 1
  `;

  if (existing.length > 0) {
    redirect("/internal/transport?error=duplicate-name");
  }

  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "TransportOption" (
      "id",
      "name",
      "description",
      "isActive",
      "sortOrder",
      "createdById",
      "updatedById",
      "createdByName",
      "updatedByName",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${name},
      ${description || null},
      true,
      ${sortOrder},
      ${currentUser.id},
      ${currentUser.id},
      ${currentUser.name},
      ${currentUser.name},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `;

  await createSecurityAuditLog({
    eventType: "TRANSPORT_OPTION_CREATED",
    user: currentUser,
    path: "/internal/transport",
    description: `Transport option created: ${name}.`,
  });

  revalidatePath("/internal/transport");
  revalidatePath("/internal/dispatch");

  redirect("/internal/transport?success=created");
}

export async function updateTransportOptionAction(formData: FormData) {
  const currentUser = await assertTransportAccess();

  const id = normalizeText(formData.get("id"));
  const name = normalizeText(formData.get("name"));
  const description = normalizeText(formData.get("description"));
  const sortOrder = Number(formData.get("sortOrder") ?? 0);

  if (!id) {
    redirect("/internal/transport?error=missing-option");
  }

  const validationError = validateTransportInput(name, description, sortOrder);

  if (validationError) {
    redirect(`/internal/transport?error=${validationError}`);
  }

  const duplicate = await prisma.$queryRaw<TransportOptionRow[]>`
    SELECT "id", "name", "isActive"
    FROM "TransportOption"
    WHERE lower("name") = lower(${name}) AND "id" <> ${id}
    LIMIT 1
  `;

  if (duplicate.length > 0) {
    redirect("/internal/transport?error=duplicate-name");
  }

  const updated = await prisma.$executeRaw`
    UPDATE "TransportOption"
    SET
      "name" = ${name},
      "description" = ${description || null},
      "sortOrder" = ${sortOrder},
      "updatedById" = ${currentUser.id},
      "updatedByName" = ${currentUser.name},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `;

  if (updated <= 0) {
    redirect("/internal/transport?error=option-not-found");
  }

  await createSecurityAuditLog({
    eventType: "TRANSPORT_OPTION_UPDATED",
    user: currentUser,
    path: "/internal/transport",
    description: `Transport option updated: ${name}.`,
  });

  revalidatePath("/internal/transport");
  revalidatePath("/internal/dispatch");

  redirect("/internal/transport?success=updated");
}

export async function toggleTransportOptionAction(formData: FormData) {
  const currentUser = await assertTransportAccess();

  const id = normalizeText(formData.get("id"));
  const nextActive = normalizeText(formData.get("nextActive")) === "true";

  if (!id) {
    redirect("/internal/transport?error=missing-option");
  }

  const existing = await prisma.$queryRaw<TransportOptionRow[]>`
    SELECT "id", "name", "isActive"
    FROM "TransportOption"
    WHERE "id" = ${id}
    LIMIT 1
  `;

  if (existing.length === 0) {
    redirect("/internal/transport?error=option-not-found");
  }

  await prisma.$executeRaw`
    UPDATE "TransportOption"
    SET
      "isActive" = ${nextActive},
      "updatedById" = ${currentUser.id},
      "updatedByName" = ${currentUser.name},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `;

  await createSecurityAuditLog({
    eventType: nextActive
      ? "TRANSPORT_OPTION_UPDATED"
      : "TRANSPORT_OPTION_DISABLED",
    user: currentUser,
    path: "/internal/transport",
    description: `${existing[0].name} transport option ${
      nextActive ? "enabled" : "disabled"
    }.`,
  });

  revalidatePath("/internal/transport");
  revalidatePath("/internal/dispatch");

  redirect(`/internal/transport?success=${nextActive ? "enabled" : "disabled"}`);
}
