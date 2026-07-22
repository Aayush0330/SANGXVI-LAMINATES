import Link from "next/link";

type AccessDeniedCardProps = {
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  theme?: "dark" | "light";
};

export function AccessDeniedCard({
  title,
  description,
  backHref = "/login",
  backLabel = "Go to Login",
  theme = "dark",
}: AccessDeniedCardProps) {
  const isDark = theme === "dark";

  return (
    <div
      className={`flex min-h-[70vh] items-center justify-center px-6 ${
        isDark ? "text-slate-950" : "text-slate-950"
      }`}
    >
      <div
        className={`max-w-lg rounded-2xl p-8 text-center ${
          isDark
            ? "border border-slate-200 bg-white"
            : "bg-white shadow-sm"
        }`}
      >
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-700">
          Access Restricted
        </p>

        <h1 className="mt-3 text-3xl font-bold">{title}</h1>

        <p
          className={`mt-4 text-sm leading-6 ${
            isDark ? "text-slate-500" : "text-slate-600"
          }`}
        >
          {description}
        </p>

        <Link
          href={backHref}
          className={`mt-6 inline-flex rounded-full px-5 py-3 text-sm font-bold ${
            isDark
              ? "bg-blue-600 text-white"
              : "bg-slate-50 text-slate-950"
          }`}
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}