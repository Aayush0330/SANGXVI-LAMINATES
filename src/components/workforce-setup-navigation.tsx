import Link from "next/link";

type WorkforceArea = "attendance" | "summary" | "teams" | "office";

const workforceLinks: Array<{
  key: WorkforceArea;
  label: string;
  href: string;
}> = [
  {
    key: "attendance",
    label: "Team Attendance",
    href: "/internal/attendance",
  },
  {
    key: "summary",
    label: "Attendance Summary",
    href: "/internal/attendance/summary",
  },
  {
    key: "teams",
    label: "Physical Teams",
    href: "/internal/teams",
  },
  {
    key: "office",
    label: "Office Setup",
    href: "/internal/attendance/settings",
  },
];

export function WorkforceSetupNavigation({
  active,
}: {
  active: WorkforceArea;
}) {
  return (
    <section className="rounded-[22px] border border-slate-200/90 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
      <nav
        aria-label="Workforce management"
        className="flex min-w-0 gap-1 overflow-x-auto"
      >
        {workforceLinks.map((item) => {
          const isActive = item.key === active;

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex h-10 shrink-0 items-center justify-center rounded-2xl px-4 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isActive
                  ? "bg-slate-950 text-white shadow-sm dark:bg-blue-600"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
