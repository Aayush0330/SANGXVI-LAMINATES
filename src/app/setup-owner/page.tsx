import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { PasswordInput } from "@/components/password-input";
import { ThemeToggle } from "@/components/theme-toggle";
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
    return "Use at least 12 characters with uppercase, lowercase, number and symbol.";
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
      <main className="relative flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950">
      <div className="fixed right-5 top-5 z-20">
        <ThemeToggle />
      </div>
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm shadow-slate-200/70">
          <div className="mx-auto mb-5 w-fit">
            <BrandLogo priority />
          </div>

          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">
            Setup Locked
          </p>

          <h1 className="mt-3 text-3xl font-bold">Owner already exists</h1>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            Owner setup is already completed.
          </p>

          <Link
            href="/login"
            className="mt-6 inline-flex rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            Go to Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10 text-slate-950">
      <div className="fixed right-5 top-5 z-20">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-200/70">
        <div className="mb-5 flex items-center gap-3">
          <BrandLogo priority />
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">
            Sanghvi ERP
          </p>
        </div>

        <h1 className="text-3xl font-bold">Create Owner Account</h1>

        {message && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {message}
          </div>
        )}

        <form action={createFirstOwnerAction} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Owner Full Name
            </label>

            <input
              id="name"
              name="name"
              type="text"
              placeholder="Owner full name"
              autoComplete="name"
              className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Owner Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              placeholder="owner email"
              autoComplete="email"
              className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label
              htmlFor="phone"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Phone Number
            </label>

            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="Phone number"
              autoComplete="tel"
              className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500"
            />
          </div>

          <PasswordInput
            name="password"
            label="Password"
            placeholder="Password"
            autoComplete="new-password"
          />

          <PasswordInput
            name="confirmPassword"
            label="Confirm Password"
            placeholder="Confirm password"
            autoComplete="new-password"
          />

          <button
            type="submit"
            className="h-14 w-full rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            Create Owner Account
          </button>
        </form>
      </div>
    </main>
  );
}
