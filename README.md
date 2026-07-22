# Sanghvi ERP

Production ERP dashboard for Sanghvi Laminates operations.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Database

```bash
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
```

## Included modules

- Owner and role-based user management
- Dealer product search and order placement
- Order receiving handoff
- Inventory stock check and stock blocking
- QC approval
- Dispatch and transport assignment
- Driver delivery updates and signed invoice proof upload
- Collections and field visits
- Attendance with office geofence
- Reports, security logs, teams and tasks
- Role/user notification center for ERP handoffs
