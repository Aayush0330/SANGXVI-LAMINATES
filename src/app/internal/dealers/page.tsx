import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { TeamFeedbackToast, type TeamFeedbackMessage } from "@/components/team-feedback-toast";
import { checkPermission } from "@/lib/auth-guards";
import {
  formatDealerAccountCurrency,
  formatDealerDirectoryDate,
  getDealerDirectoryRows,
} from "@/lib/dealer-directory";
import { hasPermission } from "@/lib/permissions";
import { createDealerAction } from "./actions";

const inputClass = "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";
const labelClass = "mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400";

function feedback(error?: string, success?: string): TeamFeedbackMessage | null {
  const successMap: Record<string, TeamFeedbackMessage> = {
    "dealer-created": { type: "success", title: "Dealer created", text: "The dealer profile and portal account are ready." },
  };
  const errorMap: Record<string, TeamFeedbackMessage> = {
    "permission-denied": { type: "error", title: "Access denied", text: "Your current role cannot manage dealer records." },
    "missing-fields": { type: "error", title: "Missing details", text: "Business name, contact name, email, and password are required." },
    "weak-password": { type: "error", title: "Weak password", text: "Use at least 12 characters with uppercase, lowercase, number and symbol." },
    "duplicate-email": { type: "error", title: "Email already exists", text: "Another ERP user already owns this email address." },
    "duplicate-gst": { type: "error", title: "GST number already exists", text: "This GST number is already linked to another dealer." },
    "invalid-gst": { type: "error", title: "Invalid GST number", text: "Use 8–20 letters and numbers without spaces." },
    "invalid-postal-code": { type: "error", title: "Invalid postal code", text: "Enter a valid six-digit postal code." },
    "invalid-account-value": { type: "error", title: "Invalid account value", text: "Credit limit and opening balance must be valid amounts." },
  };
  return success ? successMap[success] ?? null : error ? errorMap[error] ?? null : null;
}

function statusTone(status: string) {
  return status === "ACTIVE"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

export default async function DealersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const { currentUser, hasAccess } = await checkPermission("view_dealer_directory", "/internal/dealers");
  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Dealer Directory Access Denied"
        description="Your current role cannot view dealer profiles and account history."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const canManage = hasPermission(currentUser.roles, "manage_dealer_directory");
  const canCreateOrder = hasPermission(currentUser.roles, "create_internal_dealer_orders");
  const query = params?.q?.trim().toLowerCase() ?? "";
  const status = params?.status === "active" || params?.status === "inactive" ? params.status : "all";
  const rows = await getDealerDirectoryRows();
  const filtered = rows.filter((dealer) => {
    const searchable = [dealer.businessName, dealer.name, dealer.email, dealer.phone, dealer.gstNumber, dealer.city, dealer.state]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const statusMatches = status === "all" || (status === "active" ? dealer.status === "ACTIVE" : dealer.status !== "ACTIVE");
    return statusMatches && (!query || searchable.includes(query));
  });

  const activeDealers = rows.filter((dealer) => dealer.status === "ACTIVE").length;
  const totalOutstanding = rows.reduce((sum, dealer) => sum + dealer.outstanding, 0);
  const totalDeliveredValue = rows.reduce((sum, dealer) => sum + dealer.deliveredValue, 0);
  const creditRisk = rows.filter((dealer) => dealer.creditLimit > 0 && dealer.outstanding > dealer.creditLimit).length;

  return (
    <div className="space-y-7">
      <TeamFeedbackToast message={feedback(params?.error, params?.success)} />

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.34em] text-blue-600 dark:text-cyan-300">Phase 5 · Dealer Network</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 dark:text-white md:text-5xl">Dealer Directory</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Central profiles, purchase history, account exposure, order sources, portal status, and controlled internal ordering.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {canManage ? (
              <a href="#add-dealer" className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">+ Add Dealer</a>
            ) : null}
            <Link href="/internal/orders" className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">All Orders</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active Dealers", activeDealers, "text-emerald-700 dark:text-emerald-300"],
          ["Delivered Value", formatDealerAccountCurrency(totalDeliveredValue), "text-blue-700 dark:text-cyan-300"],
          ["Operational Outstanding", formatDealerAccountCurrency(totalOutstanding), totalOutstanding > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"],
          ["Over Credit Limit", creditRisk, creditRisk ? "text-rose-700 dark:text-rose-300" : "text-slate-950 dark:text-white"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
            <p className={`mt-3 break-words text-2xl font-black tabular-nums tracking-tight ${tone}`}>{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_auto]">
          <input name="q" defaultValue={params?.q ?? ""} placeholder="Search business, contact, email, GST, city..." className={inputClass} />
          <select name="status" defaultValue={status} className={inputClass}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Archived / inactive</option>
          </select>
          <button className="h-12 rounded-xl bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">Apply Filters</button>
        </form>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {filtered.length ? filtered.map((dealer) => {
          const overLimit = dealer.creditLimit > 0 && dealer.outstanding > dealer.creditLimit;
          return (
            <article key={dealer.dealerId} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/30 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusTone(dealer.status)}`}>{dealer.status === "ACTIVE" ? "Active" : "Archived"}</span>
                    {overLimit ? <span className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">Credit limit exceeded</span> : null}
                  </div>
                  <h2 className="mt-3 truncate text-2xl font-black text-slate-950 dark:text-white">{dealer.businessName}</h2>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-500 dark:text-slate-400">{dealer.name} · {dealer.email}</p>
                  <p className="mt-1 text-xs text-slate-400">{[dealer.city, dealer.state, dealer.gstNumber ? `GST ${dealer.gstNumber}` : null].filter(Boolean).join(" · ") || "Business details pending"}</p>
                </div>
                <Link href={`/internal/dealers/${dealer.dealerId}`} className="shrink-0 rounded-xl border border-slate-200 px-4 py-2.5 text-center text-xs font-black text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-cyan-300/30 dark:hover:text-cyan-300">View Dealer Details</Link>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950"><p className="text-xl font-black text-slate-950 dark:text-white">{dealer.totalOrders}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Orders</p></div>
                <div className="rounded-2xl bg-blue-50 p-4 dark:bg-blue-500/10"><p className="text-xl font-black text-blue-700 dark:text-blue-300">{dealer.activeOrders}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">Active</p></div>
                <div className="min-w-0 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10"><p className="break-words text-sm font-black tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300 sm:text-lg">{formatDealerAccountCurrency(dealer.verifiedCollections)}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-300">Collected</p></div>
                <div className={`min-w-0 rounded-2xl p-4 ${dealer.outstanding > 0 ? "bg-amber-50 dark:bg-amber-500/10" : "bg-slate-50 dark:bg-slate-950"}`}><p className={`break-words text-sm font-black tabular-nums tracking-tight sm:text-lg ${dealer.outstanding > 0 ? "text-amber-700 dark:text-amber-300" : "text-slate-950 dark:text-white"}`}>{formatDealerAccountCurrency(dealer.outstanding)}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Outstanding</p></div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>Last order: {formatDealerDirectoryDate(dealer.lastOrderAt)}</span>
                {canCreateOrder && dealer.status === "ACTIVE" ? <Link href={`/internal/dealers/${dealer.dealerId}/new-order`} className="font-black text-blue-600 hover:text-blue-700 dark:text-cyan-300">Create order →</Link> : null}
              </div>
            </article>
          );
        }) : (
          <div className="xl:col-span-2 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-xl font-black text-slate-950 dark:text-white">No dealers match these filters</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Clear the search or add a new dealer profile.</p>
          </div>
        )}
      </section>

      {canManage ? (
        <section id="add-dealer" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-600 dark:text-cyan-300">New Dealer</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950 dark:text-white">Create profile and portal access</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">The dealer receives one active Dealer Portal account. Existing history is never hard deleted.</p>
          </div>
          <form action={createDealerAction} className="mt-7 grid gap-5 lg:grid-cols-2">
            <div><label className={labelClass}>Business Name</label><input name="businessName" className={inputClass} required placeholder="Business or dealership name" /></div>
            <div><label className={labelClass}>Contact Person</label><input name="contactName" className={inputClass} required placeholder="Authorized contact name" /></div>
            <div><label className={labelClass}>Email</label><input name="email" type="email" className={inputClass} required placeholder="dealer@example.com" /></div>
            <div><label className={labelClass}>Phone</label><input name="phone" className={inputClass} placeholder="10-digit phone number" /></div>
            <div><label className={labelClass}>Temporary Password</label><input name="password" type="password" minLength={12} className={inputClass} required placeholder="12+ characters with number and symbol" /></div>
            <div><label className={labelClass}>GST Number</label><input name="gstNumber" className={inputClass} placeholder="Optional GST number" /></div>
            <div className="lg:col-span-2"><label className={labelClass}>Address Line 1</label><input name="addressLine1" className={inputClass} placeholder="Street, building, market" /></div>
            <div className="lg:col-span-2"><label className={labelClass}>Address Line 2</label><input name="addressLine2" className={inputClass} placeholder="Area or landmark" /></div>
            <div><label className={labelClass}>City</label><input name="city" className={inputClass} /></div>
            <div><label className={labelClass}>State</label><input name="state" className={inputClass} /></div>
            <div><label className={labelClass}>Postal Code</label><input name="postalCode" inputMode="numeric" className={inputClass} /></div>
            <div><label className={labelClass}>Credit Limit</label><input name="creditLimit" type="number" min="0" step="0.01" defaultValue="0" className={inputClass} /></div>
            <div><label className={labelClass}>Opening Balance</label><input name="openingBalance" type="number" step="0.01" defaultValue="0" className={inputClass} /></div>
            <div className="lg:col-span-2"><label className={labelClass}>Internal Notes</label><textarea name="internalNotes" rows={4} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" placeholder="Credit terms, account notes, special instructions..." /></div>
            <div className="lg:col-span-2"><button className="h-12 rounded-xl bg-blue-600 px-7 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">Create Dealer</button></div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
