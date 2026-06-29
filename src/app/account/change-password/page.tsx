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
  INVENTORY_TEAM: "inventory_team",
  DISPATCH_TEAM: "dispatch_team",
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
      text: "New password must be at least 8 characters.",
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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/30">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
          Account Security
        </p>

        <h1 className="text-3xl font-bold">Change Password</h1>

        <p className="mt-3 text-sm leading-6 text-slate-300">
          Update your password to keep your ERP account secure.
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-sm font-bold text-white">{session.user.name}</p>
          <p className="mt-1 text-xs text-slate-500">{session.user.email}</p>
        </div>

        {message && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.type === "warning"
                ? "border-yellow-300/20 bg-yellow-300/10 text-yellow-200"
                : "border-red-300/20 bg-red-300/10 text-red-300"
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
            placeholder="Minimum 8 characters"
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
            className="h-14 w-full rounded-2xl bg-cyan-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
          >
            Update Password
          </button>
        </form>

        {canSkip && (
          <a
            href={getPortalLandingPath(prismaRoleToAppRole[session.user.role])}
            className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl border border-white/10 text-sm font-bold text-slate-300 transition hover:bg-white/[0.04]"
          >
            Back to Dashboard
          </a>
        )}

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-xs leading-5 text-slate-400">
          <p className="font-bold text-slate-200">Password tip</p>
          <p className="mt-1">
            Use a unique password that is not used on any other website.
          </p>
        </div>
      </div>
    </main>
  );
}
