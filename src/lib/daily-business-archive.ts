import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Client } from "pg";

function connectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is missing.");
  const url = new URL(value);
  const allowed = new Set([
    "sslmode",
    "connect_timeout",
    "application_name",
    "target_session_attrs",
  ]);
  const search = new URLSearchParams();
  url.searchParams.forEach((paramValue, key) => {
    if (allowed.has(key)) search.set(key, paramValue);
  });
  url.search = search.toString();
  return url.toString();
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function getDefaultArchiveDate() {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

type OrderRow = {
  id: string;
  orderNumber: string;
  dealerName: string;
  dealerEmail: string;
  source: string;
  status: string;
  priority: string;
  enteredByName: string | null;
  receivedByName: string | null;
  assignedDriverName: string | null;
  transportLabel: string | null;
  deliveredByName: string | null;
  deliveredAt: Date | string | null;
  createdAt: Date | string;
};

type ItemRow = {
  orderId: string;
  productName: string;
  productCode: string;
  quantity: number;
  deliveredQuantity: number;
  lineTotal: string | number;
};

type AssignmentRow = {
  orderId: string;
  teamName: string;
  status: string;
  assignedByName: string | null;
  completedByName: string | null;
  issueType: string | null;
  issueNotes: string | null;
  qcRejectedByName: string | null;
  qcNotes: string | null;
};

type ProofRow = {
  orderId: string;
  fileName: string;
  uploadMode: string;
  deliveredByName: string | null;
  uploadedByName: string | null;
  uploadedAt: Date | string;
};

type PurchaseRow = {
  id: string;
  requestNumber: string;
  supplierName: string;
  status: string;
  priority: string;
  estimatedTotal: string | number;
  purchaseOrderNumber: string | null;
  requestedByName: string | null;
  approvedByName: string | null;
  orderedByName: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  expectedDeliveryDate: Date | string | null;
  createdAt: Date | string;
};

type PurchaseItemRow = {
  purchaseRequestId: string;
  productName: string;
  productCode: string;
  requestedQuantity: number;
  approvedQuantity: number;
  orderedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  rejectedQuantity: number;
  lineTotal: string | number;
};

type PurchaseReceiptRow = {
  purchaseRequestId: string;
  receiptNumber: string;
  receivedByName: string | null;
  receivedAt: Date | string;
  acceptedQuantity: number;
  issueQuantity: number;
};

export async function generateDailyBusinessArchive(businessDate: string) {
  if (!validDate(businessDate)) throw new Error("Use business date in YYYY-MM-DD format.");
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  const archiveId = randomUUID();

  try {
    await client.query(
      `INSERT INTO public."DailyBusinessArchive" ("id","businessDate","status","createdAt","updatedAt")
       VALUES ($1,$2::date,'GENERATING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT ("businessDate") DO UPDATE SET "status"='GENERATING',"errorMessage"=NULL,"updatedAt"=CURRENT_TIMESTAMP`,
      [archiveId, businessDate],
    );

    const orders = (await client.query<OrderRow>(
      `SELECT o."id",o."orderNumber",u."name" AS "dealerName",u."email" AS "dealerEmail",
              o."source"::text AS "source",o."status"::text AS "status",o."priority",
              o."enteredByName",o."receivedByName",d."name" AS "assignedDriverName",
              o."transportLabel",o."deliveredByName",o."deliveredAt",o."createdAt"
       FROM public."Order" o
       JOIN public."User" u ON u."id"=o."dealerId"
       LEFT JOIN public."User" d ON d."id"=o."assignedDriverId"
       WHERE (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date=$1::date
          OR (o."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date=$1::date
       ORDER BY o."createdAt"`,
      [businessDate],
    )).rows;

    const orderIds = orders.map((order) => order.id);
    const items: ItemRow[] = orderIds.length
      ? (await client.query<ItemRow>(
          `SELECT oi."orderId",p."name" AS "productName",p."code" AS "productCode",
                  oi."requestedQuantity" AS "quantity",oi."deliveredQuantity",oi."lineTotal"::text AS "lineTotal"
           FROM public."OrderItem" oi
           JOIN public."Product" p ON p."id"=oi."productId"
           WHERE oi."orderId"=ANY($1::text[])
           ORDER BY oi."orderId",p."name"`,
          [orderIds],
        )).rows
      : [];
    const assignments: AssignmentRow[] = orderIds.length
      ? (await client.query<AssignmentRow>(
          `SELECT a."orderId",t."name" AS "teamName",a."status"::text AS "status",a."assignedByName",
                  a."completedByName",a."issueType"::text AS "issueType",a."issueNotes",a."qcRejectedByName",a."qcNotes"
           FROM public."OrderPhysicalAssignment" a
           JOIN public."WorkTeam" t ON t."id"=a."teamId"
           WHERE a."orderId"=ANY($1::text[])
           ORDER BY a."orderId",a."assignedAt"`,
          [orderIds],
        )).rows
      : [];
    const proofs: ProofRow[] = orderIds.length
      ? (await client.query<ProofRow>(
          `SELECT dp."orderId",dp."fileName",dp."uploadMode"::text AS "uploadMode",dp."deliveredByName",
                  u."name" AS "uploadedByName",dp."uploadedAt"
           FROM public."DeliveryProof" dp
           LEFT JOIN public."User" u ON u."id"=dp."uploadedById"
           WHERE dp."orderId"=ANY($1::text[]) AND dp."isActive"=TRUE
           ORDER BY dp."uploadedAt"`,
          [orderIds],
        )).rows
      : [];

    const purchases = (await client.query<PurchaseRow>(
      `SELECT pr."id",pr."requestNumber",s."companyName" AS "supplierName",
              pr."status"::text AS "status",pr."priority"::text AS "priority",
              pr."estimatedTotal"::text AS "estimatedTotal",pr."purchaseOrderNumber",
              pr."requestedByName",pr."approvedByName",pr."orderedByName",
              pr."rejectionReason",pr."cancellationReason",pr."expectedDeliveryDate",pr."createdAt"
       FROM public."PurchaseRequest" pr
       JOIN public."Supplier" s ON s."id"=pr."supplierId"
       WHERE (pr."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date=$1::date
          OR (pr."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date=$1::date
          OR EXISTS (
            SELECT 1 FROM public."PurchaseReceipt" grn
            WHERE grn."purchaseRequestId"=pr."id"
              AND (grn."receivedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date=$1::date
          )
       ORDER BY pr."createdAt"`,
      [businessDate],
    )).rows;

    const purchaseIds = purchases.map((purchase) => purchase.id);
    const purchaseItems: PurchaseItemRow[] = purchaseIds.length
      ? (await client.query<PurchaseItemRow>(
          `SELECT pri."purchaseRequestId",p."name" AS "productName",p."code" AS "productCode",
                  pri."requestedQuantity",pri."approvedQuantity",pri."orderedQuantity",
                  pri."receivedQuantity",pri."damagedQuantity",pri."rejectedQuantity",
                  pri."lineTotal"::text AS "lineTotal"
           FROM public."PurchaseRequestItem" pri
           JOIN public."Product" p ON p."id"=pri."productId"
           WHERE pri."purchaseRequestId"=ANY($1::text[])
           ORDER BY pri."purchaseRequestId",p."name"`,
          [purchaseIds],
        )).rows
      : [];
    const purchaseReceipts: PurchaseReceiptRow[] = purchaseIds.length
      ? (await client.query<PurchaseReceiptRow>(
          `SELECT grn."purchaseRequestId",grn."receiptNumber",grn."receivedByName",grn."receivedAt",
                  COALESCE(SUM(gri."acceptedQuantity"),0)::int AS "acceptedQuantity",
                  COALESCE(SUM(gri."damagedQuantity"+gri."rejectedQuantity"),0)::int AS "issueQuantity"
           FROM public."PurchaseReceipt" grn
           JOIN public."PurchaseReceiptItem" gri ON gri."purchaseReceiptId"=grn."id"
           WHERE grn."purchaseRequestId"=ANY($1::text[])
           GROUP BY grn."id"
           ORDER BY grn."receivedAt"`,
          [purchaseIds],
        )).rows
      : [];

    const collectionSummary = (await client.query<{
      total: string;
      collected: string;
      pending: string;
    }>(
      `SELECT COUNT(*)::text AS "total",
              COALESCE(SUM("amountCollected"),0)::text AS "collected",
              COALESCE(SUM(GREATEST("amountToCollect"-"amountCollected",0)),0)::text AS "pending"
       FROM public."CollectionAssignment"
       WHERE ("updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date=$1::date`,
      [businessDate],
    )).rows[0];

    const notificationSummary = (await client.query<{
      critical: string;
      blockers: string;
      high: string;
    }>(
      `SELECT COUNT(*) FILTER (WHERE "priority"='CRITICAL')::text AS "critical",
              COUNT(*) FILTER (WHERE "priority"='BLOCKER')::text AS "blockers",
              COUNT(*) FILTER (WHERE "priority"='HIGH_ALERT')::text AS "high"
       FROM public."Notification"
       WHERE ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date=$1::date`,
      [businessDate],
    )).rows[0];

    const totalValue = items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
    const summary = {
      businessDate,
      orders: orders.length,
      deliveredOrders: orders.filter((order) => order.status === "DELIVERED").length,
      orderValue: totalValue,
      collections: {
        records: Number(collectionSummary?.total ?? 0),
        collected: Number(collectionSummary?.collected ?? 0),
        pending: Number(collectionSummary?.pending ?? 0),
      },
      alerts: {
        critical: Number(notificationSummary?.critical ?? 0),
        blockers: Number(notificationSummary?.blockers ?? 0),
        high: Number(notificationSummary?.high ?? 0),
      },
      procurement: {
        requests: purchases.length,
        estimatedValue: purchases.reduce((sum, purchase) => sum + Number(purchase.estimatedTotal), 0),
        acceptedUnits: purchaseReceipts.reduce((sum, receipt) => sum + Number(receipt.acceptedQuantity), 0),
        issueUnits: purchaseReceipts.reduce((sum, receipt) => sum + Number(receipt.issueQuantity), 0),
      },
    };

    const orderSections = orders.map((order) => {
      const orderItems = items.filter((item) => item.orderId === order.id);
      const orderAssignments = assignments.filter((item) => item.orderId === order.id);
      const orderProofs = proofs.filter((item) => item.orderId === order.id);
      return `<section class="order"><h2>${escapeHtml(order.orderNumber)} · ${escapeHtml(order.dealerName)}</h2>
        <p><strong>Source:</strong> ${escapeHtml(order.source)} · <strong>Status:</strong> ${escapeHtml(order.status)} · <strong>Priority:</strong> ${escapeHtml(order.priority)}</p>
        <p><strong>Entered by:</strong> ${escapeHtml(order.enteredByName || "Dealer Portal")} · <strong>Received by:</strong> ${escapeHtml(order.receivedByName || "Pending")}</p>
        <table><thead><tr><th>Product</th><th>Ordered</th><th>Delivered</th><th>Line total</th></tr></thead><tbody>
          ${orderItems.map((item) => `<tr><td>${escapeHtml(item.productName)} (${escapeHtml(item.productCode)})</td><td>${item.quantity}</td><td>${item.deliveredQuantity}</td><td>₹${Number(item.lineTotal).toLocaleString("en-IN")}</td></tr>`).join("") || '<tr><td colspan="4">No items</td></tr>'}
        </tbody></table>
        <h3>Physical teams and QC</h3><ul>${orderAssignments.map((item) => `<li>${escapeHtml(item.teamName)} — ${escapeHtml(item.status)}${item.issueType ? ` — ${escapeHtml(item.issueType)}: ${escapeHtml(item.issueNotes)}` : ""}${item.qcRejectedByName ? ` — QC rejected by ${escapeHtml(item.qcRejectedByName)}: ${escapeHtml(item.qcNotes)}` : ""}</li>`).join("") || "<li>Not assigned</li>"}</ul>
        <p><strong>Transport:</strong> ${escapeHtml(order.transportLabel || "Not assigned")} · <strong>Driver:</strong> ${escapeHtml(order.assignedDriverName || "Not assigned")}</p>
        <p><strong>Delivered by:</strong> ${escapeHtml(order.deliveredByName || "Not delivered")} · <strong>Proof:</strong> ${orderProofs.map((proof) => `${escapeHtml(proof.fileName)} (${escapeHtml(proof.uploadMode)}, uploaded by ${escapeHtml(proof.uploadedByName || "Unknown")})`).join(", ") || "Pending"}</p>
      </section>`;
    }).join("\n");

    const purchaseSections = purchases.map((purchase) => {
      const requestItems = purchaseItems.filter((item) => item.purchaseRequestId === purchase.id);
      const receiptsForRequest = purchaseReceipts.filter((receipt) => receipt.purchaseRequestId === purchase.id);
      return `<section class="order"><h2>${escapeHtml(purchase.requestNumber)} · ${escapeHtml(purchase.supplierName)}</h2>
        <p><strong>Status:</strong> ${escapeHtml(purchase.status)} · <strong>Priority:</strong> ${escapeHtml(purchase.priority)} · <strong>PO:</strong> ${escapeHtml(purchase.purchaseOrderNumber || "Pending")}</p>
        <p><strong>Requested by:</strong> ${escapeHtml(purchase.requestedByName || "Unknown")} · <strong>Approved by:</strong> ${escapeHtml(purchase.approvedByName || "Pending")} · <strong>Ordered by:</strong> ${escapeHtml(purchase.orderedByName || "Pending")}</p>
        <table><thead><tr><th>Product</th><th>Requested</th><th>Approved</th><th>Ordered</th><th>Accepted</th><th>Issues</th></tr></thead><tbody>
          ${requestItems.map((item) => `<tr><td>${escapeHtml(item.productName)} (${escapeHtml(item.productCode)})</td><td>${item.requestedQuantity}</td><td>${item.approvedQuantity}</td><td>${item.orderedQuantity}</td><td>${item.receivedQuantity}</td><td>${item.damagedQuantity + item.rejectedQuantity}</td></tr>`).join("") || '<tr><td colspan="6">No items</td></tr>'}
        </tbody></table>
        <p><strong>Estimated value:</strong> ₹${Number(purchase.estimatedTotal).toLocaleString("en-IN")} · <strong>Expected:</strong> ${escapeHtml(purchase.expectedDeliveryDate || "Not set")}</p>
        <p><strong>Goods receipts:</strong> ${receiptsForRequest.map((receipt) => `${escapeHtml(receipt.receiptNumber)} — ${receipt.acceptedQuantity} accepted, ${receipt.issueQuantity} issues, received by ${escapeHtml(receipt.receivedByName || "Unknown")}`).join("; ") || "None"}</p>
        ${purchase.rejectionReason ? `<p><strong>Rejection:</strong> ${escapeHtml(purchase.rejectionReason)}</p>` : ""}
        ${purchase.cancellationReason ? `<p><strong>Cancellation:</strong> ${escapeHtml(purchase.cancellationReason)}</p>` : ""}
      </section>`;
    }).join("\n");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sanghvi ERP Daily Report ${businessDate}</title><style>
      body{font-family:Arial,sans-serif;max-width:1100px;margin:40px auto;padding:0 24px;color:#172033}h1{font-size:32px}h2{font-size:20px;margin-bottom:8px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card,.order{border:1px solid #dbe2ea;border-radius:16px;padding:18px;margin-bottom:18px}.card strong{display:block;font-size:28px;margin-top:8px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #dbe2ea;padding:8px;text-align:left}th{background:#f5f7fa}@media(max-width:700px){.summary{grid-template-columns:1fr 1fr}}</style></head><body>
      <h1>Sanghvi ERP Daily Business Archive</h1><p>Business date: <strong>${businessDate}</strong></p>
      <div class="summary"><div class="card">Orders<strong>${summary.orders}</strong></div><div class="card">Delivered<strong>${summary.deliveredOrders}</strong></div><div class="card">Order value<strong>₹${summary.orderValue.toLocaleString("en-IN")}</strong></div><div class="card">Collected<strong>₹${summary.collections.collected.toLocaleString("en-IN")}</strong></div></div>
      <div class="card"><h2>Alerts</h2><p>Critical: ${summary.alerts.critical} · Blockers: ${summary.alerts.blockers} · High alerts: ${summary.alerts.high}</p></div>
      <div class="card"><h2>Procurement summary</h2><p>Requests: ${summary.procurement.requests} · Estimated value: ₹${summary.procurement.estimatedValue.toLocaleString("en-IN")} · Accepted units: ${summary.procurement.acceptedUnits} · Issue units: ${summary.procurement.issueUnits}</p></div>
      ${orderSections || '<div class="card">No order activity was recorded for this date.</div>'}
      <h1>Supplier Purchases</h1>
      ${purchaseSections || '<div class="card">No supplier purchase activity was recorded for this date.</div>'}
      </body></html>`;

    const targetDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DAILY_ARCHIVE_DIR || "backups/daily-reports");
    await fs.mkdir(targetDir, { recursive: true });
    const fileName = `sanghvi-daily-${businessDate}.html`;
    const filePath = path.join(targetDir, fileName);
    const jsonPath = path.join(targetDir, `sanghvi-daily-${businessDate}.json`);
    await fs.writeFile(filePath, html, "utf8");
    await fs.writeFile(
      jsonPath,
      JSON.stringify({ summary, orders, items, assignments, proofs, purchases, purchaseItems, purchaseReceipts }, null, 2),
      "utf8",
    );
    const sha256 = createHash("sha256").update(html).digest("hex");

    await client.query(
      `UPDATE public."DailyBusinessArchive" SET "status"='SUCCESS',"fileName"=$2,"filePath"=$3,"sha256"=$4,"summary"=$5::jsonb,"generatedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "businessDate"=$1::date`,
      [businessDate, fileName, filePath, sha256, JSON.stringify(summary)],
    );
    return { businessDate, fileName, filePath, jsonPath, sha256, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.query(
      `UPDATE public."DailyBusinessArchive" SET "status"='FAILED',"errorMessage"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "businessDate"=$1::date`,
      [businessDate, message.slice(0, 2000)],
    ).catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}
