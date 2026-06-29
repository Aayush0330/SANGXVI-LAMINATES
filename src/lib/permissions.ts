export type UserRole =
  | "owner"
  | "manager"
  | "accountant"
  | "inventory_team"
  | "dispatch_team"
  | "qc_team"
  | "driver_transport"
  | "collection_team"
  | "sales_field_team"
  | "dealer";

export type PortalType = "internal" | "dealer" | "field";

export type Permission =
  | "view_internal_dashboard"
  | "manage_users"
  | "manage_inventory"
  | "manage_dispatch"
  | "manage_qc"
  | "view_reports"
  | "view_security_logs"
  | "manage_dealer_orders"
  | "view_dealer_products"
  | "place_dealer_order"
  | "track_dealer_orders"
  | "view_assigned_deliveries"
  | "update_delivery_status"
  | "upload_delivery_proof"
  | "manage_collections"
  | "manage_field_visits";

export const roleLabels: Record<UserRole, string> = {
  owner: "Owner",
  manager: "Manager",
  accountant: "Accountant",
  inventory_team: "Inventory Team",
  dispatch_team: "Dispatch Team",
  qc_team: "QC Team",
  driver_transport: "Driver / Transport",
  collection_team: "Collection Team",
  sales_field_team: "Sales / Field Team",
  dealer: "Dealer",
};

export const rolePortalMap: Record<UserRole, PortalType> = {
  owner: "internal",
  manager: "internal",
  accountant: "internal",
  inventory_team: "internal",
  dispatch_team: "internal",
  qc_team: "internal",
  driver_transport: "field",
  collection_team: "field",
  sales_field_team: "field",
  dealer: "dealer",
};

export const rolePermissions: Record<UserRole, Permission[]> = {
  owner: [
    "view_internal_dashboard",
    "manage_users",
    "manage_inventory",
    "manage_dispatch",
    "manage_qc",
    "view_reports",
    "view_security_logs",
    "manage_dealer_orders",
    "view_dealer_products",
    "place_dealer_order",
    "track_dealer_orders",
    "view_assigned_deliveries",
    "update_delivery_status",
    "upload_delivery_proof",
    "manage_collections",
    "manage_field_visits",
  ],

  manager: [
    "view_internal_dashboard",
    "manage_inventory",
    "manage_dispatch",
    "manage_qc",
    "view_reports",
    "manage_dealer_orders",
  ],

  accountant: [
    "view_internal_dashboard",
    "view_reports",
    "manage_collections",
  ],

  inventory_team: [
    "view_internal_dashboard",
    "manage_inventory",
    "manage_dispatch",
  ],

  dispatch_team: [
    "view_internal_dashboard",
    "manage_dispatch",
    "manage_dealer_orders",
  ],

  qc_team: [
    "view_internal_dashboard",
    "manage_qc",
  ],

  driver_transport: [
    "view_assigned_deliveries",
    "update_delivery_status",
    "upload_delivery_proof",
  ],

  collection_team: [
    "manage_collections",
    "upload_delivery_proof",
  ],

  sales_field_team: [
    "manage_field_visits",
  ],

  dealer: [
    "view_dealer_products",
    "place_dealer_order",
    "track_dealer_orders",
  ],
};

export function hasPermission(role: UserRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function getPortalByRole(role: UserRole) {
  return rolePortalMap[role];
}
