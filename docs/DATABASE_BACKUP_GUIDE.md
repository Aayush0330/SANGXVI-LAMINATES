# Database backup and restore runbook

## Production requirements

The application creates compressed PostgreSQL dumps with SHA-256 manifests.
Production requires:

- `pg_dump` and `psql` compatible with the PostgreSQL server;
- an absolute `BACKUP_DIR` on a durable, private, encrypted volume;
- an absolute `DAILY_ARCHIVE_DIR` on the same class of storage;
- a unique `CRON_SECRET`;
- a separate 24+ character `RESTORE_CONFIRMATION_TOKEN`;
- a managed PostgreSQL backup/PITR policy and an independent offsite copy.

The application rejects temporary storage such as `/tmp` in production. A
serverless function filesystem is not durable storage. If the deployment has no
persistent private mount, run exports from a controlled worker/server and rely
on the database provider’s PITR capability.

Example:

```env
BACKUP_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
BACKUP_DIR="/var/lib/sanghvi-erp/database-backups"
DAILY_ARCHIVE_DIR="/var/lib/sanghvi-erp/daily-archives"
BACKUP_RETENTION_DAYS="30"
PSQL_PATH="psql"
CRON_SECRET="<unique-random-secret>"
RESTORE_CONFIRMATION_TOKEN="<different-unique-random-secret>"
```

Directories and generated backup/manifest files are created with private Unix
permissions. Volume-level encryption and access controls remain deployment
responsibilities.

## Create a backup

From the ERP, an owner can open **Internal → Backups** and submit
**Generate & Download Backup**. Generation is a same-origin authenticated
`POST`; a plain `GET` cannot create a backup.

From the server CLI:

```bash
npm run db:backup
```

Scheduled:

```bash
npm run db:backup:auto
```

The protected `/api/cron/backup` endpoint can also run this operation. Send
`Authorization: Bearer <CRON_SECRET>`. The included schedule is every four
hours, but it is usable only on a runtime with durable storage.

Only one dump can run at a time; a PostgreSQL advisory lock rejects overlapping
jobs. Database credentials are passed to `pg_dump` through the process
environment, not command-line arguments.

## Verify a backup

Use the application verifier so both gzip integrity and the SHA-256 manifest are
checked:

```bash
npm run db:backup:verify -- /absolute/path/to/sanghvi-erp-automatic-<timestamp>.sql.gz
```

Also run a scheduled restore drill into an isolated non-production database.
Successful dump creation alone does not prove recoverability.

## Restore

Restore replaces database objects and data. Validate the target URL and keep a
separate copy of the selected backup.

Local/non-production:

```bash
npm run db:restore -- /absolute/path/to/backup.sql.gz --yes
```

Production requires all three safeguards:

```bash
npm run db:restore -- /absolute/path/to/backup.sql.gz \
  --yes \
  --production \
  --confirm-token='<exact RESTORE_CONFIRMATION_TOKEN>'
```

By default, the command verifies the manifest and creates a pre-restore safety
backup. `--allow-unverified` and `--skip-restore-point` are emergency controls;
use either only after documented human review.

## Operational checklist

- Alert on a missed four-hour backup window or any failed `BackupRecord`.
- Copy successful backups to a second account/region with retention controls.
- Rotate database and cron credentials on an established schedule.
- Test restore into an isolated database at least monthly.
- Record recovery time and recovery point achieved during each drill.
