# Sanghvi ERP — Production hardening report

Date: 28 July 2026
Scope: attached application source, Prisma migrations, database snapshot and
backup artifacts.

## Current verdict

The code hardening pass is complete and all local/isolated checks listed below
pass. Production deployment is **blocked** by two external release gates:

1. The latest supplied database backup records checksum mismatches for two
   already-applied migrations:
   - `20260716130000_dispatch_assignment_workflow`
   - `20260718210000_phase2_integrity_pricing_cancellation`
2. Production secrets, managed PostgreSQL PITR, an offsite backup copy and
   durable private archive storage must be configured and tested.

The drift was not “fixed” by editing the database ledger or guessing the old
files. The deploy command now fails closed when an applied migration does not
match local source. Restore the exact files originally deployed, compare their
effects with the production schema, take a verified backup, and obtain human
approval before continuing.

No attached/live production database was modified during this work.

## Implemented fixes

### Database and workflow integrity

- Added a new corrective migration instead of rewriting applied history.
- Normalized contradictory legacy counters for terminal delivered/invoiced and
  cancelled orders.
- Added database constraints for full-quantity-only order items, mutually
  exclusive fulfilment counters, non-negative inventory, valid collection
  amounts and purchase quantity progression.
- Added triggers that prevent cancelled/invoiced orders from reopening,
  restrict delivered orders to invoice progression, require explicit
  cancellation decisions, and protect terminal order items from mutation or
  deletion.
- Made stock reservation/release, order cancellation, receiving, physical
  assignment, QC, dispatch, delivery, purchase receipt/cancellation and
  collection transitions conditional and transactional.
- Added row locks where concurrent submissions could previously resurrect
  terminal work or double-apply stock/payment changes.
- Added auditable manual inventory adjustment events.

The corrective migration deliberately stops if it finds an ambiguous
non-terminal order with delivered/cancelled quantities. Such a row requires
human review instead of automatic guessing.

### Authentication and authorization

- Added login throttling by normalized email and client IP with a 15-minute
  window.
- Removed account-existence detail from login responses and added dummy password
  verification for unknown users.
- Invalidated all sessions after password change and deleted expired/inactive
  sessions.
- Protected the last active owner with a transactional advisory lock.
- Made owner checks and operational collection/attendance access aware of
  secondary roles.
- Added production security headers: CSP, HSTS, frame denial, MIME sniffing
  protection, restrictive referrer/permissions policy and cross-origin
  isolation headers.

### Attendance, notifications and uploads

- Enforced JPEG signature/base64/size validation for punch-in photos.
- Required usable GPS accuracy for geofenced attendance and made punch/break
  transitions concurrency-safe.
- Avoided duplicating approved attendance photos in event/attempt tables.
- Sanitized notification destinations to internal same-origin paths, including
  backslash-based URL escapes.
- Reopened deduplicated notifications as genuinely unread recipient records and
  included secondary-role recipients.
- Added visibility-aware notification polling and safe service-worker
  navigation.
- Added row locks and multi-role checks to collection proof and status changes.

### Backup, restore and deployment safety

- Removed project-root runtime file discovery that previously caused raw
  backups and `dev.db` to enter server traces.
- Production backup/archive directories now require absolute durable private
  paths and reject filesystem roots and temporary storage.
- Added path-containment checks, private file modes, SHA-256 manifests,
  bounded subprocess errors and a PostgreSQL advisory lock for backups.
- Database connection URLs are passed to `pg_dump` and `psql` through child
  process environment variables instead of process arguments.
- Backup creation from the UI is an authenticated same-origin `POST`; `GET`
  returns `405`.
- The automatic backup schedule is every four hours.
- Removed database migration from the application build. Migration is now an
  explicit release step with checksum preflight and no automatic
  `migrate resolve`.
- Added a production restore confirmation token and pre-restore backup
  safeguards.

### Dependencies, seed and documentation

- Updated Next.js/ESLint config to `16.2.12` and Prisma packages to `7.9.1`.
- Patched transitive dependency versions while preserving lint compatibility.
- Split seed behavior into safe `bootstrap` and explicit `demo` modes.
- Removed default seed passwords, fixed physical dispatch team data and added
  valid demo prices/GST values.
- Made seed writes transactional and switched TypeScript scripts to the
  non-IPC Node loader.
- Added `.env.example`, deterministic checks, and updated deployment/backup
  runbooks.

## Verification evidence

| Check | Result |
|---|---:|
| Unit hardening tests | 8 passed |
| ESLint | Passed |
| TypeScript (`tsc --noEmit`) | Passed |
| Production Next.js build | Passed, no tracer warning |
| `npm audit` | 0 vulnerabilities |
| Fresh migration chain | 50 migrations, 59 tables |
| Database rejection checks | 9 passed |
| Latest supplied backup upgrade | 59 tables loaded; 1 terminal conflict normalized; 0 ambiguous rows |
| Bootstrap seed | 1 owner, 0 demo products |
| Demo seed | 10 users, 5 fully priced products |
| Migration checksum gate | Matching ledger passes; deliberate drift fails |
| Sensitive Next.js trace scan | 0 backup/database/docs/scripts entries |

The isolated migration and seed databases were removed after verification.

## Required production release gates

1. Recover the exact original contents of the two drifted migration files and
   run `npm run db:status` against a restored production copy.
2. Take and independently verify a fresh production backup.
3. Configure unique database, cron and restore secrets in the deployment secret
   store.
4. Enable managed PITR and a separate offsite export; run a restore drill.
5. Run `npm ci`, `npm run check`, `npm audit`, `npm run db:status`, then
   `npm run db:deploy` in that order.
6. Build/deploy and perform authenticated smoke tests for every portal.
7. Complete responsive browser QA and business-user acceptance with real
   workflows.

Do not bypass the checksum gate, edit `_prisma_migrations` casually, or run
`prisma migrate reset` against production.
