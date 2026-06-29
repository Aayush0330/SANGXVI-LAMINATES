export default function FieldDashboardPage() {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">
        Field / Mobile Portal
      </p>

      <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl md:text-5xl">
        Mobile Operations Dashboard
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">
        This portal is designed as a mobile-friendly workspace for drivers,
        transport staff, collection agents, and the field sales team.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:rounded-3xl sm:p-6">
          <h2 className="text-lg font-bold">Assigned Deliveries</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Drivers can view all assigned orders here.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:rounded-3xl sm:p-6">
          <h2 className="text-lg font-bold">Upload Proof</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Signed invoices or collection proof can be uploaded after delivery.
          </p>
        </div>
      </div>
    </div>
  );
}
