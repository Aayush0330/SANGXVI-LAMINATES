export default function DealerDashboardPage() {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600 sm:text-sm">
        Dealer Portal
      </p>

      <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl md:text-5xl">
        Dealer Dashboard
      </h1>

      <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-600 sm:mt-4 sm:text-sm sm:leading-6">
        Dealers can search products, place orders, and track the status of
        their orders here.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Search Products</h2>
          <p className="mt-2 text-sm text-slate-500">
            Search the inventory for available products.
          </p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Place Order</h2>
          <p className="mt-2 text-sm text-slate-500">
            Place a new order and notify the internal order team instantly.
          </p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Track Order</h2>
          <p className="mt-2 text-sm text-slate-500">
            View the latest dispatch status for each order.
          </p>
        </div>
      </div>
    </div>
  );
}
