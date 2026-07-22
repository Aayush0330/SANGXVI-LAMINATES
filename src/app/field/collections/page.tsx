import { AccessDeniedCard } from "@/components/access-denied-card";
import { CollectionProofFileInput } from "@/components/collection-proof-file-input";
import { FieldVisitPhotoGallery } from "@/components/field-visit-photo-gallery";
import { checkPermission } from "@/lib/auth-guards";
import { getPortalLandingLabel, getPortalLandingPath } from "@/lib/current-user";
import {
  collectionPaymentModeLabels,
  collectionPaymentModes,
  collectionStatusLabels,
  formatCollectionDate,
  formatCurrency,
  getCollectionStatusClass,
  getPendingCollectionAmount,
  isCollectionOverdue,
} from "@/lib/collections";
import { prisma } from "@/lib/db";
import {
  updateCollectionProgressAction,
  uploadCollectionProofAction,
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

function isInternalCollectionRole(role: string) {
  return role === "owner" || role === "manager" || role === "accountant";
}

function getMessage(error?: string, success?: string) {
  const successMap: Record<string, string> = {
    "status-updated": "Collection status updated.",
    "proof-uploaded": "Collection payment and proof saved successfully.",
  };
  const errorMap: Record<string, string> = {
    "permission-denied": "You cannot update this collection.",
    "collection-not-found": "The collection assignment was not found.",
    "collection-closed": "This collection is already closed.",
    "invalid-status": "The requested status is invalid.",
    "follow-up-required": "Select a follow-up date when rescheduling.",
    "proof-required": "Upload at least one payment proof.",
    "invalid-proof-type": "Only JPG, PNG, WebP, or PDF files are allowed.",
    "invalid-proof-content": "One uploaded file is not a valid supported proof.",
    "proof-too-large": "Each proof file must be 4 MB or smaller.",
    "proofs-total-too-large": "Combined proof files must be 20 MB or smaller.",
    "too-many-proofs": "Upload no more than 5 proof files.",
    "invalid-amount": "Collected amount must be greater than zero.",
    "amount-exceeds-pending": "Collected amount exceeds the pending amount.",
  };
  if (success && successMap[success]) {
    return { type: "success", text: successMap[success] };
  }
  if (error && errorMap[error]) {
    return { type: "error", text: errorMap[error] };
  }
  return null;
}

export default async function FieldCollectionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);
  const { currentUser, hasAccess } = await checkPermission(
    "manage_collections",
    "/field/collections"
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Collection Access Denied"
        description="Your role cannot view or update collection assignments."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const collections = await prisma.collectionAssignment.findMany({
    where: isInternalCollectionRole(currentUser.role)
      ? undefined
      : { assignedToId: currentUser.id },
    include: {
      assignedTo: { select: { name: true } },
      proofs: { orderBy: { uploadedAt: "asc" } },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
  });
  const pendingTasks = collections.filter(
    (item) => !["COLLECTED", "VERIFIED", "CANCELLED"].includes(item.status)
  ).length;
  const collectedAmount = collections.reduce(
    (sum, item) => sum + item.amountCollected,
    0
  );
  const pendingAmount = collections.reduce(
    (sum, item) =>
      sum +
      getPendingCollectionAmount(item.amountToCollect, item.amountCollected),
    0
  );

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50 p-6 dark:border-slate-700 dark:bg-slate-900 dark:bg-none">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-700">
          Collections
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">
          My Collection Tasks
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Only assigned collection tasks appear here. Update travel progress,
          record payment, and upload cheque, UPI, cash, bank-transfer, or PDF
          proof.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["Assigned", collections.length, "text-slate-950"],
            ["Pending", pendingTasks, "text-yellow-300"],
            ["Collected", formatCurrency(collectedAmount), "text-emerald-700"],
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
        <p className="mt-4 text-sm font-bold text-slate-500">
          Pending amount:{" "}
          <span className="text-amber-800">
            {formatCurrency(pendingAmount)}
          </span>
        </p>
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

      {collections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
          No assigned collection tasks are visible right now. If you expected a
          task here, ask Owner or Accountant to assign the collection to your
          account.
        </div>
      ) : (
        <div className="grid gap-5">
          {collections.map((collection) => {
            const pending = getPendingCollectionAmount(
              collection.amountToCollect,
              collection.amountCollected
            );
            const closed = ["COLLECTED", "VERIFIED", "CANCELLED"].includes(
              collection.status
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
                    <h2 className="mt-2 text-2xl font-black text-slate-950">
                      {collection.dealerName}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      {collection.contactPerson
                        ? `${collection.contactPerson} · `
                        : ""}
                      {collection.contactPhone ?? "No phone provided"}
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
                  <span
                    className={`rounded-full border px-3 py-1.5 ${
                      isCollectionOverdue(collection.dueAt, collection.status)
                        ? "border-rose-200 text-rose-700"
                        : "border-slate-200"
                    }`}
                  >
                    Due: {formatCollectionDate(collection.dueAt)}
                  </span>
                  <span className="rounded-full border border-slate-200 px-3 py-1.5">
                    Assigned: {collection.assignedTo?.name ?? "Unassigned"}
                  </span>
                </div>

                {!closed ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["ON_THE_WAY", "On The Way"],
                      ["REACHED", "Reached"],
                    ].map(([status, label]) => (
                      <form
                        key={status}
                        action={updateCollectionProgressAction}
                      >
                        <input
                          type="hidden"
                          name="collectionId"
                          value={collection.id}
                        />
                        <input type="hidden" name="status" value={status} />
                        <button className="w-full rounded-2xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700">
                          {label}
                        </button>
                      </form>
                    ))}
                    <details className="rounded-2xl border border-yellow-300/30 bg-amber-50 p-3 sm:col-span-2">
                      <summary className="cursor-pointer text-sm font-black text-amber-800">
                        Failed / Reschedule
                      </summary>
                      <form
                        action={updateCollectionProgressAction}
                        className="mt-4 grid gap-3"
                      >
                        <input
                          type="hidden"
                          name="collectionId"
                          value={collection.id}
                        />
                        <select
                          name="status"
                          defaultValue="RESCHEDULED"
                          className={`${inputClass} appearance-none pr-12`}
                          style={selectStyle}
                        >
                          <option value="RESCHEDULED">Rescheduled</option>
                          <option value="FAILED">Failed</option>
                        </select>
                        <input
                          name="nextFollowUpAt"
                          type="datetime-local"
                          className={inputClass}
                          style={{ colorScheme: "dark" }}
                        />
                        <input
                          name="note"
                          placeholder="Reason or next step"
                          className={inputClass}
                        />
                        <button className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-black text-slate-950">
                          Save Update
                        </button>
                      </form>
                    </details>
                  </div>
                ) : null}

                {!closed && pending > 0 ? (
                  <details
                    className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-300/[0.04] p-4"
                    open
                  >
                    <summary className="cursor-pointer text-sm font-black text-slate-950">
                      Record payment and upload proof
                    </summary>
                    <form
                      action={uploadCollectionProofAction}
                      className="mt-4 grid gap-4"
                    >
                      <input
                        type="hidden"
                        name="collectionId"
                        value={collection.id}
                      />
                      <div className="grid gap-4 lg:grid-cols-3">
                        <div>
                          <label className={labelClass}>Amount Now</label>
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
                      <textarea
                        name="proofNote"
                        placeholder="Transaction ID, cheque number, receipt detail, or note"
                        className={`${inputClass} min-h-24`}
                      />
                      <button className="rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-black text-slate-950">
                        Save Payment & Proof
                      </button>
                    </form>
                  </details>
                ) : null}

                {imageProofs.length > 0 ? (
                  <div className="mt-5">
                    <FieldVisitPhotoGallery
                      photos={imageProofs}
                      shopName={`${collection.dealerName} collection`}
                      compact
                    />
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
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
