import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";

export default async function FieldCollectionsPage() {
  const { hasAccess } = await checkPermission("manage_collections");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Collection Access Denied"
        description="Your current role does not have permission to view or manage collection tasks."
        backHref="/login"
        backLabel="Switch User"
      />
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">
        Collections
      </p>

      <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl md:text-5xl">
        Collection Tasks
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">
        Collection agents can view assigned collection tasks, update collection
        status, and upload cheque or UPI proof.
      </p>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <h2 className="text-lg font-bold">Collection #COL-501</h2>

        <p className="mt-2 text-sm text-zinc-400">
          Amount: ₹25,000 | Dealer: Arihant Laminates
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-bold text-zinc-950">
            On The Way
          </button>

          <button className="rounded-full border border-white/10 px-5 py-3 text-sm font-bold text-white">
            Upload Proof
          </button>
        </div>
      </div>
    </div>
  );
}