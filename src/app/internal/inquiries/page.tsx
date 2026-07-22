import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  createInventoryInquiryAction,
  updateInventoryInquiryStatusAction,
} from "./actions";

const inquiryStatusOptions = [
  { value: "NEW_INQUIRY", label: "New Inquiry" },
  { value: "FOLLOW_UP", label: "Follow Up" },
  { value: "ORDER_PLACED", label: "Order Placed" },
  { value: "NOT_IN_STOCK", label: "Not In Stock" },
  { value: "MISSED_SALE", label: "Missed Sale" },
  { value: "CLOSED", label: "Closed" },
];

const sourceOptions = ["CALL", "WHATSAPP", "WALK_IN", "DEALER", "FIELD_TEAM", "OTHER"];

const inputClassName =
  "h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/45 px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-cyan-300/10";

const selectClassName =
  "h-14 w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/45 px-4 pr-14 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-cyan-300/10";

const compactSelectClassName =
  "h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/45 px-3 pr-12 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-cyan-300/10";

const compactInputClassName =
  "h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/45 px-3 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-cyan-300/10";

const textareaClassName =
  "w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/45 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-cyan-300/10";

type MissedProductRow = {
  productName: string;
  totalQuantity: number | bigint;
  inquiryCount: number | bigint;
};

type InventoryInquiryRow = {
  id: string;
  inquiryNumber: string;
  productId: string | null;
  productName: string;
  quantityAsked: number;
  customerName: string | null;
  customerPhone: string | null;
  dealerName: string | null;
  source: string;
  status: string;
  description: string | null;
  nextFollowUpAt: Date | string | null;
  orderNumber: string | null;
  createdById: string;
  createdByName: string;
  createdByEmail: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function SelectArrow() {
  return (
    <span className="pointer-events-none absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
      <svg
        className="h-4 w-4"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5.5 7.5L10 12L14.5 7.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function CalendarIcon() {
  return (
    <span className="pointer-events-none absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7 3.75V6.25M17 3.75V6.25M4.75 9.5H19.25M6.25 5H17.75C18.58 5 19.25 5.67 19.25 6.5V18C19.25 18.83 18.58 19.5 17.75 19.5H6.25C5.42 19.5 4.75 18.83 4.75 18V6.5C4.75 5.67 5.42 5 6.25 5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function getInquiryStatusLabel(status: string) {
  const option = inquiryStatusOptions.find((item) => item.value === status);
  return option?.label ?? status.replaceAll("_", " ");
}

function getInquiryStatusClass(status: string) {
  if (status === "ORDER_PLACED") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300/20";
  }

  if (status === "MISSED_SALE") {
    return "bg-red-50 text-red-700 ring-1 ring-red-300/20";
  }

  if (status === "NOT_IN_STOCK") {
    return "bg-orange-50 text-orange-600 ring-1 ring-orange-100";
  }

  if (status === "FOLLOW_UP") {
    return "bg-amber-50 text-yellow-300 ring-1 ring-yellow-300/20";
  }

  if (status === "CLOSED") {
    return "bg-slate-300/10 text-slate-600 ring-1 ring-slate-300/20";
  }

  return "bg-blue-50 text-blue-600 ring-1 ring-blue-100";
}

function formatDateTime(date: Date | string | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatDateOnly(date: Date | string | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function getInquiryMessage(error?: string, success?: string) {
  if (success === "inquiry-created") {
    return {
      type: "success",
      text: "Inventory inquiry created successfully.",
    };
  }

  if (success === "inquiry-updated") {
    return {
      type: "success",
      text: "Inventory inquiry updated successfully.",
    };
  }

  if (error === "permission-denied") {
    return {
      type: "error",
      text: "You do not have permission to manage inventory inquiries.",
    };
  }

  if (error === "invalid-quantity") {
    return {
      type: "error",
      text: "Quantity asked must be greater than zero.",
    };
  }

  if (error === "missing-product-name") {
    return {
      type: "error",
      text: "Please select a product or enter a product name.",
    };
  }

  if (error === "product-not-found") {
    return {
      type: "error",
      text: "Selected product was not found.",
    };
  }

  if (error === "invalid-status") {
    return {
      type: "error",
      text: "Please select a valid inquiry status.",
    };
  }

  if (error === "invalid-source") {
    return {
      type: "error",
      text: "Please select a valid inquiry source.",
    };
  }

  if (error === "invalid-date") {
    return {
      type: "error",
      text: "Please enter a valid follow-up date and time.",
    };
  }

  if (error === "missing-order-number") {
    return {
      type: "error",
      text: "Order number is required when status is set to Order Placed.",
    };
  }

  if (error === "missing-inquiry") {
    return {
      type: "error",
      text: "Please select an inquiry to update.",
    };
  }

  if (error === "input-too-long") {
    return {
      type: "error",
      text: "One or more fields are longer than allowed.",
    };
  }

  if (error === "inquiry-not-found") {
    return {
      type: "error",
      text: "Selected inquiry was not found.",
    };
  }

  return null;
}

function toNumber(value: number | bigint) {
  return typeof value === "bigint" ? Number(value) : value;
}

export default async function InventoryInquiriesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const params = await searchParams;
  const message = getInquiryMessage(params?.error, params?.success);

  const { hasAccess } = await checkPermission(
    "manage_inventory_inquiries",
    "/internal/inquiries"
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Inquiry Access Denied"
        description="Your current role does not have permission to access the Inventory Inquiry module."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const [products, inquiries, missedProductRows] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { stack: "asc" }],
    }),
    prisma.$queryRaw<InventoryInquiryRow[]>`
      SELECT
        "id",
        "inquiryNumber",
        "productId",
        "productName",
        "quantityAsked",
        "customerName",
        "customerPhone",
        "dealerName",
        "source",
        "status"::text AS "status",
        "description",
        "nextFollowUpAt",
        "orderNumber",
        "createdById",
        "createdByName",
        "createdByEmail",
        "createdAt",
        "updatedAt"
      FROM public."InventoryInquiry"
      ORDER BY "createdAt" DESC
      LIMIT 120
    `,
    prisma.$queryRaw<MissedProductRow[]>`
      SELECT
        "productName",
        SUM("quantityAsked") AS "totalQuantity",
        COUNT(*) AS "inquiryCount"
      FROM public."InventoryInquiry"
      WHERE "status" IN ('NOT_IN_STOCK', 'MISSED_SALE')
      GROUP BY "productName"
      ORDER BY SUM("quantityAsked") DESC, COUNT(*) DESC
      LIMIT 8
    `,
  ]);

  const totalInquiries = inquiries.length;
  const orderPlacedCount = inquiries.filter(
    (inquiry) => inquiry.status === "ORDER_PLACED"
  ).length;
  const missedSalesCount = inquiries.filter(
    (inquiry) => inquiry.status === "MISSED_SALE"
  ).length;
  const notInStockCount = inquiries.filter(
    (inquiry) => inquiry.status === "NOT_IN_STOCK"
  ).length;
  const followUpCount = inquiries.filter(
    (inquiry) => inquiry.status === "FOLLOW_UP"
  ).length;
  const totalDemandQuantity = inquiries.reduce(
    (total, inquiry) => total + inquiry.quantityAsked,
    0
  );

  const inquiryStats = [
    {
      label: "Total Inquiries",
      value: totalInquiries.toLocaleString("en-IN"),
    },
    {
      label: "Order Placed",
      value: orderPlacedCount.toLocaleString("en-IN"),
    },
    {
      label: "Not In Stock",
      value: notInStockCount.toLocaleString("en-IN"),
    },
    {
      label: "Missed Sales",
      value: missedSalesCount.toLocaleString("en-IN"),
    },
    {
      label: "Follow Ups",
      value: followUpCount.toLocaleString("en-IN"),
    },
    {
      label: "Demand Quantity",
      value: totalDemandQuantity.toLocaleString("en-IN"),
    },
  ];

  return (
    <div className="w-full min-w-0 space-y-6">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .erp-datetime-input {
              color-scheme: dark;
            }

            .erp-datetime-input::-webkit-datetime-edit,
            .erp-datetime-input::-webkit-datetime-edit-fields-wrapper,
            .erp-datetime-input::-webkit-datetime-edit-text,
            .erp-datetime-input::-webkit-datetime-edit-month-field,
            .erp-datetime-input::-webkit-datetime-edit-day-field,
            .erp-datetime-input::-webkit-datetime-edit-year-field,
            .erp-datetime-input::-webkit-datetime-edit-hour-field,
            .erp-datetime-input::-webkit-datetime-edit-minute-field {
              color: inherit;
            }

            .erp-datetime-input::-webkit-calendar-picker-indicator {
              background: transparent;
              cursor: pointer;
              height: 100%;
              margin: 0;
              opacity: 0;
              position: absolute;
              right: 0;
              width: 3.75rem;
            }
          `,
        }}
      />
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600 sm:text-sm">
              Inventory Inquiry Module
            </p>

            <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-4xl lg:text-5xl">
              Inquiry & Missed Sales
            </h1>
          </div>

          <a
            href="#new-inquiry-form"
            className="inline-flex w-fit rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            + Add Inquiry
          </a>
        </div>
      </section>

      {message && (
        <div
          className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-6">
        {inquiryStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 sm:rounded-2xl sm:p-5"
          >
            <p className="text-xs leading-4 text-slate-500 sm:text-sm">
              {stat.label}
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-none sm:text-3xl">
              {stat.value}
            </h2>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div
          id="new-inquiry-form"
          className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
        >
          <h2 className="text-xl font-bold">Add New Inquiry</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Use this when someone asks for product availability, quantity, or
            product demand on call, WhatsApp, walk-in, dealer, or field visit.
          </p>

          <form action={createInventoryInquiryAction} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Select Product
              </label>
              <div className="relative">
                <select
                  name="productId"
                  className={selectClassName}
                >
                  <option value="">Manual / product not created yet</option>
                  {products.map((product) => {
                    const available = Math.max(product.quantity, 0);

                    return (
                      <option key={product.id} value={product.id}>
                        {product.code} - {product.name} - {product.stack} - Available: {available}
                      </option>
                    );
                  })}
                </select>
                <SelectArrow />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Product Name
              </label>
              <input
                name="productName"
                type="text"
                placeholder="Required only if product is not selected"
                className={inputClassName}
                maxLength={160}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  Quantity Asked
                </label>
                <input
                  name="quantityAsked"
                  type="number"
                  min="1"
                  placeholder="Quantity"
                  className={inputClassName}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  Source
                </label>
                <div className="relative">
                  <select
                    name="source"
                    className={selectClassName}
                  >
                    {sourceOptions.map((source) => (
                      <option key={source} value={source}>
                        {source.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <SelectArrow />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  Customer Name
                </label>
                <input
                  name="customerName"
                  type="text"
                  placeholder="Optional"
                  className={inputClassName}
                  maxLength={120}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  Customer Phone
                </label>
                <input
                  name="customerPhone"
                  type="text"
                  placeholder="Optional"
                  className={inputClassName}
                  maxLength={20}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Dealer / Company Name
              </label>
              <input
                name="dealerName"
                type="text"
                placeholder="Optional"
                className={inputClassName}
                maxLength={160}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  Inquiry Tag
                </label>
                <div className="relative">
                  <select
                    name="status"
                    className={selectClassName}
                    defaultValue="NEW_INQUIRY"
                  >
                    {inquiryStatusOptions.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                  <SelectArrow />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  Follow-up Date
                </label>
                <div className="relative">
                  <input
                    name="nextFollowUpAt"
                    type="datetime-local"
                    className={`${inputClassName} erp-datetime-input pr-14`}
                  />
                  <CalendarIcon />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Order Number
              </label>
              <input
                name="orderNumber"
                type="text"
                placeholder="Required only if order is placed"
                className={inputClassName}
                maxLength={80}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Notes / Description
              </label>
              <textarea
                name="description"
                rows={4}
                placeholder="Call notes, customer requirement, unavailable size, follow-up details..."
                className={textareaClassName}
                maxLength={1000}
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Save Inquiry
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4 sm:p-6">
              <h2 className="text-xl font-bold">Demand / Missed Sales Summary</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                No missed-sale items yet.
              </p>
            </div>

            {missedProductRows.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No missed sales records yet.
              </div>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                {missedProductRows.map((row) => (
                  <div
                    key={row.productName}
                    className="rounded-2xl border border-red-300/10 bg-red-300/[0.04] p-4"
                  >
                    <p className="line-clamp-2 min-h-10 text-sm font-bold text-slate-950">
                      {row.productName}
                    </p>
                    <p className="mt-3 text-2xl font-bold text-red-700">
                      {toNumber(row.totalQuantity).toLocaleString("en-IN")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Quantity demand · {toNumber(row.inquiryCount).toLocaleString("en-IN")} inquiries
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4 sm:p-6">
              <h2 className="text-xl font-bold">Inquiry Timeline</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Recent product inquiries, stock gaps, follow-ups, and converted orders.
              </p>
            </div>

            {inquiries.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500 sm:p-10">
                No inquiries added yet.
              </div>
            ) : (
              <>
                <div className="block space-y-4 p-4 xl:hidden">
                  {inquiries.map((inquiry) => (
                    <article
                      key={`mobile-${inquiry.id}`}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-500">
                            {inquiry.inquiryNumber}
                          </p>
                          <h3 className="mt-1 text-sm font-bold text-slate-950">
                            {inquiry.productName}
                          </h3>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${getInquiryStatusClass(
                            inquiry.status
                          )}`}
                        >
                          {getInquiryStatusLabel(inquiry.status)}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                            Quantity
                          </p>
                          <p className="mt-2 text-sm font-bold text-blue-600">
                            {inquiry.quantityAsked}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                            Source
                          </p>
                          <p className="mt-2 text-sm font-bold text-slate-900">
                            {inquiry.source.replaceAll("_", " ")}
                          </p>
                        </div>
                      </div>

                      <p className="mt-4 text-xs leading-5 text-slate-500">
                        Customer: {inquiry.customerName || inquiry.dealerName || "—"}
                        {inquiry.customerPhone ? ` · ${inquiry.customerPhone}` : ""}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Created: {formatDateTime(inquiry.createdAt)} · Follow-up: {formatDateOnly(inquiry.nextFollowUpAt)}
                      </p>

                      {inquiry.description && (
                        <p className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
                          {inquiry.description}
                        </p>
                      )}

                      <form action={updateInventoryInquiryStatusAction} className="mt-4 grid gap-3">
                        <input type="hidden" name="inquiryId" value={inquiry.id} />
                        <div className="relative">
                          <select
                            name="status"
                            defaultValue={inquiry.status}
                            className={compactSelectClassName}
                          >
                            {inquiryStatusOptions.map((status) => (
                              <option key={status.value} value={status.value}>
                                {status.label}
                              </option>
                            ))}
                          </select>
                          <SelectArrow />
                        </div>
                        <input
                          name="orderNumber"
                          type="text"
                          defaultValue={inquiry.orderNumber ?? ""}
                          placeholder="Order number if placed"
                          className={compactInputClassName}
                          maxLength={80}
                        />
                        <button
                          type="submit"
                          className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700 transition hover:bg-blue-700 hover:text-white"
                        >
                          Update Inquiry
                        </button>
                      </form>
                    </article>
                  ))}
                </div>

                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full min-w-[1200px] table-fixed text-sm">
                    <colgroup>
                      <col className="w-[18%]" />
                      <col className="w-[20%]" />
                      <col className="w-[9%]" />
                      <col className="w-[12%]" />
                      <col className="w-[12%]" />
                      <col className="w-[13%]" />
                      <col className="w-[16%]" />
                    </colgroup>
                    <thead className="bg-white text-slate-600">
                      <tr>
                        <th className="px-5 py-4 text-left font-semibold">Inquiry</th>
                        <th className="px-4 py-4 text-left font-semibold">Product</th>
                        <th className="px-4 py-4 text-center font-semibold">Qty</th>
                        <th className="px-4 py-4 text-center font-semibold">Status</th>
                        <th className="px-4 py-4 text-left font-semibold">Customer</th>
                        <th className="px-4 py-4 text-left font-semibold">Dates</th>
                        <th className="px-5 py-4 text-left font-semibold">Quick Update</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inquiries.map((inquiry) => (
                        <tr
                          key={inquiry.id}
                          className="text-slate-600 transition hover:bg-slate-50"
                        >
                          <td className="px-5 py-5 align-top">
                            <p className="font-bold text-slate-950">{inquiry.inquiryNumber}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {inquiry.source.replaceAll("_", " ")}
                            </p>
                            {inquiry.orderNumber && (
                              <p className="mt-2 text-xs font-semibold text-emerald-700">
                                Order: {inquiry.orderNumber}
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-5 align-top">
                            <p className="font-semibold text-slate-950">{inquiry.productName}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500 line-clamp-2">
                              {inquiry.description || "No notes added."}
                            </p>
                          </td>

                          <td className="px-4 py-5 text-center align-top font-bold text-blue-600">
                            {inquiry.quantityAsked}
                          </td>

                          <td className="px-4 py-5 text-center align-top">
                            <span
                              className={`inline-flex min-w-[110px] justify-center rounded-full px-3 py-1 text-[11px] font-bold ${getInquiryStatusClass(
                                inquiry.status
                              )}`}
                            >
                              {getInquiryStatusLabel(inquiry.status)}
                            </span>
                          </td>

                          <td className="px-4 py-5 align-top">
                            <p className="font-semibold text-slate-900">
                              {inquiry.customerName || inquiry.dealerName || "—"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {inquiry.customerPhone || "No phone"}
                            </p>
                          </td>

                          <td className="px-4 py-5 align-top">
                            <p className="text-xs font-semibold text-slate-700">
                              {formatDateTime(inquiry.createdAt)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Follow-up: {formatDateOnly(inquiry.nextFollowUpAt)}
                            </p>
                          </td>

                          <td className="px-5 py-5 align-top">
                            <form action={updateInventoryInquiryStatusAction} className="space-y-3">
                              <input type="hidden" name="inquiryId" value={inquiry.id} />
                              <div className="relative">
                                <select
                                  name="status"
                                  defaultValue={inquiry.status}
                                  className={compactSelectClassName}
                                >
                                  {inquiryStatusOptions.map((status) => (
                                    <option key={status.value} value={status.value}>
                                      {status.label}
                                    </option>
                                  ))}
                                </select>
                                <SelectArrow />
                              </div>
                              <input
                                name="orderNumber"
                                type="text"
                                defaultValue={inquiry.orderNumber ?? ""}
                                placeholder="Order no."
                                className={compactInputClassName}
                                maxLength={80}
                              />
                              <button
                                type="submit"
                                className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-700 hover:text-white"
                              >
                                Update
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
