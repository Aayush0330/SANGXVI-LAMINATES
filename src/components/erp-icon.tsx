export type ErpIconName =
  | "activity"
  | "alert"
  | "calendar"
  | "chevron-right"
  | "close"
  | "collection"
  | "dashboard"
  | "delivery"
  | "inventory"
  | "menu"
  | "message"
  | "orders"
  | "plus"
  | "quality"
  | "revenue"
  | "search"
  | "tasks"
  | "users";

export function ErpIcon({
  name,
  className = "h-5 w-5",
}: {
  name: ErpIconName;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "dashboard") {
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
        <rect x="13.5" y="11" width="7" height="9.5" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      </svg>
    );
  }

  if (name === "orders") {
    return (
      <svg {...common}>
        <path d="M7 3.5h10v17H7z" />
        <path d="M10 8h4M10 12h4M10 16h2.5" />
      </svg>
    );
  }

  if (name === "revenue") {
    return (
      <svg {...common}>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="M7 9h10M8 14h3M16 14h.01" />
      </svg>
    );
  }

  if (name === "inventory") {
    return (
      <svg {...common}>
        <path d="m12 3 8 4-8 4-8-4 8-4Z" />
        <path d="m4 11 8 4 8-4M4 15l8 4 8-4" />
      </svg>
    );
  }

  if (name === "collection") {
    return (
      <svg {...common}>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      </svg>
    );
  }

  if (name === "alert") {
    return (
      <svg {...common}>
        <path d="M12 3.5 21 20H3L12 3.5Z" />
        <path d="M12 9v4.5M12 17h.01" />
      </svg>
    );
  }

  if (name === "message") {
    return (
      <svg {...common}>
        <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z" />
        <path d="M8.5 8.5c.6 3.2 2.3 4.9 5.5 5.6l1.2-1.2c.2-.2.5-.3.8-.2l2 .8" />
      </svg>
    );
  }

  if (name === "tasks") {
    return (
      <svg {...common}>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="m3.5 6 1.2 1.2L7 4.9M3.5 12l1.2 1.2L7 10.9M3.5 18l1.2 1.2L7 16.9" />
      </svg>
    );
  }

  if (name === "delivery") {
    return (
      <svg {...common}>
        <path d="M3.5 6.5h11v10h-11zM14.5 10h3.7l2.3 3v3.5h-6z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17.5" cy="18" r="2" />
      </svg>
    );
  }

  if (name === "quality") {
    return (
      <svg {...common}>
        <path d="M12 3.5 19 6.5v5c0 4.5-2.85 8.35-7 9.5-4.15-1.15-7-5-7-9.5v-5l7-3Z" />
        <path d="m8.5 12 2.2 2.2 4.8-4.8" />
      </svg>
    );
  }

  if (name === "activity") {
    return (
      <svg {...common}>
        <path d="M3 12h4l2-5 4 10 2-5h6" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M7 3v4M17 3v4M3.5 9.5h17" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3.5 20c.5-3.7 2.4-5.5 5.5-5.5s5 1.8 5.5 5.5M16 5.5a3.5 3.5 0 0 1 0 6.8M17 15c2 .7 3.2 2.3 3.5 5" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
    );
  }

  if (name === "plus") {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }

  if (name === "close") {
    return (
      <svg {...common}>
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  }

  if (name === "menu") {
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
