import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { TeamFeedbackToast, type TeamFeedbackMessage } from "@/components/team-feedback-toast";
import { checkPermission } from "@/lib/auth-guards";
import { dealerOrderSourceOptions, getDealerProfile } from "@/lib/dealer-directory";
import { prisma } from "@/lib/db";
import { createOrderPriceSnapshot } from "@/lib/order-pricing";
import { InternalDealerOrderBuilder } from "./internal-order-builder";

function feedback(error?: string): TeamFeedbackMessage | null {
  const map: Record<string, TeamFeedbackMessage> = {
    "permission-denied": { type: "error", title: "Access denied", text: "Your current role cannot create internal dealer orders." },
    "dealer-not-found": { type: "error", title: "Dealer not found", text: "The selected dealer record is unavailable." },
    "dealer-inactive": { type: "error", title: "Dealer inactive", text: "Reactivate the dealer before creating a new order." },
    "invalid-source": { type: "error", title: "Invalid source", text: "Choose a permitted order source." },
    "invalid-required-date": { type: "error", title: "Invalid date", text: "Choose a valid required-by date." },
    "notes-too-long": { type: "error", title: "Notes too long", text: "Order notes cannot exceed 1,000 characters." },
    "invalid-items": { type: "error", title: "Invalid order items", text: "Add valid products and positive quantities." },
    "product-unavailable": { type: "error", title: "Product unavailable", text: "One or more selected products were archived or removed." },
    "pricing-unavailable": { type: "error", title: "Pricing unavailable", text: "Dealer or selling price is missing for one or more products." },
    "stock-insufficient": { type: "error", title: "Full quantity unavailable", text: "The order was not created. Full stock is required for every selected product." },
  };
  return error ? map[error] ?? null : null;
}

export default async function InternalDealerNewOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ dealerId: string }>;
  searchParams?: Promise<{ error?: string; products?: string }>;
}) {
  const { dealerId } = await params;
  const query = await searchParams;
  const { hasAccess } = await checkPermission("create_internal_dealer_orders", `/internal/dealers/${dealerId}/new-order`);
  if (!hasAccess) {
    return <AccessDeniedCard title="Internal Order Access Denied" description="Your role cannot record orders on behalf of dealers." backHref="/internal/dealers" backLabel="Back to Dealers" />;
  }

  const [dealer, dealerProfile, products] = await Promise.all([
    prisma.user.findUnique({ where: { id: dealerId }, include: { roleAssignments: true } }),
    getDealerProfile(dealerId),
    prisma.product.findMany({
      where: { isActive: true },
      include: { category: true, brand: true },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    }),
  ]);

  if (!dealer || (dealer.role !== "DEALER" && !dealer.roleAssignments.some((assignment) => assignment.role === "DEALER"))) notFound();

  const productRows = products.flatMap((product) => {
    const snapshot = createOrderPriceSnapshot(product, 1);
    if (!snapshot) return [];
    return [{
      id: product.id,
      code: product.code,
      name: product.name,
      unit: product.unit,
      quantity: product.quantity,
      gstRate: Number(snapshot.gstRate),
      unitPrice: Number(snapshot.unitPrice),
      categoryName: product.category.name,
      brandName: product.brand.name,
    }];
  });

  return (
    <div className="space-y-7">
      <TeamFeedbackToast message={feedback(query?.error)} />
      {query?.error === "stock-insufficient" && query.products ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">Affected products: {query.products}</div> : null}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.32em] text-blue-600 dark:text-cyan-300">Controlled Internal Ordering</p><h1 className="mt-3 text-4xl font-black text-slate-950 dark:text-white">Create order for {dealerProfile?.businessName ?? dealer.name}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Prices and GST are frozen at order time. The dealer receives a portal notification and the existing receiving workflow starts automatically.</p></div><Link href={`/internal/dealers/${dealer.id}`} className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Back to Dealer Details</Link></div>
      </section>
      {dealer.status === "ACTIVE" ? <InternalDealerOrderBuilder dealerId={dealer.id} products={productRows} sourceOptions={[...dealerOrderSourceOptions]} /> : <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-500/25 dark:bg-amber-500/10"><h2 className="text-2xl font-black text-amber-900 dark:text-amber-200">Dealer access is inactive</h2><p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">Reactivate this dealer before creating a new order.</p></div>}
    </div>
  );
}
