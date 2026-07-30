# Sanghvi ERP — Launch readiness

Current assessment: see
[PRODUCTION_HARDENING_2026-07-28.md](PRODUCTION_HARDENING_2026-07-28.md).

The code hardening and isolated verification suite pass. Production release is
still blocked until the two historical migration checksum mismatches are
reconciled against the exact originally deployed migration files, and
production backup/PITR infrastructure and secrets are configured.

Never run `prisma migrate reset` against production.
