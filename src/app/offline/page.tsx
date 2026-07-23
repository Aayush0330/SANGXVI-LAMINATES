import Image from "next/image";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm shadow-slate-200/70">
        <Image
          src="/icon-192.png"
          alt="Sanghvi ERP"
          width={72}
          height={72}
          className="mx-auto h-[72px] w-[72px] rounded-2xl border border-slate-200 bg-white"
        />
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-blue-600">
          Sanghvi ERP
        </p>
        <h1 className="mt-3 text-2xl font-bold">You&apos;re offline</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Connect to the internet to securely load the latest orders,
          attendance, and business data.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          Try Again
        </a>
      </div>
    </main>
  );
}
