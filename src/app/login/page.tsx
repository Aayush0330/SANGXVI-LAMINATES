import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { PasswordInput } from "@/components/password-input";
import { ThemeToggle } from "@/components/theme-toggle";
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
      text: "Sign in to continue.",
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
      text: "Owner setup is already completed. Sign in with the owner account.",
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
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950">
      <div className="fixed right-5 top-5 z-20">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-200/70">
        <div className="mb-5 flex items-center gap-3">
          <BrandLogo priority />
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">
            Sanghvi ERP
          </p>
        </div>

        <h1 className="text-3xl font-bold">ERP Login</h1>

        {!hasOwner && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            <p className="font-bold">First owner is not configured</p>
            <p className="mt-1">
              Create the owner account to start using the ERP.
            </p>

            <Link
              href="/setup-owner"
              className="mt-3 inline-flex rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-600"
            >
              Create First Owner
            </Link>
          </div>
        )}

        {message && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <form action={loginAction} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Email Address
            </label>

            <input
              name="email"
              type="email"
              placeholder="Email address"
              autoComplete="email"
              className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500"
              required
            />
          </div>

          <PasswordInput
            name="password"
            label="Password"
            placeholder="Password"
            autoComplete="current-password"
          />

          <button
            type="submit"
            className="h-14 w-full rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasOwner}
          >
            Sign In
          </button>
        </form>
      </div>
    </main>
  );
}
