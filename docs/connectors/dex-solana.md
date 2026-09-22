# Solana DEX Connector (Jupiter-style)

**Status:** `EXPERIMENTAL` when enabled, `DISABLED` by default. Quote reads only. No
signing, no transaction submission.

## Architecture

- `SolanaQuoteClient` — `GET {base}/swap/v2/order?inputMint=&outputMint=&amount=`
  (Jupiter Swap API v2; `x-api-key` header; no `taker` so quote-only, no transaction
  assembled). `/execute` + signing out of scope.
- `SolanaVenueAdapter.quote()` → canonical `DexQuote` (amounts, price impact, router).
  `execute_swap()` raises `VenueUnavailable`.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `SISERA_SOLANA_DEX_ENABLED` | No (default `false`) | Master switch |
| `SISERA_JUPITER_API_KEY` | For live quotes | **Never commit.** |
| Wallet keys | For execution (future) | **Never commit. Signing + `/execute` not wired.** |

## To enable execution (future)

1. Use a dedicated wallet; fetch `/order` with `taker`, verify the assembled transaction
   (mints, amounts, slippage, router) before signing.
2. Sign locally (hardware/MPC); submit via your own RPC; confirm landing.
3. Gate behind `LiveTradingGuard`; classify `SANDBOX_VERIFIED` only after paper rehearsal.
