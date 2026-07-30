function Skeleton({
  className,
}: {
  className: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800 ${className}`}
      aria-hidden="true"
    />
  );
}

export default function InternalDashboardLoading() {
  return (
    <div
      className="mx-auto w-full max-w-[1680px] space-y-5"
      aria-busy="true"
      aria-label="Loading operations dashboard"
    >
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm dark:border-white/10 dark:bg-slate-950 sm:px-7">
        <Skeleton className="h-6 w-36 bg-white/10 dark:bg-white/10" />
        <Skeleton className="mt-5 h-8 w-72 max-w-full bg-white/10 dark:bg-white/10" />
        <Skeleton className="mt-3 h-4 w-[34rem] max-w-full bg-white/10 dark:bg-white/10" />
        <Skeleton className="mt-5 h-4 w-64 max-w-full bg-white/10 dark:bg-white/10" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"
          >
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-10 rounded-xl" />
            </div>
            <Skeleton className="mt-8 h-9 w-32" />
            <Skeleton className="mt-4 h-3 w-40 max-w-full" />
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)]">
        {[0, 1].map((panel) => (
          <div
            key={panel}
            className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-slate-900"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-6 w-44" />
            <Skeleton className="mt-2 h-3 w-72 max-w-full" />
            <div className="mt-7 space-y-4">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
