"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createMissedSaleInquiry } from "@/lib/missed-sales";

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function parseQuantity(value: FormDataEntryValue | null) {
  const quantity = Number(value ?? 0);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
    return null;
  }

  return quantity;
}

export async function createDealerStockRequestAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("view_dealer_products");

  if (!hasAccess || !currentUser.roles.includes("dealer")) {
    redirect("/dealer/products?error=permission-denied");
  }

  const productId = text(formData.get("productId"));
  const quantityAsked = parseQuantity(formData.get("quantityAsked"));
  const note = text(formData.get("note"));

  if (!productId) {
    redirect("/dealer/products?error=missing-product");
  }

  if (!quantityAsked) {
    redirect("/dealer/products?error=invalid-quantity");
  }

  if (note.length > 500) {
    redirect("/dealer/products?error=input-too-long");
  }

  const [product, dealer] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        code: true,
        name: true,
        stack: true,
        quantity: true,
        isActive: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { name: true, email: true, phone: true },
    }),
  ]);

  if (!product || !product.isActive) {
    redirect("/dealer/products?error=product-not-found");
  }

  if (quantityAsked <= product.quantity) {
    redirect(`/dealer/products?error=stock-available&available=${encodeURIComponent(String(product.quantity))}`);
  }

  const result = await createMissedSaleInquiry({
    product,
    quantityAsked,
    dealerName: dealer?.name ?? currentUser.name,
    dealerPhone: dealer?.phone ?? null,
    dealerEmail: dealer?.email ?? currentUser.email,
    note,
    currentUser,
    path: "/dealer/products",
    status: "MISSED_SALE",
  });

  revalidatePath("/dealer/products");
  revalidatePath("/internal/inquiries");
  revalidatePath("/internal/dashboard");
  revalidatePath("/internal/reports");

  redirect(
    `/dealer/products?success=stock-requested&inquiryNumber=${encodeURIComponent(
      result.inquiryNumber,
    )}`,
  );
}
