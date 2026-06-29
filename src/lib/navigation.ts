import type { Permission } from "./permissions";

export type NavigationItem = {
  label: string;
  href: string;
  permission: Permission;
};

export const internalNavigation: NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/internal/dashboard",
    permission: "view_internal_dashboard",
  },
  {
    label: "Inventory",
    href: "/internal/inventory",
    permission: "manage_inventory",
  },
  {
    label: "Dispatch",
    href: "/internal/dispatch",
    permission: "manage_dispatch",
  },
  {
    label: "QC",
    href: "/internal/qc",
    permission: "manage_qc",
  },
  {
    label: "Users",
    href: "/internal/users",
    permission: "manage_users",
  },
  {
    label: "Reports",
    href: "/internal/reports",
    permission: "view_reports",
  },
  {
    label: "Security Logs",
    href: "/internal/security",
    permission: "view_security_logs",
  },
];

export const dealerNavigation: NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/dealer/dashboard",
    permission: "track_dealer_orders",
  },
  {
    label: "Search Products",
    href: "/dealer/products",
    permission: "view_dealer_products",
  },
  {
    label: "Place Order",
    href: "/dealer/place-order",
    permission: "place_dealer_order",
  },
  {
    label: "My Orders",
    href: "/dealer/orders",
    permission: "track_dealer_orders",
  },
];

export const fieldNavigation: NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/field/dashboard",
    permission: "view_assigned_deliveries",
  },
  {
    label: "Deliveries",
    href: "/field/deliveries",
    permission: "view_assigned_deliveries",
  },
  {
    label: "Collections",
    href: "/field/collections",
    permission: "manage_collections",
  },
  {
    label: "Visits",
    href: "/field/visits",
    permission: "manage_field_visits",
  },
];
