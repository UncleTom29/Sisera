# Generic CCXT Connector (second CEX)

**Status:** `EXPERIMENTAL` when enabled, `DISABLED` by default. Paper/testnet market data
only. Live trading requires exchange API keys + `LiveTradingGuard`.

## Architecture

- `CCXTVenueAdapter` wraps any CCXT exchange instance (`ccxt.binance()`, `ccxt.okx()`,
  `ccxt.coinbase()`, …) behind the canonical interface. Binance is the documented concrete
  second venue.
- Market data normalizes CCXT `fetch_ticker` / `fetch_ohlcv` into canonical events.
  Upstream failures raise `VenueUnavailable` — never silently faked.
- Execution delegates to `PaperExecutionEngine` until live keys are configured.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `SISERA_CCXT_VENUE` | No (default `binance`) | CCXT exchange id |
| `SISERA_CCXT_ENABLED` | No (default `false`) | Master switch |
| `SISERA_CCXT_API_KEY/SECRET` | For live (future) | **Trading-only keys. Never commit.** |
| `SISERA_CCXT_TESTNET` | No (default `true`) | Use exchange sandbox/testnet |

## To enable live (future)

1. Create trading-only API keys (no withdrawal) on the venue; enable testnet/sandbox first.
2. Verify paper market-data reads, then testnet order placement behind `LiveTradingGuard`.
3. Classify `SANDBOX_VERIFIED` only after testnet fills; mainnet requires
   `SISERA_ENVIRONMENT=prod` + `SISERA_LIVE_TRADING_ENABLED=true`.
