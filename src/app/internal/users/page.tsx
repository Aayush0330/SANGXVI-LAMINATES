import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { PasswordInput } from "@/components/password-input";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { UserRole, UserStatus } from "@/generated/prisma/client";
import { createUserAction, resetUserPasswordAction } from "./actions";

function SelectArrow() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center">
      <svg
        className="h-5 w-5 text-slate-300"
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

const roleLabels: Record<UserRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  ACCOUNTANT: "Accountant",
  INVENTORY_TEAM: "Inventory Team",
  DISPATCH_TEAM: "Dispatch Team",
  QC_TEAM: "QC Team",
  DRIVER_TRANSPORT: "Driver / Transport",
  COLLECTION_TEAM: "Collection Team",
  SALES_FIELD_TEAM: "Sales / Field Team",
  DEALER: "Dealer",
};

const portalLabels: Record<UserRole, string> = {
  OWNER: "Internal ERP",
  MANAGER: "Internal ERP",
  ACCOUNTANT: "Internal ERP",
  INVENTORY_TEAM: "Internal ERP",
  DISPATCH_TEAM: "Internal ERP",
  QC_TEAM: "Internal ERP",
  DRIVER_TRANSPORT: "Field / Mobile",
  COLLECTION_TEAM: "Field / Mobile",
  SALES_FIELD_TEAM: "Field / Mobile",
  DEALER: "Dealer Portal",
};

const roleOptions = Object.values(UserRole);
const statusOptions = Object.values(UserStatus);

function getStatusLabel(status: UserStatus) {
  if (status === "ACTIVE") {
    return "Active";
  }

  return "Inactive";
}

function getStatusClass(status: UserStatus) {
  if (status === "ACTIVE") {
    return "bg-emerald-300/10 text-emerald-300";
  }

  return "bg-red-300/10 text-red-300";
}

function getPasswordStatusLabel(mustChangePassword?: boolean | null) {
  if (mustChangePassword) {
    return "Change Required";
  }

  return "Password Active";
}

function getPasswordStatusClass(mustChangePassword?: boolean | null) {
  if (mustChangePassword) {
    return "bg-yellow-300/10 text-yellow-300";
  }

  return "bg-emerald-300/10 text-emerald-300";
}

function getUserManagementMessage(
  error?: string,
  success?: string,
  email?: string
) {
  if (success === "user-created") {
    return {
      type: "success",
      text: "User created successfully. The user must change password on first login.",
    };
  }

  if (success === "password-reset") {
    return {
      type: "success",
      text: "Password reset successfully. Existing sessions were signed out, and the user can log in directly with the new password.",
    };
  }

  if (error === "duplicate-email") {
    return {
      type: "error",
      text: email
        ? `A user with ${email} already exists. Use Quick Password Reset instead.`
        : "A user with this email already exists. Use Quick Password Reset instead.",
    };
  }

  if (error === "missing-fields") {
    return {
      type: "error",
      text: "Full name, email, password, and role are required.",
    };
  }

  if (error === "weak-password") {
    return {
      type: "error",
      text: "Password must be at least 8 characters.",
    };
  }

  if (error === "missing-password-reset-fields") {
    return {
      type: "error",
      text: "Please select a user and enter a new password.",
    };
  }

  if (error === "user-not-found") {
    return {
      type: "error",
      text: "Selected user was not found.",
    };
  }

  if (error === "invalid-role") {
    return {
      type: "error",
      text: "Please select a valid role.",
    };
  }

  if (error === "invalid-status") {
    return {
      type: "error",
      text: "Please select a valid status.",
    };
  }

  if (error === "permission-denied") {
    return {
      type: "error",
      text: "You do not have permission to manage users.",
    };
  }

  return null;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    email?: string;
  }>;
}) {
  const params = await searchParams;

  const message = getUserManagementMessage(
    params?.error,
    params?.success,
    params?.email
  );

  const { hasAccess } = await checkPermission("manage_users", "/internal/users");

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

  const users = await prisma.user.findMany({
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
  const dealerUsers = users.filter((user) => user.role === "DEALER").length;
  const passwordChangePending = users.filter(
    (user) => user.mustChangePassword
  ).length;

  const userStats = [
    {
      label: "Total Users",
      value: String(totalUsers),
    },
    {
      label: "Active Users",
      value: String(activeUsers),
    },
    {
      label: "Dealer Accounts",
      value: String(dealerUsers),
    },
    {
      label: "Password Change Pending",
      value: String(passwordChangePending),
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300 sm:text-sm">
            User Management
          </p>

          <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl md:text-5xl">
            Team & Access Control
          </h1>

          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-300 sm:mt-4 sm:text-sm sm:leading-6">
            Create employees, dealers, drivers, and team members. Each user
            receives portal and module access based on their assigned role.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
          <Link
            href="/account/change-password"
            className="rounded-2xl border border-white/10 px-5 py-3 text-center text-sm font-bold text-slate-200 transition hover:bg-white/[0.04]"
          >
            My Password
          </Link>

          <a
            href="#create-user-form"
            className="rounded-2xl bg-cyan-300 px-5 py-3 text-center text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
          >
            + Add New User
          </a>
        </div>
      </div>

      {message && (
        <div
          className={`mt-8 rounded-2xl border px-5 py-4 text-sm font-semibold ${
            message.type === "success"
              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-300"
              : "border-red-300/20 bg-red-300/10 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-5 xl:grid-cols-4">
        {userStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:rounded-3xl sm:p-6"
          >
            <p className="text-sm text-slate-400">{stat.label}</p>
            <h2 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl">
              {stat.value}
            </h2>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.05] p-4 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
              Quick Password Reset
            </p>

            <h2 className="mt-2 text-2xl font-bold">Select user and reset</h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Use this instead of scrolling inside the table. Select any user,
              set a new password, and the user can log in with it directly.
              Existing sessions are signed out automatically.
            </p>
          </div>

          <form
            action={resetUserPasswordAction}
            className="grid w-full gap-4 xl:max-w-3xl xl:grid-cols-[1.4fr_1fr_auto]"
          >
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Select User
              </label>

              <div className="relative">
                <select
                  name="userId"
                  className="h-14 w-full appearance-none rounded-2xl border border-white/10 bg-slate-900 px-4 pr-14 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
                  required
                >
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
              placeholder="New password"
              autoComplete="new-password"
            />

            <div className="xl:self-end">
              <button
                type="submit"
                className="h-14 w-full rounded-2xl bg-cyan-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 xl:w-auto"
              >
                Reset Password
              </button>
            </div>
          </form>
        </div>
      </section>

      <div className="mt-8 grid gap-6 2xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,2.2fr)]">
        <div
          id="create-user-form"
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:rounded-3xl sm:p-6"
        >
          <h2 className="text-xl font-bold">Create User</h2>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Add a new system user and assign the correct role. New users must
            change their password on first login.
          </p>

          <form action={createUserAction} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Full Name
              </label>

              <input
                name="name"
                type="text"
                placeholder="Example: Amit Sharma"
                className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Email
              </label>

              <input
                name="email"
                type="email"
                placeholder="user@sangxvi.com"
                className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                required
              />
            </div>

            <PasswordInput
              name="password"
              label="Password"
              placeholder="Temporary password"
              autoComplete="new-password"
            />

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Phone Number
              </label>

              <input
                name="phone"
                type="text"
                placeholder="+91 98765 43210"
                className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Assign Role
              </label>

              <div className="relative">
                <select
                  name="role"
                  className="h-14 w-full appearance-none rounded-2xl border border-white/10 bg-slate-900 px-4 pr-14 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
                  required
                >
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
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Status
              </label>

              <div className="relative">
                <select
                  name="status"
                  className="h-14 w-full appearance-none rounded-2xl border border-white/10 bg-slate-900 px-4 pr-14 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
                  required
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {getStatusLabel(status)}
                    </option>
                  ))}
                </select>

                <SelectArrow />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
            >
              Save User
            </button>
          </form>
        </div>

        <div className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 p-4 sm:p-6">
            <h2 className="text-xl font-bold">Users List</h2>
            <p className="mt-2 text-sm text-slate-400">
              Password reset is handled from the Quick Password Reset panel
              above, so this table stays easy to scan.
            </p>
          </div>

          <div className="grid gap-3 p-4 xl:hidden">
            {users.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-6 text-center text-sm text-slate-400">
                No users found in the database.
              </div>
            ) : (
              users.map((user) => (
                <article
                  key={`mobile-${user.id}`}
                  className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-white">
                        {user.name}
                      </h3>
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {user.email}
                      </p>
                    </div>

                    <span
                      className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${getStatusClass(
                        user.status
                      )}`}
                    >
                      {getStatusLabel(user.status)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Role
                      </p>
                      <p className="mt-2 text-xs font-bold text-cyan-300">
                        {roleLabels[user.role]}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Portal
                      </p>
                      <p className="mt-2 text-xs font-bold text-slate-100">
                        {portalLabels[user.role]}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Password
                      </p>
                      <p
                        className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${getPasswordStatusClass(
                          user.mustChangePassword
                        )}`}
                      >
                        {getPasswordStatusLabel(user.mustChangePassword)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Phone
                      </p>
                      <p className="mt-2 text-xs font-bold text-slate-100">
                        {user.phone || "Not provided"}
                      </p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="hidden max-w-full overflow-x-auto overscroll-x-contain xl:block">
            <table className="w-full min-w-[800px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[29%]" />
                <col className="w-[21%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="px-4 py-4 font-semibold">User</th>
                  <th className="px-4 py-4 font-semibold">Role</th>
                  <th className="px-4 py-4 font-semibold">Portal</th>
                  <th className="px-4 py-4 font-semibold">Status</th>
                  <th className="px-4 py-4 font-semibold">Password</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/10">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-5">
                      <div className="max-w-[260px]">
                        <p className="font-bold text-white">{user.name}</p>
                        <p className="mt-1 break-words text-xs text-slate-500">
                          {user.email}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {user.phone || "No phone"}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-5">
                      <span className="inline-flex whitespace-nowrap rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                        {roleLabels[user.role]}
                      </span>
                    </td>

                    <td className="px-4 py-5">{portalLabels[user.role]}</td>

                    <td className="px-4 py-5">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                          user.status
                        )}`}
                      >
                        {getStatusLabel(user.status)}
                      </span>
                    </td>

                    <td className="px-4 py-5">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${getPasswordStatusClass(
                          user.mustChangePassword
                        )}`}
                      >
                        {getPasswordStatusLabel(user.mustChangePassword)}
                      </span>
                    </td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-slate-400"
                    >
                      No users found in the database.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <h2 className="text-xl font-bold">How password reset works</h2>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white/[0.04] p-5">
            <p className="font-semibold text-cyan-300">1. Owner selects user</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Use the Quick Password Reset panel to select the employee, dealer,
              or field user.
            </p>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-5">
            <p className="font-semibold text-cyan-300">2. New password</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Owner sets the user&apos;s new password. Old sessions are signed out
              automatically.
            </p>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-5">
            <p className="font-semibold text-cyan-300">3. User logs in</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              User logs in directly with the password set by the owner. No
              additional password-change step is required.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
