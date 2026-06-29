import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createDealerOrderAction } from "./actions";

function SelectArrow() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center">
      <svg
        className="h-5 w-5 text-slate-500"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 7.5L10 12.5L15 7.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function getPlaceOrderMessage(
  error?: string,
  success?: string,
  orderNumber?: string,
  available?: string
) {
  if (success === "order-created") {
    return {
      type: "success",
      text: `Order ${orderNumber} created successfully. Your order is now waiting for internal stock check.`,
    };
  }

  if (error === "permission-denied") {
    return {
      type: "error",
      text: "You do not have permission to place dealer orders.",
    };
  }

  if (error === "missing-product") {
    return {
      type: "error",
      text: "Please select a product before placing the order.",
    };
  }

  if (error === "invalid-quantity") {
    return {
      type: "error",
      text: "Order quantity must be greater than zero.",
    };
  }

  if (error === "dealer-not-found") {
    return {
      type: "error",
      text: "Dealer account was not found in the database.",
    };
  }

  if (error === "product-not-found") {
    return {
      type: "error",
      text: "Selected product was not found in the database.",
    };
  }

  if (error === "out-of-stock") {
    return {
      type: "error",
      text: "Selected product is currently out of stock.",
    };
  }

  if (error === "not-enough-stock") {
    return {
      type: "error",
      text: `Requested quantity is higher than available stock. Available stock: ${available}.`,
    };
  }

  return null;
}

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

export default async function DealerPlaceOrderPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    orderNumber?: string;
    available?: string;
  }>;
}) {
  const params = await searchParams;

  const message = getPlaceOrderMessage(
    params?.error,
    params?.success,
    params?.orderNumber,
    params?.available
  );

  const { hasAccess } = await checkPermission("place_dealer_order");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Place Order Access Denied"
        description="Your current role does not have permission to place dealer orders."
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

  const availableProducts = products.filter((product) => product.quantity > 0);

  const totalProducts = products.length;
  const availableProductCount = availableProducts.length;
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
      value: String(availableProductCount),
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
            Place New Order
          </h1>

          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-600 sm:mt-4 sm:text-sm sm:leading-6">
            Select a product, enter required quantity, and submit your order.
            The internal team will check stock, block stock, and move it toward
            dispatch.
          </p>
        </div>

        <a
          href="/dealer/orders"
          className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-bold text-slate-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700 sm:w-auto"
        >
          View My Orders
        </a>
      </div>

      {message && (
        <div
          className={`mt-8 rounded-2xl border px-5 py-4 text-sm font-semibold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

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

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_2fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <h2 className="text-xl font-bold text-slate-950">Order Form</h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Only products with available stock can be selected for a new dealer
            order.
          </p>

          <form action={createDealerOrderAction} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Select Product
              </label>

              <div className="relative">
                <select
                  name="productId"
                  className="h-14 w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-14 text-sm text-slate-950 outline-none transition focus:border-cyan-400 focus:bg-white"
                  required
                >
                  <option value="">Select product</option>

                  {availableProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.code} - {product.name} - {product.stack} - Stock:{" "}
                      {product.quantity}
                    </option>
                  ))}
                </select>

                <SelectArrow />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Quantity
              </label>

              <input
                name="quantity"
                type="number"
                min="1"
                placeholder="Enter order quantity"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Notes
              </label>

              <textarea
                name="notes"
                rows={4}
                placeholder="Optional order note"
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:bg-white"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-cyan-300"
            >
              Submit Order
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-950">
              Available Products
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              This product list is loaded from the inventory database.
            </p>
          </div>

          <div className="grid gap-3 p-4 lg:hidden">
            {products.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                No products found in inventory.
              </div>
            ) : (
              products.map((product) => (
                <article
                  key={`mobile-${product.id}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-slate-950">
                        {product.name}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
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
                </article>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[720px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[38%]" />
                <col className="w-[13%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[21%]" />
              </colgroup>

              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-4 font-semibold">Product</th>
                  <th className="px-4 py-4 font-semibold">Stack</th>
                  <th className="px-4 py-4 font-semibold">Available</th>
                  <th className="px-4 py-4 font-semibold">Minimum</th>
                  <th className="px-4 py-4 font-semibold">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {products.map((product) => (
                  <tr key={product.id} className="text-slate-700">
                    <td className="px-4 py-5">
                      <div>
                        <p className="break-words font-semibold text-slate-950">
                          {product.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {product.code}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-5">{product.stack}</td>
                    <td className="px-4 py-5">{product.quantity}</td>
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
                  </tr>
                ))}

                {products.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No products found in inventory.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">
          What happens after submitting?
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-5">
            <p className="font-semibold text-cyan-700">1. New Order</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Your order is saved in the system with a unique order number.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-5">
            <p className="font-semibold text-cyan-700">2. Stock Check</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Internal team checks product availability and stock location.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-5">
            <p className="font-semibold text-cyan-700">3. Dispatch</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Dispatch team prepares the order for transport assignment.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-5">
            <p className="font-semibold text-cyan-700">4. Delivery</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Transport team updates delivery status after assignment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}