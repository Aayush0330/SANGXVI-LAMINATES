import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  PhysicalCheckStatus,
  UserRole,
  WorkTeamMemberRole,
  WorkTeamType,
} from "@/generated/prisma/client";
import {
  TeamFeedbackToast,
  type TeamFeedbackMessage,
} from "@/components/team-feedback-toast";
import { PhysicalTeamCreateForm } from "@/components/physical-team-create-form";
import {
  addPhysicalTeamMemberAction,
  removePhysicalTeamMemberAction,
  togglePhysicalTeamStatusAction,
  updatePhysicalTeamAction,
} from "./actions";

const inputClass =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500";

const labelClass =
  "mb-2 block text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400";

const selectClass = `${inputClass} appearance-none pr-11`;

const selectArrowStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: "right 0.9rem center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "17px 17px",
} as const;

const activeAssignmentStatuses = new Set<PhysicalCheckStatus>([
  PhysicalCheckStatus.ASSIGNED,
  PhysicalCheckStatus.IN_PROGRESS,
  PhysicalCheckStatus.ISSUE_REPORTED,
  PhysicalCheckStatus.QC_REWORK,
]);

const blockerAssignmentStatuses = new Set<PhysicalCheckStatus>([
  PhysicalCheckStatus.ISSUE_REPORTED,
  PhysicalCheckStatus.QC_REWORK,
]);

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M9 4.5V3h6v1.5" />
      <path d="M9 9h6M9 13h6" />
    </Icon>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </Icon>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M10.3 3.8 2.5 18a2 2 0 0 0 1.75 3h15.5a2 2 0 0 0 1.75-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.7-3.7" />
    </Icon>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </Icon>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z" />
      <path d="m13.8 7.8 2.4 2.4" />
    </Icon>
  );
}

function PackageIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4.4 7.7 7.6 4.2 7.6-4.2M12 12v9" />
    </Icon>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

function getMessage(error?: string, success?: string): TeamFeedbackMessage | null {
  const successMessages: Record<string, TeamFeedbackMessage> = {
    "team-created": {
      type: "success",
      title: "Physical team created",
      text: "The team is ready for worker and order assignments.",
    },
    "team-saved": {
      type: "success",
      title: "Team details saved",
      text: "The physical team information has been updated.",
    },
    "team-enabled": {
      type: "success",
      title: "Team activated",
      text: "This team can receive new order assignments again.",
    },
    "team-disabled": {
      type: "success",
      title: "Team deactivated",
      text: "Existing history is preserved, but new orders cannot be assigned.",
    },
    "member-added": {
      type: "success",
      title: "Worker assigned",
      text: "The physical team roster has been updated.",
    },
    "member-removed": {
      type: "success",
      title: "Worker removed",
      text: "The worker is no longer assigned to this physical team.",
    },
  };

  const errorMessages: Record<string, TeamFeedbackMessage> = {
    "team-name-required": {
      type: "error",
      title: "Team not created",
      text: "Enter a valid team name and keep the instructions within the allowed limit.",
    },
    "team-update-invalid": {
      type: "error",
      title: "Team not saved",
      text: "Please verify the team name and work instructions.",
    },
    "team-missing": {
      type: "error",
      title: "Physical team missing",
      text: "Refresh the page and try again.",
    },
    "member-invalid": {
      type: "error",
      title: "Worker not assigned",
      text: "Select a valid active physical worker.",
    },
    "physical-member-role-required": {
      type: "error",
      title: "Physical Team role required",
      text: "Only active users with the Physical Team role can be assigned here.",
    },
    "member-missing": {
      type: "error",
      title: "Worker record missing",
      text: "Refresh the page and try again.",
    },
    "duplicate-lead-worker": {
      type: "error",
      title: "Select two different people",
      text: "The Team Lead cannot also be selected as the initial worker.",
    },
    "worker-already-assigned": {
      type: "error",
      title: "Worker already assigned",
      text: "A physical worker can belong to only one physical team at a time.",
    },
  };

  return (success && successMessages[success]) || (error && errorMessages[error]) || null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function teamCode(index: number) {
  return `PT-${String(index + 1).padStart(2, "0")}`;
}

function assignmentProgress(status: PhysicalCheckStatus) {
  switch (status) {
    case PhysicalCheckStatus.ASSIGNED:
      return 15;
    case PhysicalCheckStatus.IN_PROGRESS:
      return 50;
    case PhysicalCheckStatus.ISSUE_REPORTED:
      return 45;
    case PhysicalCheckStatus.QC_REWORK:
      return 70;
    case PhysicalCheckStatus.READY_FOR_QC:
    case PhysicalCheckStatus.COMPLETED:
      return 100;
    case PhysicalCheckStatus.CANCELLED:
      return 0;
  }
}

function assignmentLabel(status: PhysicalCheckStatus) {
  const labels: Record<PhysicalCheckStatus, string> = {
    ASSIGNED: "Assigned",
    IN_PROGRESS: "In Progress",
    READY_FOR_QC: "Ready for QC",
    ISSUE_REPORTED: "Blocked",
    QC_REWORK: "QC Rework",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };
  return labels[status];
}

function assignmentBadge(status: PhysicalCheckStatus) {
  if (status === PhysicalCheckStatus.READY_FOR_QC || status === PhysicalCheckStatus.COMPLETED) {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300";
  }
  if (status === PhysicalCheckStatus.ISSUE_REPORTED || status === PhysicalCheckStatus.QC_REWORK) {
    return "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300";
  }
  return "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300";
}

async function getPhysicalWorkers() {
  return prisma.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { role: UserRole.DISPATCH_TEAM },
        {
          roleAssignments: {
            some: { role: UserRole.DISPATCH_TEAM },
          },
        },
      ],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      workTeamMemberships: {
        where: {
          team: { teamType: WorkTeamType.PHYSICAL_DISPATCH },
        },
        select: {
          teamId: true,
          team: { select: { id: true, name: true, isActive: true } },
        },
        take: 1,
      },
    },
  });
}

async function getPhysicalTeams() {
  return prisma.workTeam.findMany({
    where: {
      teamType: WorkTeamType.PHYSICAL_DISPATCH,
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      physicalAssignments: {
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              createdAt: true,
              dealer: { select: { name: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
}

function normalizePhysicalInstructions(description: string | null) {
  const value = description?.trim();
  if (!value) {
    return "No work area or instructions added yet.";
  }

  const legacyDescriptions = new Set([
    "Stock checks, reorder planning, and inventory audits.",
    "Packing, dispatch coordination, and delivery handover.",
  ]);

  if (legacyDescriptions.has(value)) {
    return "Physical product verification, quantity checking, damage checks, packing readiness, and issue reporting.";
  }

  return value;
}

function MetricCard({
  icon,
  iconClass,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="group rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="flex items-center gap-4">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${iconClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{label}</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
      </div>
    </div>
  );
}

export default async function PhysicalTeamsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    q?: string;
    status?: string;
    edit?: string;
  }>;
}) {
  const params = await searchParams;
  const { hasAccess } = await checkPermission("manage_work_teams", "/internal/teams");

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const [allTeams, workers] = await Promise.all([getPhysicalTeams(), getPhysicalWorkers()]);
  const message = getMessage(params?.error, params?.success);
  const query = String(params?.q ?? "").trim().toLowerCase();
  const statusFilter = String(params?.status ?? "ALL").toUpperCase();

  const filteredTeams = allTeams.filter((team) => {
    const matchesQuery =
      !query ||
      team.name.toLowerCase().includes(query) ||
      (team.description ?? "").toLowerCase().includes(query) ||
      team.members.some((member) => member.user.name.toLowerCase().includes(query));
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && team.isActive) ||
      (statusFilter === "INACTIVE" && !team.isActive);
    return matchesQuery && matchesStatus;
  });

  const uniqueActiveWorkerIds = new Set(
    allTeams
      .filter((team) => team.isActive)
      .flatMap((team) => team.members.map((member) => member.userId)),
  );
  const assignments = allTeams.flatMap((team) =>
    team.physicalAssignments.map((assignment) => ({ ...assignment, team })),
  );
  const ordersInProgress = new Set(
    assignments
      .filter((assignment) => activeAssignmentStatuses.has(assignment.status))
      .map((assignment) => assignment.orderId),
  ).size;
  const readyForQc = assignments.filter(
    (assignment) => assignment.status === PhysicalCheckStatus.READY_FOR_QC,
  ).length;
  const blockerCount = assignments.filter((assignment) =>
    blockerAssignmentStatuses.has(assignment.status),
  ).length;
  const readyTeamCount = new Set(
    assignments
      .filter((assignment) => assignment.status === PhysicalCheckStatus.READY_FOR_QC)
      .map((assignment) => assignment.teamId),
  ).size;

  const recentAssignments = assignments
    .filter((assignment) => assignment.status !== PhysicalCheckStatus.CANCELLED)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-blue-100 bg-gradient-to-br from-white via-blue-50/70 to-violet-100/70 px-6 py-7 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/60 sm:px-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-blue-300/30 blur-3xl dark:bg-blue-500/10" />
        <div className="pointer-events-none absolute right-20 top-8 h-36 w-36 rounded-full bg-violet-300/30 blur-2xl dark:bg-violet-500/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.34em] text-blue-600 dark:text-cyan-300">
              Workforce Operations
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Physical Teams
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Manage physical verification teams, assign workers, and track order readiness before QC.
            </p>
          </div>
          <a
            href="#create-team"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700"
          >
            <PlusIcon className="h-5 w-5" />
            Create Physical Team
          </a>
        </div>
      </section>

      <TeamFeedbackToast message={message} />

      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          icon={<UsersIcon className="h-6 w-6" />}
          iconClass="bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"
          label="Total Physical Teams"
          value={allTeams.length}
          helper="Across all work areas"
        />
        <MetricCard
          icon={<UsersIcon className="h-6 w-6" />}
          iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"
          label="Active Workers"
          value={uniqueActiveWorkerIds.size}
          helper="Currently assigned to active teams"
        />
        <MetricCard
          icon={<ClipboardIcon className="h-6 w-6" />}
          iconClass="bg-violet-50 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300"
          label="Orders In Progress"
          value={ordersInProgress}
          helper="Across all physical teams"
        />
        <MetricCard
          icon={<CheckIcon className="h-6 w-6" />}
          iconClass="bg-orange-50 text-orange-600 dark:bg-orange-400/10 dark:text-orange-300"
          label="Ready for QC"
          value={readyForQc}
          helper="Awaiting quality verification"
        />
      </section>

      <section
        id="create-team"
        className="scroll-mt-24 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
            <PlusIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Create Physical Team</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Add a team lead and an initial worker now; more workers can be added later.
            </p>
          </div>
        </div>

        <PhysicalTeamCreateForm
          workers={workers.map((worker) => {
            const membership = worker.workTeamMemberships[0];
            return {
              id: worker.id,
              name: worker.name,
              assignedTeamId: membership?.teamId ?? null,
              assignedTeamName: membership?.team.name ?? null,
            };
          })}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                <UsersIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">
                  Physical Teams ({filteredTeams.length})
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  No hierarchy or subteams. Each worker belongs to a physical ground team.
                </p>
              </div>
            </div>

            <form method="get" className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_160px_auto]">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="q"
                  defaultValue={params?.q ?? ""}
                  className={`${inputClass} pl-11`}
                  placeholder="Search teams or workers..."
                />
              </div>
              <select
                name="status"
                defaultValue={statusFilter}
                className={selectClass}
                style={selectArrowStyle}
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
              <button className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                Apply
              </button>
            </form>
          </div>

          {filteredTeams.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 px-6 py-14 text-center dark:border-slate-700">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <UsersIcon className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">No physical teams found</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Create the first physical team or change the current search filters.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5">
              {filteredTeams.map((team) => {
                const lead = team.members.find((member) => member.role === WorkTeamMemberRole.LEAD);
                const workersOnly = team.members.filter((member) => member.role === WorkTeamMemberRole.MEMBER);
                const inProgressCount = team.physicalAssignments.filter((assignment) =>
                  activeAssignmentStatuses.has(assignment.status),
                ).length;
                const problemsCount = team.physicalAssignments.filter((assignment) =>
                  blockerAssignmentStatuses.has(assignment.status),
                ).length;
                const readyCount = team.physicalAssignments.filter(
                  (assignment) => assignment.status === PhysicalCheckStatus.READY_FOR_QC,
                ).length;

                return (
                  <article
                    key={team.id}
                    id={`team-${team.id}`}
                    className="min-w-0 scroll-mt-24 overflow-hidden rounded-[26px] border border-slate-200 bg-gradient-to-b from-white to-slate-50/50 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/5 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950"
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                            <UsersIcon className="h-6 w-6" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-black text-blue-600 dark:text-blue-300">
                                {teamCode(allTeams.findIndex((item) => item.id === team.id))}
                              </span>
                              <h3 className="truncate text-lg font-black text-slate-950 dark:text-white">
                                {team.name}
                              </h3>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Team Lead: <span className="font-bold text-slate-700 dark:text-slate-200">{lead?.user.name ?? "Not assigned"}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                              team.isActive
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            {team.isActive ? "Active" : "Inactive"}
                          </span>
                          <details className="relative">
                            <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                              <MoreIcon className="h-5 w-5" />
                            </summary>
                            <div className="absolute right-0 z-20 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                              <form action={togglePhysicalTeamStatusAction}>
                                <input type="hidden" name="teamId" value={team.id} />
                                <input type="hidden" name="isActive" value={String(!team.isActive)} />
                                <button className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                                  {team.isActive ? "Deactivate Team" : "Activate Team"}
                                </button>
                              </form>
                            </div>
                          </details>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ["Team Size", team.members.length, "text-slate-950 dark:text-white"],
                          ["In Progress", inProgressCount, "text-blue-600 dark:text-blue-300"],
                          ["Problems", problemsCount, problemsCount ? "text-amber-600" : "text-emerald-600"],
                          ["Ready for QC", readyCount, "text-emerald-600"],
                        ].map(([label, value, color]) => (
                          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
                            <p className={`mt-1 text-xl font-black ${color}`}>{value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <div className="grid gap-4 md:grid-cols-[150px_1fr]">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Team Lead</p>
                            {lead ? (
                              <div className="mt-3 flex items-center gap-2">
                                <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-xs font-black text-white">
                                  {initials(lead.user.name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-slate-950 dark:text-white">{lead.user.name}</p>
                                  <p className="truncate text-[11px] text-slate-500">{lead.user.phone || lead.user.email}</p>
                                </div>
                              </div>
                            ) : (
                              <p className="mt-3 text-xs font-semibold text-amber-600">Lead not assigned</p>
                            )}
                          </div>
                          <div className="border-slate-200 md:border-l md:pl-4 dark:border-slate-800">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                              Workers ({workersOnly.length})
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {workersOnly.length ? (
                                workersOnly.slice(0, 7).map((member, memberIndex) => (
                                  <div
                                    key={member.id}
                                    title={member.user.name}
                                    className={`grid h-9 w-9 place-items-center rounded-full border-2 border-white text-[11px] font-black text-white shadow-sm dark:border-slate-900 ${
                                      [
                                        "bg-blue-500",
                                        "bg-violet-500",
                                        "bg-emerald-500",
                                        "bg-orange-500",
                                        "bg-cyan-500",
                                      ][memberIndex % 5]
                                    }`}
                                  >
                                    {initials(member.user.name)}
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-slate-500">No workers assigned yet.</p>
                              )}
                              {workersOnly.length > 7 ? (
                                <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-[11px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  +{workersOnly.length - 7}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Work Area / Instructions</p>
                        <p className="mt-2 min-h-10 text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {normalizePhysicalInstructions(team.description)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 border-t border-slate-200 bg-white p-3 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
                      <a
                        href={`/internal/teams?edit=${encodeURIComponent(team.id)}#team-settings-${team.id}`}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <EyeIcon className="h-4 w-4" />
                        View Team
                      </a>
                      <a
                        href={`/internal/teams?edit=${encodeURIComponent(team.id)}#team-settings-${team.id}`}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-black text-blue-600 transition hover:bg-blue-50 dark:border-slate-700 dark:text-blue-300 dark:hover:bg-blue-400/10"
                      >
                        <PencilIcon className="h-4 w-4" />
                        Edit
                      </a>
                      <Link
                        href="/internal/order-receiving"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700"
                      >
                        <PackageIcon className="h-4 w-4" />
                        Assign Orders
                      </Link>
                    </div>

                    <details
                      id={`team-settings-${team.id}`}
                      open={params?.edit === team.id}
                      className="group border-t border-slate-200 dark:border-slate-800"
                    >
                      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60">
                        Manage team details and workers
                      </summary>
                      <div className="grid gap-5 border-t border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-950/50 lg:grid-cols-2">
                        <form action={updatePhysicalTeamAction}>
                          <input type="hidden" name="teamId" value={team.id} />
                          <p className="text-sm font-black text-slate-950 dark:text-white">Team Details</p>
                          <div className="mt-4">
                            <label className={labelClass}>Team Name</label>
                            <input name="name" defaultValue={team.name} className={inputClass} required />
                          </div>
                          <div className="mt-4">
                            <label className={labelClass}>Work Area / Instructions</label>
                            <textarea
                              name="description"
                              defaultValue={normalizePhysicalInstructions(team.description)}
                              className="min-h-28 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </div>
                          <button className="mt-4 h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700">
                            Save Details
                          </button>
                        </form>

                        <div>
                          <p className="text-sm font-black text-slate-950 dark:text-white">Team Roster</p>
                          <div className="mt-4 space-y-2">
                            {team.members.length ? (
                              team.members.map((member) => (
                                <div key={member.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-black text-white dark:bg-slate-700">
                                      {initials(member.user.name)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-black text-slate-950 dark:text-white">{member.user.name}</p>
                                      <p className="truncate text-[11px] text-slate-500">
                                        {member.role === WorkTeamMemberRole.LEAD ? "Team Lead" : "Worker"} · {member.user.email}
                                      </p>
                                    </div>
                                  </div>
                                  <form action={removePhysicalTeamMemberAction}>
                                    <input type="hidden" name="memberId" value={member.id} />
                                    <input type="hidden" name="teamId" value={team.id} />
                                    <button className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600 transition hover:bg-rose-50 dark:border-rose-400/30 dark:hover:bg-rose-400/10">
                                      Remove
                                    </button>
                                  </form>
                                </div>
                              ))
                            ) : (
                              <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700">
                                No workers assigned yet.
                              </p>
                            )}
                          </div>

                          <form action={addPhysicalTeamMemberAction} className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_130px_auto]">
                            <input type="hidden" name="teamId" value={team.id} />
                            <select name="userId" className={selectClass} style={selectArrowStyle} required defaultValue="">
                              <option value="">Select worker</option>
                              {workers.map((worker) => {
                                const membership = worker.workTeamMemberships[0];
                                const assignedElsewhere = membership && membership.teamId !== team.id;
                                const assignedHere = membership?.teamId === team.id;
                                return (
                                  <option
                                    key={worker.id}
                                    value={worker.id}
                                    disabled={Boolean(assignedElsewhere)}
                                  >
                                    {worker.name}
                                    {assignedElsewhere
                                      ? ` — Assigned to ${membership.team.name}`
                                      : assignedHere
                                        ? " — Current team"
                                        : ""}
                                  </option>
                                );
                              })}
                            </select>
                            <select name="role" className={selectClass} style={selectArrowStyle} defaultValue="MEMBER">
                              <option value="MEMBER">Worker</option>
                              <option value="LEAD">Team Lead</option>
                            </select>
                            <button className="h-12 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
                              Assign
                            </button>
                          </form>
                        </div>
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <h2 className="text-base font-black text-slate-950 dark:text-white">Team Insights</h2>
            <div className="mt-4 space-y-3">
              <Link href="/internal/qc" className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-slate-800 dark:hover:bg-emerald-400/5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
                  <CheckIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950 dark:text-white">{readyTeamCount} teams ready for QC</p>
                  <p className="mt-1 text-xs text-slate-500">Awaiting quality check</p>
                </div>
              </Link>
              <Link href="/internal/dispatch" className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-amber-200 hover:bg-amber-50/50 dark:border-slate-800 dark:hover:bg-amber-400/5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
                  <AlertIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950 dark:text-white">{blockerCount} blockers require review</p>
                  <p className="mt-1 text-xs text-slate-500">Impacting team progress</p>
                </div>
              </Link>
              <Link href="/internal/dispatch" className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-800 dark:hover:bg-blue-400/5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                  <ClipboardIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950 dark:text-white">{ordersInProgress} orders in progress</p>
                  <p className="mt-1 text-xs text-slate-500">Across all physical teams</p>
                </div>
              </Link>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-black text-slate-950 dark:text-white">Current Assigned Orders</h2>
              <Link href="/internal/dispatch" className="text-xs font-black text-blue-600 dark:text-blue-300">
                View all
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {recentAssignments.length ? (
                recentAssignments.map((assignment) => {
                  const progress = assignmentProgress(assignment.status);
                  return (
                    <div key={assignment.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950 dark:text-white">{assignment.order.orderNumber}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{assignment.team.name} · {assignment.order.dealer.name}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${assignmentBadge(assignment.status)}`}>
                          {assignmentLabel(assignment.status)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full ${progress === 100 ? "bg-emerald-500" : blockerAssignmentStatuses.has(assignment.status) ? "bg-amber-500" : "bg-blue-600"}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-black text-slate-500">{progress}%</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
                  No physical orders assigned yet.
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
