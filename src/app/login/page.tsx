import Link from "next/link";
import { PasswordInput } from "@/components/password-input";
import { prisma } from "@/lib/db";
import { loginAction } from "./actions";

function getLoginMessage(error?: string) {
  if (error === "invalid-credentials") {
    return {
      type: "error",
      text: "Invalid email or password.",
    };
  }

  if (error === "inactive-user") {
    return {
      type: "error",
      text: "This user account is inactive. Please contact the ERP owner.",
    };
  }

  if (error === "password-not-set") {
    return {
      type: "error",
      text: "Password is not set for this user. Owner can reset it from User Management.",
    };
  }

  if (error === "session-required") {
    return {
      type: "error",
      text: "Please login to continue.",
    };
  }

  if (error === "missing-fields") {
    return {
      type: "error",
      text: "Email and password are required.",
    };
  }

  if (error === "owner-already-exists") {
    return {
      type: "error",
      text: "Owner setup is already completed. Please login with the owner account.",
    };
  }

  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const message = getLoginMessage(params?.error);
  const ownerCount = await prisma.user.count({
    where: {
      role: "OWNER",
    },
  });
  const hasOwner = ownerCount > 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/30">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
          Sangxvi ERP
        </p>

        <h1 className="text-3xl font-bold">Login to your account</h1>

        <p className="mt-3 text-sm leading-6 text-slate-300">
          Use your registered email and password to access the correct ERP
          portal based on your assigned role.
        </p>

        {!hasOwner && (
          <div className="mt-6 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-sm leading-6 text-yellow-100">
            <p className="font-bold">First owner is not configured</p>
            <p className="mt-1">
              Create the real owner account before using the ERP.
            </p>

            <Link
              href="/setup-owner"
              className="mt-3 inline-flex rounded-xl bg-yellow-300 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-yellow-200"
            >
              Create First Owner
            </Link>
          </div>
        )}

        {message && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.type === "error"
                ? "border-red-300/20 bg-red-300/10 text-red-300"
                : "border-emerald-300/20 bg-emerald-300/10 text-emerald-300"
            }`}
          >
            {message.text}
          </div>
        )}

        <form action={loginAction} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Email Address
            </label>

            <input
              name="email"
              type="email"
              placeholder="owner@company.com"
              autoComplete="email"
              className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-5 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
              required
            />
          </div>

          <PasswordInput
            name="password"
            label="Password"
            placeholder="Enter password"
            autoComplete="current-password"
          />

          <button
            type="submit"
            className="h-14 w-full rounded-2xl bg-cyan-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasOwner}
          >
            Login
          </button>
        </form>

        {hasOwner ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-xs leading-5 text-slate-400">
            <p className="font-bold text-slate-200">Private ERP access</p>
            <p className="mt-1">
              Only users created by the owner can login to this ERP.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
