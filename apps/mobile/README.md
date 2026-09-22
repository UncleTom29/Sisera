# Sisera Mobile

Expo + React Native + TypeScript trading app (spec §6, §32). Tabs: Home, Markets, Trade,
Portfolio, Agents, Alerts, Sisera AI. Uses the shared `@sisera/api-client`.

## Setup (operator)

```bash
cd apps/mobile
npm install
npx expo start
```

Point `SISERA_API_URL` at the backend (LAN URL for device testing, not localhost).
Secure key storage (Expo SecureStore), biometrics, and push notifications are wired at
the native layer when building via EAS; this scaffold includes the navigation + API
integration. Privy email/Google login plugs in here (`@privy-io/expo`, see
`docs/auth-privy.md`).
