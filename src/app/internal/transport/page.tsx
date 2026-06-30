import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  createTransportOptionAction,
  toggleTransportOptionAction,
  updateTransportOptionAction,
} from "./actions";

type TransportOptionRow = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  assignedOrders: bigint | number;
};

function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getMessage(error?: string, success?: string) {
  if (success === "created") return { type: "success", text: "Transport option created successfully." };
  if (success === "updated") return { type: "success", text: "Transport option updated successfully." };
  if (success === "enabled") return { type: "success", text: "Transport option enabled successfully." };
  if (success === "disabled") return { type: "success", text: "Transport option disabled successfully." };
  if (error === "permission-denied") return { type: "error", text: "You do not have permission to manage transport options." };
  if (error === "missing-name") return { type: "error", text: "Transport name is required." };
  if (error === "name-too-long") return { type: "error", text: "Transport name must be 80 characters or less." };
  if (error === "description-too-long") return { type: "error", text: "Description must be 300 characters or less." };
  if (error === "invalid-sort-order") return { type: "error", text: "Order must be a whole number between 0 and 9999." };
  if (error === "duplicate-name") return { type: "error", text: "A transport option with this name already exists." };
  if (error === "missing-option") return { type: "error", text: "Transport option id is missing." };
  if (error === "option-not-found") return { type: "error", text: "Selected transport option was not found." };
  return null;
}

export default async function TransportOptionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);

  const { hasAccess } = await checkPermission("manage_transport_options");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Transport Access Denied"
        description="Your current role does not have permission to manage transport options."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const transportOptions = await prisma.$queryRaw<TransportOptionRow[]>`
    SELECT
      t."id",
      t."name",
      t."description",
      t."isActive",
      t."sortOrder",
      t."createdByName",
      t."updatedByName",
      t."createdAt",
      t."updatedAt",
      COUNT(o."id") AS "assignedOrders"
    FROM "TransportOption" t
    LEFT JOIN "Order" o ON o."transportOptionId" = t."id"
    GROUP BY t."id"
    ORDER BY t."isActive" DESC, t."sortOrder" ASC, t."name" ASC
  `;

  const activeCount = transportOptions.filter((option) => option.isActive).length;
  const assignedCount = transportOptions.reduce(
    (total, option) => total + Number(option.assignedOrders || 0),
    0,
  );

  return (
    <div>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300 sm:text-sm">
            Dispatch Setup
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:mt-3 sm:text-3xl md:text-5xl">
            Transport Options
          </h1>
          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-300 sm:mt-4 sm:text-sm sm:leading-6">
            Owner-friendly transport setup for Auto, Tempo, Truck, Courier,
            company vehicles, and any custom delivery method.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200">
          Active: <span className="text-cyan-300">{activeCount}</span>
        </div>
      </div>

      {message && (
        <div
          className={`mt-8 rounded-2xl border px-5 py-4 text-sm font-semibold ${
            message.type === "success"
              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-300"
              : "border-red-300/20 bg-red-300/10 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm text-slate-400">Total Options</p>
          <h2 className="mt-2 text-3xl font-bold text-white">{transportOptions.length}</h2>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm text-slate-400">Active Options</p>
          <h2 className="mt-2 text-3xl font-bold text-cyan-300">{activeCount}</h2>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm text-slate-400">Assigned Orders</p>
          <h2 className="mt-2 text-3xl font-bold text-emerald-300">{assignedCount}</h2>
        </div>
      </div>

      <section className="mt-8 rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.06] p-5 sm:p-6">
        <h2 className="text-xl font-bold text-white">Add Transport Option</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Add options like Auto, Tempo, Truck, Courier, Own Vehicle, or any custom transport method.
        </p>

        <form action={createTransportOptionAction} className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_110px_auto] md:items-end">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Name</span>
            <input
              name="name"
              placeholder="Tempo"
              maxLength={80}
              className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-cyan-300"
              required
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Description</span>
            <input
              name="description"
              placeholder="Local delivery by tempo or mini truck"
              maxLength={300}
              className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-cyan-300"
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Order</span>
            <input
              name="sortOrder"
              type="number"
              min={0}
              max={9999}
              step={1}
              defaultValue={60}
              className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-cyan-300"
            />
          </label>

          <button type="submit" className="h-12 rounded-2xl bg-cyan-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">
            Add Option
          </button>
        </form>
      </section>

      <section className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 p-5 sm:p-6">
          <h2 className="text-xl font-bold text-white">Transport Options List</h2>
          <p className="mt-2 text-sm text-slate-400">
            Disable an option instead of deleting it so old dispatch history remains clean.
          </p>
        </div>

        <div className="divide-y divide-white/10">
          {transportOptions.map((option) => (
            <article key={option.id} className="p-5 sm:p-6">
              <form action={updateTransportOptionAction} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_110px_auto_auto] xl:items-end">
                <input type="hidden" name="id" value={option.id} />

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Name</span>
                  <input name="name" defaultValue={option.name} maxLength={80} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-cyan-300" />
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Description</span>
                  <input name="description" defaultValue={option.description ?? ""} maxLength={300} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-cyan-300" />
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Order</span>
                  <input name="sortOrder" type="number" min={0} max={9999} step={1} defaultValue={option.sortOrder} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-cyan-300" />
                </label>

                <button type="submit" className="h-12 rounded-2xl border border-cyan-300/30 px-5 text-sm font-bold text-cyan-300 transition hover:bg-cyan-300 hover:text-slate-950">
                  Save
                </button>

                <div className="flex gap-3 xl:justify-end">
                  <span className={`inline-flex h-12 items-center rounded-2xl px-4 text-sm font-bold ${option.isActive ? "bg-emerald-300/10 text-emerald-300" : "bg-red-300/10 text-red-300"}`}>
                    {option.isActive ? "Active" : "Disabled"}
                  </span>
                </div>
              </form>

              <div className="mt-3 flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Used in {Number(option.assignedOrders || 0)} order(s). Last updated {formatDateTime(option.updatedAt)}{option.updatedByName ? ` by ${option.updatedByName}` : ""}.
                </p>

                <form action={toggleTransportOptionAction}>
                  <input type="hidden" name="id" value={option.id} />
                  <input type="hidden" name="nextActive" value={option.isActive ? "false" : "true"} />
                  <button type="submit" className={`rounded-2xl px-4 py-2 text-xs font-bold transition ${option.isActive ? "border border-red-300/30 text-red-300 hover:bg-red-300 hover:text-slate-950" : "border border-emerald-300/30 text-emerald-300 hover:bg-emerald-300 hover:text-slate-950"}`}>
                    {option.isActive ? "Disable" : "Enable"}
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
