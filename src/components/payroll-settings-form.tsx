"use client";

import { useMemo, useState } from "react";
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
  "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

const selectClass = `${inputClass} appearance-none`;

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.max(0, value || 0),
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
    <form action={updateAttendancePayProfileAction} className="mt-6 grid gap-4">
      <div>
        <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Employee
        </label>
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
        <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Effective Month
        </label>
        <input
          name="effectiveMonth"
          type="month"
          defaultValue={effectiveMonth}
          required
          className={inputClass}
        />
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
          The structure starts on the first day of this month. Finalized months stay locked.
        </p>
      </div>

      {selectedEmployee ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold leading-5 text-blue-800 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
          Saved settings are loaded below for {selectedEmployee.userName}.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Monthly Base Salary (₹)
          </label>
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
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Monthly Allowance (₹)
          </label>
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
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Fixed Monthly Deduction (₹)
          </label>
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
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Standard Daily Minutes
          </label>
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
          <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            480 minutes = 8 hours.
          </p>
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Overtime Hourly Rate (₹)
          </label>
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

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Salary Preview
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">Monthly earnings</p>
            <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">₹{formatAmount(monthlyEarnings)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">Per calendar day</p>
            <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
              ₹{formatAmount(monthlyEarnings / Math.max(1, salaryCalendarDays))}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">Fixed deduction</p>
            <p className="mt-1 text-lg font-black text-rose-600 dark:text-rose-300">
              ₹{formatAmount(Number(monthlyDeduction) || 0)}
            </p>
          </div>
        </div>
      </div>

      <button className="h-12 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
        Save Salary Structure
      </button>
    </form>
  );
}
