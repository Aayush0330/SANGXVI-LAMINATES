import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { formatIndiaPayrollDate, formatIndiaPayrollDateTime, getEmployeeRoleLabel, getStatusClass, getStatusLabel } from "@/lib/attendance-payroll";
import { prisma } from "@/lib/db";
import { getIndiaWorkDate } from "@/lib/office-attendance";
import { addLifecycleEventAction, decideAttendanceCorrectionAction, saveEmployeeProfileAction } from "./actions";

const input = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

type EmployeeRow = {
  id: string; name: string; email: string; phone: string | null; status: string; userRole: string;
  employeeCode: string | null; department: string | null; designation: string | null;
  employmentType: string | null; joiningDate: string | null; probationEndDate: string | null;
  reportingManagerId: string | null; reportingManagerName: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null;
  lastWorkingDate: string | null; notes: string | null; profileUpdatedAt: Date | string | null;
};
type LifecycleRow = { id: string; eventType: string; effectiveDate: string; title: string; details: string | null; previousValue: string | null; newValue: string | null; createdByName: string | null; createdAt: Date | string };
type CorrectionRow = { id: string; userId: string; userName: string; workDate: string; requestedPunchIn: Date | string; requestedPunchOut: Date | string; reason: string; status: string; requestedAt: Date | string };

function notice(error?: string, success?: string) {
  const ok: Record<string, string> = { "profile-saved": "Employee HR profile saved.", "lifecycle-added": "Employee lifecycle event recorded.", "correction-approved": "Attendance correction approved and applied.", "correction-rejected": "Attendance correction rejected." };
  const bad: Record<string, string> = { "permission-denied": "You do not have HR access.", "invalid-profile": "Check the employee profile details.", "invalid-probation": "Probation end date cannot be before joining date.", "invalid-exit-date": "Last working date cannot be before joining date.", "employee-not-found": "Employee was not found.", "manager-not-found": "Reporting manager is not available.", "self-manager": "An employee cannot report to themselves.", "employee-code-exists": "Employee code is already assigned.", "invalid-lifecycle": "Enter a valid lifecycle event.", "correction-not-found": "Correction request was not found.", "correction-already-decided": "Correction request is already decided.", "payroll-locked": "This payroll month is finalized and locked." };
  if (success) return { good: true, text: ok[success] ?? "Saved successfully." };
  if (error) return { good: false, text: bad[error] ?? "Unable to complete the action." };
  return null;
}
function statusTone(status: string) {
  return status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

export default async function HrCenterPage({ searchParams }: { searchParams?: Promise<{ employee?: string; q?: string; error?: string; success?: string }> }) {
  const { hasAccess } = await checkPermission("manage_hr", "/internal/hr");
  if (!hasAccess) return <AccessDeniedCard title="HR Center Access Denied" description="Only authorized HR managers can manage employee profiles and lifecycle history." backHref="/internal/dashboard" backLabel="Go to Dashboard" />;
  const params = await searchParams;
  const query = String(params?.q ?? "").trim().toLowerCase();
  const message = notice(params?.error, params?.success);
  const employees = await prisma.$queryRaw<EmployeeRow[]>`
    SELECT u."id", u."name", u."email", u."phone", u."status"::text AS "status",
      COALESCE((SELECT a."role"::text FROM public."UserRoleAssignment" a WHERE a."userId" = u."id" AND a."role"::text <> 'DEALER' ORDER BY a."isPrimary" DESC, a."createdAt" ASC LIMIT 1), NULLIF(u."role"::text, 'DEALER')) AS "userRole",
      profile."employeeCode", profile."department", profile."designation",
      profile."employmentType"::text AS "employmentType", profile."joiningDate",
      profile."probationEndDate", profile."reportingManagerId", profile."reportingManagerName",
      profile."emergencyContactName", profile."emergencyContactPhone", profile."lastWorkingDate",
      profile."notes", profile."updatedAt" AS "profileUpdatedAt"
    FROM public."User" u
    LEFT JOIN public."EmployeeProfile" profile ON profile."userId" = u."id"
    WHERE u."role"::text <> 'DEALER'
      OR EXISTS (SELECT 1 FROM public."UserRoleAssignment" a WHERE a."userId" = u."id" AND a."role"::text <> 'DEALER')
    ORDER BY CASE WHEN u."status"::text = 'ACTIVE' THEN 0 ELSE 1 END, u."name" ASC
  `;
  const filtered = employees.filter((employee) => !query || `${employee.name} ${employee.email} ${employee.employeeCode ?? ""} ${employee.department ?? ""} ${employee.designation ?? ""}`.toLowerCase().includes(query));
  const selected = employees.find((employee) => employee.id === params?.employee) ?? filtered[0] ?? employees[0] ?? null;
  const [lifecycle, corrections] = await Promise.all([
    selected ? prisma.$queryRaw<LifecycleRow[]>`
      SELECT "id", "eventType"::text AS "eventType", "effectiveDate", "title", "details",
        "previousValue", "newValue", "createdByName", "createdAt"
      FROM public."EmployeeLifecycleEvent" WHERE "userId" = ${selected.id}
      ORDER BY "effectiveDate" DESC, "createdAt" DESC LIMIT 100
    ` : Promise.resolve([] as LifecycleRow[]),
    prisma.$queryRaw<CorrectionRow[]>`
      SELECT request."id", request."userId", employee."name" AS "userName", request."workDate",
        request."requestedPunchIn", request."requestedPunchOut", request."reason",
        request."status"::text AS "status", request."requestedAt"
      FROM public."AttendanceCorrectionRequest" request
      INNER JOIN public."User" employee ON employee."id" = request."userId"
      WHERE request."status" = 'PENDING'::public."AttendanceRequestStatus"
      ORDER BY request."requestedAt" ASC
    `,
  ]);
  const activeManagers = employees.filter((employee) => employee.status === "ACTIVE");
  const today = getIndiaWorkDate();

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="h-1 bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400" /><div className="p-5 sm:p-8"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-300">Workforce Management</p><h1 className="mt-3 text-3xl font-black text-slate-950 dark:text-white sm:text-5xl">HR Center</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">Employee profiles, reporting lines, joining/exit history and attendance correction approvals.</p></div><div className="flex flex-wrap gap-3"><Link href="/internal/hr/reports" className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black dark:border-slate-700 dark:text-white">HR Reports</Link><Link href="/internal/users" className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black dark:border-slate-700 dark:text-white">Users</Link><Link href="/internal/attendance/payroll" className="inline-flex h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white dark:bg-white dark:text-slate-950">Payroll</Link></div></div></div></section>
    {message ? <div className={`rounded-2xl border p-4 text-sm font-bold ${message.good ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{message.text}</div> : null}

    <section className="grid gap-5 xl:grid-cols-[340px_1fr]">
      <aside className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><form className="flex gap-2"><input name="q" defaultValue={params?.q ?? ""} placeholder="Search employee" className={input} /><button className="rounded-xl bg-slate-950 px-3 text-xs font-black text-white dark:bg-white dark:text-slate-950">Search</button></form><div className="mt-4 max-h-[720px] space-y-2 overflow-y-auto">{filtered.map((employee) => <Link key={employee.id} href={`/internal/hr?employee=${employee.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`} className={`block rounded-2xl border p-3 transition ${selected?.id === employee.id ? "border-blue-300 bg-blue-50 dark:border-blue-400/30 dark:bg-blue-500/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}><div className="flex items-start justify-between gap-2"><div><p className="font-black text-slate-950 dark:text-white">{employee.name}</p><p className="mt-1 text-xs text-slate-500">{employee.employeeCode ?? "No employee code"} · {employee.department ?? getEmployeeRoleLabel(employee.userRole)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusTone(employee.status)}`}>{employee.status}</span></div></Link>)}</div></aside>

      {selected ? <div className="space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Employee Profile</p><h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{selected.name}</h2><p className="mt-1 text-sm text-slate-500">{selected.email} · {getEmployeeRoleLabel(selected.userRole)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${statusTone(selected.status)}`}>{selected.status}</span></div>
          <form action={saveEmployeeProfileAction} className="mt-6 grid gap-4 md:grid-cols-2"><input type="hidden" name="userId" value={selected.id} />
            <Field label="Employee Code"><input name="employeeCode" defaultValue={selected.employeeCode ?? ""} className={input} /></Field>
            <Field label="Employment Type"><select name="employmentType" defaultValue={selected.employmentType ?? "FULL_TIME"} className={input}>{["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "TEMPORARY"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Department"><input name="department" defaultValue={selected.department ?? ""} className={input} /></Field>
            <Field label="Designation"><input name="designation" defaultValue={selected.designation ?? ""} className={input} /></Field>
            <Field label="Joining Date"><input type="date" name="joiningDate" defaultValue={selected.joiningDate ?? ""} className={input} /></Field>
            <Field label="Probation End"><input type="date" name="probationEndDate" defaultValue={selected.probationEndDate ?? ""} className={input} /></Field>
            <Field label="Reporting Manager"><select name="reportingManagerId" defaultValue={selected.reportingManagerId ?? ""} className={input}><option value="">No reporting manager</option>{activeManagers.filter((employee) => employee.id !== selected.id).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></Field>
            <Field label="Last Working Date"><input type="date" name="lastWorkingDate" defaultValue={selected.lastWorkingDate ?? ""} className={input} /></Field>
            <Field label="Emergency Contact Name"><input name="emergencyContactName" defaultValue={selected.emergencyContactName ?? ""} className={input} /></Field>
            <Field label="Emergency Contact Phone"><input name="emergencyContactPhone" defaultValue={selected.emergencyContactPhone ?? ""} className={input} /></Field>
            <label className="md:col-span-2 text-xs font-black uppercase tracking-[0.15em] text-slate-500">HR Notes<textarea name="notes" defaultValue={selected.notes ?? ""} rows={4} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold normal-case tracking-normal outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <button className="md:col-span-2 h-12 rounded-2xl bg-blue-600 text-sm font-black text-white">Save Employee Profile</button>
          </form>
        </section>

        <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-black uppercase tracking-[0.2em] text-violet-600">Lifecycle Event</p><form action={addLifecycleEventAction} className="mt-4 grid gap-3"><input type="hidden" name="userId" value={selected.id} /><select name="eventType" className={input}>{["NOTE", "JOINED", "PROMOTED", "TRANSFERRED", "STATUS_CHANGED", "EXITED", "REACTIVATED", "PROFILE_UPDATED"].map((value) => <option key={value}>{value}</option>)}</select><input type="date" name="effectiveDate" defaultValue={today} required className={input} /><input name="title" required placeholder="Event title" className={input} /><input name="previousValue" placeholder="Previous value optional" className={input} /><input name="newValue" placeholder="New value optional" className={input} /><textarea name="details" rows={3} placeholder="Details" className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><button className="h-11 rounded-xl bg-violet-600 text-sm font-black text-white">Record Event</button></form></div><div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Employment Timeline</p><div className="mt-4 max-h-[500px] space-y-3 overflow-y-auto">{lifecycle.length === 0 ? <p className="text-sm text-slate-500">No lifecycle history yet.</p> : lifecycle.map((event) => <article key={event.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex justify-between gap-3"><div><p className="font-black dark:text-white">{event.title}</p><p className="mt-1 text-xs font-bold text-blue-600">{event.eventType.replaceAll("_", " ")} · {formatIndiaPayrollDate(event.effectiveDate)}</p></div></div>{event.details ? <p className="mt-3 text-sm text-slate-500">{event.details}</p> : null}{event.previousValue || event.newValue ? <p className="mt-2 text-xs text-slate-400">{event.previousValue ?? "—"} → {event.newValue ?? "—"}</p> : null}<p className="mt-2 text-xs text-slate-400">By {event.createdByName ?? "System"} · {formatIndiaPayrollDateTime(event.createdAt)}</p></article>)}</div></div></section>
      </div> : <div className="rounded-3xl border border-dashed border-slate-300 p-10 text-center text-slate-500">No employees found.</div>}
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600">Attendance Corrections</p><h2 className="mt-2 text-2xl font-black dark:text-white">Pending employee requests</h2></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{corrections.length}</span></div><div className="mt-5 grid gap-4 lg:grid-cols-2">{corrections.length === 0 ? <p className="text-sm text-slate-500">No pending correction requests.</p> : corrections.map((request) => <article key={request.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex justify-between gap-3"><div><p className="font-black dark:text-white">{request.userName}</p><p className="mt-1 text-xs text-slate-500">{request.workDate} · {formatIndiaPayrollDateTime(request.requestedPunchIn)} → {formatIndiaPayrollDateTime(request.requestedPunchOut)}</p></div><span className={`h-fit rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(request.status)}`}>{getStatusLabel(request.status)}</span></div><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{request.reason}</p><form action={decideAttendanceCorrectionAction} className="mt-4 grid gap-2"><input type="hidden" name="requestId" value={request.id} /><input name="decisionNote" placeholder="Decision note" className={input} /><div className="grid grid-cols-2 gap-2"><button name="decision" value="APPROVED" className="h-10 rounded-xl bg-emerald-600 text-xs font-black text-white">Approve & Apply</button><button name="decision" value="REJECTED" className="h-10 rounded-xl bg-rose-600 text-xs font-black text-white">Reject</button></div></form></article>)}</div></section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">{label}<div className="mt-2 normal-case tracking-normal">{children}</div></label>;
}
