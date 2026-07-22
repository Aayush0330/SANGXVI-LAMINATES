import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { PasswordInput } from "@/components/password-input";
import { TeamFeedbackToast, type TeamFeedbackMessage } from "@/components/team-feedback-toast";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { UserRole, UserStatus } from "@/generated/prisma/client";
import {
  createUserAction,
  resetUserPasswordAction,
} from "./actions";
import { UsersDirectoryClient } from "./users-directory-client";

const roleLabels: Record<UserRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  ACCOUNTANT: "Accountant",

  DISPATCH_TEAM: "Physical Dispatch Team",
  ORDER_TEAM: "Order Receiving Team",
  QC_TEAM: "QC Team",
  DRIVER_TRANSPORT: "Driver / Transport",
  COLLECTION_TEAM: "Collection Team",
  SALES_FIELD_TEAM: "Sales / Field Team",
  DEALER: "Dealer",
};

const roleOptions = Object.values(UserRole);
const statusOptions = Object.values(UserStatus);

const inputClass =
  "h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

const selectClass = `${inputClass} appearance-none pr-12`;

const labelClass =
  "mb-2 block text-xs font-black uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400";

function SelectArrow() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center">
      <svg
        className="h-5 w-5 text-slate-500 dark:text-slate-400"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 7.5L10 12.5L15 7.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function getStatusLabel(status: UserStatus) {
  if (status === "ACTIVE") return "Active";
  if (status === "FORMER_EMPLOYEE") return "Former Employee";
  return "Inactive";
}

function getMessage(error?: string, success?: string): TeamFeedbackMessage | null {
  const successMessages: Record<string, TeamFeedbackMessage> = {
    "user-created": {
      type: "success",
      title: "User created",
      text: "The user can log in with the temporary password and must replace it immediately.",
    },
    "user-updated": {
      type: "success",
      title: "User saved",
      text: "User profile, access, and portal details have been updated.",
    },
    "user-disabled": {
      type: "success",
      title: "User disabled",
      text: "User access has been disabled and active sessions were cleared.",
    },
    "password-reset": {
      type: "success",
      title: "Password reset",
      text: "Existing sessions were signed out. The user can log in with the new password.",
    },
    "user-archived": {
      type: "success",
      title: "User archived",
      text: "Login access was stopped while historical work was preserved.",
    },
  };

  const errorMessages: Record<string, TeamFeedbackMessage> = {
    "duplicate-email": {
      type: "error",
      title: "Email already exists",
      text: "Another user already has this email address.",
    },
    "missing-fields": {
      type: "error",
      title: "Missing details",
      text: "Full name, email, password, role, and status are required.",
    },
    "update-missing-fields": {
      type: "error",
      title: "Update incomplete",
      text: "User, name, email, role, and status are required.",
    },
    "weak-password": {
      type: "error",
      title: "Weak password",
      text: "Use at least 12 characters with uppercase, lowercase, number and symbol.",
    },
    "missing-password-reset-fields": {
      type: "error",
      title: "Password reset incomplete",
      text: "Please select a user and enter a new password.",
    },
    "user-not-found": {
      type: "error",
      title: "User not found",
      text: "The selected user does not exist anymore.",
    },
    "invalid-role": {
      type: "error",
      title: "Invalid role",
      text: "Please select a valid ERP role.",
    },
    "invalid-status": {
      type: "error",
      title: "Invalid status",
      text: "Please select a valid user status.",
    },
    "permission-denied": {
      type: "error",
      title: "Access denied",
      text: "Your current role cannot manage users.",
    },
    "cannot-change-own-access": {
      type: "error",
      title: "Self access protected",
      text: "You cannot change your own role or disable your own account from this page.",
    },
    "cannot-delete-own-account": {
      type: "error",
      title: "Current account protected",
      text: "You cannot delete the account you are currently using.",
    },
    "last-owner-required": {
      type: "error",
      title: "Owner required",
      text: "At least one active owner account must remain in the ERP.",
    },
  };

  if (success && successMessages[success]) {
    return successMessages[success];
  }

  if (error && errorMessages[error]) {
    return errorMessages[error];
  }

  return null;
}

function isRole(value?: string): value is UserRole {
  return Boolean(value && roleOptions.includes(value as UserRole));
}

function isStatus(value?: string): value is UserStatus {
  return Boolean(value && statusOptions.includes(value as UserStatus));
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    q?: string;
    role?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);
  const { currentUser, hasAccess } = await checkPermission("manage_users", "/internal/users");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="User Management Access Denied"
        description="Your current role does not have permission to create, update, or manage system users."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const selectedRole = isRole(params?.role) ? params?.role : "ALL";
  const selectedStatus = isStatus(params?.status) ? params?.status : "ALL";

  const users = await prisma.user.findMany({
    include: { roleAssignments: true },
    orderBy: [
      {
        role: "asc",
      },
      {
        name: "asc",
      },
    ],
  });

  const totalUsers = users.length;
  const activeUsers = users.filter((user) => user.status === "ACTIVE").length;
  const inactiveUsers = users.filter((user) => user.status === "INACTIVE").length;
  const dealerUsers = users.filter((user) => user.role === "DEALER").length;
  const passwordChangePending = users.filter((user) => user.mustChangePassword).length;

  const userStats = [
    ["Total Users", totalUsers, "text-slate-950 dark:text-slate-100"],
    ["Active Users", activeUsers, "text-emerald-700 dark:text-emerald-300"],
    ["Inactive Users", inactiveUsers, "text-rose-700 dark:text-rose-300"],
    ["Dealer Accounts", dealerUsers, "text-blue-700 dark:text-cyan-300"],
    ["Password Pending", passwordChangePending, "text-amber-700 dark:text-amber-300"],
  ] as const;

  return (
    <div className="space-y-8">
      <TeamFeedbackToast message={message} />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-blue-600 dark:text-cyan-300">
              Access Control
            </p>

            <h1 className="mt-3 text-4xl font-black text-slate-950 dark:text-slate-100 md:text-5xl">
              Users & Roles
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Create users, assign ERP roles, disable access, reset temporary passwords,
              and keep an audit trail for every access change.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/account/change-password"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              My Password
            </Link>

            <a
              href="#create-user-form"
              className="rounded-2xl bg-blue-600 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300"
            >
              + Add User
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {userStats.map(([label, value, color]) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
            <p className={`mt-3 text-3xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.3fr)]">
        <div
          id="create-user-form"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
        >
          <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600 dark:text-cyan-300">
            Create Account
          </p>

          <h2 className="mt-3 text-2xl font-black text-slate-950 dark:text-slate-100">
            Add new user
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            New users get an active password and can log in directly.
          </p>

          <form action={createUserAction} className="mt-6 space-y-4">
            <div>
              <label className={labelClass}>Full Name</label>
              <input
                name="name"
                type="text"
                placeholder="User full name"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input
                name="email"
                type="email"
                placeholder="user@sanghvi.com"
                className={inputClass}
                required
              />
            </div>

            <PasswordInput
              name="password"
              label="Temporary Password"
              placeholder="12+ characters with number and symbol"
              autoComplete="new-password"
            />

            <div>
              <label className={labelClass}>Phone Number</label>
              <input
                name="phone"
                type="text"
                placeholder="Phone number"
                className={inputClass}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Role</label>
                <div className="relative">
                  <select name="primaryRole" className={selectClass} required defaultValue="MANAGER">
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                  <SelectArrow />
                </div>
              </div>

              <div>
                <label className={labelClass}>Status</label>
                <div className="relative">
                  <select name="status" className={selectClass} required defaultValue="ACTIVE">
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {getStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                  <SelectArrow />
                </div>
              </div>
            </div>


            <div>
              <label className={labelClass}>Additional Roles</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {roleOptions.map((role) => (
                  <label key={role} className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold dark:border-slate-700">
                    <input type="checkbox" name="roles" value={role} /> {roleLabels[role]}
                  </label>
                ))}
              </div>
            </div>
            <div><label className={labelClass}>Attendance Location</label><div className="relative"><select name="geofenceMode" className={selectClass} defaultValue="OFFICE_REQUIRED"><option value="OFFICE_REQUIRED">Office Geofence Required</option><option value="ANYWHERE">Work From Anywhere</option></select><SelectArrow /></div></div>
            <button
              type="submit"
              className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300"
            >
              Create User
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-6 dark:border-cyan-400/20 dark:bg-cyan-400/5">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600 dark:text-cyan-300">
            Password Reset
          </p>

          <h2 className="mt-3 text-2xl font-black text-slate-950 dark:text-slate-100">
            Reset access safely
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Resetting a password signs out existing sessions. Use direct login unless you explicitly need a forced password change.
          </p>

          <form action={resetUserPasswordAction} className="mt-6 grid gap-4 xl:grid-cols-[1.25fr_1fr_0.9fr_auto] xl:items-end">
            <div>
              <label className={labelClass}>Select User</label>
              <div className="relative">
                <select name="userId" className={selectClass} required defaultValue="">
                  <option value="">Choose user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} — {user.email} — {roleLabels[user.role]}
                    </option>
                  ))}
                </select>
                <SelectArrow />
              </div>
            </div>

            <PasswordInput
              name="password"
              label="New Password"
              placeholder="12+ characters with number and symbol"
              autoComplete="new-password"
            />

            <div>
              <label className={labelClass}>Login Rule</label>
              <div className="relative">
                <select name="mustChangePassword" className={selectClass} defaultValue="false">
                  <option value="false">Password active</option>
                  <option value="true">Require change</option>
                </select>
                <SelectArrow />
              </div>
            </div>

            <button
              type="submit"
              className="h-14 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300"
            >
              Reset
            </button>
          </form>
        </div>
      </section>

      <UsersDirectoryClient
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          roles: [...new Set([user.role, ...user.roleAssignments.map((item) => item.role)])],
          status: user.status,
          geofenceMode: user.geofenceMode,
          archivedAt: user.archivedAt?.toISOString() ?? null,
          exitReason: user.exitReason,
          mustChangePassword: user.mustChangePassword,
        }))}
        currentUserId={currentUser.id}
        roleOptions={roleOptions}
        statusOptions={statusOptions}
        initialQuery={params?.q ?? ""}
        initialRole={selectedRole}
        initialStatus={selectedStatus}
      />
    </div>
  );
}
