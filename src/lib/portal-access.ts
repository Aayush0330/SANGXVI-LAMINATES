import type { PortalType, UserRole } from "./permissions";
import { getPortalByRole } from "./permissions";

export type PortalAccessItem = {
  portal: PortalType;
  role: UserRole;
  label: string;
  shortLabel: string;
  description: string;
  href: string;
};

const portalRolePriority: Record<PortalType, readonly UserRole[]> = {
  internal: [
    "owner",
    "manager",
    "accountant",
    "order_team",
    "qc_team",
    "dispatch_team",
    "sales_field_team",
    "collection_team",
  ],
  field: ["driver_transport", "collection_team", "sales_field_team"],
  dealer: ["dealer"],
};

export function getPortalRole(
  roles: readonly UserRole[],
  portal: PortalType,
): UserRole | null {
  const uniqueRoles = [...new Set(roles)];
  const primaryRole = uniqueRoles[0];

  if (primaryRole && getPortalByRole(primaryRole) === portal) {
    return primaryRole;
  }

  return (
    portalRolePriority[portal].find((role) => uniqueRoles.includes(role)) ??
    uniqueRoles.find((role) => getPortalByRole(role) === portal) ??
    null
  );
}

export function getPortalLandingPath(role: UserRole) {
  const portal = getPortalByRole(role);

  if (role === "driver_transport") return "/field/deliveries";
  if (role === "collection_team") return "/field/collections";
  if (role === "sales_field_team") return "/field/visits";
  if (portal === "dealer") return "/dealer/dashboard";
  if (portal === "field") return "/field/dashboard";
  return "/internal/dashboard";
}

export function getPortalLandingPathForRoles(
  roles: readonly UserRole[],
  portal: PortalType,
) {
  const portalRole = getPortalRole(roles, portal);

  if (!portalRole) return getPortalLandingPath(roles[0] ?? "owner");
  if (portal === "internal" && getPortalByRole(portalRole) !== "internal") {
    return "/internal/dealers";
  }
  return getPortalLandingPath(portalRole);
}

export function getPortalAccessItems(
  roles: readonly UserRole[],
): PortalAccessItem[] {
  const items: PortalAccessItem[] = [];

  for (const portal of ["internal", "field", "dealer"] as const) {
    const role = getPortalRole(roles, portal);

    if (!role) continue;

    if (portal === "internal") {
      items.push({
        portal,
        role,
        label: "Internal ERP",
        shortLabel: "Internal",
        description: "Office operations and management",
        href:
          getPortalByRole(role) === "internal"
            ? getPortalLandingPath(role)
            : "/internal/dealers",
      });
      continue;
    }

    if (role === "driver_transport") {
      items.push({
        portal,
        role,
        label: "Driver Portal",
        shortLabel: "Driver",
        description: "Assigned deliveries and proof upload",
        href: getPortalLandingPath(role),
      });
      continue;
    }

    if (role === "collection_team") {
      items.push({
        portal,
        role,
        label: "Collection Portal",
        shortLabel: "Collection",
        description: "Collection tasks and payment proof",
        href: getPortalLandingPath(role),
      });
      continue;
    }

    if (role === "sales_field_team") {
      items.push({
        portal,
        role,
        label: "Sales / Field Portal",
        shortLabel: "Field",
        description: "Field visits and inquiries",
        href: getPortalLandingPath(role),
      });
      continue;
    }

    items.push({
      portal,
      role,
      label: "Dealer Portal",
      shortLabel: "Dealer",
      description: "Products, orders and tracking",
      href: getPortalLandingPath(role),
    });
  }

  return items;
}

export function getPortalLandingLabel(role: UserRole) {
  if (role === "collection_team") return "Back to Collection Portal";
  if (role === "sales_field_team") return "Back to Sales / Field Portal";
  if (role === "driver_transport") return "Back to Driver Portal";
  if (role === "dealer") return "Back to Dealer Portal";
  return "Back to Internal Dashboard";
}

export function getPortalDisplayCopy(role: UserRole) {
  if (role === "collection_team") {
    return {
      eyebrow: "Collection Portal",
      title: "Collection Portal",
      description: "Collections",
    };
  }

  if (role === "driver_transport") {
    return {
      eyebrow: "Driver Portal",
      title: "Transport / Driver Portal",
      description: "Deliveries",
    };
  }

  if (role === "sales_field_team") {
    return {
      eyebrow: "Sales Field Portal",
      title: "Sales / Field Portal",
      description: "Field visits",
    };
  }

  if (role === "dealer") {
    return {
      eyebrow: "Dealer Portal",
      title: "Dealer Portal",
      description: "Dealer operations",
    };
  }

  return {
    eyebrow: "Internal ERP",
    title: "Internal ERP",
    description: "Operations",
  };
}
