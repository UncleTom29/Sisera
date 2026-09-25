# Market data provenance

Sisera keeps spot, perpetual, and reference markets separate. The terminal and screener default to Hyperliquid perpetuals because its public feed is reachable in the current local environment. Selecting Binance spot never substitutes a perpetual quote.

| Surface | Source | Public endpoint | Semantics |
| --- | --- | --- | --- |
| Perpetual market metadata, mark, funding, open interest, 24h notional | Hyperliquid | `POST https://api.hyperliquid.xyz/info` with `type=metaAndAssetCtxs` | `markPx` is displayed as **mark**, not last trade. `dayNtlVlm` is quote notional. Funding is a fractional hourly rate. |
| Perpetual bid, ask, and depth | Hyperliquid | `type=l2Book` | Top book prices and levels; venue timestamp comes from `time`. |
| Perpetual candles | Hyperliquid | `type=candleSnapshot` | Verified venue OHLCV, not interpolated. |
| Spot market data | Binance | `/api/v3/exchangeInfo`, `/api/v3/ticker`, `/api/v3/depth`, `/api/v3/klines` | Used only for Binance spot instruments. |
| Reference prices | CoinGecko | `/api/v3/coins/markets` | Shown only when selected spot venue is unavailable; never used for order pricing. |
| Prediction events | Polymarket Gamma | `/events` | Indexed event probability snapshots; not an executable order book. Unpriced events are skipped. |
| Chain TVL | DeFiLlama | `GET https://api.llama.fi/v2/chains` | Current public TVL snapshot, fetched time shown; not a full macro-regime classification. |
| Observed perp wallet | Hyperliquid | `type=clearinghouseState` | Requires a user-supplied public address. Data is read-only, not reconciled, and never grants order authority. The address is sent to Hyperliquid's public API. |

The source and observed time are displayed next to market data. A missing response leaves a panel unavailable rather than synthesizing values. Account-specific portfolio, risk, agent, and audit data require authenticated account state and cannot be fabricated from public feeds. Paper orders remain guarded by reconciled balances, mandate limits, and a fresh same-venue quote; Hyperliquid perp paper execution is not yet enabled.

Official references: [Hyperliquid info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint), [Hyperliquid perpetual contexts](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals), [Binance public market data](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md).
