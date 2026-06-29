import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

function getProductStatusLabel(status: string) {
  if (status === "AVAILABLE") return "Available";
  if (status === "LOW_STOCK") return "Low Stock";
  if (status === "OUT_OF_STOCK") return "Out of Stock";

  return status;
}

function getProductStatusClass(status: string) {
  if (status === "AVAILABLE") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "LOW_STOCK") {
    return "bg-yellow-100 text-yellow-700";
  }

  return "bg-red-100 text-red-700";
}

export default async function DealerProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const searchQuery = String(params?.q ?? "").trim().toLowerCase();

  const { hasAccess } = await checkPermission("view_dealer_products");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Product Access Denied"
        description="Your current role does not have permission to view dealer product catalog."
        backHref="/dealer/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const products = await prisma.product.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });

  const filteredProducts = searchQuery
    ? products.filter((product) => {
        const searchableText = [
          product.code,
          product.name,
          product.stack,
          product.status,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(searchQuery);
      })
    : products;

  const totalProducts = products.length;

  const orderableProducts = products.filter(
    (product) => product.quantity > 0
  ).length;

  const lowStockProducts = products.filter(
    (product) =>
      product.status === "LOW_STOCK" ||
      product.quantity <= product.minimumStock
  ).length;

  const outOfStockProducts = products.filter(
    (product) => product.quantity <= 0
  ).length;

  const stats = [
    {
      label: "Total Products",
      value: String(totalProducts),
    },
    {
      label: "Orderable Products",
      value: String(orderableProducts),
    },
    {
      label: "Low Stock Products",
      value: String(lowStockProducts),
    },
    {
      label: "Out of Stock",
      value: String(outOfStockProducts),
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-500 sm:text-sm">
            Dealer Portal
          </p>

          <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:mt-3 sm:text-3xl md:text-5xl">
            Product Catalog
          </h1>

          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-600 sm:mt-4 sm:text-sm sm:leading-6">
            Search available products, check stock status, stack location, and
            minimum stock level before placing a dealer order.
          </p>
        </div>

        <a
          href="/dealer/place-order"
          className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-center text-sm font-bold text-slate-950 shadow-sm transition hover:bg-cyan-300 sm:w-auto"
        >
          + Place Order
        </a>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-5 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6"
          >
            <p className="text-sm text-slate-500">{stat.label}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950 sm:mt-3 sm:text-3xl">
              {stat.value}
            </h2>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Search Products
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Search by product name, product code, stack location, or stock
              status.
            </p>
          </div>

          <form className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <input
              name="q"
              type="search"
              defaultValue={params?.q ?? ""}
              placeholder="Search products..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:bg-white sm:min-w-[320px]"
            />

            <button
              type="submit"
              className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-center text-sm font-bold text-slate-950 shadow-sm transition hover:bg-cyan-300 sm:w-auto"
            >
              Search
            </button>

            {searchQuery && (
              <a
                href="/dealer/products"
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-bold text-slate-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700"
              >
                Clear
              </a>
            )}
          </form>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-slate-950">Products List</h2>

          <p className="mt-2 text-sm text-slate-500">
            This catalog is loaded from the live inventory database.
          </p>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="p-6 text-center sm:p-10">
            <h3 className="text-lg font-bold text-slate-950">
              No products found
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Try searching with another product name, product code, or stack
              location.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-4 lg:hidden">
            {filteredProducts.map((product) => (
              <article
                key={`mobile-${product.id}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-slate-950">
                      {product.name}
                    </h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {product.code}
                    </p>
                  </div>

                  <span
                    className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${getProductStatusClass(
                      product.status
                    )}`}
                  >
                    {getProductStatusLabel(product.status)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Stack
                    </p>
                    <p className="mt-2 text-xs font-bold text-slate-950">
                      {product.stack}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Stock
                    </p>
                    <p className="mt-2 text-xs font-bold text-emerald-700">
                      {product.quantity}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Min
                    </p>
                    <p className="mt-2 text-xs font-bold text-slate-950">
                      {product.minimumStock}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  {product.quantity > 0 ? (
                    <a
                      href="/dealer/place-order"
                      className="flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-xs font-bold text-slate-950 transition hover:bg-cyan-300"
                    >
                      Order This Product
                    </a>
                  ) : (
                    <span className="flex w-full items-center justify-center rounded-2xl bg-slate-200 px-4 py-3 text-xs font-bold text-slate-500">
                      Not Available
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[820px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
              </colgroup>

              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-4 font-semibold">Product</th>
                  <th className="px-4 py-4 font-semibold">Stack</th>
                  <th className="px-4 py-4 font-semibold">Available</th>
                  <th className="px-4 py-4 font-semibold">Minimum</th>
                  <th className="px-4 py-4 font-semibold">Status</th>
                  <th className="px-4 py-4 font-semibold">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="text-slate-700">
                    <td className="px-4 py-5">
                      <p className="break-words font-semibold text-slate-950">
                        {product.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {product.code}
                      </p>
                    </td>

                    <td className="px-4 py-5">{product.stack}</td>

                    <td className="px-4 py-5">
                      <span className="font-semibold text-slate-950">
                        {product.quantity}
                      </span>
                    </td>

                    <td className="px-4 py-5">{product.minimumStock}</td>

                    <td className="px-4 py-5">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${getProductStatusClass(
                          product.status
                        )}`}
                      >
                        {getProductStatusLabel(product.status)}
                      </span>
                    </td>

                    <td className="px-4 py-5">
                      {product.quantity > 0 ? (
                        <a
                          href="/dealer/place-order"
                          className="inline-flex rounded-xl bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-300"
                        >
                          Order
                        </a>
                      ) : (
                        <span className="inline-flex rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-400">
                          N/A
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <p className="font-semibold text-cyan-700">Available</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Product has enough stock and can be selected while placing a dealer
            order.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <p className="font-semibold text-yellow-700">Low Stock</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Product is still orderable but stock is near or below minimum level.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <p className="font-semibold text-red-700">Out of Stock</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Product cannot be ordered until the internal team updates stock.
          </p>
        </div>
      </div>
    </div>
  );
}