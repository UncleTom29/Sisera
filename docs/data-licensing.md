# Data Licensing

Sources used by Sisera (V1 implementation in `sisera/data/`, connectors in `connectors/`).
Commercial redistribution terms must be verified against the live provider terms before
building commercial features — terms change, and this file is a starting point, not legal
advice.

| Source | Data | Terms / rate limits | Notes |
|---|---|---|---|
| Bybit V5 (public) | Perps market data (tickers, klines, funding, OI, order book) | Free public endpoints; rate limits per docs | Trading requires API keys; testnet available |
| CoinGecko (free) | Market-cap ranking, fundamentals | Free tier ~10–30 calls/min; batch `/coins/markets` | Cache daily; universe refresh only |
| CoinPaprika | Market-cap fallback | 20k calls/mo free, personal use | Fallback only |
| Deribit (public) | BTC/ETH options (DVOL, chain, skew) | Free public market data, no auth | Scoped to BTC/ETH |
| FRED | Fed funds, yields, CPI | Free, requires self-serve API key | Structured macro facts |
| US Treasury FiscalData | Yields/debt | Free, no key | Structured macro facts |
| DeFiLlama | TVL | Free, no key, effectively unlimited normal traffic | Onchain/TVL |
| DexScreener | DEX liquidity/volume | Free, no key | Liquidity inputs |
| RSS (various) | News headlines | Per-publisher ToS; headlines + links (no full-text scraping) | Best-effort, degrades to no-data |
| Telegram (MTProto) | Public channel messages | User account via Telethon; channel ToS apply | Requires session; never commit `.session` |
| X / Twitter API | Tracked posts | Paid ($0.005/post read as of Feb 2026, no free tier); hard spend cap enforced in code | Off by default |
| OpenRouter | LLM fundamental/news analysis | Paid per-token; cached 24h | Off by default; never in backtests |

## Rules

- Do not build commercial redistribution features on sources whose terms prohibit it.
- Cache aggressively (per-type TTLs) to stay within free tiers.
- Paid sources are opt-in, gated by explicit enable flags + spend caps, and excluded from
  backtesting (see `NOT_BACKTESTABLE_INDICATORS`).
- Attribute sources in the UI where terms require it.
