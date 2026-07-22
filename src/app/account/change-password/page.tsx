import { redirect } from "next/navigation";
import { PasswordInput } from "@/components/password-input";
import { getPortalLandingPath } from "@/lib/current-user";
import { getMustChangePassword } from "@/lib/password-change-state";
import { getCurrentSession } from "@/lib/session";
import type { UserRole as PrismaUserRole } from "@/generated/prisma/client";
import { changeOwnPasswordAction } from "./actions";

const prismaRoleToAppRole: Record<
  PrismaUserRole,
  Parameters<typeof getPortalLandingPath>[0]
> = {
  OWNER: "owner",
  MANAGER: "manager",
  ACCOUNTANT: "accountant",

  DISPATCH_TEAM: "dispatch_team",
  ORDER_TEAM: "order_team",
  QC_TEAM: "qc_team",
  DRIVER_TRANSPORT: "driver_transport",
  COLLECTION_TEAM: "collection_team",
  SALES_FIELD_TEAM: "sales_field_team",
  DEALER: "dealer",
};

function getMessage(error?: string, reason?: string) {
  if (reason === "required") {
    return {
      type: "warning",
      text: "You must change your password before continuing.",
    };
  }

  if (error === "missing-fields") {
    return {
      type: "error",
      text: "Current password, new password, and confirm password are required.",
    };
  }

  if (error === "current-password-wrong") {
    return {
      type: "error",
      text: "Current password is incorrect.",
    };
  }

  if (error === "weak-password") {
    return {
      type: "error",
      text: "Use at least 12 characters with uppercase, lowercase, number and symbol.",
    };
  }

  if (error === "password-mismatch") {
    return {
      type: "error",
      text: "New password and confirm password do not match.",
    };
  }

  if (error === "same-password") {
    return {
      type: "error",
      text: "New password must be different from your current password.",
    };
  }

  if (error === "password-not-set") {
    return {
      type: "error",
      text: "Password is not set for this account. Please contact the owner.",
    };
  }

  return null;
}

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    reason?: string;
  }>;
}) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login?error=session-required");
  }

  const mustChangePassword = await getMustChangePassword(session.user.id);
  const params = await searchParams;
  const message = getMessage(params?.error, params?.reason);
  const canSkip = !mustChangePassword;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10 text-slate-950">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-200/70">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">
          Account Security
        </p>

        <h1 className="text-3xl font-bold">Change Password</h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          Update your password to keep your ERP account secure.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-950">{session.user.name}</p>
          <p className="mt-1 text-xs text-slate-500">{session.user.email}</p>
        </div>

        {message && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <form action={changeOwnPasswordAction} className="mt-8 space-y-5">
          <PasswordInput
            name="currentPassword"
            label="Current Password"
            placeholder="Enter current password"
            autoComplete="current-password"
          />

          <PasswordInput
            name="newPassword"
            label="New Password"
            placeholder="12+ characters with number and symbol"
            autoComplete="new-password"
          />

          <PasswordInput
            name="confirmPassword"
            label="Confirm New Password"
            placeholder="Re-enter new password"
            autoComplete="new-password"
          />

          <button
            type="submit"
            className="h-14 w-full rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            Update Password
          </button>
        </form>

        {canSkip && (
          <a
            href={getPortalLandingPath(prismaRoleToAppRole[session.user.role])}
            className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            Back to Dashboard
          </a>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500">
          <p className="font-bold text-slate-700">Password tip</p>
          <p className="mt-1">
            Use a unique password that is not used on any other website.
          </p>
        </div>
      </div>
    </main>
  );
}
