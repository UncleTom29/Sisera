# Privy Authentication (email + Google)

**Status:** Backend JWT verification implemented and tested. Frontend SDK integration
(Next.js + Expo) pending `apps/` build. Disabled by default; refuses without configuration.

## Architecture

- **Frontend (pending):** Privy React SDK (`apps/web`) + Expo SDK (`apps/mobile`) with
  email + Google login. Privy issues a JWT on successful login.
- **Backend (done):** `PrivyVerifier` (`services/auth`) validates the JWT via JWKS
  (ES256, `aud` = App ID, `exp`/`sub` required), extracting `user_id`/`email`/`provider`
  into Sisera's RBAC (`AuthRepository.has_permission`).
- The verifier never passes through unverified tokens and never logs secrets.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `SISERA_PRIVY_APP_ID` | Yes (to enable) | Privy App ID (JWT `aud`) |
| `SISERA_PRIVY_ENABLED` | No (default `false`) | Master switch; verification refuses unless `true` |
| `SISERA_PRIVY_JWKS_URL` | No (default Privy JWKS) | Override JWKS endpoint (tests inject a fake) |
| `SISERA_PRIVY_SECRET` | For user management API (future) | **Privy secret. Never commit. Server-only.** |

## Setup (operator)

1. Create a Privy app at https://dashboard.privy.io; enable **Email** + **Google** login
   methods; set allowed origins (`http://localhost:3000`, production domains).
2. Copy the **App ID** into `SISERA_PRIVY_APP_ID`; set `SISERA_PRIVY_ENABLED=true`.
3. Frontend: install `@privy-io/react-auth` (web) / `@privy-io/expo` (mobile), initialize
   with the App ID, and send the JWT as `Authorization: Bearer <token>` to `/api/v1`.
4. Backend verifies via JWKS; map `user_id` → Sisera `User` + `Membership` for RBAC.
5. Never expose `SISERA_PRIVY_SECRET` to clients; rotate via the Privy dashboard if leaked.
