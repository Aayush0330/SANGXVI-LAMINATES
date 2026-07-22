import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { prisma } from "../src/lib/db";
import { readAndValidateDeliveryProof } from "../src/lib/delivery-proof";
import { isStrongEnoughPassword } from "../src/lib/password";

// Next bundles this helper for encoding Server Action arguments.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import rscClient from "../node_modules/next/dist/compiled/react-server-dom-webpack/client.node.js";

const baseUrl = process.env.PHASE10_BASE_URL ?? "http://127.0.0.1:3110";
const marker = `PHASE10-${Date.now()}-${randomUUID().slice(0, 8)}`;
const startedAt = new Date();
const payrollMonth = "1997-10";

type Role =
  | "OWNER"
  | "MANAGER"
  | "ACCOUNTANT"
  | "DISPATCH_TEAM"
  | "ORDER_TEAM"
  | "QC_TEAM"
  | "DRIVER_TRANSPORT"
  | "COLLECTION_TEAM"
  | "SALES_FIELD_TEAM"
  | "DEALER";

type ManifestEntry = { exportedName: string };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function actionIds() {
  const raw = await readFile(".next/server/server-reference-manifest.json", "utf8");
  const manifest = JSON.parse(raw) as { node: Record<string, ManifestEntry> };
  return Object.fromEntries(
    Object.entries(manifest.node).map(([id, entry]) => [entry.exportedName, id]),
  );
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return token;
}

async function get(path: string, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { cookie: `sangxvi_session=${token}` } : undefined,
    redirect: "manual",
  });
  const body = await response.text();
  return { response, body };
}

async function expectAllowed(path: string, token: string) {
  const result = await get(path, token);
  assert(result.response.status === 200, `${path} returned ${result.response.status}`);
  assert(!/access denied|do not have permission|cannot view/i.test(result.body), `${path} was unexpectedly denied`);
  return result.body;
}

async function expectDenied(path: string, token: string, secret?: string) {
  const result = await get(path, token);
  assert(
    result.response.status === 401 ||
      result.response.status === 403 ||
      /access denied|do not have permission|cannot view|not available/i.test(result.body),
    `${path} exposed an unauthorized page (${result.response.status})`,
  );
  if (secret) assert(!result.body.includes(secret), `${path} leaked protected data`);
}

async function callAction(path: string, id: string, token: string, form: FormData) {
  const body = await rscClient.encodeReply([form]);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "text/x-component",
      cookie: `sangxvi_session=${token}`,
      "next-action": id,
    },
    body,
    redirect: "manual",
  });
  const responseBody = await response.text();
  assert(response.status < 500, `${path} action failed (${response.status}): ${responseBody.slice(0, 400)}`);
  return response;
}

async function main() {
  const testUsers: string[] = [];
  let purchaseRequestId: string | null = null;
  let productId: string | null = null;
  let categoryId: string | null = null;
  let brandId: string | null = null;
  let orderId: string | null = null;
  let workTeamId: string | null = null;
  let transportOptionId: string | null = null;

  try {
    const owner = await prisma.user.findFirst({
      where: {
        status: "ACTIVE",
        OR: [{ role: "OWNER" }, { roleAssignments: { some: { role: "OWNER" } } }],
      },
      select: { id: true },
    });
    assert(owner, "No active owner exists for Phase 10 verification.");

    const roles: Role[] = [
      "MANAGER",
      "ACCOUNTANT",
      "DISPATCH_TEAM",
      "ORDER_TEAM",
      "QC_TEAM",
      "DRIVER_TRANSPORT",
      "COLLECTION_TEAM",
      "SALES_FIELD_TEAM",
      "DEALER",
      "DEALER",
    ];
    const created = await Promise.all(
      roles.map((role, index) =>
        prisma.user.create({
          data: {
            name: `${marker}-${role}-${index}`,
            email: `${marker.toLowerCase()}-${role.toLowerCase()}-${index}@example.test`,
            role,
            status: "ACTIVE",
            geofenceMode: "ANYWHERE",
            roleAssignments: {
              create: { role, isPrimary: true, assignedById: owner.id },
            },
          },
        }),
      ),
    );
    testUsers.push(...created.map((user) => user.id));

    const byRole = (role: Role, offset = 0) =>
      created.filter((user) => user.role === role)[offset];
    const manager = byRole("MANAGER");
    const accountant = byRole("ACCOUNTANT");
    const dispatch = byRole("DISPATCH_TEAM");
    const orderTeam = byRole("ORDER_TEAM");
    const qc = byRole("QC_TEAM");
    const driver = byRole("DRIVER_TRANSPORT");
    const collection = byRole("COLLECTION_TEAM");
    const sales = byRole("SALES_FIELD_TEAM");
    const dealerA = byRole("DEALER", 0);
    const dealerB = byRole("DEALER", 1);
    const dealerABusiness = `${marker}-Dealer-A-Business`;
    const dealerBBusiness = `${marker}-Dealer-B-Business`;
    await prisma.dealerProfile.createMany({
      data: [
        { dealerId: dealerA.id, businessName: dealerABusiness },
        { dealerId: dealerB.id, businessName: dealerBBusiness },
      ],
    });

    const usersForTokens = [owner, manager, accountant, dispatch, orderTeam, qc, driver, collection, sales, dealerA];
    const tokens = new Map<string, string>();
    await Promise.all(
      usersForTokens.map(async (user) => tokens.set(user.id, await createSession(user.id))),
    );
    const token = (user: { id: string }) => {
      const value = tokens.get(user.id);
      assert(value, `Missing token for ${user.id}`);
      return value;
    };

    const ids = await actionIds();
    for (const name of [
      "createSupplierAction",
      "updateSupplierAction",
      "updateDealerProfileAction",
      "createPurchaseRequestAction",
      "approvePurchaseRequestAction",
      "markPurchaseOrderedAction",
      "markPurchaseInTransitAction",
      "receivePurchaseStockAction",
      "createDealerOrderAction",
      "confirmOrderReceivedAction",
      "assignPhysicalTeamsAction",
      "startPhysicalCheckAction",
      "completePhysicalCheckAction",
      "approveQcAction",
      "assignTransportFromQcAction",
      "markOnTheWayAction",
      "markDeliveredAction",
    ]) {
      assert(ids[name], `Missing Server Action id for ${name}`);
    }

    const anonymous = await get("/internal/users");
    assert([302, 303, 307, 308].includes(anonymous.response.status), "Protected route did not redirect anonymous user");
    assert((anonymous.response.headers.get("location") ?? "").includes("/login"), "Anonymous redirect did not target login");

    await expectAllowed("/internal/users", token(owner));
    await expectDenied("/internal/users", token(manager), manager.email);
    await expectDenied("/internal/security", token(manager));
    await expectDenied("/internal/backups", token(manager));
    const backupDownload = await get("/internal/backups/download", token(manager));
    assert(backupDownload.response.status === 403, "Manager could generate a full database backup");
    await expectAllowed("/internal/attendance/payroll", token(accountant));
    await expectAllowed("/internal/dispatch", token(dispatch));
    await expectDenied("/internal/inventory", token(dispatch));
    await expectAllowed("/internal/order-receiving", token(orderTeam));
    await expectAllowed("/internal/qc", token(qc));
    await expectAllowed("/field/deliveries", token(driver));
    await expectDenied("/internal/hr", token(driver));
    await expectAllowed("/field/collections", token(collection));
    await expectAllowed("/field/visits", token(sales));
    await expectDenied("/internal/hr", token(dealerA));

    const dealerProfile = await expectAllowed("/dealer/profile", token(dealerA));
    assert(dealerProfile.includes(dealerABusiness), "Dealer could not see own profile");
    assert(!dealerProfile.includes(dealerBBusiness), "Dealer saw another dealer profile");
    await expectDenied(`/internal/dealers/${dealerB.id}`, token(dealerA), dealerBBusiness);

    const payrollRun = await prisma.payrollRun.create({
      data: {
        monthKey: payrollMonth,
        status: "FINALIZED",
        finalizedAt: new Date(),
        finalizedById: owner.id,
        finalizedByName: marker,
      },
    });
    await prisma.payrollRunItem.createMany({
      data: [driver, manager].map((user, index) => ({
        payrollRunId: payrollRun.id,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        monthlyBaseSalary: 10000 + index,
        perDaySalary: 333,
        standardDailyMinutes: 480,
        overtimeHourlyRate: 0,
        fullDays: 1,
        halfDays: 0,
        paidLeaveDays: 0,
        paidSundayDays: 0,
        paidHolidayDays: 0,
        payableDays: 1,
        overtimeMinutes: 0,
        grossSalary: 333,
        overtimePay: 0,
        approvedAdvance: 0,
        netPay: 333 + index,
      })),
    });
    const ownPayslip = await expectAllowed(`/account/attendance/payslips/${payrollMonth}`, token(driver));
    assert(ownPayslip.includes(driver.name), "Employee own payslip was not visible");
    await expectDenied(
      `/internal/attendance/payroll/payslip/${manager.id}?month=${payrollMonth}`,
      token(driver),
      manager.name,
    );
    const payrollExport = await get(`/internal/attendance/payroll/export?month=${payrollMonth}`, token(dealerA));
    assert(payrollExport.response.status === 403, "Dealer could export payroll data");
    const securityExport = await get("/internal/security/export", token(manager));
    assert(securityExport.response.status === 403, "Manager could export owner security logs");

    const unauthorizedSupplier = new FormData();
    unauthorizedSupplier.set("code", `${marker}-DENIED`);
    unauthorizedSupplier.set("companyName", `${marker}-Denied Supplier`);
    unauthorizedSupplier.set("defaultLeadTimeDays", "1");
    await callAction("/internal/suppliers", ids.createSupplierAction, token(dealerA), unauthorizedSupplier);
    assert(
      !(await prisma.supplier.findUnique({ where: { code: `${marker}-DENIED` } })),
      "Unauthorized dealer created a supplier",
    );

    const archivedSupplier = await prisma.supplier.create({
      data: { code: `${marker}-SUP`, companyName: `${marker}-Archived Supplier`, isActive: false },
    });
    const supplierUpdate = new FormData();
    supplierUpdate.set("supplierId", archivedSupplier.id);
    supplierUpdate.set("code", archivedSupplier.code);
    supplierUpdate.set("companyName", `${marker}-ILLEGAL-EDIT`);
    supplierUpdate.set("defaultLeadTimeDays", "5");
    await callAction(`/internal/suppliers/${archivedSupplier.id}`, ids.updateSupplierAction, token(owner), supplierUpdate);
    const unchangedSupplier = await prisma.supplier.findUnique({ where: { id: archivedSupplier.id } });
    assert(unchangedSupplier?.companyName === archivedSupplier.companyName, "Archived supplier was editable");

    await prisma.user.update({ where: { id: dealerB.id }, data: { status: "INACTIVE", archivedAt: new Date() } });
    const dealerUpdate = new FormData();
    dealerUpdate.set("dealerId", dealerB.id);
    dealerUpdate.set("contactName", `${marker}-Illegal Dealer Edit`);
    dealerUpdate.set("businessName", `${marker}-Illegal Business Edit`);
    dealerUpdate.set("email", dealerB.email);
    dealerUpdate.set("creditLimit", "0");
    dealerUpdate.set("openingBalance", "0");
    await callAction(`/internal/dealers/${dealerB.id}`, ids.updateDealerProfileAction, token(owner), dealerUpdate);
    const unchangedDealer = await prisma.dealerProfile.findUnique({ where: { dealerId: dealerB.id } });
    assert(unchangedDealer?.businessName === dealerBBusiness, "Archived dealer was editable");

    const [category, brand] = await Promise.all([
      prisma.productCategory.create({ data: { name: `${marker}-Category` } }),
      prisma.productBrand.create({ data: { name: `${marker}-Brand` } }),
    ]);
    categoryId = category.id;
    brandId = brand.id;
    const product = await prisma.product.create({
      data: {
        code: `${marker}-PRODUCT`,
        name: `${marker}-Product`,
        categoryId: category.id,
        brandId: brand.id,
        stack: "QA",
        quantity: 0,
        blocked: 0,
        minimumStock: 0,
        maximumStock: 100,
        purchasePrice: 10,
        sellingPrice: 120,
        dealerPrice: 100,
        gstRate: 18,
      },
    });
    productId = product.id;
    const supplier = await prisma.supplier.create({
      data: { code: `${marker}-RECV-SUP`, companyName: `${marker}-Receiving Supplier` },
    });
    await prisma.productSupplier.create({
      data: { productId: product.id, supplierId: supplier.id, minimumOrderQuantity: 1 },
    });
    const createPurchase = new FormData();
    createPurchase.set("supplierId", supplier.id);
    createPurchase.set("priority", "NORMAL");
    createPurchase.set("itemsJson", JSON.stringify([{ productId: product.id, quantity: 5, unitPrice: 10 }]));
    await callAction("/internal/reorder", ids.createPurchaseRequestAction, token(manager), createPurchase);
    const submittedPurchase = await prisma.purchaseRequest.findFirstOrThrow({
      where: { supplierId: supplier.id, requestedById: manager.id, status: "SUBMITTED" },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    const approvePurchase = new FormData();
    approvePurchase.set("requestId", submittedPurchase.id);
    approvePurchase.set(`approved_${submittedPurchase.items[0].id}`, "5");
    await callAction("/internal/reorder", ids.approvePurchaseRequestAction, token(owner), approvePurchase);
    const orderPurchase = new FormData();
    orderPurchase.set("requestId", submittedPurchase.id);
    orderPurchase.set("purchaseOrderNumber", `${marker}-PO`);
    await callAction("/internal/reorder", ids.markPurchaseOrderedAction, token(manager), orderPurchase);
    const transitPurchase = new FormData();
    transitPurchase.set("requestId", submittedPurchase.id);
    transitPurchase.set("supplierInvoiceNumber", `${marker}-INV`);
    await callAction("/internal/reorder", ids.markPurchaseInTransitAction, token(manager), transitPurchase);
    const purchase = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: submittedPurchase.id },
      include: { items: true },
    });
    assert(purchase.status === "IN_TRANSIT", `Purchase workflow stopped at ${purchase.status}`);
    purchaseRequestId = purchase.id;
    const receiveForm = () => {
      const form = new FormData();
      form.set("requestId", purchase.id);
      form.set(`received_${purchase.items[0].id}`, "5");
      form.set(`damaged_${purchase.items[0].id}`, "0");
      form.set(`rejected_${purchase.items[0].id}`, "0");
      form.set(`unitCost_${purchase.items[0].id}`, "10");
      return form;
    };
    await Promise.all([
      callAction("/internal/reorder", ids.receivePurchaseStockAction, token(owner), receiveForm()),
      callAction("/internal/reorder", ids.receivePurchaseStockAction, token(owner), receiveForm()),
    ]);
    const [receivedProduct, receiptCount] = await Promise.all([
      prisma.product.findUnique({ where: { id: product.id } }),
      prisma.purchaseReceipt.count({ where: { purchaseRequestId: purchase.id } }),
    ]);
    assert(receivedProduct?.quantity === 5, `Duplicate receipt changed stock to ${receivedProduct?.quantity}`);
    assert(receiptCount === 1, `Duplicate receipt created ${receiptCount} receipts`);

    const workTeam = await prisma.workTeam.create({
      data: {
        name: `${marker}-Physical Team`,
        teamType: "PHYSICAL_DISPATCH",
        members: { create: { userId: dispatch.id, role: "LEAD", addedById: owner.id } },
      },
    });
    workTeamId = workTeam.id;
    const transportOption = await prisma.transportOption.create({
      data: { name: `${marker}-Transport`, createdById: owner.id, createdByName: marker },
    });
    transportOptionId = transportOption.id;
    await prisma.dealerCart.create({
      data: {
        dealerId: dealerA.id,
        notes: marker,
        items: {
          create: {
            productId: product.id,
            quantity: 2,
            unitPriceSnapshot: 100,
            gstRateSnapshot: 18,
            priceSourceSnapshot: "DEALER_PRICE",
          },
        },
      },
    });
    const cart = await prisma.dealerCart.findUniqueOrThrow({ where: { dealerId: dealerA.id } });
    const placeOrder = new FormData();
    placeOrder.set("cartVersion", String(cart.version));
    await callAction("/dealer/place-order", ids.createDealerOrderAction, token(dealerA), placeOrder);
    const order = await prisma.order.findFirstOrThrow({
      where: { dealerId: dealerA.id, notes: marker },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    orderId = order.id;
    const receiveOrder = new FormData();
    receiveOrder.set("orderId", order.id);
    receiveOrder.set("receivingNotes", marker);
    await callAction("/internal/order-receiving", ids.confirmOrderReceivedAction, token(orderTeam), receiveOrder);
    const assignTeam = new FormData();
    assignTeam.set("orderId", order.id);
    for (const item of order.items) assignTeam.set(`teamId__${item.id}`, workTeam.id);
    await callAction("/internal/order-receiving", ids.assignPhysicalTeamsAction, token(orderTeam), assignTeam);
    const assignment = await prisma.orderPhysicalAssignment.findFirstOrThrow({
      where: { orderId: order.id },
      include: { items: true },
    });
    const startCheck = new FormData();
    startCheck.set("assignmentId", assignment.id);
    await callAction("/internal/dispatch", ids.startPhysicalCheckAction, token(dispatch), startCheck);
    const completeCheck = new FormData();
    completeCheck.set("assignmentId", assignment.id);
    for (const item of assignment.items) {
      completeCheck.set(`verifiedQuantity__${item.id}`, String(item.assignedQuantity));
      completeCheck.set(`damagedQuantity__${item.id}`, "0");
    }
    await callAction("/internal/dispatch", ids.completePhysicalCheckAction, token(dispatch), completeCheck);
    const approveQc = new FormData();
    approveQc.set("orderId", order.id);
    approveQc.set("qcNotes", marker);
    await callAction("/internal/qc", ids.approveQcAction, token(qc), approveQc);
    const assignTransport = new FormData();
    assignTransport.set("orderId", order.id);
    assignTransport.set("driverId", driver.id);
    assignTransport.set("transportOptionId", transportOption.id);
    await callAction("/internal/qc", ids.assignTransportFromQcAction, token(qc), assignTransport);
    const onTheWay = new FormData();
    onTheWay.set("orderId", order.id);
    await callAction("/field/deliveries", ids.markOnTheWayAction, token(driver), onTheWay);
    const delivered = new FormData();
    delivered.set("orderId", order.id);
    await callAction("/field/deliveries", ids.markDeliveredAction, token(driver), delivered);
    const [completedOrder, completedProduct] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } }),
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ]);
    assert(completedOrder.status === "DELIVERED", `Dealer workflow stopped at ${completedOrder.status}`);
    assert(completedOrder.items[0].deliveredQuantity === 2, "Delivered quantity was not finalized");
    assert(completedProduct.quantity === 3 && completedProduct.blocked === 0, "Delivery stock reconciliation failed");

    const fakeJpeg = new File([new Uint8Array(32)], "fake.jpg", { type: "image/jpeg" });
    const invalidProof = await readAndValidateDeliveryProof(fakeJpeg, "");
    assert(invalidProof.error === "invalid-proof-content", "Invalid upload signature was accepted");
    const oversized = new File([new Uint8Array(3 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    const oversizedProof = await readAndValidateDeliveryProof(oversized, "");
    assert(oversizedProof.error === "proof-too-large", "Oversized proof was accepted");
    assert(!isStrongEnoughPassword("Sanghvi@123"), "Known demo password still passes policy");
    assert(isStrongEnoughPassword("Launch#Safe2026"), "Strong production password failed policy");

    const deniedAuditCount = await prisma.securityAuditLog.count({
      where: {
        createdAt: { gte: startedAt },
        eventType: "ACCESS_DENIED",
        userId: { in: testUsers },
      },
    });
    assert(deniedAuditCount >= 5, "Important access denials were not captured in audit logs");

    console.log("Phase 10 permissions, isolation, upload and duplicate-click verification passed.");
  } finally {
    if (orderId) await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.dealerCart.deleteMany({ where: { dealerId: { in: testUsers } } });
    if (transportOptionId) await prisma.transportOption.deleteMany({ where: { id: transportOptionId } });
    if (workTeamId) await prisma.workTeam.deleteMany({ where: { id: workTeamId } });
    const receiptIds = purchaseRequestId
      ? (await prisma.purchaseReceipt.findMany({
          where: { purchaseRequestId },
          select: { id: true },
        })).map((row) => row.id)
      : [];
    if (receiptIds.length) {
      await prisma.notification.deleteMany({
        where: { dedupeKey: { in: receiptIds.map((id) => `purchase-receipt:${id}`) } },
      });
      await prisma.purchaseReceiptItem.deleteMany({ where: { purchaseReceiptId: { in: receiptIds } } });
      await prisma.purchaseReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    }
    if (purchaseRequestId) await prisma.purchaseRequest.deleteMany({ where: { id: purchaseRequestId } });
    if (productId) await prisma.productSupplier.deleteMany({ where: { productId } });
    await prisma.supplier.deleteMany({ where: { code: { startsWith: marker } } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.productCategory.deleteMany({ where: { id: categoryId } });
    if (brandId) await prisma.productBrand.deleteMany({ where: { id: brandId } });
    await prisma.payrollRun.deleteMany({ where: { monthKey: payrollMonth } });
    await prisma.notification.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: testUsers } },
          { recipients: { some: { userId: { in: testUsers } } } },
          { message: { contains: marker } },
        ],
      },
    });
    await prisma.securityAuditLog.deleteMany({
      where: {
        createdAt: { gte: startedAt },
        OR: [
          { userId: { in: testUsers } },
          { userEmail: { endsWith: "@example.test" } },
          { description: { contains: marker } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: testUsers } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
