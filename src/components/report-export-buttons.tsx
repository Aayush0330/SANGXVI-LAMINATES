import Link from "next/link";

function withFormat(href: string, format: "xlsx" | "pdf") {
  return `${href}${href.includes("?") ? "&" : "?"}format=${format}`;
}

export function ReportExportButtons({
  href,
  compact = false,
}: {
  href: string;
  compact?: boolean;
}) {
  const sizeClass = compact ? "min-h-10 px-3.5 text-xs" : "h-12 px-5 text-sm";

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={withFormat(href, "xlsx")}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 font-black text-emerald-700 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:hover:bg-emerald-400/20 ${sizeClass}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6M8 13l3 4m0-4-3 4m5-4h3" />
        </svg>
        Excel
      </Link>
      <Link
        href={withFormat(href, "pdf")}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 font-black text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300 dark:hover:bg-rose-400/20 ${sizeClass}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6M8 15h2a2 2 0 0 0 0-4H8v6m6-6v6m0-6h3" />
        </svg>
        PDF
      </Link>
    </div>
  );
}
