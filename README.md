# Sanghvi ERP

Production-oriented ERP dashboard for Sanghvi Laminates operations, built with
Next.js, React, PostgreSQL and Prisma.

## Local setup

Requirements: Node.js 20+, PostgreSQL, and PostgreSQL client tools (`pg_dump`
and `psql`) when backup/restore commands are used.

```bash
cp .env.example .env
npm ci
npx prisma generate
npm run db:deploy
SEED_MODE=demo SEED_INITIAL_PASSWORD='replace-with-a-strong-password' npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

`SEED_MODE=demo` is only for local/demo environments. Production bootstrap is:

```bash
SEED_MODE=bootstrap \
SEED_OWNER_EMAIL='owner@example.com' \
SEED_INITIAL_PASSWORD='replace-with-a-unique-strong-password' \
npm run db:seed
```

Bootstrap mode creates the owner and operational reference data without demo
employees or products. Remove `SEED_INITIAL_PASSWORD` from runtime environment
variables after the one-time seed.

## Verification

```bash
npm ci
npm run check
npm audit
DATABASE_URL='<local-postgres-url>' npm run db:migrations:fresh-test
DATABASE_URL='<production-url>' npm run db:status
npm run build
```

`db:migrations:fresh-test` is intentionally restricted to localhost and creates
then removes an isolated temporary database.

## Production release order

Database migration is an explicit release operation; the application build does
not mutate a database.

1. Take and verify a recoverable database backup.
2. Run `npm ci` and `npm run check`.
3. Run `npm run db:status` against the exact production database.
4. Run `npm run db:deploy`.
5. Build and deploy the application.
6. Smoke-test login and each operational portal.

Do not edit an already-applied migration. If `prisma migrate status` reports
checksum drift or a failed migration, stop the release, preserve a backup, and
reconcile the database with the exact migration source that was originally
deployed. Use `prisma migrate resolve` only after a human has verified the
database state; the application deliberately performs no automatic resolution.
Never run `prisma migrate reset` against production.

## Production configuration

Copy the variables in `.env.example` into the deployment secret store. At
minimum, configure a production PostgreSQL URL, a unique `CRON_SECRET`, and a
separate restore confirmation token.

`BACKUP_DIR` and `DAILY_ARCHIVE_DIR` must be absolute paths on durable, private,
encrypted storage. Temporary/serverless filesystems are rejected in production.
For Vercel or another ephemeral runtime, use managed PostgreSQL point-in-time
recovery plus an independently configured offsite export job; do not treat a
function filesystem as a backup destination.

See [docs/DATABASE_BACKUP_GUIDE.md](docs/DATABASE_BACKUP_GUIDE.md) for the
backup, verification and restore procedure.

## Google Calendar

Sanghvi ERP can automatically send dated tasks, order progress and payment
timelines to one Google Calendar. The integration is intentionally one-way:
ERP remains the source of truth. See
[docs/GOOGLE_CALENDAR_SETUP.md](docs/GOOGLE_CALENDAR_SETUP.md) for the initial
Gmail test, owner-account handover and production configuration.

The internal portal uses a permission-aware operations command center with
role-specific KPIs, active workflow queues, exception handling, and scalable
aggregate queries. See
[docs/PREMIUM_DASHBOARD_2026-07-28.md](docs/PREMIUM_DASHBOARD_2026-07-28.md)
for its metric definitions and behavior.

## PWA

Production must be served over HTTPS. On Android, use Chrome’s **Install App**.
On iPhone, use Safari’s **Share → Add to Home Screen**. Business records are
not cached for offline use; offline navigation shows a reconnect screen.

## Included modules

- Owner and multi-role user management
- Premium role-aware operations dashboard and command navigation
- Dealer catalogue, cart and order placement
- Order receiving, physical verification, QC, transport and delivery
- Inventory reservation and supplier purchasing
- Collections, field visits and attendance with GPS quality checks
- HR, payroll, reports, tasks, security audit and notifications
