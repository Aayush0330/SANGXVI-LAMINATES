# Sanghvi ERP

Production ERP dashboard for Sanghvi Laminates operations.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Install on a phone

The ERP is configured as a Progressive Web App (PWA). Production must be served
over HTTPS for phone installation.

- Android (Chrome): open the ERP, tap **Install App**, and confirm.
- iPhone (Safari): open the ERP, tap **Share**, then **Add to Home Screen**.

The installed app uses the same ERP server and database as the desktop site.
Business data is not stored for offline use; if the phone loses connectivity,
the app shows a safe reconnect screen.

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
