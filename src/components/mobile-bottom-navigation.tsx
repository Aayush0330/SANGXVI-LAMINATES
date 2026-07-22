"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type MobileNavIcon =
  | "dashboard"
  | "inventory"
  | "dispatch"
  | "qc"
  | "users"
  | "reports"
  | "products"
  | "order"
  | "orders"
  | "deliveries"
  | "collections"
  | "visits";

type MobileNavItem = {
  label: string;
  href: string;
  icon?: MobileNavIcon;
};

function getIconFromItem(item: MobileNavItem): MobileNavIcon {
  const text = `${item.label} ${item.href}`.toLowerCase();

  if (item.icon) return item.icon;
  if (text.includes("inventory")) return "inventory";
  if (text.includes("dispatch")) return "dispatch";
  if (text.includes("qc")) return "qc";
  if (text.includes("users")) return "users";
  if (text.includes("reports")) return "reports";
  if (text.includes("products")) return "products";
  if (text.includes("place-order") || text.includes("place order")) return "order";
  if (text.includes("orders")) return "orders";
  if (text.includes("deliveries")) return "deliveries";
  if (text.includes("collections")) return "collections";
  if (text.includes("visits")) return "visits";

  return "dashboard";
}

function MobileIcon({ icon }: { icon: MobileNavIcon }) {
  const common = {
    className: "h-5 w-5",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
  };

  if (icon === "inventory") {
    return (
      <svg {...common}>
        <path d="M4 7.5L12 3L20 7.5L12 12L4 7.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M4 12L12 16.5L20 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 16.5L12 21L20 16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "dispatch") {
    return (
      <svg {...common}>
        <path d="M3.5 7.5H15.5V17H3.5V7.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M15.5 10.5H19L21 13V17H15.5V10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M7 19.5C8.10457 19.5 9 18.6046 9 17.5C9 16.3954 8.10457 15.5 7 15.5C5.89543 15.5 5 16.3954 5 17.5C5 18.6046 5.89543 19.5 7 19.5Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M18 19.5C19.1046 19.5 20 18.6046 20 17.5C20 16.3954 19.1046 15.5 18 15.5C16.8954 15.5 16 16.3954 16 17.5C16 18.6046 16.8954 19.5 18 19.5Z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "qc") {
    return (
      <svg {...common}>
        <path d="M12 3.5L19 6.5V11.5C19 16 16.15 19.85 12 21C7.85 19.85 5 16 5 11.5V6.5L12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8.5 12L10.7 14.2L15.7 9.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "users") {
    return (
      <svg {...common}>
        <path d="M9.5 11.5C11.433 11.5 13 9.933 13 8C13 6.067 11.433 4.5 9.5 4.5C7.567 4.5 6 6.067 6 8C6 9.933 7.567 11.5 9.5 11.5Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 20C4.5 16.8 6.45 15 9.5 15C12.55 15 14.5 16.8 15 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M15 5.5C16.7 5.9 18 7.35 18 9.1C18 10.85 16.7 12.3 15 12.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16.5 15.4C18.55 16 19.75 17.55 20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "reports") {
    return (
      <svg {...common}>
        <path d="M5 20V4H19V20H5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8 16V12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 16V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16 16V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "products") {
    return (
      <svg {...common}>
        <path d="M6 7H18L17 20H7L6 7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 7C9 4.8 10.1 3.5 12 3.5C13.9 3.5 15 4.8 15 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "order") {
    return (
      <svg {...common}>
        <path d="M6 4.5H18V19.5H6V4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 9H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M9 13H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16.5 16.5H20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M18.5 14.5V18.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "orders") {
    return (
      <svg {...common}>
        <path d="M7 4.5H17V19.5H7V4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M10 8.5H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M10 12H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M10 15.5H12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "deliveries") {
    return (
      <svg {...common}>
        <path d="M4 6.5H14.5V17.5H4V6.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M14.5 10H18.5L21 13V17.5H14.5V10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8 20C9.10457 20 10 19.1046 10 18C10 16.8954 9.10457 16 8 16C6.89543 16 6 16.8954 6 18C6 19.1046 6.89543 20 8 20Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M18 20C19.1046 20 20 19.1046 20 18C20 16.8954 19.1046 16 18 16C16.8954 16 16 16.8954 16 18C16 19.1046 16.8954 20 18 20Z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "collections") {
    return (
      <svg {...common}>
        <path d="M4.5 7.5H19.5V18.5H4.5V7.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M7 7.5V5.5H17V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 16C13.6569 16 15 14.6569 15 13C15 11.3431 13.6569 10 12 10C10.3431 10 9 11.3431 9 13C9 14.6569 10.3431 16 12 16Z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "visits") {
    return (
      <svg {...common}>
        <path d="M12 21C12 21 18 15.7 18 10C18 6.686 15.314 4 12 4C8.686 4 6 6.686 6 10C6 15.7 12 21 12 21Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 12.5C13.3807 12.5 14.5 11.3807 14.5 10C14.5 8.61929 13.3807 7.5 12 7.5C10.6193 7.5 9.5 8.61929 9.5 10C9.5 11.3807 10.6193 12.5 12 12.5Z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M4 10.5L12 4L20 10.5V20H14.5V14H9.5V20H4V10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function MobileBottomNavigation({
  items,
  theme = "light",
}: {
  items: MobileNavItem[];
  theme?: "dark" | "light";
}) {
  const pathname = usePathname();

  const shellClass =
    theme === "light"
      ? "border-slate-200 bg-white/95 text-slate-500 shadow-[0_-12px_40px_rgba(15,23,42,0.08)]"
      : "border-slate-200 bg-white/95 text-slate-500 shadow-[0_-12px_40px_rgba(15,23,42,0.08)]";

  const activeClass =
    theme === "light"
      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
      : "bg-blue-50 text-blue-700 ring-1 ring-blue-100";

  const inactiveClass =
    theme === "light"
      ? "hover:bg-slate-100 hover:text-slate-950"
      : "hover:bg-slate-100 hover:text-slate-950";

  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-50 border-t px-2 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 backdrop-blur-xl lg:hidden ${shellClass}`}
    >
      <div className="mx-auto flex max-w-md gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[58px] min-w-[66px] flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[10px] font-bold transition ${
                isActive ? activeClass : inactiveClass
              }`}
            >
              <MobileIcon icon={getIconFromItem(item)} />
              <span className="max-w-[58px] truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
