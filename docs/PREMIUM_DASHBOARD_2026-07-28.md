# Premium Operations Dashboard

Date: 28 July 2026

## Outcome

The internal landing experience is now an operational command center instead of
a decorative summary page. It uses permission-aware navigation, scalable
aggregate queries, live workflow status, and actionable exception queues.

No database schema change or migration is required for this redesign.

## Experience Changes

- Replaced the legacy shell with a fixed desktop sidebar that follows the
  selected light or dark theme and keeps navigation independent from the
  pinned logout footer.
- Added an authorized command menu with `Ctrl/Command + K`, search, arrow-key
  navigation, Enter selection, and Escape dismissal.
- Added a mobile-first bottom navigation with four priority modules and an
  accessible all-modules drawer.
- Added a compact top bar with the current module, user identity, notification
  access, portal switching, theme control, and logout.
- Added dedicated dashboard loading and error states.
- Added reduced-motion behavior for users who request it.

## Dashboard Information Architecture

1. Executive header with role, date, data freshness, range selection, and
   permission-aware quick actions.
2. Four role-specific KPI cards.
3. Action Center for operational decisions and exceptions.
4. Active workflow pipeline derived from real order statuses.
5. Order momentum across 7, 30, or 90 days.
6. Stock risk for authorized inventory users, or queue health for other teams.
7. Recent orders with value, commitment date, priority, and current status.
8. Real order-status audit activity with actor and timestamp.

## Metric Definitions

| Metric | Definition |
| --- | --- |
| Order Value | Sum of order-item line totals for orders created in the selected India-time window |
| Open Orders | Orders not in Delivered, Invoice Uploaded, or Cancelled |
| Past Required Date | Open orders whose required date is earlier than the snapshot time |
| High Priority | Open orders with High, Urgent, or Critical priority |
| Delivered in Period | Orders whose delivered timestamp falls in the selected window |
| Stock at Risk | Active products at or below minimum available stock, or explicitly marked Low/Out of Stock |
| Collections Outstanding | Remaining amount on non-verified, non-cancelled collection assignments |
| Overdue Tasks | Open tasks with a due timestamp earlier than the snapshot time |

The previous-period comparison uses the same elapsed day portion as the current
window so percentage changes are not distorted by a full-day versus partial-day
comparison.

## Permission Behavior

- Owner and Manager receive business-wide order, inventory, collection, and
  exception views.
- QC receives QC queue, rework, dispatch-ready, and transit metrics.
- Physical Dispatch receives physical-check, blocked-order, task, and delivery
  metrics.
- Order Receiving receives intake, assignment, priority, and commitment metrics.
- Accountant-only users continue to receive the finance-focused dashboard.
- Workflow links fall back to the authorized all-orders view when the user
  cannot access a specialist module.
- Inventory and collection queries only run for roles allowed to view those
  workspaces.

## Query and Runtime Design

- Aggregate SQL is used for summary cards, workflow stages, stock, collections,
  tasks, and chart buckets.
- Recent orders and activity use bounded Prisma queries.
- Dashboard queries run concurrently.
- Result lists are capped to keep response size predictable.
- India time is used for day boundaries and displayed dates.
- Active pipeline calculations exclude historical closed orders.

## Verification

Run before deployment:

```bash
npm run check
npm run build
npm audit --omit=dev
```

The dashboard reads existing data only. It does not mutate production records.
