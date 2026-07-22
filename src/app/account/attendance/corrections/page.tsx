import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { formatIndiaPayrollDateTime, getStatusClass, getStatusLabel } from "@/lib/attendance-payroll";
import { getIndiaWorkDate } from "@/lib/office-attendance";
import { requestAttendanceCorrectionAction } from "./actions";

const input = "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

type Row = { id: string; workDate: string; requestedPunchIn: Date | string; requestedPunchOut: Date | string; reason: string; status: string; requestedAt: Date | string; decidedByName: string | null; decidedAt: Date | string | null; decisionNote: string | null };

function message(error?: string, success?: string) {
  if (success === "request-sent") return { good: true, text: "Attendance correction request sent." };
  const map: Record<string, string> = { "permission-denied": "Attendance correction is not available.", "invalid-request": "Enter valid punch times and a clear reason.", "future-date": "Future attendance cannot be corrected.", "date-mismatch": "Punch times must be on the selected work date.", "payroll-locked": "This payroll month is finalized and locked.", "already-pending": "A correction request for this date is already pending." };
  return error ? { good: false, text: map[error] ?? "Could not submit the request." } : null;
}

export default async function CorrectionsPage({ searchParams }: { searchParams?: Promise<{ error?: string; success?: string }> }) {
  const { currentUser, hasAccess } = await checkPermission("use_office_attendance", "/account/attendance/corrections");
  if (!hasAccess || currentUser.roles.includes("dealer")) return <AccessDeniedCard title="Correction Request Not Available" description="This page is available to company employees." backHref="/account/attendance" backLabel="Back to Attendance" />;
  const params = await searchParams;
  const notice = message(params?.error, params?.success);
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT "id", "workDate", "requestedPunchIn", "requestedPunchOut", "reason",
      "status"::text AS "status", "requestedAt", "decidedByName", "decidedAt", "decisionNote"
    FROM public."AttendanceCorrectionRequest"
    WHERE "userId" = ${currentUser.id}
    ORDER BY "requestedAt" DESC
    LIMIT 50
  `;
  const today = getIndiaWorkDate();
  return <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950"><div className="mx-auto max-w-5xl space-y-6"><section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600">Attendance Self-Service</p><h1 className="mt-3 text-3xl font-black text-slate-950 dark:text-white">Correction Requests</h1><p className="mt-2 text-sm text-slate-500">Request a missing or incorrect punch correction. Finalized payroll months remain locked.</p></div><Link href="/account/attendance" className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black dark:border-slate-700 dark:text-white">Back to Attendance</Link></div></section>{notice ? <div className={`rounded-2xl border p-4 text-sm font-bold ${notice.good ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{notice.text}</div> : null}<section className="grid gap-6 lg:grid-cols-[380px_1fr]"><form action={requestAttendanceCorrectionAction} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-xl font-black dark:text-white">New request</h2><div className="mt-5 grid gap-4"><label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Work date<input name="workDate" type="date" max={today} required className={`mt-2 ${input}`} /></label><label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Correct punch in<input name="requestedPunchIn" type="datetime-local" required className={`mt-2 ${input}`} /></label><label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Correct punch out<input name="requestedPunchOut" type="datetime-local" required className={`mt-2 ${input}`} /></label><label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Reason<textarea name="reason" required minLength={5} rows={4} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Explain what was missed or incorrect" /></label><button className="h-12 rounded-2xl bg-blue-600 text-sm font-black text-white">Send Request</button></div></form><div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-xl font-black dark:text-white">Request history</h2><div className="mt-5 space-y-3">{rows.length === 0 ? <p className="text-sm text-slate-500">No correction requests yet.</p> : rows.map((row) => <article key={row.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-black dark:text-white">{row.workDate}</p><p className="mt-1 text-xs text-slate-500">{formatIndiaPayrollDateTime(row.requestedPunchIn)} → {formatIndiaPayrollDateTime(row.requestedPunchOut)}</p></div><span className={`h-fit rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(row.status)}`}>{getStatusLabel(row.status)}</span></div><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{row.reason}</p>{row.decisionNote ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500 dark:bg-slate-950">Decision: {row.decisionNote}</p> : null}<p className="mt-3 text-xs text-slate-400">Requested {formatIndiaPayrollDateTime(row.requestedAt)}{row.decidedAt ? ` · Decided ${formatIndiaPayrollDateTime(row.decidedAt)} by ${row.decidedByName ?? "manager"}` : ""}</p></article>)}</div></div></section></div></main>;
}
