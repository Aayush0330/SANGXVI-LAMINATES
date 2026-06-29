import Link from "next/link";
import { PasswordInput } from "@/components/password-input";
import { prisma } from "@/lib/db";
import { createFirstOwnerAction } from "./actions";

function getSetupOwnerMessage(error?: string) {
  if (error === "missing-fields") {
    return "Owner name, email, password, and confirm password are required.";
  }

  if (error === "invalid-email") {
    return "Please enter a valid owner email address.";
  }

  if (error === "weak-password") {
    return "Password must be at least 8 characters.";
  }

  if (error === "password-mismatch") {
    return "Password and confirm password do not match.";
  }

  if (error === "duplicate-email") {
    return "This email is already used by another user.";
  }

  return null;
}

export default async function SetupOwnerPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const message = getSetupOwnerMessage(params?.error);

  const existingOwnerCount = await prisma.user.count({
    where: {
      role: "OWNER",
    },
  });

  if (existingOwnerCount > 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-black/30">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
            Setup Locked
          </p>

          <h1 className="mt-3 text-3xl font-bold">Owner already exists</h1>

          <p className="mt-4 text-sm leading-6 text-slate-300">
            The first owner account is already configured. For security, this
            setup page is locked after the owner account is created.
          </p>

          <Link
            href="/login"
            className="mt-6 inline-flex rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
          >
            Go to Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/30">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
          ERP Installation
        </p>

        <h1 className="text-3xl font-bold">Create First Owner</h1>

        <p className="mt-3 text-sm leading-6 text-slate-300">
          This page is only available when no owner exists in the database. The
          first owner becomes the main administrator of the ERP.
        </p>

        {message && (
          <div className="mt-6 rounded-2xl border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm font-semibold text-red-300">
            {message}
          </div>
        )}

        <form action={createFirstOwnerAction} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Owner Full Name
            </label>

            <input
              id="name"
              name="name"
              type="text"
              placeholder="Example: Aayush Chandak"
              autoComplete="name"
              className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-5 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
              required
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Owner Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              placeholder="owner@company.com"
              autoComplete="email"
              className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-5 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
              required
            />
          </div>

          <div>
            <label
              htmlFor="phone"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Phone Number
            </label>

            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+91 98765 43210"
              autoComplete="tel"
              className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-5 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
            />
          </div>

          <PasswordInput
            name="password"
            label="Password"
            placeholder="Minimum 8 characters"
            autoComplete="new-password"
          />

          <PasswordInput
            name="confirmPassword"
            label="Confirm Password"
            placeholder="Re-enter password"
            autoComplete="new-password"
          />

          <button
            type="submit"
            className="h-14 w-full rounded-2xl bg-cyan-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
          >
            Create Owner Account
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-xs leading-5 text-yellow-100">
          <p className="font-bold">Security note</p>
          <p className="mt-1">
            After this owner is created, this page will lock automatically and
            all future users must be created from User Management.
          </p>
        </div>
      </div>
    </main>
  );
}
