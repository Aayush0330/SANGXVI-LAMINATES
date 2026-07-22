"use client";

import { useMemo, useState } from "react";
import {
  deleteDealerMemberAction,
  updateDealerMemberAction,
} from "./actions";

type DealerMemberItem = {
  id: string;
  memberName: string;
  dealerName: string;
  contactNumber: string;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

const inputClass =
  "h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

const labelClass =
  "mb-2 block text-xs font-black uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400";

function normalizeQuery(value: string) {
  return value.trim().toLowerCase();
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

function matchesDealerMember(member: DealerMemberItem, query: string) {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) return true;

  const haystack = [
    member.memberName,
    member.dealerName,
    member.contactNumber,
    member.createdByName,
    member.updatedByName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function DealerMemberForm({
  member,
  submitLabel,
}: {
  member: DealerMemberItem;
  submitLabel: string;
}) {
  return (
    <form action={updateDealerMemberAction} className="grid gap-4">
      <input type="hidden" name="dealerMemberId" value={member.id} />

      <div>
        <label htmlFor={`memberName-${member.id}`} className={labelClass}>
          Member Name
        </label>
        <input
          id={`memberName-${member.id}`}
          name="memberName"
          defaultValue={member.memberName}
          placeholder="Example: Ramesh Sharma"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label htmlFor={`dealerName-${member.id}`} className={labelClass}>
          Dealer Name
        </label>
        <input
          id={`dealerName-${member.id}`}
          name="dealerName"
          defaultValue={member.dealerName}
          placeholder="Example: Jaipur Laminates"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label htmlFor={`contactNumber-${member.id}`} className={labelClass}>
          Contact Number
        </label>
        <input
          id={`contactNumber-${member.id}`}
          name="contactNumber"
          defaultValue={member.contactNumber}
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

export function DealerMembersListClient({
  dealerMembers,
  initialQuery = "",
}: {
  dealerMembers: DealerMemberItem[];
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);

  const filteredDealerMembers = useMemo(
    () =>
      dealerMembers.filter((member) =>
        matchesDealerMember(member, query),
      ),
    [dealerMembers, query],
  );

  const hasSearch = normalizeQuery(query) !== "";

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search member, dealer, contact number..."
            className={inputClass}
          />
          <button
            type="button"
            disabled={!hasSearch}
            onClick={() => setQuery("")}
            className="h-14 rounded-2xl border border-slate-200 bg-slate-50 px-6 text-sm font-black text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Clear
          </button>
        </div>
      </div>

      {filteredDealerMembers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
            No Dealer Members
          </p>
          <h3 className="mt-3 text-2xl font-black text-slate-950 dark:text-white">
            {hasSearch ? "No matching member found" : "Add first dealer member"}
          </h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Dealer member records will appear here with the member name, dealer name,
            and contact number.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDealerMembers.map((member) => (
            <details
              key={member.id}
              name="dealer-member-edit-panel"
              className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <summary className="grid cursor-pointer list-none gap-4 p-5 transition hover:bg-slate-50 group-open:bg-slate-50 dark:hover:bg-slate-950 dark:group-open:bg-slate-950 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                    Member
                  </p>
                  <h3 className="mt-2 text-xl font-black text-slate-950 dark:text-white">
                    {member.memberName}
                  </h3>
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                    Dealer
                  </p>
                  <p className="mt-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    {member.dealerName}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                    Contact
                  </p>
                  <p className="mt-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    {member.contactNumber}
                  </p>
                </div>

                <span className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition group-open:bg-slate-950 group-open:text-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:group-open:bg-cyan-300 dark:group-open:text-slate-950">
                  Edit
                </span>
              </summary>

              <div className="grid gap-5 border-t border-slate-200 p-5 dark:border-slate-800 lg:grid-cols-[1fr_220px]">
                <DealerMemberForm member={member} submitLabel="Save Changes" />

                <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-400/30 dark:bg-rose-500/10">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-700 dark:text-rose-300">
                    Remove
                  </p>
                  <p className="mt-2 text-sm font-bold leading-6 text-rose-700 dark:text-rose-200">
                    Remove this dealer member record if it was added by mistake.
                  </p>
                  <form action={deleteDealerMemberAction} className="mt-4">
                    <input
                      type="hidden"
                      name="dealerMemberId"
                      value={member.id}
                    />
                    <button
                      type="submit"
                      className="h-12 w-full rounded-2xl bg-rose-500 px-4 text-sm font-black text-white transition hover:bg-rose-600 dark:bg-rose-300 dark:text-slate-950 dark:hover:bg-rose-200"
                    >
                      Remove Member
                    </button>
                  </form>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                Added {formatDateTime(member.createdAt)}
                {member.createdByName ? ` by ${member.createdByName}` : ""} ·
                Last updated {formatDateTime(member.updatedAt)}
                {member.updatedByName ? ` by ${member.updatedByName}` : ""}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
