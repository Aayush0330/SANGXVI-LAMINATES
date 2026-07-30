"use client";

import { type ReactNode, useMemo, useState } from "react";
import { updateAttendancePayProfileAction } from "@/app/internal/attendance/payroll/actions";

type PayrollEmployeeSetting = {
  userId: string;
  userName: string;
  roleLabel: string;
  monthlyBaseSalary: number;
  monthlyAllowance: number;
  monthlyDeduction: number;
  standardDailyMinutes: number;
  overtimeHourlyRate: number;
};

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-950 outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

const selectClass = `${inputClass} appearance-none`;

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.max(0, value || 0),
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
      {children}
    </label>
  );
}

export function PayrollSettingsForm({
  employees,
  initialEmployeeId = "",
  salaryCalendarDays,
  effectiveMonth,
}: {
  employees: PayrollEmployeeSetting[];
  initialEmployeeId?: string;
  salaryCalendarDays: number;
  effectiveMonth: string;
}) {
  const initialEmployee = useMemo(
    () => employees.find((employee) => employee.userId === initialEmployeeId),
    [employees, initialEmployeeId],
  );
  const [selectedId, setSelectedId] = useState(initialEmployee?.userId ?? "");
  const [monthlyBaseSalary, setMonthlyBaseSalary] = useState(
    initialEmployee ? String(initialEmployee.monthlyBaseSalary) : "",
  );
  const [monthlyAllowance, setMonthlyAllowance] = useState(
    initialEmployee ? String(initialEmployee.monthlyAllowance) : "",
  );
  const [monthlyDeduction, setMonthlyDeduction] = useState(
    initialEmployee ? String(initialEmployee.monthlyDeduction) : "",
  );
  const [standardMinutes, setStandardMinutes] = useState(
    String(initialEmployee?.standardDailyMinutes ?? 480),
  );
  const [overtimeRate, setOvertimeRate] = useState(
    initialEmployee ? String(initialEmployee.overtimeHourlyRate) : "",
  );

  const selectedEmployee = employees.find(
    (employee) => employee.userId === selectedId,
  );
  const monthlyEarnings =
    Math.max(0, Number(monthlyBaseSalary) || 0) +
    Math.max(0, Number(monthlyAllowance) || 0);

  function selectEmployee(userId: string) {
    const employee = employees.find((item) => item.userId === userId);
    setSelectedId(userId);
    setMonthlyBaseSalary(employee ? String(employee.monthlyBaseSalary) : "");
    setMonthlyAllowance(employee ? String(employee.monthlyAllowance) : "");
    setMonthlyDeduction(employee ? String(employee.monthlyDeduction) : "");
    setStandardMinutes(String(employee?.standardDailyMinutes ?? 480));
    setOvertimeRate(employee ? String(employee.overtimeHourlyRate) : "");
  }

  return (
    <form action={updateAttendancePayProfileAction} className="mt-5 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <div>
          <FieldLabel>Employee</FieldLabel>
          <select
            name="userId"
            required
            value={selectedId}
            onChange={(event) => selectEmployee(event.target.value)}
            className={selectClass}
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.userId} value={employee.userId}>
                {employee.userName} · {employee.roleLabel}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel>Effective Month</FieldLabel>
          <input
            name="effectiveMonth"
            type="month"
            defaultValue={effectiveMonth}
            required
            className={inputClass}
          />
          <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-400">
            Starts on day one. Finalized months remain locked.
          </p>
        </div>
      </div>

      {selectedEmployee ? (
        <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-xs font-bold leading-5 text-blue-800 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-[10px] font-black text-white">
            {selectedEmployee.userName
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <span>
            Editing {selectedEmployee.userName}
            <span className="block text-[10px] font-semibold text-blue-600/70 dark:text-blue-200/60">
              {selectedEmployee.roleLabel}
            </span>
          </span>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-xs font-semibold leading-5 text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400">
          Select an employee to load the active salary structure.
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Compensation
            </p>
            <p className="mt-1 text-[11px] font-semibold text-slate-400">
              Monthly fixed components
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500 dark:bg-white/10 dark:text-slate-300">
            INR
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div>
            <FieldLabel>Base Salary (₹)</FieldLabel>
            <input
              name="monthlyBaseSalary"
              type="number"
              min="0"
              step="1"
              required
              value={monthlyBaseSalary}
              onChange={(event) => setMonthlyBaseSalary(event.target.value)}
              placeholder="30000"
              className={inputClass}
            />
          </div>

          <div>
            <FieldLabel>Allowance (₹)</FieldLabel>
            <input
              name="monthlyAllowance"
              type="number"
              min="0"
              step="1"
              value={monthlyAllowance}
              onChange={(event) => setMonthlyAllowance(event.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>

          <div>
            <FieldLabel>Fixed Deduction (₹)</FieldLabel>
            <input
              name="monthlyDeduction"
              type="number"
              min="0"
              step="1"
              value={monthlyDeduction}
              onChange={(event) => setMonthlyDeduction(event.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>

          <div>
            <FieldLabel>Daily Minutes</FieldLabel>
            <input
              name="standardDailyMinutes"
              type="number"
              min="60"
              step="1"
              required
              value={standardMinutes}
              onChange={(event) => setStandardMinutes(event.target.value)}
              className={inputClass}
            />
            <p className="mt-2 text-[10px] font-semibold text-slate-400">
              480 minutes equals 8 hours.
            </p>
          </div>

          <div className="sm:col-span-2 xl:col-span-1">
            <FieldLabel>Overtime Rate / Hour (₹)</FieldLabel>
            <input
              name="overtimeHourlyRate"
              type="number"
              min="0"
              step="1"
              value={overtimeRate}
              onChange={(event) => setOvertimeRate(event.target.value)}
              placeholder="0 = automatic hourly equivalent"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Structure Preview
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-white/10">
          <div className="p-4">
            <p className="text-[10px] font-semibold text-slate-400">
              Monthly earnings
            </p>
            <p className="mt-1 text-lg font-black tracking-tight text-slate-950 dark:text-white">
              ₹{formatAmount(monthlyEarnings)}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[10px] font-semibold text-slate-400">
              Per calendar day
            </p>
            <p className="mt-1 text-lg font-black tracking-tight text-blue-700 dark:text-blue-300">
              ₹
              {formatAmount(
                monthlyEarnings / Math.max(1, salaryCalendarDays),
              )}
            </p>
          </div>
          <div className="col-span-2 flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-white/10">
            <span className="text-[10px] font-semibold text-slate-400">
              Fixed deduction
            </span>
            <span className="text-sm font-black text-rose-600 dark:text-rose-300">
              ₹{formatAmount(Number(monthlyDeduction) || 0)}
            </span>
          </div>
        </div>
      </div>

      <button className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-black text-white shadow-[0_8px_20px_rgba(37,99,235,0.18)] transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 3h12l2 2v16H5z" />
          <path d="M8 3v6h8V3M8 21v-7h8v7" />
        </svg>
        Save Salary Structure
      </button>
    </form>
  );
}
