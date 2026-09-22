# Security

Sisera is execution infrastructure. Security and correct accounting take precedence over
features (see `docs/architecture.md` §2). This document is the security posture and
incident surface.

## Reporting a vulnerability

Do **not** open a public issue. Report suspected vulnerabilities privately to the
repository owner. Include steps to reproduce and the affected component.

## Credential handling

- **Never commit** API keys, wallet keys/seed phrases, cookies, database files, or auth
  sessions. See `docs/security/credential-remediation.md` for the Phase 0 remediation and
  the manual rotation checklist.
- All secrets are read from environment variables and modeled as `pydantic.SecretStr`
  (`packages/config`); they are masked in `repr`, logs, and redacted summaries.
- Trading keys must be **trading-only** (no withdrawal permissions).

## Live-trading safety

- Live trading is **disabled by default**. `packages/config`'s `LiveTradingGuard` refuses
  live order submission unless `SISERA_ENVIRONMENT=prod` **and**
  `SISERA_LIVE_TRADING_ENABLED=true` are both set.
- Test/staging environments can never accidentally submit live orders.
- Paper and testnet execution are always allowed.

## Critical invariants

1. **LLMs never place trades** (`docs/adr/ADR-008-llm-execution-isolation.md`). The
   deterministic policy/risk/approval/OMS path is the only route to execution.
2. **Risk is deterministic** — no LLM decides whether risk constraints apply.
3. **The financial ledger is accounting** — orders/portfolio tables are not.
4. **Every live number has provenance** — no invisible fallback constants
   (`docs/adr/ADR-010-market-data-quality.md`).

## Scope of this repository

Sisera does **not** implement its own cryptographic custody. Wallet/custody integrations
must use external wallets, WalletConnect, hardware wallets, MPC custodians, or
institutional custody providers (spec §36). Any signing service must enforce deterministic
policy before requesting signatures.

## Supply chain

- CI runs `ruff`, the full test suite, `gitleaks` (secret scan), and `pip-audit`
  (dependency audit) on every push/PR (`.github/workflows/ci.yml`).
- SBOM generation and container scanning are tracked for later phases.
