import type { Permission } from "./permissions";

export type NavigationItem = {
  label: string;
  href: string;
  permission: Permission;
};

export const internalNavigation: NavigationItem[] = [
  // Main: daily work and the fastest path to the complete order journey.
  {
    label: "Dashboard",
    href: "/internal/dashboard",
    permission: "view_internal_dashboard",
  },
  {
    label: "All Orders",
    href: "/internal/orders",
    permission: "view_order_journey",
  },
  {
    label: "My Tasks",
    href: "/account/tasks",
    permission: "view_my_work_tasks",
  },
  {
    label: "Inquiries",
    href: "/internal/inquiries",
    permission: "manage_inventory_inquiries",
  },
  {
    label: "Dealers",
    href: "/internal/dealers",
    permission: "view_dealer_directory",
  },

  // Workforce: people, attendance and internal work management.
  {
    label: "My Attendance",
    href: "/account/attendance",
    permission: "use_office_attendance",
  },
  {
    label: "My Payslips",
    href: "/account/attendance/payslips",
    permission: "view_own_payslips",
  },
  {
    label: "Attendance",
    href: "/internal/attendance",
    permission: "manage_attendance",
  },
  {
    label: "Attendance Summary",
    href: "/internal/attendance/summary",
    permission: "view_attendance_summary",
  },
  {
    label: "Physical Teams",
    href: "/internal/teams",
    permission: "manage_work_teams",
  },
  {
    label: "Tasks",
    href: "/internal/tasks",
    permission: "manage_work_tasks",
  },
  {
    label: "Payroll",
    href: "/internal/attendance/payroll",
    permission: "manage_payroll",
  },
  {
    label: "Payslips",
    href: "/internal/attendance/payroll/payslips",
    permission: "view_payslips",
  },
  {
    label: "HR Center",
    href: "/internal/hr",
    permission: "manage_hr",
  },
  {
    label: "HR Reports",
    href: "/internal/hr/reports",
    permission: "view_hr_reports",
  },
  {
    label: "Office Setup",
    href: "/internal/attendance/settings",
    permission: "manage_attendance_settings",
  },

  // Operations: order execution, delivery and stock workflows.
  {
    label: "Workflow Control",
    href: "/internal/order-receiving",
    permission: "manage_order_receiving",
  },
  {
    label: "Physical Checks",
    href: "/internal/dispatch",
    permission: "manage_dispatch",
  },
  {
    label: "QC & Delivery",
    href: "/internal/qc",
    permission: "manage_qc",
  },
  {
    label: "Transport Options",
    href: "/internal/transport",
    permission: "manage_transport_options",
  },
  {
    label: "Delivery Proofs",
    href: "/internal/delivery-proofs",
    permission: "manage_delivery_proofs",
  },
  {
    label: "Products",
    href: "/internal/inventory",
    permission: "manage_inventory",
  },
  {
    label: "Suppliers",
    href: "/internal/suppliers",
    permission: "view_suppliers",
  },
  {
    label: "Reorder & Purchases",
    href: "/internal/reorder",
    permission: "view_suppliers",
  },
  {
    label: "Inventory Insights",
    href: "/internal/inventory/insights",
    permission: "manage_inventory",
  },
  {
    label: "Stock Calendar",
    href: "/internal/inventory/calendar",
    permission: "manage_inventory",
  },
  {
    label: "Collections",
    href: "/internal/collections",
    permission: "manage_collections",
  },
  {
    label: "Field Visits",
    href: "/internal/field-visits",
    permission: "view_field_visit_reports",
  },

  // Administration: configuration, access, reporting and recovery.
  {
    label: "Users",
    href: "/internal/users",
    permission: "manage_users",
  },
  {
    label: "Dealer Members",
    href: "/internal/users/dealer-members",
    permission: "manage_users",
  },
  {
    label: "Reports",
    href: "/internal/reports",
    permission: "view_reports",
  },
  {
    label: "Alerts",
    href: "/internal/alerts",
    permission: "view_alert_center",
  },
  {
    label: "Security Logs",
    href: "/internal/security",
    permission: "view_security_logs",
  },
  {
    label: "Backups",
    href: "/internal/backups",
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
    label: "Catalogue",
    href: "/dealer/products",
    permission: "view_dealer_products",
  },
  {
    label: "New Order",
    href: "/dealer/place-order",
    permission: "place_dealer_order",
  },
  {
    label: "My Orders",
    href: "/dealer/orders",
    permission: "track_dealer_orders",
  },
  {
    label: "Profile",
    href: "/dealer/profile",
    permission: "track_dealer_orders",
  },
];

export const fieldNavigation: NavigationItem[] = [
  {
    label: "Dealers",
    href: "/internal/dealers",
    permission: "view_dealer_directory",
  },
  {
    label: "My Tasks",
    href: "/account/tasks",
    permission: "view_my_work_tasks",
  },
  {
    label: "Inquiries",
    href: "/internal/inquiries",
    permission: "manage_inventory_inquiries",
  },
  {
    label: "Attendance",
    href: "/account/attendance",
    permission: "use_office_attendance",
  },
  {
    label: "My Payslips",
    href: "/account/attendance/payslips",
    permission: "view_own_payslips",
  },
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
