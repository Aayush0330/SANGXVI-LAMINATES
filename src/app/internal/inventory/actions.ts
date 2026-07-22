"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProductStatus } from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { hasExpectedDeliveryProofSignature } from "@/lib/delivery-proof";

function getProductStatus(quantity: number, minimumStock: number) {
  if (quantity <= 0) return ProductStatus.OUT_OF_STOCK;
  if (quantity <= minimumStock) return ProductStatus.LOW_STOCK;
  return ProductStatus.AVAILABLE;
}

function cleanText(value: FormDataEntryValue | null, max = 160) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function formatLabel(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      if (!/[A-Za-z]/.test(word)) return word;
      return word
        .split(/([/-])/)
        .map((part) => {
          if (part === "/" || part === "-" || !/[A-Za-z]/.test(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join("");
    })
    .join(" ");
}

function normalizeUnit(value: string) {
  return formatLabel(value).slice(0, 40);
}

function parseGstRate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  const parsed = Number(raw || 18);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) go("invalid-gst-rate");
  return Number(parsed.toFixed(2));
}

function parseOptionalPrice(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9999999999.99) go("invalid-price");
  return Number(parsed.toFixed(2));
}

const PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

async function getUploadedProductImage(formData: FormData) {
  const value = formData.get("image");
  if (!(value instanceof File) || value.size === 0) return null;
  if (!PRODUCT_IMAGE_TYPES.has(value.type)) go("invalid-product-image");
  if (value.size > PRODUCT_IMAGE_MAX_BYTES) go("product-image-too-large");
  const imageData = new Uint8Array(await value.arrayBuffer());
  if (
    imageData.length !== value.size ||
    imageData.length < 12 ||
    !hasExpectedDeliveryProofSignature(imageData, value.type)
  ) {
    go("invalid-product-image-content");
  }

  return {
    imageData,
    imageMimeType: value.type,
    imageFileName: cleanText(value.name, 180) || "product-image",
  };
}

function go(code: string, type: "error" | "success" = "error", extra = ""): never {
  const key = type === "success" ? "success" : "error";
  redirect(`/internal/inventory?${key}=${encodeURIComponent(code)}${extra}`);
}

function revalidateProductPaths() {
  revalidatePath("/internal/inventory");
  revalidatePath("/internal/inventory/calendar");
  revalidatePath("/internal/inventory/insights");
  revalidatePath("/internal/inventory/intelligence");
  revalidatePath("/internal/dashboard");
  revalidatePath("/dealer/products");
  revalidatePath("/dealer/place-order");
  revalidatePath("/internal/inquiries");
  revalidatePath("/internal/reports");
}

async function requireInventoryAccess() {
  const result = await checkPermission("manage_inventory");
  if (!result.hasAccess) go("permission-denied");
  return result.currentUser;
}

async function getActiveMasterRecords(categoryId: string, brandId: string) {
  const [category, brand] = await Promise.all([
    prisma.productCategory.findFirst({ where: { id: categoryId, isActive: true }, select: { id: true } }),
    prisma.productBrand.findFirst({ where: { id: brandId, isActive: true }, select: { id: true } }),
  ]);

  if (!category) go("invalid-category");
  if (!brand) go("invalid-brand");
}

export async function createProductCategoryAction(formData: FormData) {
  await requireInventoryAccess();
  const name = formatLabel(cleanText(formData.get("categoryName"), 80));
  const description = cleanText(formData.get("categoryDescription"), 300) || null;
  if (!name) go("missing-category-name");

  const existing = await prisma.productCategory.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) go("duplicate-category", "error", `&name=${encodeURIComponent(name)}`);

  await prisma.productCategory.create({ data: { name, description } });
  revalidateProductPaths();
  go("category-created", "success");
}

export async function createProductBrandAction(formData: FormData) {
  await requireInventoryAccess();
  const name = formatLabel(cleanText(formData.get("brandName"), 80));
  const description = cleanText(formData.get("brandDescription"), 300) || null;
  if (!name) go("missing-brand-name");

  const existing = await prisma.productBrand.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) go("duplicate-brand", "error", `&name=${encodeURIComponent(name)}`);

  await prisma.productBrand.create({ data: { name, description } });
  revalidateProductPaths();
  go("brand-created", "success");
}

export async function createProductAction(formData: FormData) {
  await requireInventoryAccess();

  const code = cleanText(formData.get("code"), 60).toUpperCase();
  const name = formatLabel(cleanText(formData.get("name"), 120));
  const description = cleanText(formData.get("description"), 500) || null;
  const categoryId = cleanText(formData.get("categoryId"), 80);
  const brandId = cleanText(formData.get("brandId"), 80);
  const stack = cleanText(formData.get("stack"), 60).toUpperCase();
  const unit = normalizeUnit(cleanText(formData.get("unit"), 40));
  const gstRate = parseGstRate(formData.get("gstRate"));
  const purchasePrice = parseOptionalPrice(formData.get("purchasePrice"));
  const sellingPrice = parseOptionalPrice(formData.get("sellingPrice"));
  const dealerPrice = parseOptionalPrice(formData.get("dealerPrice"));
  const uploadedImage = await getUploadedProductImage(formData);
  const quantity = Number(formData.get("quantity") ?? 0);
  const minimumStock = Number(formData.get("minimumStock") ?? 0);
  const maximumStock = Number(formData.get("maximumStock") ?? 0);

  if (!code || !name || !categoryId || !brandId || !stack || !unit) go("missing-fields");
  if (!Number.isInteger(quantity) || quantity < 0) go("invalid-quantity");
  if (!Number.isInteger(minimumStock) || minimumStock < 0) go("invalid-minimum-stock");
  if (!Number.isInteger(maximumStock) || maximumStock <= 0) go("invalid-maximum-stock");
  if (maximumStock < minimumStock) go("maximum-below-minimum");
  if (quantity > maximumStock) go("initial-stock-above-maximum");

  await getActiveMasterRecords(categoryId, brandId);

  const existingProductCode = await prisma.product.findUnique({ where: { code }, select: { id: true } });
  if (existingProductCode) go("duplicate-code", "error", `&code=${encodeURIComponent(code)}`);

  const duplicateProduct = await prisma.product.findFirst({
    where: { stack, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicateProduct) {
    go("duplicate-name-stack", "error", `&name=${encodeURIComponent(name)}&stack=${encodeURIComponent(stack)}`);
  }

  await prisma.product.create({
    data: {
      code,
      name,
      description,
      categoryId,
      brandId,
      stack,
      unit,
      gstRate,
      purchasePrice,
      sellingPrice,
      dealerPrice,
      ...(uploadedImage ?? {}),
      quantity,
      blocked: 0,
      minimumStock,
      maximumStock,
      status: getProductStatus(quantity, minimumStock),
      isActive: true,
    },
  });

  revalidateProductPaths();
  go("product-created", "success");
}

export async function updateProductAction(formData: FormData) {
  await requireInventoryAccess();

  const productId = cleanText(formData.get("productId"), 80);
  const code = cleanText(formData.get("code"), 60).toUpperCase();
  const name = formatLabel(cleanText(formData.get("name"), 120));
  const description = cleanText(formData.get("description"), 500) || null;
  const categoryId = cleanText(formData.get("categoryId"), 80);
  const brandId = cleanText(formData.get("brandId"), 80);
  const stack = cleanText(formData.get("stack"), 60).toUpperCase();
  const unit = normalizeUnit(cleanText(formData.get("unit"), 40));
  const gstRate = parseGstRate(formData.get("gstRate"));
  const purchasePrice = parseOptionalPrice(formData.get("purchasePrice"));
  const sellingPrice = parseOptionalPrice(formData.get("sellingPrice"));
  const dealerPrice = parseOptionalPrice(formData.get("dealerPrice"));
  const uploadedImage = await getUploadedProductImage(formData);
  const removeImage = cleanText(formData.get("removeImage"), 5) === "1";
  const minimumStock = Number(formData.get("minimumStock") ?? 0);
  const maximumStock = Number(formData.get("maximumStock") ?? 0);

  if (!productId) go("missing-product");
  if (!code || !name || !categoryId || !brandId || !stack || !unit) go("missing-fields");
  if (!Number.isInteger(minimumStock) || minimumStock < 0) go("invalid-minimum-stock");
  if (!Number.isInteger(maximumStock) || maximumStock <= 0) go("invalid-maximum-stock");
  if (maximumStock < minimumStock) go("maximum-below-minimum");

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) go("product-not-found");
  if (maximumStock < product.quantity + product.blocked) go("maximum-below-current-stock");

  await getActiveMasterRecords(categoryId, brandId);

  const duplicateCode = await prisma.product.findFirst({
    where: { code, NOT: { id: productId } },
    select: { id: true },
  });
  if (duplicateCode) go("duplicate-code", "error", `&code=${encodeURIComponent(code)}`);

  const duplicateNameStack = await prisma.product.findFirst({
    where: { stack, name: { equals: name, mode: "insensitive" }, NOT: { id: productId } },
    select: { id: true },
  });
  if (duplicateNameStack) {
    go("duplicate-name-stack", "error", `&name=${encodeURIComponent(name)}&stack=${encodeURIComponent(stack)}`);
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      code,
      name,
      description,
      categoryId,
      brandId,
      stack,
      unit,
      gstRate,
      purchasePrice,
      sellingPrice,
      dealerPrice,
      ...(uploadedImage
        ? uploadedImage
        : removeImage
          ? { imageData: null, imageMimeType: null, imageFileName: null }
          : {}),
      minimumStock,
      maximumStock,
      status: getProductStatus(product.quantity, minimumStock),
    },
  });

  revalidateProductPaths();
  go("product-updated", "success");
}

export async function updateStockAction(formData: FormData) {
  await requireInventoryAccess();

  const productId = cleanText(formData.get("productId"), 80);
  const movementType = cleanText(formData.get("movementType"), 20);
  const quantityChange = Number(formData.get("quantityChange") ?? 0);
  const minimumStockInput = cleanText(formData.get("minimumStock"), 30);
  const maximumStockInput = cleanText(formData.get("maximumStock"), 30);

  if (!productId) go("missing-product");
  if (!["ADD", "REDUCE"].includes(movementType)) go("invalid-stock-action");
  if (!Number.isInteger(quantityChange) || quantityChange <= 0) go("invalid-stock-quantity");

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) go("product-not-found");
  if (!product.isActive) go("archived-product-stock");

  const nextQuantity = movementType === "ADD" ? product.quantity + quantityChange : product.quantity - quantityChange;
  if (nextQuantity < 0) go("insufficient-stock");

  const nextMinimumStock = minimumStockInput === "" ? product.minimumStock : Number(minimumStockInput);
  const nextMaximumStock = maximumStockInput === "" ? product.maximumStock : Number(maximumStockInput);

  if (!Number.isInteger(nextMinimumStock) || nextMinimumStock < 0) go("invalid-minimum-stock");
  if (!Number.isInteger(nextMaximumStock) || nextMaximumStock <= 0) go("invalid-maximum-stock");
  if (nextMaximumStock < nextMinimumStock) go("maximum-below-minimum");
  if (nextQuantity + product.blocked > nextMaximumStock) go("stock-above-maximum");

  await prisma.product.update({
    where: { id: product.id },
    data: {
      quantity: nextQuantity,
      minimumStock: nextMinimumStock,
      maximumStock: nextMaximumStock,
      status: getProductStatus(nextQuantity, nextMinimumStock),
    },
  });

  revalidateProductPaths();
  go("stock-updated", "success");
}

export async function archiveProductAction(formData: FormData) {
  const currentUser = await requireInventoryAccess();
  const productId = cleanText(formData.get("productId"), 80);
  if (!productId) go("missing-product");

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) go("product-not-found");
  if (!product.isActive) go("product-already-archived");
  if (product.blocked > 0) go("active-stock-block");

  await prisma.product.update({
    where: { id: productId },
    data: {
      isActive: false,
      archivedAt: new Date(),
      archivedById: currentUser.id,
      archivedByName: currentUser.name,
    },
  });

  revalidateProductPaths();
  go("product-archived", "success");
}

export async function reactivateProductAction(formData: FormData) {
  await requireInventoryAccess();
  const productId = cleanText(formData.get("productId"), 80);
  if (!productId) go("missing-product");

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) go("product-not-found");
  if (product.isActive) go("product-already-active");

  await prisma.product.update({
    where: { id: productId },
    data: {
      isActive: true,
      archivedAt: null,
      archivedById: null,
      archivedByName: null,
      status: getProductStatus(product.quantity, product.minimumStock),
    },
  });

  revalidateProductPaths();
  go("product-reactivated", "success");
}
