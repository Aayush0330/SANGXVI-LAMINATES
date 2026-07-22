import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { getPortalLandingLabel, getPortalLandingPath } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDealerCart } from "@/lib/dealer-cart-db";
import { DealerOrderBuilder } from "./order-builder-client";

function getMessage(error?: string, success?: string, orderNumber?: string, products?: string, inquiryNumber?: string) {
  if (success === "order-created") return { type: "success", text: `Order ${orderNumber ?? ""} was created successfully. Your saved cart was cleared and the order was sent to the Order Receiving Team.` };
  if (error === "permission-denied") return { type: "error", text: "You do not have permission to create dealer orders." };
  if (error === "empty-order") return { type: "error", text: "Add at least one product before placing the order." };
  if (error === "invalid-items") return { type: "error", text: "The saved cart contains invalid products, quantities or notes." };
  if (error === "dealer-not-found") return { type: "error", text: "Your active dealer account was not found." };
  if (error === "product-not-found") return { type: "error", text: "One or more saved products were archived or removed. Review and remove unavailable items before ordering." };
  if (error === "pricing-unavailable") return { type: "error", text: "Dealer pricing is unavailable for one or more products. Ask the internal team to complete Product Master pricing." };
  if (error === "stock-issues") return { type: "error", text: `${products || "Some products"} do not have enough stock. Your cart was preserved and stock request ${inquiryNumber ?? ""} was created for internal follow-up.` };
  if (error === "cart-not-saved") return { type: "error", text: "Wait for the cart to finish saving before placing the order." };
  if (error === "cart-conflict") return { type: "error", text: "This cart was changed in another browser or device. The latest saved cart has been loaded; review it before ordering." };
  if (error === "cart-pricing-changed") return { type: "error", text: "Dealer price or GST changed while you were reviewing the cart. The saved cart was refreshed with current pricing; review the new totals and place the order again." };
  if (error === "cart-stock-changed") return { type: "error", text: "Stock changed while the order was being submitted. Your cart was preserved; review the latest availability before trying again." };
  return null;
}

export default async function DealerPlaceOrderPage({
  searchParams,
}: {
  searchParams?: Promise<{ product?: string; error?: string; success?: string; orderNumber?: string; products?: string; inquiryNumber?: string }>;
}) {
  const params = await searchParams;
  const { currentUser, hasAccess } = await checkPermission("place_dealer_order");

  if (!hasAccess || !currentUser.roles.includes("dealer")) {
    return (
      <AccessDeniedCard
        title="Order Access Denied"
        description="Your current role does not have permission to place dealer orders."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const savedCart = await getDealerCart(prisma, currentUser.id);

  const savedProductIds = savedCart?.items.map((item) => item.productId) ?? [];
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { isActive: true, quantity: { gt: 0 } },
        ...(savedProductIds.length ? [{ id: { in: savedProductIds } }] : []),
      ],
    },
    include: { category: true, brand: true },
    orderBy: [{ isActive: "desc" }, { quantity: "desc" }, { name: "asc" }],
  });

  const serializableProducts = products.map((product) => {
    const selectedPrice = product.dealerPrice ?? product.sellingPrice;
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      description: product.description,
      unit: product.unit,
      quantity: product.quantity,
      minimumStock: product.minimumStock,
      gstRate: Number(product.gstRate),
      dealerPrice: selectedPrice === null ? null : Number(selectedPrice),
      priceSource: product.dealerPrice !== null ? "DEALER_PRICE" as const : "SELLING_PRICE" as const,
      pricingAvailable: selectedPrice !== null,
      isActive: product.isActive,
      imageMimeType: product.imageMimeType,
      category: { id: product.category.id, name: product.category.name },
      brand: { id: product.brand.id, name: product.brand.name },
    };
  });

  const initialCart = (savedCart?.items ?? []).map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    unitPriceSnapshot: Number(item.unitPriceSnapshot),
    gstRateSnapshot: Number(item.gstRateSnapshot),
    priceSourceSnapshot: item.priceSourceSnapshot,
  }));

  const message = getMessage(params?.error, params?.success, params?.orderNumber, params?.products, params?.inquiryNumber);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0d182a] sm:p-6 xl:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/10 dark:text-blue-300">Persistent dealer cart</span>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Build your order</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">Your cart is saved to your dealer account and resumes after logout or on another device. Current price, GST and stock are revalidated before ordering.</p>
          </div>
          <Link href="/dealer/orders" className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-blue-400/25 dark:hover:text-blue-300">Track My Orders</Link>
        </div>
        {message ? <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-300"}`}>{message.text}</div> : null}
      </section>
      <DealerOrderBuilder
        products={serializableProducts}
        initialProductId={params?.product}
        initialCart={initialCart}
        initialCartVersion={savedCart?.version ?? 0}
        initialNotes={savedCart?.notes ?? ""}
        initialSavedAt={savedCart?.updatedAt.toISOString() ?? null}
      />
    </div>
  );
}
