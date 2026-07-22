"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

type OrderDetailsDrawerProps = {
  closeHref: string;
  children: ReactNode;
};

const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function OrderDetailsDrawer({ closeHref, children }: OrderDetailsDrawerProps) {
  const mounted = useSyncExternalStore(
    subscribeToClient,
    getClientSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia("(max-width: 1023px)");

    function syncBodyScroll() {
      document.body.style.overflow = mediaQuery.matches ? "hidden" : "";
    }

    syncBodyScroll();
    mediaQuery.addEventListener("change", syncBodyScroll);

    return () => {
      mediaQuery.removeEventListener("change", syncBodyScroll);
      document.body.style.overflow = "";
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <>
      <Link
        href={closeHref}
        aria-label="Close Order Details panel"
        className="fixed inset-0 z-[90] bg-slate-950/40 backdrop-blur-[1px] lg:hidden"
      />

      <aside
        aria-label="Order Details details"
        className="fixed bottom-0 right-0 top-0 z-[100] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl shadow-slate-950/25 lg:top-[88px] dark:border-white/10 dark:bg-slate-950 dark:shadow-black/50"
        style={{ width: "min(420px, 100vw)", maxWidth: "100vw" }}
      >
        {children}
      </aside>
    </>,
    document.body,
  );
}
