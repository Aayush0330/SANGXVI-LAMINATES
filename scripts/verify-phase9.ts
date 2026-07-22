import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { prisma } from "../src/lib/db";

// Next bundles this helper for encoding Server Action arguments.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import rscClient from "../node_modules/next/dist/compiled/react-server-dom-webpack/client.node.js";

const baseUrl = process.env.PHASE9_BASE_URL ?? "http://127.0.0.1:3109";
const marker = `PHASE9-E2E-${Date.now()}-${randomUUID().slice(0, 8)}`;
const employeeEmail = `${marker.toLowerCase()}@example.test`;
const correctionDate = "1998-11-02";
const finalizedMonth = "1998-12";
const finalizedDate = `${finalizedMonth}-02`;
const startedAt = new Date();

type ManifestEntry = { exportedName: string };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

async function actionIds() {
  const raw = await readFile(".next/server/server-reference-manifest.json", "utf8");
  const manifest = JSON.parse(raw) as { node: Record<string, ManifestEntry> };
  return Object.fromEntries(
    Object.entries(manifest.node).map(([id, entry]) => [entry.exportedName, id]),
  );
}

async function callAction(path: string, actionId: string, cookie: string, form: FormData) {
  const body = await rscClient.encodeReply([form]);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "text/x-component",
      cookie: `sangxvi_session=${cookie}`,
      "next-action": actionId,
    },
    body,
    redirect: "manual",
  });
  const responseBody = await response.text();
  assert(response.status < 500, `${path} action failed (${response.status}): ${responseBody.slice(0, 400)}`);
  return response;
}

async function getPage(path: string, cookie?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { cookie: `sangxvi_session=${cookie}` } : undefined,
    redirect: "manual",
  });
  const body = await response.text();
  assert(response.status === 200, `${path} returned ${response.status}: ${body.slice(0, 300)}`);
  return { response, body };
}

async function cleanup(employeeId: string | null) {
  const run = await prisma.payrollRun.findUnique({ where: { monthKey: finalizedMonth } });
  if (run) await prisma.payrollRun.delete({ where: { id: run.id } });
  if (employeeId) {
    await prisma.attendanceSalaryRevision.deleteMany({ where: { userId: employeeId } });
    await prisma.notification.deleteMany({
      where: {
        OR: [
          { actorUserId: employeeId },
          { recipients: { some: { userId: employeeId } } },
          { message: { contains: marker } },
        ],
      },
    });
    await prisma.securityAuditLog.deleteMany({
      where: {
        createdAt: { gte: startedAt },
        OR: [
          { userId: employeeId },
          { userEmail: employeeEmail },
          { description: { contains: marker } },
        ],
      },
    });
    await prisma.attendanceCorrectionRequest.deleteMany({ where: { userId: employeeId } });
    await prisma.employeeLifecycleEvent.deleteMany({ where: { userId: employeeId } });
    await prisma.employeeProfile.deleteMany({ where: { userId: employeeId } });
    await prisma.user.delete({ where: { id: employeeId } });
  }
}

async function main() {
  let employeeId: string | null = null;
  try {
    const staleEmployees = await prisma.user.findMany({
      where: {
        email: { startsWith: "phase9-e2e-", endsWith: "@example.test" },
      },
      select: { id: true },
    });
    for (const staleEmployee of staleEmployees) {
      await cleanup(staleEmployee.id);
    }

    const owner = await prisma.user.findFirst({
      where: {
        status: "ACTIVE",
        OR: [{ role: "OWNER" }, { roleAssignments: { some: { role: "OWNER" } } }],
      },
      select: { id: true },
    });
    assert(owner, "No active owner is available for Phase 9 verification.");

    const employee = await prisma.user.create({
      data: {
        name: marker,
        email: employeeEmail,
        role: "MANAGER",
        status: "ACTIVE",
        geofenceMode: "ANYWHERE",
        roleAssignments: {
          create: { role: "MANAGER", isPrimary: true, assignedById: owner.id },
        },
      },
    });
    employeeId = employee.id;
    const [ownerToken, employeeToken, ids] = await Promise.all([
      createSession(owner.id),
      createSession(employee.id),
      actionIds(),
    ]);

    for (const name of [
      "saveEmployeeProfileAction",
      "updateAttendancePayProfileAction",
      "requestAttendanceCorrectionAction",
      "decideAttendanceCorrectionAction",
      "finalizePayrollAction",
      "updatePayrollPaymentAction",
    ]) {
      assert(ids[name], `Missing Server Action id for ${name}`);
    }

    const login = await getPage("/login");
    assert(login.body.includes("Sanghvi ERP"), "Correct Sanghvi branding is missing from login.");
    assert(!login.body.includes("Sangxvi ERP"), "Old visible Sangxvi branding remains on login.");
    await getPage("/internal/hr", ownerToken);
    await getPage("/internal/attendance/payroll", ownerToken);

    const profile = new FormData();
    profile.set("userId", employee.id);
    profile.set("employeeCode", marker);
    profile.set("department", "Verification");
    profile.set("designation", "Phase 9 Tester");
    profile.set("employmentType", "FULL_TIME");
    profile.set("joiningDate", "1998-01-01");
    profile.set("reportingManagerId", owner.id);
    profile.set("notes", marker);
    await callAction("/internal/hr", ids.saveEmployeeProfileAction, ownerToken, profile);
    const savedProfile = await prisma.employeeProfile.findUnique({ where: { userId: employee.id } });
    assert(savedProfile?.employeeCode === marker, "Employee HR profile was not saved.");
    assert(
      (await prisma.employeeLifecycleEvent.count({ where: { userId: employee.id } })) > 0,
      "Employee lifecycle history was not created.",
    );

    const salary = new FormData();
    salary.set("userId", employee.id);
    salary.set("effectiveMonth", finalizedMonth);
    salary.set("monthlyBaseSalary", "30000");
    salary.set("monthlyAllowance", "2500");
    salary.set("monthlyDeduction", "750");
    salary.set("standardDailyMinutes", "480");
    salary.set("overtimeHourlyRate", "200");
    await callAction(
      "/internal/attendance/payroll",
      ids.updateAttendancePayProfileAction,
      ownerToken,
      salary,
    );
    const payProfile = await prisma.attendancePayProfile.findUnique({ where: { userId: employee.id } });
    assert(payProfile?.monthlyAllowance.toNumber() === 2500, "Salary allowance was not persisted.");
    assert(payProfile?.monthlyDeduction.toNumber() === 750, "Salary deduction was not persisted.");

    const correction = new FormData();
    correction.set("workDate", correctionDate);
    correction.set("requestedPunchIn", `${correctionDate}T09:00`);
    correction.set("requestedPunchOut", `${correctionDate}T18:00`);
    correction.set("reason", marker);
    await callAction(
      "/account/attendance/corrections",
      ids.requestAttendanceCorrectionAction,
      employeeToken,
      correction,
    );
    const request = await prisma.attendanceCorrectionRequest.findFirst({
      where: { userId: employee.id, workDate: correctionDate },
    });
    assert(request?.status === "PENDING", "Attendance correction request was not created.");

    const decision = new FormData();
    decision.set("requestId", request.id);
    decision.set("decision", "APPROVED");
    decision.set("decisionNote", marker);
    await callAction("/internal/hr", ids.decideAttendanceCorrectionAction, ownerToken, decision);
    const approved = await prisma.attendanceCorrectionRequest.findUnique({ where: { id: request.id } });
    assert(approved?.status === "APPROVED", "Attendance correction was not approved.");
    assert(
      await prisma.officeAttendance.findUnique({
        where: { userId_workDate: { userId: employee.id, workDate: correctionDate } },
      }),
      "Approved correction did not create attendance.",
    );

    const finalize = new FormData();
    finalize.set("monthKey", finalizedMonth);
    await callAction(
      "/internal/attendance/payroll",
      ids.finalizePayrollAction,
      ownerToken,
      finalize,
    );
    const run = await prisma.payrollRun.findUnique({ where: { monthKey: finalizedMonth } });
    assert(run?.status === "FINALIZED", "Payroll run was not finalized.");
    const item = await prisma.payrollRunItem.findUnique({
      where: { payrollRunId_userId: { payrollRunId: run.id, userId: employee.id } },
    });
    assert(item, "Finalized payroll item was not created for the employee.");

    const payment = new FormData();
    payment.set("payrollItemId", item.id);
    payment.set("monthKey", finalizedMonth);
    payment.set("paymentStatus", "PAID");
    payment.set("paymentReference", marker);
    await callAction(
      "/internal/attendance/payroll",
      ids.updatePayrollPaymentAction,
      ownerToken,
      payment,
    );
    const paidItem = await prisma.payrollRunItem.findUnique({ where: { id: item.id } });
    assert(paidItem?.paymentStatus === "PAID" && paidItem.paidAt, "Payroll payment was not recorded.");

    await getPage(`/account/attendance/payslips/${finalizedMonth}`, employeeToken);
    await getPage(
      `/internal/attendance/payroll/payslip/${employee.id}?month=${finalizedMonth}`,
      ownerToken,
    );
    const payrollExport = await getPage(
      `/internal/attendance/payroll/export?month=${finalizedMonth}`,
      ownerToken,
    );
    assert(payrollExport.body.includes(marker), "Payroll export is missing the test employee.");
    const hrExport = await getPage(`/internal/hr/reports/export?month=${finalizedMonth}`, ownerToken);
    assert(hrExport.body.includes(marker), "HR export is missing the test employee.");

    const lockedCorrection = new FormData();
    lockedCorrection.set("workDate", finalizedDate);
    lockedCorrection.set("requestedPunchIn", `${finalizedDate}T09:00`);
    lockedCorrection.set("requestedPunchOut", `${finalizedDate}T18:00`);
    lockedCorrection.set("reason", marker);
    await callAction(
      "/account/attendance/corrections",
      ids.requestAttendanceCorrectionAction,
      employeeToken,
      lockedCorrection,
    );
    assert(
      !(await prisma.attendanceCorrectionRequest.findFirst({
        where: { userId: employee.id, workDate: finalizedDate },
      })),
      "Finalized payroll month accepted an attendance correction.",
    );

    console.log("Phase 9 authenticated verification passed.");
  } finally {
    await cleanup(employeeId);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
