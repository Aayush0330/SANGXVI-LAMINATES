import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";
import { getAppRolesFromUser } from "@/lib/user-role-utils";
import {
  formatDuration,
  formatIndiaTime,
  getAttendanceActionLabel,
  getAttendanceEventsForDate,
  getBreakTypeLabel,
  getEmployeeAttendanceRows,
  getEmployeeSessionEventsForDate,
  getIndiaWorkDate,
  type EmployeeAttendanceRow,
  type EmployeeSessionEventRow,
  type OfficeAttendanceEventRow,
} from "@/lib/office-attendance";
import { createReportDownloadResponse, getReportFormat } from "@/lib/report-export";

function isValidWorkDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getStatus(row: EmployeeAttendanceRow) {
  if (row.status === "REVIEW_REQUIRED") return { value: "REVIEW_REQUIRED", label: "Review Required" };
  if (row.punchOutAt || row.status === "COMPLETED") return { value: "COMPLETED", label: "Completed" };
  if (row.currentBreakType) return { value: "ON_BREAK", label: `On ${getBreakTypeLabel(row.currentBreakType)}` };
  if (row.punchInAt) return { value: "WORKING", label: "Currently Working" };
  return { value: "NOT_PUNCHED", label: "Not Punched In" };
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    map.set(value, [...(map.get(value) || []), row]);
  }
  return map;
}

function getSessionLabel(event: EmployeeSessionEventRow) {
  if (event.eventType === "LOGIN_SUCCESS") return "Login";
  return event.description?.toLowerCase().includes("all devices")
    ? "Automatic Logout - All Devices"
    : "Logout";
}

function formatTimeline(
  attendanceEvents: OfficeAttendanceEventRow[],
  sessionEvents: EmployeeSessionEventRow[],
) {
  return [
    ...attendanceEvents.map((event) => ({
      label: getAttendanceActionLabel(event.eventType),
      createdAt: event.createdAt,
    })),
    ...sessionEvents.map((event) => ({
      label: getSessionLabel(event),
      createdAt: event.createdAt,
    })),
  ]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((event) => `${formatIndiaTime(event.createdAt)} - ${event.label}`)
    .join(" | ");
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  if (!hasPermission(getAppRolesFromUser(session.user), "manage_attendance")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const requestedDate = request.nextUrl.searchParams.get("date");
  const workDate = isValidWorkDate(requestedDate) ? requestedDate! : getIndiaWorkDate();
  const selectedEmployee = request.nextUrl.searchParams.get("employee") || "ALL";
  const requestedStatus = request.nextUrl.searchParams.get("status") || "ALL";
  const allowedStatuses = new Set(["ALL", "COMPLETED", "WORKING", "ON_BREAK", "NOT_PUNCHED", "REVIEW_REQUIRED"]);
  const selectedStatus = allowedStatuses.has(requestedStatus) ? requestedStatus : "ALL";

  const [employees, attendanceEvents, sessionEvents] = await Promise.all([
    getEmployeeAttendanceRows(workDate),
    getAttendanceEventsForDate(workDate),
    getEmployeeSessionEventsForDate(workDate),
  ]);
  const attendanceById = groupBy(attendanceEvents, (event) => event.attendanceId);
  const sessionsByUser = groupBy(sessionEvents, (event) => event.userId);

  const filtered = employees.filter((employee) => {
    const status = getStatus(employee).value;
    return (
      (selectedEmployee === "ALL" || employee.userId === selectedEmployee) &&
      (selectedStatus === "ALL" || status === selectedStatus)
    );
  });

  const columns = [
    "Employee",
    "Email",
    "Role",
    "Work Date",
    "Status",
    "First Login",
    "Punch In",
    "Break Time",
    "Punch Out",
    "Session End",
    "All Devices Logged Out",
    "Total Office Time",
    "Net Work",
    "Complete Daily Timeline",
  ];

  const rows = filtered.map((employee) => {
    const employeeSessionEvents = sessionsByUser.get(employee.userId) || [];
    const firstLogin = employeeSessionEvents.find((event) => event.eventType === "LOGIN_SUCCESS");
    const lastLogout = [...employeeSessionEvents].reverse().find((event) => event.eventType === "LOGOUT");
    const allDevicesLoggedOut = Boolean(lastLogout?.description?.toLowerCase().includes("all devices"));
    const employeeAttendanceEvents = employee.attendanceId
      ? attendanceById.get(employee.attendanceId) || []
      : [];

    return [
      employee.userName,
      employee.userEmail,
      employee.userRole.replaceAll("_", " "),
      workDate,
      getStatus(employee).label,
      formatIndiaTime(firstLogin?.createdAt),
      formatIndiaTime(employee.punchInAt),
      formatDuration(employee.breakMinutes),
      formatIndiaTime(employee.punchOutAt),
      formatIndiaTime(lastLogout?.createdAt),
      allDevicesLoggedOut ? "Yes" : "No",
      formatDuration(employee.totalMinutes),
      formatDuration(employee.netWorkingMinutes),
      formatTimeline(employeeAttendanceEvents, employeeSessionEvents),
    ];
  });

  return createReportDownloadResponse(
    getReportFormat(request.nextUrl.searchParams.get("format")),
    {
      title: "Daily Employee Activity",
      subtitle: `Date: ${workDate} | Status: ${selectedStatus} | Employee: ${selectedEmployee === "ALL" ? "All employees" : filtered[0]?.userName || "Selected employee"}`,
      fileName: `daily-employee-activity-${workDate}`,
      columns,
      rows,
    },
  );
}
