"use client";

export function PrintPayslipButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white print:hidden"
    >
      Print / Save PDF
    </button>
  );
}
