# EVM DEX Connector (1inch-style)

**Status:** `EXPERIMENTAL` when enabled, `DISABLED` by default. Quote reads only. No
signing, no approvals, no on-chain execution.

## Architecture

- `EVMQuoteClient` — `GET {base}/v6.1/{chain_id}/quote?src=&dst=&amount=` (1inch Swap API
  v6.1; requires API key for live). `/swap` calldata + router signing out of scope.
- `EVMVenueAdapter.quote()` → canonical `DexQuote` (amounts, effective price, gas).
  `execute_swap()` raises `VenueUnavailable`.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `SISERA_EVM_DEX_ENABLED` | No (default `false`) | Master switch |
| `SISERA_EVM_DEX_API_KEY` | For live quotes | **1inch API key. Never commit.** |
| `SISERA_EVM_DEX_CHAIN_ID` | No (default `1`) | EVM chain id |
| Wallet keys | For execution (future) | **Never commit. Router approval + signing not wired.** |

## To enable execution (future)

1. Use a dedicated wallet; approve the router for exact amounts (never unlimited).
2. Build `/swap` calldata off-chain, simulate, then sign locally via hardware/MPC.
3. Gate behind `LiveTradingGuard` + testnet rehearsal; classify `SANDBOX_VERIFIED` first.
