"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { ProductStatus } from "@/generated/prisma/client";

function getProductStatus(quantity: number, minimumStock: number) {
  if (quantity <= 0) {
    return ProductStatus.OUT_OF_STOCK;
  }

  if (quantity <= minimumStock) {
    return ProductStatus.LOW_STOCK;
  }

  return ProductStatus.AVAILABLE;
}

export async function createProductAction(formData: FormData) {
  const { hasAccess } = await checkPermission("manage_inventory");

  if (!hasAccess) {
    redirect("/internal/inventory?error=permission-denied");
  }

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const stack = String(formData.get("stack") ?? "").trim().toUpperCase();
  const quantity = Number(formData.get("quantity") ?? 0);
  const minimumStock = Number(formData.get("minimumStock") ?? 0);

  if (!code || !name || !stack) {
    redirect("/internal/inventory?error=missing-fields");
  }

  if (Number.isNaN(quantity) || quantity < 0) {
    redirect("/internal/inventory?error=invalid-quantity");
  }

  if (Number.isNaN(minimumStock) || minimumStock < 0) {
    redirect("/internal/inventory?error=invalid-minimum-stock");
  }

  const existingProductCode = await prisma.product.findUnique({
    where: {
      code,
    },
  });

  if (existingProductCode) {
    redirect(
      `/internal/inventory?error=duplicate-code&code=${encodeURIComponent(
        code
      )}`
    );
  }

  const productsInSameStack = await prisma.product.findMany({
    where: {
      stack,
    },
  });

  const existingProductInSameStack = productsInSameStack.find(
    (product) => product.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (existingProductInSameStack) {
    redirect(
      `/internal/inventory?error=duplicate-name-stack&name=${encodeURIComponent(
        name
      )}&stack=${encodeURIComponent(stack)}`
    );
  }

  await prisma.product.create({
    data: {
      code,
      name,
      stack,
      quantity,
      blocked: 0,
      minimumStock,
      status: getProductStatus(quantity, minimumStock),
    },
  });

  revalidatePath("/internal/inventory");
  redirect("/internal/inventory?success=product-created");
}

export async function updateStockAction(formData: FormData) {
  const { hasAccess } = await checkPermission("manage_inventory");

  if (!hasAccess) {
    redirect("/internal/inventory?error=permission-denied");
  }

  const productId = String(formData.get("productId") ?? "");
  const movementType = String(formData.get("movementType") ?? "");
  const quantityChange = Number(formData.get("quantityChange") ?? 0);
  const minimumStockInput = String(formData.get("minimumStock") ?? "").trim();

  if (!productId) {
    redirect("/internal/inventory?error=missing-product");
  }

  if (!["ADD", "REDUCE"].includes(movementType)) {
    redirect("/internal/inventory?error=invalid-stock-action");
  }

  if (Number.isNaN(quantityChange) || quantityChange <= 0) {
    redirect("/internal/inventory?error=invalid-stock-quantity");
  }

  const product = await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

  if (!product) {
    redirect("/internal/inventory?error=product-not-found");
  }

  const nextQuantity =
    movementType === "ADD"
      ? product.quantity + quantityChange
      : product.quantity - quantityChange;

  if (nextQuantity < 0) {
    redirect("/internal/inventory?error=insufficient-stock");
  }

  const nextMinimumStock =
    minimumStockInput === "" ? product.minimumStock : Number(minimumStockInput);

  if (Number.isNaN(nextMinimumStock) || nextMinimumStock < 0) {
    redirect("/internal/inventory?error=invalid-minimum-stock");
  }

  await prisma.product.update({
    where: {
      id: product.id,
    },
    data: {
      quantity: nextQuantity,
      minimumStock: nextMinimumStock,
      status: getProductStatus(nextQuantity, nextMinimumStock),
    },
  });

  revalidatePath("/internal/inventory");
  redirect("/internal/inventory?success=stock-updated");
}