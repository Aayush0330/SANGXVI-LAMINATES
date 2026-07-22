import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { CollectionProofFileInput } from "@/components/collection-proof-file-input";
import { FieldVisitPhotoGallery } from "@/components/field-visit-photo-gallery";
import { UserRole as DbUserRole } from "@/generated/prisma/enums";
import { checkPermission } from "@/lib/auth-guards";
import {
  collectionPaymentModeLabels,
  collectionPaymentModes,
  collectionStatusLabels,
  collectionStatuses,
  formatCollectionDate,
  formatCurrency,
  getCollectionStatusClass,
  getPendingCollectionAmount,
  isCollectionOverdue,
} from "@/lib/collections";
import { prisma } from "@/lib/db";
import { roleLabels, type UserRole } from "@/lib/permissions";
import {
  createCollectionAction,
  updateCollectionAssignmentAction,
  verifyCollectionAction,
  uploadInternalCollectionProofAction,
} from "./actions";

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-300/20";
const labelClass =
  "text-[11px] font-black uppercase tracking-[0.24em] text-slate-500";
const selectStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23cbd5e1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: "right 1rem center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "18px 18px",
} as const;

function roleToAppRole(role: string) {
  return role.toLowerCase() as UserRole;
}

function canManageInternalCollections(role: string) {
  return role === "owner" || role === "manager" || role === "accountant";
}

const collectionAssignableRoles: DbUserRole[] = [
  DbUserRole.OWNER,
  DbUserRole.MANAGER,
  DbUserRole.ACCOUNTANT,
  DbUserRole.COLLECTION_TEAM,
];

function toIndiaDateTimeLocal(date: Date | null) {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function getMessage(error?: string, success?: string) {
  const successMap: Record<string, string> = {
    "collection-created": "Collection assigned successfully.",
    "collection-updated": "Collection updated successfully.",
    "collection-verified": "Collection verified successfully.",
    "proof-uploaded": "Payment proof uploaded successfully.",
  };
  const errorMap: Record<string, string> = {
    "permission-denied": "You do not have permission to manage collections.",
    "invalid-amount": "Collection amount must be greater than zero.",
    "invalid-collected-amount": "Collected amount is outside the valid range.",
    "missing-agent": "Please select a collection agent.",
    "agent-not-found": "The selected collection agent is unavailable.",
    "missing-dealer": "Please select or enter a dealer/customer.",
    "proof-required": "Payment proof is required before verification.",
    "invalid-proof-type": "Only JPG, PNG, WebP, or PDF files are allowed.",
    "invalid-proof-content": "One uploaded file is not a valid supported proof.",
    "proof-too-large": "Each proof file must be 4 MB or smaller.",
    "proofs-total-too-large": "Combined proof files must be 20 MB or smaller.",
    "too-many-proofs": "Upload no more than 5 proof files.",
    "collection-incomplete": "Collect the full pending amount before verification.",
    "collection-locked": "A verified collection cannot be edited.",
    "collection-not-found": "The collection assignment was not found.",
  };
  if (success && successMap[success]) {
    return { type: "success", text: successMap[success] };
  }
  if (error && errorMap[error]) {
    return { type: "error", text: errorMap[error] };
  }
  return null;
}

async function getData() {
  return Promise.all([
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: { in: collectionAssignableRoles },
      },
      select: { id: true, name: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: "DEALER" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.collectionAssignment.findMany({
      include: {
        assignedTo: { select: { name: true, role: true } },
        verifiedBy: { select: { name: true } },
        proofs: { orderBy: { uploadedAt: "asc" } },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    }),
  ]);
}

export default async function InternalCollectionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);
  const { currentUser, hasAccess } = await checkPermission(
    "manage_collections",
    "/internal/collections"
  );

  if (!hasAccess || !currentUser.roles.some((role) => canManageInternalCollections(role))) {
    return (
      <AccessDeniedCard
        title="Collections Access Denied"
        description="Only owner, manager, and accountant accounts can assign or verify collections."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const [users, dealers, collections] = await getData();
  const totalAmount = collections.reduce(
    (sum, item) => sum + item.amountToCollect,
    0
  );
  const collectedAmount = collections.reduce(
    (sum, item) => sum + item.amountCollected,
    0
  );
  const pendingAmount = totalAmount - collectedAmount;
  const overdueCount = collections.filter((item) =>
    isCollectionOverdue(item.dueAt, item.status)
  ).length;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-700">
              Collection Management
            </p>
            <h1 className="mt-3 text-3xl font-black text-slate-950">
              Assign and verify collections
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              Assign payment collection, monitor field progress, review proofs,
              and verify completed payments.
            </p>
          </div>
          <Link
            href="/field/collections"
            className="rounded-2xl border border-emerald-300/40 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700"
          >
            Open Field View
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {[
            ["Total", formatCurrency(totalAmount), "text-slate-950"],
            ["Collected", formatCurrency(collectedAmount), "text-emerald-700"],
            ["Pending", formatCurrency(pendingAmount), "text-yellow-300"],
            ["Overdue", overdueCount, "text-rose-700"],
          ].map(([label, value, color]) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <p className="text-sm text-slate-500">{label}</p>
              <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      {message ? (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="rounded-2xl border border-emerald-200 bg-emerald-300/[0.04] p-6">
        <h2 className="text-xl font-black text-slate-950">
          Create Collection Assignment
        </h2>
        <form action={createCollectionAction} className="mt-6 grid gap-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <label className={labelClass}>Dealer Account</label>
              <select
                name="dealerId"
                defaultValue=""
                className={`${inputClass} mt-2 appearance-none pr-12`}
                style={selectStyle}
              >
                <option value="">Manual customer</option>
                {dealers.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>
                    {dealer.name} · {dealer.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Dealer / Customer Name</label>
              <input
                name="dealerName"
                className={`${inputClass} mt-2`}
                placeholder="Customer name"
              />
            </div>
            <div>
              <label className={labelClass}>Assign Collection To</label>
              <select
                name="assignedToId"
                required
                defaultValue=""
                className={`${inputClass} mt-2 appearance-none pr-12`}
                style={selectStyle}
              >
              <option value="">Select agent</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {roleLabels[roleToAppRole(user.role)]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            <input
              name="amountToCollect"
              type="number"
              min="1"
              required
              placeholder="Amount to collect"
              className={inputClass}
            />
            <select
              name="paymentMode"
              defaultValue="CASH"
              className={`${inputClass} appearance-none pr-12`}
              style={selectStyle}
            >
              {collectionPaymentModes.map((mode) => (
                <option key={mode} value={mode}>
                  {collectionPaymentModeLabels[mode]}
                </option>
              ))}
            </select>
            <input
              name="dueAt"
              type="datetime-local"
              className={inputClass}
              style={{ colorScheme: "dark" }}
            />
            <input
              name="contactPhone"
              type="tel"
              placeholder="Contact phone"
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr_auto]">
            <input
              name="contactPerson"
              placeholder="Contact person"
              className={inputClass}
            />
            <input
              name="notes"
              placeholder="Invoice reference or collection notes"
              className={inputClass}
            />
            <button className="rounded-2xl bg-emerald-300 px-6 py-3 text-sm font-black text-slate-950">
              Assign Collection
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-5">
        {collections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
            No collection assignments yet.
          </div>
        ) : (
          collections.map((collection) => {
            const pending = getPendingCollectionAmount(
              collection.amountToCollect,
              collection.amountCollected
            );
            const imageProofs = collection.proofs
              .filter((proof) => proof.mimeType !== "application/pdf")
              .map((proof) => ({
                id: proof.id,
                fileDataUrl: proof.fileDataUrl,
                caption: proof.fileName,
              }));
            const pdfProofs = collection.proofs.filter(
              (proof) => proof.mimeType === "application/pdf"
            );

            return (
              <article
                key={collection.id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <p className="text-xs font-black tracking-widest text-slate-500">
                      {collection.collectionNumber}
                    </p>
                    <h2 className="mt-2 text-xl font-black text-slate-950">
                      {collection.dealerName}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Assigned: {collection.assignedTo?.name ?? "Unassigned"}
                      {collection.assignedTo
                        ? ` · ${roleLabels[roleToAppRole(collection.assignedTo.role)]}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`h-fit rounded-full border px-3 py-1.5 text-xs font-black ${getCollectionStatusClass(collection.status)}`}
                  >
                    {collectionStatusLabels[collection.status]}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    ["To Collect", formatCurrency(collection.amountToCollect)],
                    ["Collected", formatCurrency(collection.amountCollected)],
                    ["Pending", formatCurrency(pending)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-full border border-slate-200 px-3 py-1.5">
                    {collectionPaymentModeLabels[collection.paymentMode]}
                  </span>
                  <span className="rounded-full border border-slate-200 px-3 py-1.5">
                    Due: {formatCollectionDate(collection.dueAt)}
                  </span>
                  <span className="rounded-full border border-slate-200 px-3 py-1.5">
                    Proofs: {collection.proofs.length}
                  </span>
                  {isCollectionOverdue(collection.dueAt, collection.status) ? (
                    <span className="rounded-full border border-rose-200 px-3 py-1.5 text-rose-700">
                      Overdue
                    </span>
                  ) : null}
                </div>

                {imageProofs.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
                      Payment Proof Gallery
                    </p>
                    <FieldVisitPhotoGallery
                      photos={imageProofs}
                      shopName={collection.dealerName}
                      compact
                    />
                  </div>
                ) : collection.proofs.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No payment proof uploaded yet. Collection team can upload
                    from Collection Portal, or owner/accountant can upload
                    proof below for direct collections.
                  </div>
                ) : null}
                {pdfProofs.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pdfProofs.map((proof) => (
                      <a
                        key={proof.id}
                        href={proof.fileDataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"
                      >
                        PDF: {proof.fileName}
                      </a>
                    ))}
                  </div>
                ) : null}

                {pending > 0 && collection.status !== "VERIFIED" ? (
                  <details className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-300/[0.04] p-4">
                    <summary className="cursor-pointer text-sm font-black text-emerald-700">
                      Upload payment proof from internal side
                    </summary>

                    <form
                      action={uploadInternalCollectionProofAction}
                      className="mt-4 grid gap-4"
                    >
                      <input
                        type="hidden"
                        name="collectionId"
                        value={collection.id}
                      />

                      <div className="grid gap-4 lg:grid-cols-3">
                        <div>
                          <label className={labelClass}>Amount Collected Now</label>
                          <input
                            name="amountCollected"
                            type="number"
                            min="1"
                            max={pending}
                            required
                            className={`${inputClass} mt-2`}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>Payment Mode</label>
                          <select
                            name="paymentMode"
                            defaultValue={collection.paymentMode}
                            className={`${inputClass} mt-2 appearance-none pr-12`}
                            style={selectStyle}
                          >
                            {collectionPaymentModes.map((mode) => (
                              <option key={mode} value={mode}>
                                {collectionPaymentModeLabels[mode]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={labelClass}>Proof Type</label>
                          <select
                            name="proofType"
                            defaultValue="PAYMENT_PROOF"
                            className={`${inputClass} mt-2 appearance-none pr-12`}
                            style={selectStyle}
                          >
                            <option value="PAYMENT_PROOF">Payment Proof</option>
                            <option value="CHEQUE_PHOTO">Cheque Photo</option>
                            <option value="UPI_SCREENSHOT">UPI Screenshot</option>
                            <option value="CASH_RECEIPT">Cash Receipt</option>
                            <option value="BANK_TRANSFER_PROOF">
                              Bank Transfer Proof
                            </option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Proof Files</label>
                        <CollectionProofFileInput
                          className={`${inputClass} mt-2 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-300 file:px-4 file:py-2 file:text-sm file:font-black file:text-slate-950`}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Proof Note</label>
                        <textarea
                          name="proofNote"
                          placeholder="Transaction ID, cheque number, cash receipt detail, or owner handover note"
                          className={`${inputClass} mt-2 min-h-24`}
                        />
                      </div>

                      <button className="rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200">
                        Add Payment Proof
                      </button>
                    </form>
                  </details>
                ) : null}

                <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer text-sm font-black text-slate-950">
                    Edit or verify
                  </summary>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                    <form
                      action={updateCollectionAssignmentAction}
                      className="grid gap-4"
                    >
                      <input
                        type="hidden"
                        name="collectionId"
                        value={collection.id}
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <select
                          name="assignedToId"
                          defaultValue={collection.assignedToId ?? ""}
                          className={`${inputClass} appearance-none pr-12`}
                          style={selectStyle}
                        >
                          <option value="">Unassigned</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name}
                            </option>
                          ))}
                        </select>
                        <select
                          name="status"
                          defaultValue={collection.status}
                          className={`${inputClass} appearance-none pr-12`}
                          style={selectStyle}
                        >
                          {collectionStatuses.map((status) => (
                            <option
                              key={status}
                              value={status}
                              disabled={status === "VERIFIED"}
                            >
                              {collectionStatusLabels[status]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <input
                          name="amountCollected"
                          type="number"
                          min="0"
                          max={collection.amountToCollect}
                          defaultValue={collection.amountCollected}
                          className={inputClass}
                        />
                        <select
                          name="paymentMode"
                          defaultValue={collection.paymentMode}
                          className={`${inputClass} appearance-none pr-12`}
                          style={selectStyle}
                        >
                          {collectionPaymentModes.map((mode) => (
                            <option key={mode} value={mode}>
                              {collectionPaymentModeLabels[mode]}
                            </option>
                          ))}
                        </select>
                        <input
                          name="dueAt"
                          type="datetime-local"
                          defaultValue={toIndiaDateTimeLocal(collection.dueAt)}
                          className={inputClass}
                          style={{ colorScheme: "dark" }}
                        />
                      </div>
                      <input
                        name="nextFollowUpAt"
                        type="datetime-local"
                        defaultValue={toIndiaDateTimeLocal(
                          collection.nextFollowUpAt
                        )}
                        className={inputClass}
                        style={{ colorScheme: "dark" }}
                      />
                      <input
                        name="failureReason"
                        defaultValue={collection.failureReason ?? ""}
                        placeholder="Failure/reschedule reason"
                        className={inputClass}
                      />
                      <textarea
                        name="notes"
                        defaultValue={collection.notes ?? ""}
                        className={`${inputClass} min-h-24`}
                      />
                      <button className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-black text-blue-700">
                        Save Changes
                      </button>
                    </form>
                    <form action={verifyCollectionAction}>
                      <input
                        type="hidden"
                        name="collectionId"
                        value={collection.id}
                      />
                      <button
                        disabled={collection.status === "VERIFIED"}
                        className="rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
                      >
                        {collection.verifiedBy
                          ? `Verified by ${collection.verifiedBy.name}`
                          : "Verify Collection"}
                      </button>
                    </form>
                  </div>
                </details>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
