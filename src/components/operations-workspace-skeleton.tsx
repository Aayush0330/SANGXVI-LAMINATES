export function OperationsWorkspaceSkeleton() {
  return (
    <div
      className="min-w-0 animate-pulse space-y-5 pb-10"
      aria-label="Loading operations workspace"
      aria-busy="true"
    >
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
        <div className="h-3 w-44 rounded-full bg-slate-200 dark:bg-white/10" />
        <div className="mt-4 h-9 w-full max-w-md rounded-xl bg-slate-200 dark:bg-white/10" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded-full bg-slate-100 dark:bg-white/5" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-32 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"
          >
            <div className="h-3 w-24 rounded-full bg-slate-200 dark:bg-white/10" />
            <div className="mt-4 h-8 w-16 rounded-lg bg-slate-200 dark:bg-white/10" />
            <div className="mt-4 h-2.5 w-36 rounded-full bg-slate-100 dark:bg-white/5" />
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.76fr)_minmax(0,1.24fr)]">
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-5 dark:border-white/10">
            <div className="h-5 w-40 rounded-lg bg-slate-200 dark:bg-white/10" />
            <div className="mt-4 h-11 rounded-xl bg-slate-100 dark:bg-white/5" />
          </div>
          <div className="space-y-px">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="border-b border-slate-100 p-5 last:border-0 dark:border-white/5"
              >
                <div className="h-4 w-40 rounded-full bg-slate-200 dark:bg-white/10" />
                <div className="mt-3 h-3 w-56 rounded-full bg-slate-100 dark:bg-white/5" />
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-[560px] rounded-[24px] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
          <div className="h-3 w-36 rounded-full bg-slate-200 dark:bg-white/10" />
          <div className="mt-4 h-8 w-64 rounded-lg bg-slate-200 dark:bg-white/10" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-24 rounded-2xl bg-slate-100 dark:bg-white/5"
              />
            ))}
          </div>
          <div className="mt-6 h-48 rounded-2xl bg-slate-100 dark:bg-white/5" />
          <div className="mt-4 h-36 rounded-2xl bg-slate-100 dark:bg-white/5" />
        </div>
      </div>
    </div>
  );
}
