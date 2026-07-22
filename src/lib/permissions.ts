export type UserRole =
  | "owner"
  | "manager"
  | "accountant"
  | "dispatch_team"
  | "order_team"
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
  | "manage_inventory_inquiries"
  | "manage_dispatch"
  | "manage_order_receiving"
  | "manage_transport_options"
  | "manage_work_teams"
  | "manage_work_tasks"
  | "view_my_work_tasks"
  | "manage_qc"
  | "view_reports"
  | "view_security_logs"
  | "view_alert_center"
  | "manage_alert_center"
  | "manage_backups"
  | "view_suppliers"
  | "manage_suppliers"
  | "manage_purchase_requests"
  | "approve_purchase_requests"
  | "receive_purchase_stock"
  | "use_office_attendance"
  | "manage_attendance"
  | "view_attendance_summary"
  | "manage_payroll"
  | "view_payslips"
  | "view_own_payslips"
  | "manage_hr"
  | "view_hr_reports"
  | "manage_attendance_settings"
  | "manage_dealer_orders"
  | "view_dealer_directory"
  | "manage_dealer_directory"
  | "create_internal_dealer_orders"
  | "view_order_journey"
  | "view_dealer_products"
  | "place_dealer_order"
  | "track_dealer_orders"
  | "view_assigned_deliveries"
  | "update_delivery_status"
  | "upload_delivery_proof"
  | "manage_delivery_proofs"
  | "manage_collections"
  | "manage_field_visits"
  | "view_field_visit_reports";

export const roleLabels: Record<UserRole, string> = {
  owner: "Owner",
  manager: "Manager",
  accountant: "Accountant",
  dispatch_team: "Physical Dispatch Team",
  order_team: "Order Receiving Team",
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
  dispatch_team: "internal",
  order_team: "internal",
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
    "manage_inventory_inquiries",
    "manage_dispatch",
    "manage_order_receiving",
    "manage_transport_options",
    "manage_delivery_proofs",
    "manage_work_teams",
    "manage_work_tasks",
    "view_my_work_tasks",
    "manage_qc",
    "view_reports",
    "view_security_logs",
    "view_alert_center",
    "manage_alert_center",
    "manage_backups",
    "view_suppliers",
    "manage_suppliers",
    "manage_purchase_requests",
    "approve_purchase_requests",
    "receive_purchase_stock",
    "use_office_attendance",
    "manage_attendance",
    "view_attendance_summary",
    "manage_payroll",
    "view_payslips",
    "view_own_payslips",
    "view_hr_reports",
    "manage_hr",
    "manage_attendance_settings",
    "manage_dealer_orders",
    "view_dealer_directory",
    "manage_dealer_directory",
    "create_internal_dealer_orders",
    "view_order_journey",
    "view_dealer_products",
    "track_dealer_orders",
    "view_assigned_deliveries",
    "update_delivery_status",
    "upload_delivery_proof",
    "manage_collections",
    "manage_field_visits",
    "view_field_visit_reports",
  ],
  manager: [
    "view_internal_dashboard",
    "manage_inventory",
    "manage_inventory_inquiries",
    "manage_dispatch",
    "manage_order_receiving",
    "manage_transport_options",
    "manage_delivery_proofs",
    "manage_work_teams",
    "manage_work_tasks",
    "view_my_work_tasks",
    "manage_qc",
    "view_reports",
    "view_alert_center",
    "manage_alert_center",
    "view_suppliers",
    "manage_suppliers",
    "manage_purchase_requests",
    "receive_purchase_stock",
    "manage_collections",
    "use_office_attendance",
    "manage_attendance",
    "view_attendance_summary",
    "manage_payroll",
    "view_payslips",
    "manage_dealer_orders",
    "view_dealer_directory",
    "manage_dealer_directory",
    "create_internal_dealer_orders",
    "view_order_journey",
    "view_field_visit_reports",
    "view_own_payslips",
    "manage_hr",
    "view_hr_reports",
  ],
  accountant: [
    "view_alert_center",
    "view_internal_dashboard",
    "view_reports",
    "use_office_attendance",
    "view_my_work_tasks",
    "manage_collections",
    "view_dealer_directory",
    "view_suppliers",
    "view_attendance_summary",
    "manage_payroll",
    "view_payslips",
    "view_own_payslips",
    "view_hr_reports",
  ],
  dispatch_team: [
    "view_alert_center",
    "view_internal_dashboard",
    "use_office_attendance",
    "view_own_payslips",
    "view_my_work_tasks",
    "manage_dispatch",
    "manage_dealer_orders",
    "view_order_journey",
  ],
  order_team: [
    "view_alert_center",
    "view_internal_dashboard",
    "use_office_attendance",
    "view_own_payslips",
    "view_my_work_tasks",
    "manage_order_receiving",
    "manage_dealer_orders",
    "view_dealer_directory",
    "view_order_journey",
  ],
  qc_team: [
    "view_alert_center",
    "view_internal_dashboard",
    "use_office_attendance",
    "view_own_payslips",
    "view_my_work_tasks",
    "manage_qc",
    "manage_transport_options",
    "manage_dealer_orders",
    "view_order_journey",
  ],
  driver_transport: [
    "view_alert_center",
    "use_office_attendance",
    "view_own_payslips",
    "view_my_work_tasks",
    "view_assigned_deliveries",
    "update_delivery_status",
    "upload_delivery_proof",
  ],
  collection_team: [
    "view_alert_center",
    "use_office_attendance",
    "view_own_payslips",
    "view_my_work_tasks",
    "manage_collections",
    "view_dealer_directory",
    "upload_delivery_proof",
  ],
  sales_field_team: [
    "view_alert_center",
    "use_office_attendance",
    "view_own_payslips",
    "view_my_work_tasks",
    "manage_inventory_inquiries",
    "manage_field_visits",
    "view_dealer_directory",
    "create_internal_dealer_orders",
  ],
  dealer: ["view_dealer_products", "place_dealer_order", "track_dealer_orders"],
};

function normalizeRoles(roles: UserRole | readonly UserRole[]): readonly UserRole[] {
  return Array.isArray(roles) ? (roles as readonly UserRole[]) : [roles as UserRole];
}

export function hasPermission(
  roles: UserRole | readonly UserRole[],
  permission: Permission,
) {
  return normalizeRoles(roles).some((role) =>
    rolePermissions[role].includes(permission),
  );
}

export function hasRole(
  roles: UserRole | readonly UserRole[],
  role: UserRole,
) {
  return normalizeRoles(roles).includes(role);
}

export function hasAnyRole(
  roles: UserRole | readonly UserRole[],
  allowed: readonly UserRole[],
) {
  return normalizeRoles(roles).some((role) => allowed.includes(role));
}

export function getPortalByRole(role: UserRole) {
  return rolePortalMap[role];
}
