import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { TeamFeedbackToast, type TeamFeedbackMessage } from "@/components/team-feedback-toast";
import { checkPermission } from "@/lib/auth-guards";
import {
  formatDealerAccountCurrency,
  formatDealerDirectoryDate,
  getDealerAccountHistory,
  getOrderSourceLabel,
} from "@/lib/dealer-directory";
import { hasPermission } from "@/lib/permissions";
import {
  archiveDealerAction,
  reactivateDealerAction,
  updateDealerProfileAction,
} from "../actions";

const inputClass = "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";
const labelClass = "mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400";

function feedback(error?: string, success?: string): TeamFeedbackMessage | null {
  const successMap: Record<string, TeamFeedbackMessage> = {
    "dealer-created": { type: "success", title: "Dealer created", text: "The profile and Dealer Portal account are active." },
    "dealer-updated": { type: "success", title: "Dealer updated", text: "Business, contact, address, and account values were saved." },
    "dealer-archived": { type: "success", title: "Dealer archived", text: "Portal access is blocked while historical orders and collections remain available." },
    "dealer-reactivated": { type: "success", title: "Dealer reactivated", text: "Dealer Portal access and controlled ordering are active again." },
    "order-created": { type: "success", title: "Order created", text: "The controlled internal order has entered the receiving workflow." },
  };
  const errorMap: Record<string, TeamFeedbackMessage> = {
    "permission-denied": { type: "error", title: "Access denied", text: "Your current role cannot change this dealer profile." },
    "missing-fields": { type: "error", title: "Missing details", text: "Business name, contact person, and email are required." },
    "duplicate-email": { type: "error", title: "Email already exists", text: "Another ERP user owns this email address." },
    "duplicate-gst": { type: "error", title: "GST number already exists", text: "This GST number belongs to another dealer." },
    "invalid-gst": { type: "error", title: "Invalid GST number", text: "Use 8–20 letters and numbers without spaces." },
    "invalid-postal-code": { type: "error", title: "Invalid postal code", text: "Enter a six-digit postal code." },
    "invalid-account-value": { type: "error", title: "Invalid account value", text: "Credit limit and opening balance must be valid amounts." },
    "archive-reason-required": { type: "error", title: "Reason required", text: "Add a reason before archiving dealer access." },
    "dealer-already-inactive": { type: "error", title: "Dealer already inactive", text: "This dealer is already archived or inactive." },
  };
  return success ? successMap[success] ?? null : error ? errorMap[error] ?? null : null;
}

function orderStatusTone(status: string) {
  if (["DELIVERED", "INVOICE_UPLOADED"].includes(status)) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (status === "CANCELLED") return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";
  return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300";
}

export default async function DealerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ dealerId: string }>;
  searchParams?: Promise<{ error?: string; success?: string; orderNumber?: string }>;
}) {
  const { dealerId } = await params;
  const query = await searchParams;
  const { currentUser, hasAccess } = await checkPermission("view_dealer_directory", `/internal/dealers/${dealerId}`);
  if (!hasAccess) {
    return <AccessDeniedCard title="Dealer Profile Access Denied" description="Your role cannot view Dealer Details." backHref="/internal/dealers" backLabel="Back to Dealers" />;
  }

  const account = await getDealerAccountHistory(dealerId);
  if (!account) notFound();

  const { dealer, entries, totals } = account;
  const profile = dealer.dealerProfile;
  const canManage = hasPermission(currentUser.roles, "manage_dealer_directory");
  const canCreateOrder = hasPermission(currentUser.roles, "create_internal_dealer_orders") && dealer.status === "ACTIVE";
  const activeOrders = dealer.dealerOrders.filter((order) => !["DELIVERED", "INVOICE_UPLOADED", "CANCELLED"].includes(order.status));
  const deliveredOrders = dealer.dealerOrders.filter((order) => ["DELIVERED", "INVOICE_UPLOADED"].includes(order.status));
  const cancelledOrders = dealer.dealerOrders.filter((order) => order.status === "CANCELLED");
  const overLimit = totals.creditLimit > 0 && totals.outstanding > totals.creditLimit;

  return (
    <div className="space-y-7">
      <TeamFeedbackToast message={feedback(query?.error, query?.success)} />

      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-6 text-white sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${dealer.status === "ACTIVE" ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-slate-300"}`}>{dealer.status === "ACTIVE" ? "Active Dealer" : "Archived Dealer"}</span>
                {overLimit ? <span className="rounded-full bg-rose-400/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-200">Credit limit exceeded</span> : null}
              </div>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.3em] text-blue-200">Dealer Details</p>
              <h1 className="mt-2 text-4xl font-black md:text-5xl">{profile?.businessName ?? dealer.name}</h1>
              <p className="mt-3 text-sm font-semibold text-blue-100">{dealer.name} · {dealer.email} {dealer.phone ? `· ${dealer.phone}` : ""}</p>
              <p className="mt-2 text-xs text-blue-200/80">{[profile?.city, profile?.state, profile?.gstNumber ? `GST ${profile.gstNumber}` : null].filter(Boolean).join(" · ") || "Business profile details pending"}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {canCreateOrder ? <Link href={`/internal/dealers/${dealer.id}/new-order`} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-blue-50">Create Internal Order</Link> : null}
              <Link href="/internal/dealers" className="rounded-2xl border border-white/20 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10">Back to Directory</Link>
            </div>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-5">
          {[
            ["Total Orders", dealer.dealerOrders.length, "text-slate-950 dark:text-white"],
            ["Active Orders", activeOrders.length, "text-blue-700 dark:text-blue-300"],
            ["Delivered Value", formatDealerAccountCurrency(totals.debit - Number(profile?.openingBalance ?? 0)), "text-emerald-700 dark:text-emerald-300"],
            ["Verified Collections", formatDealerAccountCurrency(totals.credit), "text-violet-700 dark:text-violet-300"],
            ["Outstanding", formatDealerAccountCurrency(totals.outstanding), totals.outstanding > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
              <p className={`mt-2 text-xl font-black ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-cyan-300">Purchase History</p><h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Orders from every source</h2></div>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{deliveredOrders.length} delivered · {cancelledOrders.length} cancelled</span>
            </div>
            <div className="mt-5 space-y-3">
              {dealer.dealerOrders.slice(0, 12).map((order) => {
                const amount = order.items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
                return (
                  <Link key={order.id} href={`/internal/order-journey?orderId=${encodeURIComponent(order.id)}`} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/30 dark:border-slate-800 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950 dark:text-white">{order.orderNumber}</p><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${orderStatusTone(order.status)}`}>{order.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{getOrderSourceLabel(order.source)} · {formatDealerDirectoryDate(order.createdAt)} · {order.items.length} products</p></div>
                    <p className="shrink-0 text-base font-black text-slate-950 dark:text-white">{formatDealerAccountCurrency(amount)}</p>
                  </Link>
                );
              })}
              {!dealer.dealerOrders.length ? <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">No orders have been created for this dealer.</p> : null}
            </div>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-violet-600 dark:text-violet-300">Operational Account History</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Delivered orders and verified collections</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">This is an operational outstanding view, not a general-ledger accounting statement.</p>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-[0.13em] text-slate-400 dark:border-slate-800"><th className="px-3 py-3">Date / Reference</th><th className="px-3 py-3">Description</th><th className="px-3 py-3 text-right">Debit</th><th className="px-3 py-3 text-right">Credit</th></tr></thead>
                <tbody>
                  {entries.slice(0, 20).map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100 dark:border-slate-800/70">
                      <td className="px-3 py-4 align-top"><p className="font-black text-slate-950 dark:text-white">{entry.reference}</p><p className="mt-1 text-xs text-slate-400">{formatDealerDirectoryDate(entry.occurredAt)}</p></td>
                      <td className="px-3 py-4 align-top"><p className="font-semibold text-slate-700 dark:text-slate-200">{entry.description}</p>{entry.href ? <Link href={entry.href} className="mt-1 inline-flex text-xs font-black text-blue-600 dark:text-cyan-300">Open record →</Link> : null}</td>
                      <td className="px-3 py-4 text-right align-top font-black text-amber-700 dark:text-amber-300">{entry.debit ? formatDealerAccountCurrency(entry.debit) : "—"}</td>
                      <td className="px-3 py-4 text-right align-top font-black text-emerald-700 dark:text-emerald-300">{entry.credit ? formatDealerAccountCurrency(entry.credit) : "—"}</td>
                    </tr>
                  ))}
                  {!entries.length ? <tr><td colSpan={4} className="px-3 py-8 text-center text-sm font-semibold text-slate-500">No delivered-order or verified-collection account entries yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-cyan-300">Account Exposure</p>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-950"><span className="text-sm font-semibold text-slate-500">Credit limit</span><strong className="text-slate-950 dark:text-white">{formatDealerAccountCurrency(totals.creditLimit)}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-amber-50 p-4 dark:bg-amber-500/10"><span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Outstanding</span><strong className="text-amber-800 dark:text-amber-200">{formatDealerAccountCurrency(totals.outstanding)}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10"><span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Available credit</span><strong className="text-emerald-800 dark:text-emerald-200">{formatDealerAccountCurrency(Math.max(totals.creditLimit - Math.max(totals.outstanding, 0), 0))}</strong></div>
            </div>
          </div>

          {canManage ? (
            <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-cyan-300">Profile Control</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Official dealer details</h2>
              <form action={updateDealerProfileAction} className="mt-5 space-y-4">
                <input type="hidden" name="dealerId" value={dealer.id} />
                <div><label className={labelClass}>Business Name</label><input name="businessName" defaultValue={profile?.businessName ?? dealer.name} className={inputClass} required /></div>
                <div><label className={labelClass}>Contact Person</label><input name="contactName" defaultValue={profile?.contactPerson ?? dealer.name} className={inputClass} required /></div>
                <div><label className={labelClass}>Email</label><input name="email" type="email" defaultValue={dealer.email} className={inputClass} required /></div>
                <div><label className={labelClass}>Phone</label><input name="phone" defaultValue={dealer.phone ?? ""} className={inputClass} /></div>
                <div><label className={labelClass}>GST Number</label><input name="gstNumber" defaultValue={profile?.gstNumber ?? ""} className={inputClass} /></div>
                <div><label className={labelClass}>Address Line 1</label><input name="addressLine1" defaultValue={profile?.addressLine1 ?? ""} className={inputClass} /></div>
                <div><label className={labelClass}>Address Line 2</label><input name="addressLine2" defaultValue={profile?.addressLine2 ?? ""} className={inputClass} /></div>
                <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>City</label><input name="city" defaultValue={profile?.city ?? ""} className={inputClass} /></div><div><label className={labelClass}>State</label><input name="state" defaultValue={profile?.state ?? ""} className={inputClass} /></div></div>
                <div><label className={labelClass}>Postal Code</label><input name="postalCode" defaultValue={profile?.postalCode ?? ""} className={inputClass} /></div>
                <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>Credit Limit</label><input name="creditLimit" type="number" min="0" step="0.01" defaultValue={Number(profile?.creditLimit ?? 0)} className={inputClass} /></div><div><label className={labelClass}>Opening Balance</label><input name="openingBalance" type="number" step="0.01" defaultValue={Number(profile?.openingBalance ?? 0)} className={inputClass} /></div></div>
                <div><label className={labelClass}>Internal Notes</label><textarea name="internalNotes" rows={4} defaultValue={profile?.internalNotes ?? ""} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div>
                <button className="h-12 w-full rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-400 dark:text-slate-950">Save Dealer Profile</button>
              </form>

              <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
                {dealer.status === "ACTIVE" ? (
                  <form action={archiveDealerAction} className="space-y-3"><input type="hidden" name="dealerId" value={dealer.id} /><label className={labelClass}>Archive Reason</label><textarea name="reason" rows={3} required className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-rose-400 dark:border-rose-500/25 dark:bg-rose-500/5 dark:text-slate-100" placeholder="Why should Dealer Portal access be stopped?" /><button className="h-11 w-full rounded-xl border border-rose-200 text-sm font-black text-rose-700 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10">Archive Dealer Access</button></form>
                ) : (
                  <form action={reactivateDealerAction}><input type="hidden" name="dealerId" value={dealer.id} /><button className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-black text-white transition hover:bg-emerald-700">Reactivate Dealer</button></form>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><p className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">Business Details</p><div className="mt-4 space-y-3 text-sm"><p><strong className="text-slate-950 dark:text-white">GST:</strong> <span className="text-slate-500">{profile?.gstNumber ?? "Not added"}</span></p><p><strong className="text-slate-950 dark:text-white">Address:</strong> <span className="text-slate-500">{[profile?.addressLine1, profile?.addressLine2, profile?.city, profile?.state, profile?.postalCode].filter(Boolean).join(", ") || "Not added"}</span></p><p><strong className="text-slate-950 dark:text-white">Member since:</strong> <span className="text-slate-500">{formatDealerDirectoryDate(dealer.createdAt)}</span></p></div></div>
          )}
        </div>
      </section>
    </div>
  );
}
