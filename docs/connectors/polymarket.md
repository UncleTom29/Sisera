# Polymarket Connector

**Status:** `EXPERIMENTAL` when enabled, `DISABLED` by default. Public market-data reads
only. Authenticated CLOB trading is **not wired**.

## Architecture

- `PolymarketClient` — Gamma (`https://gamma-api.polymarket.com/markets`, `/events`,
  public, no key) + CLOB public (`https://clob.polymarket.com/book`, `/price`,
  `/midpoint`, public, no auth).
- `PolymarketVenueAdapter` — Gamma rows → canonical `PredictionMarket`/`PredictionEvent`
  (`sisera_domain.prediction`); outcome probabilities → `PredictionPriceUpdate` events.
- Deterministic fixtures in `tests/fixtures.py`; 6 tests, no network.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `SISERA_POLYMARKET_ENABLED` | No (default `false`) | Master switch; refuses all calls unless `true` |
| `SISERA_POLYMARKET_WALLET_ADDRESS` | For live position reads (future) | Polygon address |
| `SISERA_POLYMARKET_API_KEY/SECRET/PASSPHRASE` | For live trading (future) | **L2 credentials. Never commit. Never log.** |
| `SISERA_POLYMARKET_PRIVATE_KEY` | For live trading (future) | **Wallet key for L1/EIP-712. Never commit.** |

## To enable live trading (future, not yet implemented)

1. Create a dedicated Polygon wallet; derive CLOB API credentials via L1 EIP-712
   (`POST /auth/api-key` with `POLY_ADDRESS/SIGNATURE/TIMESTAMP/NONCE`).
2. Fund with USDC on Polygon; verify reads on staging (`clob-staging`).
3. Implement L2 HMAC signing + EIP-712 order authorization behind `LiveTradingGuard`;
   classify `SANDBOX_VERIFIED` only after staging fills.
4. Never enable mainnet writes without `SISERA_ENVIRONMENT=prod` **and**
   `SISERA_LIVE_TRADING_ENABLED=true`.

## References

- Gamma + CLOB docs: https://docs.polymarket.com/getting-started/api
- CLOB OpenAPI: https://docs.polymarket.com/api-spec/clob-openapi.yaml
