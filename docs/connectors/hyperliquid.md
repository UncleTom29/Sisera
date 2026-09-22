# Hyperliquid Connector

**Status:** `EXPERIMENTAL` when enabled, `DISABLED` by default. Paper/testnet market data
only. Live `/exchange` writes are **not wired**.

## Architecture

- `HyperliquidClient` — read-only `/info` POST client (`metaAndAssetCtxs`, `l2Book`,
  `allMids`, `candle`, `fundingHistory`). No auth. Mainnet
  `https://api.hyperliquid.xyz/info`, testnet `https://api.hyperliquid-testnet.xyz/info`.
- `HyperliquidVenueAdapter` — normalizes `/info` into canonical `sisera_schemas` events;
  paper execution delegates to `PaperExecutionEngine`; live calls raise `VenueUnavailable`.
- Deterministic fixtures in `tests/fixtures.py`; contract tests against the Bybit adapter
  shape in `tests/test_hyperliquid.py`.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `SISERA_HYPERLIQUID_ENABLED` | No (default `false`) | Master switch; connector refuses all calls unless `true` |
| `SISERA_HYPERLIQUID_BASE_URL` | No | Override `/info` URL (testnet for sandbox) |
| `SISERA_HYPERLIQUID_WALLET_ADDRESS` | For live reads (balances/positions) | Account to query |
| `SISERA_HYPERLIQUID_PRIVATE_KEY` | For live writes (future) | **Agent wallet key, trading-only. Never commit. Never log.** |

## To enable live trading (future, not yet implemented)

1. Generate a dedicated **agent wallet** (not your main key) and approve it on Hyperliquid.
2. Fund testnet via the faucet; verify on `https://api.hyperliquid-testnet.xyz`.
3. Set `SISERA_HYPERLIQUID_ENABLED=true`, point base URL at testnet, provide the agent
   private key via env/secret manager.
4. Implement EIP-712 `/exchange` signing (see `hyperliquid-python-sdk` reference) behind
   `LiveTradingGuard`; classify the connector `SANDBOX_VERIFIED` only after testnet fills.
5. Never enable mainnet writes without `SISERA_ENVIRONMENT=prod` **and**
   `SISERA_LIVE_TRADING_ENABLED=true` plus a passing testnet period.

## References

- Official info/exchange docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
- Testnet: `https://api.hyperliquid-testnet.xyz` (faucet USDC)
