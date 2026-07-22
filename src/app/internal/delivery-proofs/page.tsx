import Link from "next/link";
import { redirect } from "next/navigation";
import { DeliveryProofAssistanceStatus } from "@/generated/prisma/client";
import {
  ManagerProofUploadForm,
  MANAGER_PROOF_SCROLL_KEY,
  ReplaceDeliveryProofForm,
} from "@/components/manager-proof-upload-form";
import {
  TeamFeedbackToast,
  type TeamFeedbackMessage,
} from "@/components/team-feedback-toast";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

type ArchivedProofRow = {
  orderId: string;
  proofId: string;
  fileName: string;
  uploadedAt: Date;
  uploadedByName: string | null;
  replacedAt: Date | null;
  replacedByName: string | null;
  replacementReason: string | null;
};

type RecentProofRow = {
  orderId: string;
  orderNumber: string;
  dealerName: string;
  assignedDriverName: string | null;
  deliveredByName: string | null;
  proofId: string;
  fileName: string;
  mimeType: string;
  uploadMode: string;
  uploadedAt: Date;
  uploadedByName: string | null;
  note: string | null;
};

function getUploadModeLabel(uploadMode: string) {
  if (uploadMode === "MANAGER_ASSISTED") return "Manager Assisted";
  if (uploadMode === "INTERNAL_UPLOAD") return "Internal Replacement";
  return "Driver Self Upload";
}

function isTodayInIndia(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  return formatter.format(date) === formatter.format(new Date());
}

function formatDateTime(date: Date | null) {
  if (!date) return "Not available";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function getMessage(error?: string, success?: string): TeamFeedbackMessage | null {
  if (success === "manager-proof-uploaded") {
    return {
      type: "success",
      title: "Delivery proof uploaded",
      text: "The proof was saved on behalf of the driver and the audit record was updated.",
    };
  }

  if (success === "proof-replaced") {
    return {
      type: "success",
      title: "Delivery proof replaced",
      text: "The corrected proof is active. The previous file remains preserved in the audit history.",
    };
  }

  const errors: Record<string, string> = {
    "missing-order": "The order reference is missing.",
    "order-not-found": "The selected order no longer exists.",
    "assistance-not-requested": "This driver has not requested manager assistance.",
    "proof-already-uploaded": "Delivery proof is already uploaded for this order.",
    "proof-not-allowed": "Proof cannot be uploaded for the current delivery status.",
    "missing-proof": "Select a proof photo or PDF.",
    "invalid-proof-type": "Only JPG, PNG, WebP, or PDF files are allowed.",
    "proof-too-large": "The proof file must be 3MB or smaller.",
    "invalid-proof-content": "The selected file content does not match its file type.",
    "proof-note-too-long": "The upload note must be 500 characters or less.",
    "replacement-reason-required": "Enter a replacement reason of at least 10 characters.",
    "replacement-reason-too-long": "The replacement reason must be 500 characters or less.",
    "proof-not-found-for-replacement": "No active proof is available to replace for this order.",
    "replacement-file-unchanged": "Choose a different corrected file; the selected file matches the active proof.",
    "replacement-upload-conflict": "Another proof update completed at the same time. Refresh and try again.",
  };

  if (error && errors[error]) {
    return {
      type: "error",
      title: "Proof upload failed",
      text: errors[error],
    };
  }

  return null;
}

export default async function DeliveryProofAssistancePage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const { hasAccess } = await checkPermission(
    "manage_delivery_proofs",
    "/internal/delivery-proofs",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const [pendingOrders, recentProofs, archivedProofs, pendingProofCount] = await Promise.all([
    prisma.order.findMany({
      where: {
        deliveryProofAssistanceStatus:
          DeliveryProofAssistanceStatus.REQUESTED,
        signedInvoiceStatus: { not: "UPLOADED" },
      },
      include: {
        dealer: { select: { name: true, email: true, phone: true } },
        assignedDriver: { select: { name: true, email: true, phone: true } },
        items: {
          include: {
            product: { select: { name: true, code: true, unit: true } },
          },
        },
      },
      orderBy: { deliveryProofRequestedAt: "asc" },
    }),
    prisma.$queryRaw<RecentProofRow[]>`
      SELECT
        o."id" AS "orderId",
        o."orderNumber",
        dealer."name" AS "dealerName",
        driver."name" AS "assignedDriverName",
        o."deliveredByName",
        proof."id" AS "proofId",
        proof."fileName",
        proof."mimeType",
        proof."uploadMode"::text AS "uploadMode",
        proof."uploadedAt",
        uploader."name" AS "uploadedByName",
        proof."note"
      FROM public."DeliveryProof" proof
      INNER JOIN public."Order" o ON o."id" = proof."orderId"
      INNER JOIN public."User" dealer ON dealer."id" = o."dealerId"
      LEFT JOIN public."User" driver ON driver."id" = o."assignedDriverId"
      LEFT JOIN public."User" uploader ON uploader."id" = proof."uploadedById"
      WHERE proof."proofType" = 'SIGNED_DUPLICATE_INVOICE'
        AND proof."isActive" = TRUE
      ORDER BY proof."uploadedAt" DESC
      LIMIT 12
    `,
    prisma.$queryRaw<ArchivedProofRow[]>`
      SELECT
        proof."orderId",
        proof."id" AS "proofId",
        proof."fileName",
        proof."uploadedAt",
        uploader."name" AS "uploadedByName",
        proof."replacedAt",
        proof."replacedByName",
        proof."replacementReason"
      FROM public."DeliveryProof" proof
      LEFT JOIN public."User" uploader ON uploader."id" = proof."uploadedById"
      WHERE proof."proofType" = 'SIGNED_DUPLICATE_INVOICE'
        AND proof."isActive" = FALSE
      ORDER BY proof."replacedAt" DESC NULLS LAST, proof."uploadedAt" DESC
      LIMIT 30
    `,
    prisma.order.count({
      where: {
        status: { in: ["DELIVERED"] },
        signedInvoiceStatus: { not: "UPLOADED" },
      },
    }),
  ]);

  const archivedProofsByOrderId = new Map<string, ArchivedProofRow[]>();
  for (const proof of archivedProofs) {
    const existing = archivedProofsByOrderId.get(proof.orderId) ?? [];
    existing.push(proof);
    archivedProofsByOrderId.set(proof.orderId, existing);
  }

  const completedToday = recentProofs.filter((proof) =>
    isTodayInIndia(proof.uploadedAt),
  ).length;

  return (
    <div className="space-y-6 pb-12">
      <TeamFeedbackToast
        message={getMessage(params?.error, params?.success)}
        restoreScrollKey={MANAGER_PROOF_SCROLL_KEY}
      />

      <section className="relative overflow-hidden rounded-[28px] border border-blue-100 bg-gradient-to-br from-white via-blue-50/70 to-violet-100/60 px-6 py-7 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/50 sm:px-8">
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-blue-300/25 blur-3xl dark:bg-blue-500/10" />
        <div className="relative">
          <p className="text-[11px] font-black uppercase tracking-[0.32em] text-blue-600 dark:text-blue-300">
            Delivery Operations
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Delivery Proof Assistance
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Drivers who cannot upload proof can request manager help. Upload the file here while preserving who delivered and who uploaded it.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Waiting for Manager", pendingOrders.length, "text-amber-600"],
          ["Proofs Uploaded Today", completedToday, "text-emerald-600"],
          ["All Proofs Pending", pendingProofCount, "text-blue-600"],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{label}</p>
            <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">
              Manager Upload Queue
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Oldest requests appear first.
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
            {pendingOrders.length} pending
          </span>
        </div>

        {pendingOrders.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 px-6 py-14 text-center dark:border-slate-700">
            <h3 className="text-lg font-black text-slate-950 dark:text-white">
              No manager assistance requests
            </h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              New driver requests will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {pendingOrders.map((order) => {
              const totalQuantity = order.items.reduce(
                (sum, item) => sum + item.deliveredQuantity,
                0,
              );

              return (
                <article key={order.id} className="rounded-[24px] border border-amber-200 bg-amber-50/40 p-5 dark:border-amber-400/20 dark:bg-amber-400/5 sm:p-6">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-xl font-black text-slate-950 dark:text-white">
                          {order.orderNumber}
                        </h3>
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                          Manager Help Requested
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        Dealer: <strong>{order.dealer.name}</strong> · Driver: <strong>{order.assignedDriver?.name || order.deliveredByName || "Not available"}</strong>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Requested by {order.deliveryProofRequestedByName || order.assignedDriver?.name || "Driver"} on {formatDateTime(order.deliveryProofRequestedAt)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white px-4 py-3 dark:bg-slate-950">
                        <p className="text-xs text-slate-500">Products</p>
                        <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{order.items.length}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3 dark:bg-slate-950">
                        <p className="text-xs text-slate-500">Delivered Qty</p>
                        <p className="mt-1 text-lg font-black text-emerald-600">{totalQuantity}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3 dark:bg-slate-950">
                        <p className="text-xs text-slate-500">Proof</p>
                        <p className="mt-1 text-sm font-black text-amber-600">Pending</p>
                      </div>
                    </div>
                  </div>

                  {order.deliveryProofRequestNote ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-amber-400/20 dark:bg-slate-950 dark:text-slate-200">
                      <strong>Driver note:</strong> {order.deliveryProofRequestNote}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {order.items.map((item) => (
                      <span key={item.id} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                        {item.product.name} · {item.deliveredQuantity} {item.product.unit}
                      </span>
                    ))}
                  </div>

                  <ManagerProofUploadForm orderId={order.id} />
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">
              Recent Delivery Proofs
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              One active proof is allowed per order. Managers can replace an incorrect file with a mandatory audit reason.
            </p>
          </div>
          <Link href="/internal/security" className="text-xs font-black text-blue-600 dark:text-blue-300">
            View Audit
          </Link>
        </div>

        <div className="mt-5 space-y-3">
          {recentProofs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
              No delivery proofs uploaded yet.
            </p>
          ) : (
            recentProofs.map((proof) => {
              const previousProofs = archivedProofsByOrderId.get(proof.orderId) ?? [];

              return (
              <article key={proof.proofId} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-slate-950 dark:text-white">
                        {proof.orderNumber} · {proof.dealerName}
                      </p>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                        {getUploadModeLabel(proof.uploadMode)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Delivered by {proof.deliveredByName || proof.assignedDriverName || "Driver"} · Uploaded by {proof.uploadedByName || "Unknown user"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {proof.fileName} · {formatDateTime(proof.uploadedAt)}
                    </p>
                    {proof.note ? (
                      <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                        {proof.note}
                      </p>
                    ) : null}
                  </div>
                  <a href={`/field/deliveries/proof/${proof.proofId}`} target="_blank" rel="noreferrer" className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 px-4 text-xs font-black text-blue-600 transition hover:bg-blue-600 hover:text-white dark:border-blue-400/30 dark:text-blue-300">
                    View Proof
                  </a>
                </div>

                {previousProofs.length > 0 ? (
                  <details className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60">
                    <summary className="cursor-pointer list-none text-xs font-black text-slate-700 dark:text-slate-200">
                      Previous proof versions ({previousProofs.length})
                    </summary>
                    <div className="mt-3 space-y-2">
                      {previousProofs.map((previous) => (
                        <div key={previous.proofId} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-black text-slate-800 dark:text-slate-200">{previous.fileName}</p>
                              <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                                Uploaded by {previous.uploadedByName || "Unknown user"} on {formatDateTime(previous.uploadedAt)}
                              </p>
                              <p className="mt-1 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
                                Replaced by {previous.replacedByName || "System"} on {formatDateTime(previous.replacedAt)} · {previous.replacementReason || "Replacement reason unavailable"}
                              </p>
                            </div>
                            <a href={`/field/deliveries/proof/${previous.proofId}`} target="_blank" rel="noreferrer" className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 px-3 text-[10px] font-black text-slate-600 transition hover:bg-slate-900 hover:text-white dark:border-slate-700 dark:text-slate-300">
                              View Archived
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}

                <ReplaceDeliveryProofForm orderId={proof.orderId} />
              </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
