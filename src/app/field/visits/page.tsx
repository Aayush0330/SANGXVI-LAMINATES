import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";

export default async function FieldVisitsPage() {
  const { hasAccess } = await checkPermission("manage_field_visits");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Field Visit Access Denied"
        description="Your current role does not have permission to manage field visits."
        backHref="/login"
        backLabel="Switch User"
      />
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">
        Field Visits
      </p>

      <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl md:text-5xl">
        Shop Visit Updates
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">
        Field sales teams can upload shop photos, locations, visit descriptions,
        achieved goals, and pending goals from this page.
      </p>

      <form className="mt-8 grid gap-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div>
          <label className="mb-2 block text-sm font-semibold text-zinc-200">
            Shop Name
          </label>

          <input
            type="text"
            placeholder="Enter shop name"
            className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-emerald-300"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-zinc-200">
            Visit Description
          </label>

          <textarea
            placeholder="Add visit details"
            className="min-h-28 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-emerald-300"
          />
        </div>

        <button
          type="button"
          className="rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-bold text-zinc-950"
        >
          Save Visit
        </button>
      </form>
    </div>
  );
}