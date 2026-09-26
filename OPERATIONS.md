# Sisera production operations

Production runs on the Contabo VPS with PostgreSQL on loopback, `sisera-api` and `sisera-web` systemd units, and Nginx in front of the web service. GitHub Actions deploys pushes to `main` using `.github/workflows/deploy.yml`. The VPS environment file is `/opt/sisera/.env.production` (or `.env` when that is the installed configuration); it is not committed.

## Release checks

1. CI must pass lint, typecheck, tests, and build before the SSH deployment job starts.
2. The deployment job verifies Privy settings, requires a local PostgreSQL URL, and takes a `pg_dump` snapshot in `/opt/sisera-backups` before running migrations.
3. After restart, `/health/live` confirms the API process; `/health/ready` confirms essential configuration and the expected database migration. The deployment job must pass readiness and public sign-in asset checks.
4. Live trading flags default to `false`. Enable one venue only after its ownership, risk, order state, and reconciliation checks have been verified with a controlled account. Hyperliquid live execution remains disabled while those checks are incomplete.

## Diagnosing a failed release

Check the `deploy-production` GitHub Actions run for the failing step. On the VPS, inspect `systemctl status sisera-api sisera-web`, `journalctl -u sisera-api -n 100`, and `journalctl -u sisera-web -n 100`. Check `curl -fsS http://127.0.0.1:4200/health/ready`; it reports configuration and database status without printing credentials. Match the response's `x-request-id` with API logs when investigating an account error.

If a migration fails, keep the application stopped or on the previous code until the schema is reviewed. Restore only from a verified backup using a controlled maintenance window; do not run an automatic destructive rollback. The timestamped pre-migration dump in `/opt/sisera-backups` is the restore source. Test a restore into a separate database before touching production.

## Secrets and incident response

Supply provider keys through GitHub Actions secrets or the VPS environment file. Never place API keys in `NEXT_PUBLIC_` variables, client bundles, logs, or Git. Rotate keys that have been pasted into chat or issue text. If a live order is uncertain, leave its state `unknown`, inspect the venue or chain using its order ID or signature, and reconcile it before retrying. Pause the corresponding `SISERA_LIVE_*_ENABLED` flag during a venue outage.

## Current limitations

Readiness checks the database and identity configuration. Provider health, authenticated browser journeys, account reconciliation, and backup restore drills still need separate checks. A green readiness response is not evidence that live trading is safe to enable.
