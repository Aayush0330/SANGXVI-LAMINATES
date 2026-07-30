export function FieldNavigationIcon({
  href,
  className = "h-5 w-5",
}: {
  href: string;
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

  if (href === "/field/dashboard") {
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
        <rect x="13.5" y="11" width="7" height="9.5" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      </svg>
    );
  }

  if (href === "/field/deliveries") {
    return (
      <svg {...common}>
        <path d="M3.5 6.5h11v10h-11zM14.5 10h3.7l2.3 3v3.5h-6z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17.5" cy="18" r="2" />
      </svg>
    );
  }

  if (href === "/field/collections") {
    return (
      <svg {...common}>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      </svg>
    );
  }

  if (href === "/field/visits") {
    return (
      <svg {...common}>
        <path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z" />
        <circle cx="12" cy="10" r="2.3" />
      </svg>
    );
  }

  if (href === "/internal/dealers") {
    return (
      <svg {...common}>
        <path d="M4 10h16M5 10V6h14v4M6 10v9h12v-9" />
        <path d="M9 14h6M9 19v-3h6v3" />
      </svg>
    );
  }

  if (href === "/internal/inquiries") {
    return (
      <svg {...common}>
        <path d="M4 5.5h16v11H9l-5 4v-15Z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    );
  }

  if (href === "/account/tasks") {
    return (
      <svg {...common}>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="m3.5 6 1.2 1.2L7 4.9M3.5 12l1.2 1.2L7 10.9M3.5 18l1.2 1.2L7 16.9" />
      </svg>
    );
  }

  if (href === "/account/attendance") {
    return (
      <svg {...common}>
        <path d="M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
        <path d="m8 14 2 2 5-5" />
      </svg>
    );
  }

  if (href === "/account/attendance/payslips") {
    return (
      <svg {...common}>
        <path d="M6 3h9l3 3v15H6V3Z" />
        <path d="M15 3v4h4M9 11h6M9 15h6M9 18h4" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
