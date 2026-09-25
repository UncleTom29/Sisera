# Market data provenance

Sisera keeps tokenized stocks, spot, perpetual, and reference markets separate. The default
workspace centers Solana stocks. Hyperliquid perpetuals and Binance spot remain secondary;
selecting one never substitutes the other's quotes.

| Surface | Source | Public endpoint | Semantics |
| --- | --- | --- | --- |
| Pre-IPO catalogue | PreStocks | `GET https://prestocks.com/api/prestocks` | Token price, issuer mark, valuation, supply and Solana mint. Premium and supply-value are derived. The source does not provide quote timestamps, candles, liquidity or holders. |
| Equity reference | Pyth Pro | Authenticated `POST /v1/latest_price` | Uses `feedUpdateTimestamp` to distinguish current from carried-forward/stale prices. A reference feed is not an executable token price. |
| Solana wallet observation | Helius | RPC `getBalance`, DAS `getAssetsByOwner` | Read-only balances. Not account reconciliation or trade authorization. |
| Agent-token discovery | Clawpump | Authenticated `GET /tokens/search`, `/price` | Provider search/verification claims; not a safe-token endorsement. |
| Company articles | GNews/Finnhub | Authenticated search/company-news | Publication time is attached; GNews free-tier results may be delayed. |
| Stock research assessment | OpenRouter | Authenticated chat completion with strict JSON schema | On-demand, source-contextual, non-executable model output. Provider/model availability depends on configured credentials. |
| Solana route preview | Jupiter | Authenticated `GET /swap/v2/order` without taker | Indicative quote only; no unsigned transaction, signing, or execution. |
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
