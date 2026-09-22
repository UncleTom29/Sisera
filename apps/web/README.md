# Sisera Web Terminal

Next.js + TypeScript trading terminal (spec §6, §29). Uses the shared
`@sisera/api-client` against the versioned `/api/v1` backend and `@sisera/ui` tokens.

## Setup (operator)

```bash
cd apps/web
npm install
SISERA_API_URL=http://localhost:8000 npm run dev
```

Open http://localhost:3000. The backend (`make dev`, port 8000) must be running.

## Structure

- `app/` — App Router pages (Dashboard, Trade, Portfolio, Markets, …)
- `lib/api.ts` — `SiseraClient` singleton
- `lib/store.ts` — Zustand terminal state (symbol, portfolio, data quality)
- `hooks/useRealtime.ts` — WebSocket fan-out hook (spec §46)

Stale/delayed data is surfaced via `qualityLabel` badges (spec §30); live trading is
never enabled from this client (paper only until the backend gates it).
