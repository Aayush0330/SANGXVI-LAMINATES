import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { getPortalLandingLabel, getPortalLandingPath } from "@/lib/current-user";
import {
  formatDealerAccountCurrency,
  formatDealerDirectoryDate,
  getDealerAccountHistory,
} from "@/lib/dealer-directory";

function InfoCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-3 text-sm font-black text-slate-950 dark:text-white">{value}</p></div>;
}

export default async function DealerProfilePage() {
  const { currentUser, hasAccess } = await checkPermission("track_dealer_orders", "/dealer/profile");
  if (!hasAccess || !currentUser.roles.includes("dealer")) {
    return <AccessDeniedCard title="Profile Access Denied" description="Your current role does not have permission to view the dealer profile." backHref={getPortalLandingPath(currentUser.role)} backLabel={getPortalLandingLabel(currentUser.role)} />;
  }

  const account = await getDealerAccountHistory(currentUser.id);
  if (!account || account.dealer.status !== "ACTIVE") {
    return <AccessDeniedCard title="Dealer Account Not Found" description="Your active dealer account was not found." backHref={getPortalLandingPath(currentUser.role)} backLabel={getPortalLandingLabel(currentUser.role)} />;
  }

  const { dealer, totals } = account;
  const profile = dealer.dealerProfile;
  const completed = dealer.dealerOrders.filter((order) => ["DELIVERED", "INVOICE_UPLOADED"].includes(order.status)).length;
  const active = dealer.dealerOrders.filter((order) => !["DELIVERED", "INVOICE_UPLOADED", "CANCELLED"].includes(order.status)).length;
  const initials = (profile?.businessName ?? dealer.name).split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  return (
    <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0d182a]">
        <div className="bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-7 text-white"><div className="flex h-20 w-20 items-center justify-center rounded-[26px] border border-white/15 bg-white/10 text-2xl font-black shadow-xl backdrop-blur">{initials || "D"}</div><h2 className="mt-5 text-2xl font-black">{profile?.businessName ?? dealer.name}</h2><p className="mt-1 text-sm font-semibold text-blue-100">{dealer.name} · Authorized Sanghvi Dealer</p><span className="mt-4 inline-flex rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200">Active account</span></div>
        <div className="p-5 sm:p-6"><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5"><p className="text-2xl font-black text-slate-950 dark:text-white">{dealer.dealerOrders.length}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Total Orders</p></div><div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10"><p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{completed}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-300">Delivered</p></div><div className="rounded-2xl bg-blue-50 p-4 dark:bg-blue-500/10"><p className="text-2xl font-black text-blue-700 dark:text-blue-300">{active}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-blue-600 dark:text-blue-300">Active Orders</p></div><div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-500/10"><p className="text-base font-black text-amber-700 dark:text-amber-300">{formatDealerAccountCurrency(totals.outstanding)}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-amber-600 dark:text-amber-300">Operational Outstanding</p></div></div><p className="mt-4 text-xs leading-5 text-slate-400">Outstanding is an operational view based on delivered orders, opening balance, and verified collections. It is not a general-ledger statement.</p></div>
      </section>

      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0d182a] sm:p-6"><h2 className="text-lg font-black text-slate-950 dark:text-white">Business & Account Information</h2><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Contact your Sanghvi manager to update official dealer details.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><InfoCard label="Business Name" value={profile?.businessName ?? dealer.name} /><InfoCard label="Contact Person" value={profile?.contactPerson ?? dealer.name} /><InfoCard label="Email Address" value={dealer.email} /><InfoCard label="Phone Number" value={dealer.phone || "Not added"} /><InfoCard label="GST Number" value={profile?.gstNumber || "Not added"} /><InfoCard label="Account Status" value="Active and verified" /><InfoCard label="Credit Limit" value={formatDealerAccountCurrency(totals.creditLimit)} /><InfoCard label="Member Since" value={formatDealerDirectoryDate(dealer.createdAt)} /><div className="sm:col-span-2"><InfoCard label="Business Address" value={[profile?.addressLine1, profile?.addressLine2, profile?.city, profile?.state, profile?.postalCode].filter(Boolean).join(", ") || "Not added"} /></div></div></section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0d182a] sm:p-6"><h2 className="text-lg font-black text-slate-950 dark:text-white">Dealer Shortcuts</h2><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Continue your saved cart or track existing orders.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><Link href="/dealer/place-order" className="rounded-2xl bg-blue-600 px-5 py-4 text-center text-sm font-black text-white transition hover:bg-blue-700">Create New Order</Link><Link href="/dealer/orders" className="rounded-2xl border border-slate-200 px-5 py-4 text-center text-sm font-black text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:text-slate-200 dark:hover:border-blue-400/25 dark:hover:text-blue-300">View Order History</Link></div><div className="mt-3 sm:hidden"><LogoutButton variant="compact" /></div></section>
      </div>
    </div>
  );
}
