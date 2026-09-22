# Credential Remediation

> Immediate security remediation for Sisera, produced in Phase 0. This document records
> what was exposed, what was done in-repo, and — critically — what the operator must rotate
> out-of-band, because **Sisera cannot rotate third-party credentials for you**.

---

## 1. What was exposed

### 1.1 A live Telegram MTProto session committed to Git

`sisera_telegram_news.session` was tracked in the repository (commit `e77bfcd`). This file
is a **SQLite database containing the authenticated Telegram user-account session** used by
the Breaking News monitor (`sisera/data/telegram_news.py`). Anyone who can read the repo
can use this session to act as that Telegram account.

- **Status:** `git rm --cached` applied; `*.session` / `*.session-journal` added to
  `.gitignore`. The file still exists on disk (now ignored) and must be **revoked** (below).

### 1.2 A populated `.env` in the working tree

The `.env` file is correctly gitignored and was **not** committed, but it contains real
secrets. Because the repository is a single public-origin repo and the session above was
committed, treat every credential below as **potentially exposed** and rotate.

### 1.3 `.DS_Store` files

Non-sensitive, but `.DS_Store` files were committed; untracked and ignored now.

---

## 2. What the operator must rotate (manual, out-of-band)

| Credential | Env var(s) | Rotation action |
|---|---|---|
| **Telegram account session** | `SISERA_TELEGRAM_NEWS_API_ID`, `SISERA_TELEGRAM_NEWS_API_HASH`, `sisera_telegram_news.session` | In Telegram: **Settings → Devices → Terminate all other sessions** (or terminate the affected session), then optionally regenerate the API id/hash at <https://my.telegram.org>. Re-run `uv run python scripts/telegram_login.py` to create a fresh session. **Delete the old `sisera_telegram_news.session` file from disk.** |
| OpenRouter API key | `SISERA_OPENROUTER_API_KEY` | Revoke/rotate at <https://openrouter.ai/keys>, then update `.env`. |
| FRED API key | `SISERA_FRED_API_KEY` | Request a new key at <https://fred.stlouisfed.org/docs/api/api_key.html>, update `.env`. |
| X / Twitter bearer token | `SISERA_X_BEARER_TOKEN` | Revoke/rotate in the X developer portal, update `.env`. |
| Bybit API key/secret | `SISERA_BYBIT_API_KEY`, `SISERA_BYBIT_API_SECRET` | Currently empty in the repo, but if you ever populated them, rotate at Bybit and **create keys with trading-only permissions (no withdrawal)**. |
| Telegram bot token | `SISERA_TELEGRAM_BOT_TOKEN` | If set, rotate via @BotFather (`/revoke`). |

**Do not** commit a rotated value back into the repo. `.env` is gitignored; keep it that way.

---

## 3. What was done in-repo

1. Untracked `sisera_telegram_news.session`, `.DS_Store`, `sisera/.DS_Store` from Git.
2. Added `.session`, `.session-journal`, `*.key`, `*.pem`, `*.db-wal`, `*.db-shm`,
   `.env.*` (with `!.env.example`), and `.DS_Store` to `.gitignore`.
3. Verified that `.env` was **never** committed (checked Git history — the repo has a
   single commit and does not contain `.env`).
4. Scanned tracked source for hardcoded secrets: none found. All credentials are read from
   environment variables in `sisera/config.py`; the `.env.example` file contains only
   placeholders and safe defaults.

---

## 4. Git history caveat

Because the session file was part of the **initial** commit, simply untracking it does not
purge it from history. Anyone cloning the repo still receives the compromised session in
that commit. Two options:

- **Preferred:** rotate the Telegram session (Section 2). Once rotated, the leaked session
  is worthless, and no history rewrite is strictly required.
- **Optional (cleanliness):** rewrite history to purge the file (`git filter-repo
  --path sisera_telegram_news.session --invert-paths`) and force-push. This requires
  coordination with all collaborators and will change commit SHAs.

Until the session is rotated, treat the Telegram account as compromised regardless of any
history rewrite.

---

## 5. Standing policy

- Never commit: API keys, wallet keys/seed phrases, cookies, database files, or auth
  sessions.
- Live trading remains **disabled by default** (`SISERA_LIVE_TRADING_ENABLED=false` is the
  V2 guard; see `docs/architecture.md`).
- Secret scanning will be added to CI (Phase 0/1) so this class of leak is caught before
  merge.
