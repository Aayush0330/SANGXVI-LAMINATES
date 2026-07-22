import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import {
  TeamFeedbackToast,
  type TeamFeedbackMessage,
} from "@/components/team-feedback-toast";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  createDealerMemberAction,
} from "./actions";
import { DealerMembersListClient } from "./dealer-members-list-client";

type DealerMemberRow = {
  id: string;
  memberName: string;
  dealerName: string;
  contactNumber: string;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const inputClass =
  "h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

const labelClass =
  "mb-2 block text-xs font-black uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400";

function getMessage(error?: string, success?: string): TeamFeedbackMessage | null {
  const successMessages: Record<string, TeamFeedbackMessage> = {
    "dealer-member-created": {
      type: "success",
      title: "Dealer member added",
      text: "Member name, dealer name, and contact number have been saved.",
    },
    "dealer-member-updated": {
      type: "success",
      title: "Dealer member updated",
      text: "Dealer member details have been updated.",
    },
    "dealer-member-deleted": {
      type: "success",
      title: "Dealer member removed",
      text: "Dealer member record has been removed from user management.",
    },
  };

  const errorMessages: Record<string, TeamFeedbackMessage> = {
    "missing-fields": {
      type: "error",
      title: "Missing details",
      text: "Member name, dealer name, and contact number are required.",
    },
    "duplicate-member": {
      type: "error",
      title: "Duplicate member",
      text: "This dealer already has a member with the same contact number.",
    },
    "missing-member-id": {
      type: "error",
      title: "Member not selected",
      text: "Please select a dealer member before updating or removing.",
    },
    "member-not-found": {
      type: "error",
      title: "Member not found",
      text: "This dealer member record does not exist anymore.",
    },
    "permission-denied": {
      type: "error",
      title: "Access denied",
      text: "Your current role cannot manage dealer members.",
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

function DealerMemberForm({
  action,
  member,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  member?: DealerMemberRow;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-4">
      {member ? <input type="hidden" name="dealerMemberId" value={member.id} /> : null}

      <div>
        <label htmlFor={member ? `memberName-${member.id}` : "memberName"} className={labelClass}>
          Member Name
        </label>
        <input
          id={member ? `memberName-${member.id}` : "memberName"}
          name="memberName"
          defaultValue={member?.memberName ?? ""}
          placeholder="Example: Ramesh Sharma"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label htmlFor={member ? `dealerName-${member.id}` : "dealerName"} className={labelClass}>
          Dealer Name
        </label>
        <input
          id={member ? `dealerName-${member.id}` : "dealerName"}
          name="dealerName"
          defaultValue={member?.dealerName ?? ""}
          placeholder="Example: Jaipur Laminates"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label htmlFor={member ? `contactNumber-${member.id}` : "contactNumber"} className={labelClass}>
          Contact Number
        </label>
        <input
          id={member ? `contactNumber-${member.id}` : "contactNumber"}
          name="contactNumber"
          defaultValue={member?.contactNumber ?? ""}
          placeholder="Example: 9876543210"
          className={inputClass}
          required
        />
      </div>

      <button
        type="submit"
        className="h-14 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
      >
        {submitLabel}
      </button>
    </form>
  );
}

export default async function DealerMembersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; error?: string; success?: string }>;
}) {
  const { hasAccess } = await checkPermission(
    "manage_users",
    "/internal/users/dealer-members",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Dealer Members Access Denied"
        description="Only users who can manage ERP users can manage dealer members."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);

  const dealerMembers = await prisma.dealerMember.findMany({
    orderBy: [
      {
        dealerName: "asc",
      },
      {
        memberName: "asc",
      },
    ],
  });

  const dealerCount = new Set(
    dealerMembers.map((member) => member.dealerName.trim().toLowerCase()),
  ).size;

  const newestMember = [...dealerMembers].sort(
    (firstMember, secondMember) =>
      secondMember.createdAt.getTime() - firstMember.createdAt.getTime(),
  )[0] ?? null;

  return (
    <div className="space-y-6">
      {message ? <TeamFeedbackToast message={message} /> : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative p-5 sm:p-6 lg:p-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />

          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600 dark:text-cyan-300">
                User Management
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Dealer Members
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Manage only the dealer member name, dealer name, and contact number here. Additional customer or contractor workflows are not included.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/internal/users"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-5 text-sm font-black text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Back to Users
              </Link>
              <Link
                href="/internal/security?eventType=DEALER_MEMBER_CREATED"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
              >
                View Audit Logs
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
            Total Members
          </p>
          <p className="mt-3 text-3xl font-black text-slate-950 dark:text-white">
            {dealerMembers.length}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
            Dealers Covered
          </p>
          <p className="mt-3 text-3xl font-black text-slate-950 dark:text-white">
            {dealerCount}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
            Latest Entry
          </p>
          <p className="mt-3 truncate text-lg font-black text-slate-950 dark:text-white">
            {newestMember ? newestMember.memberName : "No members yet"}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-500 dark:text-slate-400">
            {newestMember ? newestMember.dealerName : "Add first dealer member"}
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-cyan-300">
            Add Member
          </p>
          <h2 className="mt-3 text-2xl font-black text-slate-950 dark:text-white">
            New dealer member
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Required details: member name, dealer name, and contact number.
          </p>

          <div className="mt-6">
            <DealerMemberForm action={createDealerMemberAction} submitLabel="Add Dealer Member" />
          </div>
        </aside>

        <DealerMembersListClient
          dealerMembers={dealerMembers.map((member) => ({
            id: member.id,
            memberName: member.memberName,
            dealerName: member.dealerName,
            contactNumber: member.contactNumber,
            createdByName: member.createdByName,
            updatedByName: member.updatedByName,
            createdAt: member.createdAt.toISOString(),
            updatedAt: member.updatedAt.toISOString(),
          }))}
          initialQuery={params?.q ?? ""}
        />
      </section>
    </div>
  );
}
