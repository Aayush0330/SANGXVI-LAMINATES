"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M10 17a2 2 0 0 0 4 0" />
    </svg>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function subscribeToMount() {
  return () => {};
}

export function NotificationPopover({
  unreadCount,
  children,
}: {
  unreadCount: number;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 72, width: 440 });
  const mounted = useSyncExternalStore(
    subscribeToMount,
    () => true,
    () => false,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;

    if (!button || typeof window === "undefined") {
      return;
    }

    const safeGap = 12;
    const panelWidth = Math.min(440, window.innerWidth - safeGap * 2);
    const buttonRect = button.getBoundingClientRect();
    const preferredLeft = buttonRect.right - panelWidth;
    const left = clamp(
      preferredLeft,
      safeGap,
      window.innerWidth - panelWidth - safeGap,
    );
    const preferredTop = buttonRect.bottom + safeGap;
    const panelHeight = Math.min(520, window.innerHeight - safeGap * 2);
    const hasEnoughRoomBelow = window.innerHeight - preferredTop > panelHeight;
    const top = hasEnoughRoomBelow
      ? preferredTop
      : Math.max(safeGap, buttonRect.top - panelHeight);

    setPosition({ left, top, width: panelWidth });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePosition();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (buttonRef.current?.contains(target)) {
        return;
      }

      if (panelRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  function handlePanelClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const clickedNavigationLink = target.closest("a[href]");

    if (clickedNavigationLink) {
      setIsOpen(false);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((current) => !current);
          requestAnimationFrame(updatePosition);
        }}
        className={`notification-bell-button relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm shadow-slate-200/70 transition hover:border-blue-200 hover:bg-slate-50 hover:text-blue-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:shadow-black/20 dark:hover:border-blue-500/60 dark:hover:bg-slate-800 dark:hover:text-white ${
          unreadCount > 0 ? "notification-bell-unread" : ""
        }`}
      >
        <span className="notification-bell-icon">
          <BellIcon />
        </span>

        {unreadCount > 0 ? (
          <span className="notification-count-badge absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow-sm dark:border-slate-900">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {mounted && isOpen
        ? createPortal(
            <div
              ref={panelRef}
              onClickCapture={handlePanelClickCapture}
              className="fixed z-[9999]"
              style={{
                left: position.left,
                top: position.top,
                width: position.width,
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
