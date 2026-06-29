import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createProductAction, updateStockAction } from "./actions";

function SelectArrow() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center">
      <svg
        className="h-5 w-5 text-slate-300"
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

function getProductStatusLabel(status: string) {
  if (status === "AVAILABLE") return "Available";
  if (status === "LOW_STOCK") return "Low Stock";
  if (status === "OUT_OF_STOCK") return "Out of Stock";

  return status;
}

function getProductStatusClass(status: string) {
  if (status === "AVAILABLE") {
    return "bg-emerald-300/10 text-emerald-300 ring-1 ring-emerald-300/20";
  }

  if (status === "LOW_STOCK") {
    return "bg-yellow-300/10 text-yellow-300 ring-1 ring-yellow-300/20";
  }

  return "bg-red-300/10 text-red-300 ring-1 ring-red-300/20";
}

function getInventoryMessage(
  error?: string,
  success?: string,
  code?: string,
  name?: string,
  stack?: string
) {
  if (success === "product-created") {
    return {
      type: "success",
      text: "Product created successfully.",
    };
  }

  if (success === "stock-updated") {
    return {
      type: "success",
      text: "Stock updated successfully.",
    };
  }

  if (error === "duplicate-code") {
    return {
      type: "error",
      text: `Product code ${code} already exists. Please use a different product code.`,
    };
  }

  if (error === "duplicate-name-stack") {
    return {
      type: "error",
      text: `${name} already exists in stack ${stack}. Please update the existing product stock instead of creating a duplicate product.`,
    };
  }

  if (error === "missing-fields") {
    return {
      type: "error",
      text: "Product code, product name, and stack location are required.",
    };
  }

  if (error === "missing-product") {
    return {
      type: "error",
      text: "Please select a product before updating stock.",
    };
  }

  if (error === "product-not-found") {
    return {
      type: "error",
      text: "Selected product was not found in the database.",
    };
  }

  if (error === "invalid-stock-action") {
    return {
      type: "error",
      text: "Please select a valid stock update action.",
    };
  }

  if (error === "invalid-stock-quantity") {
    return {
      type: "error",
      text: "Stock update quantity must be greater than zero.",
    };
  }

  if (error === "insufficient-stock") {
    return {
      type: "error",
      text: "Stock cannot be reduced below zero.",
    };
  }

  if (error === "invalid-quantity") {
    return {
      type: "error",
      text: "Quantity must be a valid number.",
    };
  }

  if (error === "invalid-minimum-stock") {
    return {
      type: "error",
      text: "Minimum stock must be a valid number.",
    };
  }

  if (error === "permission-denied") {
    return {
      type: "error",
      text: "You do not have permission to manage inventory.",
    };
  }

  return null;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    code?: string;
    name?: string;
    stack?: string;
  }>;
}) {
  const params = await searchParams;

  const message = getInventoryMessage(
    params?.error,
    params?.success,
    params?.code,
    params?.name,
    params?.stack
  );

  const { hasAccess } = await checkPermission("manage_inventory");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Inventory Access Denied"
        description="Your current role does not have permission to access the Inventory Management module."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const products = await prisma.product.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });

  const totalProducts = products.length;

  const availableStock = products.reduce(
    (total, product) => total + product.quantity,
    0
  );

  const blockedStock = products.reduce(
    (total, product) => total + product.blocked,
    0
  );

  const lowStockItems = products.filter(
    (product) =>
      product.status === "LOW_STOCK" ||
      product.quantity <= product.minimumStock
  ).length;

  const inventoryStats = [
    {
      label: "Total Products",
      value: String(totalProducts),
    },
    {
      label: "Available Stock",
      value: availableStock.toLocaleString("en-IN"),
    },
    {
      label: "Blocked Stock",
      value: blockedStock.toLocaleString("en-IN"),
    },
    {
      label: "Low Stock Items",
      value: String(lowStockItems).padStart(2, "0"),
    },
  ];

  return (
    <div className="w-full min-w-0">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300 sm:text-sm">
            Inventory Module
          </p>

          <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl md:text-5xl">
            Inventory Management
          </h1>

          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-300 sm:mt-4 sm:text-sm sm:leading-6">
            Manage products, unique product codes, stack locations, available
            quantities, blocked stock, and minimum stock alerts from one place.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <a
            href="#add-product-form"
            className="w-full rounded-2xl bg-cyan-300 px-5 py-3 text-center text-sm font-bold text-slate-950 transition hover:bg-cyan-200 sm:w-auto"
          >
            + Add Product
          </a>

          <a
            href="#update-stock-form"
            className="w-full rounded-2xl border border-white/10 px-5 py-3 text-center text-sm font-bold text-slate-200 transition hover:bg-white/10 hover:text-white sm:w-auto"
          >
            Update Stock
          </a>
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

      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-5 xl:grid-cols-4">
        {inventoryStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:rounded-3xl sm:p-6"
          >
            <p className="text-sm text-slate-400">{stat.label}</p>
            <h2 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl">{stat.value}</h2>
          </div>
        ))}
      </div>

      <div className="mt-8 grid min-w-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-6">
          <div
            id="add-product-form"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:rounded-3xl sm:p-6"
          >
            <h2 className="text-xl font-bold">Add Product</h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Add a new inventory item with product code, stack location,
              quantity, and minimum stock level.
            </p>

            <form action={createProductAction} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Product Code
                </label>

                <input
                  name="code"
                  type="text"
                  placeholder="Example: LAM-1005"
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Product Name
                </label>

                <input
                  name="name"
                  type="text"
                  placeholder="Enter product name"
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Stack Location
                </label>

                <input
                  name="stack"
                  type="text"
                  placeholder="Example: A-01"
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Quantity
                  </label>

                  <input
                    name="quantity"
                    type="number"
                    min="0"
                    placeholder="Enter quantity"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Minimum Stock
                  </label>

                  <input
                    name="minimumStock"
                    type="number"
                    min="0"
                    placeholder="Minimum level"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
              >
                Save Product
              </button>
            </form>
          </div>

          <div
            id="update-stock-form"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:rounded-3xl sm:p-6"
          >
            <h2 className="text-xl font-bold">Update Stock</h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Increase or reduce stock for an existing product and stack
              location.
            </p>

            <form action={updateStockAction} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Select Product
                </label>

                <div className="relative">
                  <select
                    name="productId"
                    className="h-14 w-full appearance-none rounded-2xl border border-white/10 bg-slate-900 px-4 pr-14 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
                    required
                  >
                    <option value="">Select product</option>

                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.code} - {product.name} - {product.stack} -
                        Qty: {product.quantity}
                      </option>
                    ))}
                  </select>

                  <SelectArrow />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Action
                </label>

                <div className="relative">
                  <select
                    name="movementType"
                    className="h-14 w-full appearance-none rounded-2xl border border-white/10 bg-slate-900 px-4 pr-14 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
                    required
                  >
                    <option value="ADD">Add Stock</option>
                    <option value="REDUCE">Reduce Stock</option>
                  </select>

                  <SelectArrow />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Quantity Change
                  </label>

                  <input
                    name="quantityChange"
                    type="number"
                    min="1"
                    placeholder="Example: 12"
                    className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Minimum Stock
                  </label>

                  <input
                    name="minimumStock"
                    type="number"
                    min="0"
                    placeholder="Leave blank to keep same"
                    className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-300 transition hover:bg-cyan-300 hover:text-slate-950"
              >
                Update Stock
              </button>
            </form>
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 px-6 py-6">
            <h2 className="text-xl font-bold">Inventory List</h2>
            <p className="mt-2 text-sm text-slate-400">
              This table is loaded from the database using Prisma.
            </p>
          </div>

          <div className="block space-y-4 p-4 lg:hidden">
            {products.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 text-center text-sm text-slate-400">
                No products found in the database.
              </div>
            ) : (
              products.map((product) => (
                <article
                  key={`mobile-${product.id}`}
                  className="rounded-3xl border border-white/10 bg-slate-950/50 p-4 shadow-xl shadow-black/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-white">
                        {product.name}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {product.code}
                      </p>
                    </div>

                    <span
                      className={`inline-flex shrink-0 justify-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold leading-4 ${getProductStatusClass(
                        product.status
                      )}`}
                    >
                      {getProductStatusLabel(product.status)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Stack
                      </p>
                      <p className="mt-2 text-sm font-bold text-slate-100">
                        {product.stack}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Available
                      </p>
                      <p className="mt-2 text-sm font-bold text-emerald-300">
                        {product.quantity}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Blocked
                      </p>
                      <p className="mt-2 text-sm font-bold text-cyan-300">
                        {product.blocked}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Minimum
                      </p>
                      <p className="mt-2 text-sm font-bold text-slate-100">
                        {product.minimumStock}
                      </p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="hidden w-full overflow-x-auto lg:block">
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[24%]" />
              </colgroup>

              <thead className="bg-white/[0.04] text-slate-300">
                <tr>
                  <th className="px-5 py-4 text-left font-semibold">Product</th>
                  <th className="px-3 py-4 text-center font-semibold">Stack</th>
                  <th className="px-3 py-4 text-center font-semibold">Available</th>
                  <th className="px-3 py-4 text-center font-semibold">Blocked</th>
                  <th className="px-3 py-4 text-center font-semibold">Minimum</th>
                  <th className="px-5 py-4 text-center font-semibold">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/10">
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="text-slate-300 transition hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-5 text-left align-middle">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">
                          {product.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {product.code}
                        </p>
                      </div>
                    </td>

                    <td className="px-3 py-5 text-center align-middle">
                      {product.stack}
                    </td>

                    <td className="px-3 py-5 text-center align-middle">
                      {product.quantity}
                    </td>

                    <td className="px-3 py-5 text-center align-middle">
                      {product.blocked}
                    </td>

                    <td className="px-3 py-5 text-center align-middle">
                      {product.minimumStock}
                    </td>

                    <td className="px-5 py-5 text-center align-middle">
                      <span
                        className={`inline-flex min-w-[92px] justify-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold leading-4 ${getProductStatusClass(
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
                      colSpan={6}
                      className="px-6 py-10 text-center text-sm text-slate-400"
                    >
                      No products found in the database.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
