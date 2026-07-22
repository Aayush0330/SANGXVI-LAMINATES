"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

type ClickableOrderRowProps = {
  href: string;
  className?: string;
  children: ReactNode;
};

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest("a, button, input, select, textarea, [role='button']"))
    : false;
}

export function ClickableOrderRow({ href, className, children }: ClickableOrderRowProps) {
  const router = useRouter();

  function openOrder(event: MouseEvent<HTMLTableRowElement>) {
    if (isInteractiveTarget(event.target)) return;
    router.push(href);
  }

  function openOrderFromKeyboard(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (isInteractiveTarget(event.target)) return;

    event.preventDefault();
    router.push(href);
  }

  return (
    <tr
      className={className}
      role="link"
      tabIndex={0}
      onClick={openOrder}
      onKeyDown={openOrderFromKeyboard}
    >
      {children}
    </tr>
  );
}
