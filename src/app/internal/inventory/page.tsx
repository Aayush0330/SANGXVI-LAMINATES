import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { ProductManagementClient } from "./product-management-client";

function getInventoryMessage(error?: string, success?: string, code?: string, name?: string, stack?: string) {
  const successMessages: Record<string, string> = {
    "product-created": "Product created successfully.",
    "product-updated": "Product details updated successfully.",
    "stock-updated": "Stock updated successfully.",
    "category-created": "Product category created successfully.",
    "brand-created": "Brand / company created successfully.",
    "product-archived": "Product archived. It is now hidden from new dealer orders.",
    "product-reactivated": "Product reactivated and restored to the active catalogue.",
  };

  if (success && successMessages[success]) return { type: "success" as const, text: successMessages[success] };
  if (error === "duplicate-code") return { type: "error" as const, text: `Product code ${code ?? ""} already exists.` };
  if (error === "duplicate-name-stack") return { type: "error" as const, text: `${name ?? "Product"} already exists in stack ${stack ?? "selected"}.` };
  if (error === "duplicate-category") return { type: "error" as const, text: `${name ?? "Category"} already exists.` };
  if (error === "duplicate-brand") return { type: "error" as const, text: `${name ?? "Brand"} already exists.` };
  if (error === "missing-fields") return { type: "error" as const, text: "Please complete all required product fields." };
  if (error === "missing-category-name") return { type: "error" as const, text: "Category name is required." };
  if (error === "missing-brand-name") return { type: "error" as const, text: "Brand / company name is required." };
  if (error === "invalid-category") return { type: "error" as const, text: "Please select a valid active product category." };
  if (error === "invalid-brand") return { type: "error" as const, text: "Please select a valid active brand / company." };
  if (error === "invalid-gst-rate") return { type: "error" as const, text: "GST rate must be between 0% and 100%." };
  if (error === "invalid-price") return { type: "error" as const, text: "Product prices must be valid positive amounts." };
  if (error === "invalid-product-image") return { type: "error" as const, text: "Product image must be a PNG, JPG or WEBP file." };
  if (error === "invalid-product-image-content") return { type: "error" as const, text: "Product image content does not match a valid PNG, JPG or WEBP file." };
  if (error === "product-image-too-large") return { type: "error" as const, text: "Product image must be 5 MB or smaller." };
  if (error === "missing-product") return { type: "error" as const, text: "Please select a product." };
  if (error === "product-not-found") return { type: "error" as const, text: "Selected product was not found." };
  if (error === "invalid-stock-action") return { type: "error" as const, text: "Please select a valid stock action." };
  if (error === "invalid-stock-quantity") return { type: "error" as const, text: "Stock quantity must be a whole number greater than zero." };
  if (error === "insufficient-stock") return { type: "error" as const, text: "Stock cannot be reduced below zero." };
  if (error === "invalid-quantity") return { type: "error" as const, text: "Initial quantity must be a valid whole number." };
  if (error === "invalid-minimum-stock") return { type: "error" as const, text: "Minimum stock must be a valid whole number." };
  if (error === "invalid-maximum-stock") return { type: "error" as const, text: "Maximum stock must be a whole number greater than zero." };
  if (error === "maximum-below-minimum") return { type: "error" as const, text: "Maximum stock cannot be lower than minimum stock." };
  if (error === "initial-stock-above-maximum") return { type: "error" as const, text: "Initial quantity cannot be higher than maximum stock." };
  if (error === "maximum-below-current-stock") return { type: "error" as const, text: "Maximum stock cannot be lower than current available plus blocked stock." };
  if (error === "stock-above-maximum") return { type: "error" as const, text: "This stock addition would exceed the configured maximum stock." };
  if (error === "archived-product-stock") return { type: "error" as const, text: "Reactivate this product before updating its stock." };
  if (error === "active-stock-block") return { type: "error" as const, text: "This product has reserved stock. Release active stock blocks before archiving it." };
  if (error === "product-already-archived") return { type: "error" as const, text: "This product is already archived." };
  if (error === "product-already-active") return { type: "error" as const, text: "This product is already active." };
  if (error === "permission-denied") return { type: "error" as const, text: "You do not have permission to manage products." };
  return null;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string; code?: string; name?: string; stack?: string }>;
}) {
  const params = await searchParams;
  const { hasAccess } = await checkPermission("manage_inventory");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Product Master Access Denied"
        description="Your current role does not have permission to manage products and stock."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const [products, categories, brands] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        categoryId: true,
        brandId: true,
        stack: true,
        unit: true,
        gstRate: true,
        purchasePrice: true,
        sellingPrice: true,
        dealerPrice: true,
        imageMimeType: true,
        imageFileName: true,
        quantity: true,
        blocked: true,
        minimumStock: true,
        maximumStock: true,
        status: true,
        isActive: true,
        archivedAt: true,
        archivedByName: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        _count: { select: { orderItems: true, stockBlockTimelines: true, purchaseReceiptItems: true } },
        purchaseReceiptItems: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            acceptedQuantity: true,
            damagedQuantity: true,
            rejectedQuantity: true,
            unitCost: true,
            createdAt: true,
            purchaseReceipt: {
              select: {
                receiptNumber: true,
                receivedAt: true,
                purchaseRequest: {
                  select: {
                    requestNumber: true,
                    supplier: { select: { companyName: true } },
                  },
                },
              },
            },
          },
        },
        stockBlockTimelines: {
          orderBy: { blockedAt: "desc" },
          take: 5,
          select: {
            id: true,
            quantity: true,
            status: true,
            blockReason: true,
            releaseReason: true,
            blockedAt: true,
            releasedAt: true,
            order: { select: { orderNumber: true } },
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { code: "asc" }],
    }),
    prisma.productCategory.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.productBrand.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
  ]);

  const message = getInventoryMessage(params?.error, params?.success, params?.code, params?.name, params?.stack);

  return (
    <ProductManagementClient
      message={message}
      products={products.map((product) => ({
        id: product.id,
        code: product.code,
        name: product.name,
        description: product.description,
        categoryId: product.categoryId,
        categoryName: product.category.name,
        brandId: product.brandId,
        brandName: product.brand.name,
        stack: product.stack,
        unit: product.unit,
        gstRate: Number(product.gstRate),
        purchasePrice: product.purchasePrice === null ? null : Number(product.purchasePrice),
        sellingPrice: product.sellingPrice === null ? null : Number(product.sellingPrice),
        dealerPrice: product.dealerPrice === null ? null : Number(product.dealerPrice),
        imageUrl: product.imageMimeType
          ? `/api/product-images/${product.id}?v=${product.updatedAt.getTime()}`
          : null,
        imageFileName: product.imageFileName,
        quantity: product.quantity,
        blocked: product.blocked,
        minimumStock: product.minimumStock,
        maximumStock: product.maximumStock,
        status: product.status,
        isActive: product.isActive,
        archivedAt: product.archivedAt?.toISOString() ?? null,
        archivedByName: product.archivedByName,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
        usageCount: product._count.orderItems,
        blockCount: product._count.stockBlockTimelines,
        purchaseReceiptCount: product._count.purchaseReceiptItems,
        recentPurchases: product.purchaseReceiptItems.map((receiptItem) => ({
          id: receiptItem.id,
          receiptNumber: receiptItem.purchaseReceipt.receiptNumber,
          requestNumber: receiptItem.purchaseReceipt.purchaseRequest.requestNumber,
          supplierName: receiptItem.purchaseReceipt.purchaseRequest.supplier.companyName,
          acceptedQuantity: receiptItem.acceptedQuantity,
          damagedQuantity: receiptItem.damagedQuantity,
          rejectedQuantity: receiptItem.rejectedQuantity,
          unitCost: receiptItem.unitCost === null ? null : Number(receiptItem.unitCost),
          receivedAt: receiptItem.purchaseReceipt.receivedAt.toISOString(),
        })),
        recentBlocks: product.stockBlockTimelines.map((block) => ({
          id: block.id,
          quantity: block.quantity,
          status: block.status,
          blockReason: block.blockReason,
          releaseReason: block.releaseReason,
          blockedAt: block.blockedAt.toISOString(),
          releasedAt: block.releasedAt?.toISOString() ?? null,
          orderNumber: block.order.orderNumber,
        })),
      }))}
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        isActive: category.isActive,
        productCount: category._count.products,
      }))}
      brands={brands.map((brand) => ({
        id: brand.id,
        name: brand.name,
        description: brand.description,
        isActive: brand.isActive,
        productCount: brand._count.products,
      }))}
    />
  );
}
