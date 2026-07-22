import Link from "next/link";
import {
  getCurrentUser,
  getPortalDisplayCopy,
  getPortalRole,
} from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

export default async function FieldDashboardPage() {
  const currentUser = await getCurrentUser();
  const fieldRole = getPortalRole(currentUser.roles, "field") ?? currentUser.role;
  const portalCopy = getPortalDisplayCopy(fieldRole);
  const canViewDeliveries = hasPermission(
    currentUser.roles,
    "view_assigned_deliveries"
  );
  const canManageVisits = hasPermission(
    currentUser.roles,
    "manage_field_visits"
  );

  const [assignedDeliveries, myVisits, pendingVisits] = await Promise.all([
    prisma.order.count({
      where: {
        assignedDriverId: currentUser.id,
        status: {
          in: ["TRANSPORT_ASSIGNED", "ON_THE_WAY"],
        },
      },
    }),
    prisma.fieldVisit.count({
      where: {
        createdById: currentUser.id,
      },
    }),
    prisma.fieldVisit.count({
      where: {
        createdById: currentUser.id,
        status: {
          in: ["GOAL_PENDING", "FOLLOW_UP_REQUIRED"],
        },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-blue-50 p-5 shadow-sm shadow-slate-200/70 dark:border-slate-700 dark:bg-slate-900 dark:bg-none dark:shadow-none sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-600">
          {portalCopy.eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">
          {portalCopy.title}
        </h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Assigned Deliveries</p>
            <p className="mt-2 text-3xl font-black text-blue-600">
              {assignedDeliveries}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">My Visit Reports</p>
            <p className="mt-2 text-3xl font-black text-emerald-700">
              {myVisits}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Pending Follow-ups</p>
            <p className="mt-2 text-3xl font-black text-orange-600">
              {pendingVisits}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {canViewDeliveries ? (
          <Link
            href="/field/deliveries"
            className="rounded-2xl border border-blue-100 bg-blue-600/[0.05] p-6 transition hover:-translate-y-1 hover:bg-blue-50"
          >
            <h2 className="text-xl font-black text-slate-950">
              Assigned Deliveries
            </h2>

          </Link>
        ) : null}

        {canManageVisits ? (
          <Link
            href="/field/visits"
            className="rounded-2xl border border-emerald-200 bg-emerald-300/[0.05] p-6 transition hover:-translate-y-1 hover:bg-emerald-50"
          >
            <h2 className="text-xl font-black text-slate-950">
              Shop Visit Reports
            </h2>

          </Link>
        ) : null}

        <Link
          href="/account/tasks"
          className="rounded-2xl border border-purple-200 bg-purple-50 p-6 transition hover:-translate-y-1 hover:bg-purple-50"
        >
          <h2 className="text-xl font-black text-slate-950">My Tasks</h2>

        </Link>
      </section>
    </div>
  );
}
