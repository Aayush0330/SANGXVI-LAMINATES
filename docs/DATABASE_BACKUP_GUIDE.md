# Database backup and restore

## Download a backup from the ERP UI

Open **Internal → Backups** and click **Generate & Download Backup**.

The web download is production-safe for normal hosted deployments:

- it generates a fresh `.sql.gz` export at request time;
- it sends the file directly to the browser;
- it does not read from or write permanent files in `backups/database`;
- it deletes the temporary runtime file after preparing the response.

For production, set `BACKUP_DATABASE_URL` to the hosted PostgreSQL connection
string. If `BACKUP_DATABASE_URL` is not set, the route falls back to
`DATABASE_URL`.

The hosting runtime must have `pg_dump` available. If it is not available, use
a Docker/server deployment that includes PostgreSQL client tools, or use your
database provider's managed backup/export feature.

## Create a local/scheduled CLI backup

```bash
npm run db:backup
```

CLI backups are written to `backups/database` as compressed `.sql.gz` files.
This folder is for local use or scheduled server jobs only; the ERP web
download page does not list or depend on it.
The command checks the database connection first. When `DATABASE_URL` points
to localhost and the database is stopped, it starts the configured Prisma Dev
instance automatically. Data is dumped as SQL `INSERT` statements because the
local Prisma Dev database does not reliably support `pg_dump`'s default
`COPY ... TO stdout` mode. Prisma Dev's internal WAL schema is excluded from
the archive. When the configured database is the default Prisma Dev TCP port$
(`51214`), a running instance is briefly restarted before backup to clear
proxy session state and make repeated backups reliable.

Local defaults:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable"
PRISMA_DEV_NAME="default"
BACKUP_DIR="backups/database"
BACKUP_RETENTION_DAYS="30"
PG_DUMP_PATH="pg_dump"
PSQL_PATH="psql"
```

`pg_dump` and `psql` must be installed. On macOS with Homebrew:

```bash
brew install libpq
brew link --force libpq
```

## Verify a backup

```bash
gzip -t backups/database/sanghvi-erp-<timestamp>.sql.gz
```

Successful and failed attempts are recorded in
`backups/database/backup-log.jsonl`.

## Restore a backup

Restore replaces database objects and data. Confirm the target
`DATABASE_URL` before running:

```bash
npm run db:restore -- backups/database/sanghvi-erp-<timestamp>.sql.gz --yes
```

The `--yes` flag is required because restore is destructive.

## Local Prisma Dev note

Prisma Dev's local Postgres proxy can sometimes keep a stale prepared statement
session for `pg_dump`, causing an error like:

```txt
prepared statement "dumpenumtype" already exists
```

The ERP download route handles this only for local databases by restarting the
configured Prisma Dev instance once and retrying the dump. Set
`PRISMA_DEV_NAME` if your local instance name is not `default`.

Daily database backup system has been added.
The system can generate compressed PostgreSQL backup files using npm run db:backup.
On server, the hosting team can schedule the same command daily using cron.
