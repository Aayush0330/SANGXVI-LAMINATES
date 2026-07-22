# Sanghvi ERP — Phase 10 Launch Readiness

Generated: 19 July 2026

## Verified locally

- Production build, TypeScript and ESLint pass.
- Owner/Manager/Inventory/QC/Dispatch/Accountant/Dealer/Driver/HR permission paths are covered by authenticated regression checks.
- Dealer order flow passes: saved cart → order receiving → physical team assignment → full physical verification → QC approval → transport/driver assignment → on the way → delivered.
- Supplier flow passes: purchase request → owner approval → ordered → in transit → stock receipt.
- Concurrent duplicate stock-receipt submission adds stock once and creates one receipt.
- Dealer-to-dealer and employee-to-employee data isolation pass.
- Owner-only backup/security/user routes and exports reject unauthorized roles.
- Archived dealer and supplier records reject edits.
- Delivery-proof and product-image type, size and file-signature validation are enabled.
- All six cron routes fail closed without `CRON_SECRET`; task-reminder authorization passes with the configured secret.
- Existing database has all 49 migrations applied.
- An isolated fresh PostgreSQL database successfully applied all 49 migrations and created 59 tables; the temporary database was removed afterward.
- Duplicate email/product-code, orphan-row and invalid-stock audits report zero.
- Known launch/demo passwords were rotated to unique temporary passwords, all sessions invalidated, and all accounts require password change at next login.
- Final post-rotation backup and SHA-256 manifest verification pass.
- Production restore requires `--production`, `--yes`, and a separate 24+ character confirmation token; the negative safety test passes.

## Required before production sign-off

- Replace local `DATABASE_URL`, `BACKUP_DATABASE_URL`, `APP_URL`, and `NEXT_PUBLIC_APP_URL` with production values.
- Replace the current placeholder `CRON_SECRET`, configure `RESTORE_CONFIRMATION_TOKEN`, and set every documented environment variable in the deployment platform.
- Configure durable backup/archive and upload storage. A deployment filesystem must not be assumed to be persistent.
- Run responsive visual QA at 1920, 1440, 1366, 1280, tablet, mobile and 320 px in both themes. The in-app browser was unavailable during this run, so visual sign-off is not claimed.
- Deploy, run migrations with `prisma migrate deploy`, perform production smoke tests for every portal, and obtain client acceptance.
- Review the one-time credentials file, distribute credentials securely, then delete that file.

## Repeatable verification commands

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run db:migrations:fresh-test
npx tsx scripts/audit-phase10.ts
PHASE10_BASE_URL=http://127.0.0.1:3110 npx tsx scripts/verify-phase10-security.ts
PHASE9_BASE_URL=http://127.0.0.1:3110 npx tsx scripts/verify-phase9.ts
PHASE10_BASE_URL=http://127.0.0.1:3110 npx tsx scripts/verify-cron-security.ts
npm run db:backup
npm run db:backup:verify -- <backup-file>
```

Never run `prisma migrate reset` against production.
