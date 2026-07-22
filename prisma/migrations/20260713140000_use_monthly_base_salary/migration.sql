-- Store the employee's monthly base salary and derive the per-day rate using
-- the business-standard 26 working days shown in the approved payroll sample.
ALTER TABLE public."AttendancePayProfile"
RENAME COLUMN "dailySalary" TO "monthlyBaseSalary";
