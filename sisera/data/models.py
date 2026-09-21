from __future__ import annotations

from pydantic import BaseModel


class BybitInstrument(BaseModel):
    symbol: str
    base_coin: str
    quote_coin: str
    status: str
    contract_type: str


class CoinMarketData(BaseModel):
    id: str
    symbol: str
    name: str
    market_cap: float | None
    market_cap_rank: int | None
    current_price: float | None
    total_volume: float | None = None  # 24h volume — for mcap/volume ratio (§5)
    circulating_supply: float | None = None
    total_supply: float | None = None
    max_supply: float | None = None  # many coins have no fixed cap — stays None


class UniversePair(BaseModel):
    """A tradable pair: on Bybit's listed perpetuals, ranked by market cap. See SCOPE.md §4."""

    symbol: str  # Bybit symbol, e.g. "BTCUSDT"
    base_coin: str
    market_cap_source: str  # "coingecko" (normal) or "coinpaprika" (CoinGecko was down)
    market_cap_source_id: str  # id in whichever provider's own namespace
    market_cap: float
    market_cap_rank: int
    market_cap_diverged: bool = False  # flagged by reconciliation (§3) against the fallback
    # Full display name (e.g. "Bitcoin", not "BTC") -- available from CoinGecko at universe
    # build time. Empty for the Bybit-only fallback path, which has no name source; callers
    # needing a display name should fall back to base_coin themselves in that case. Added
    # specifically because news headlines usually say "Bitcoin", not "BTC" -- see
    # sisera/scoring/news_relevance.py, which matches on this in addition to the ticker.
    name: str = ""


class OrderBookLevel(BaseModel):
    price: float
    size: float


class OrderBook(BaseModel):
    """See SCOPE.md §3, §5 — order book depth replaces mcap/volume ratio as a real liquidity read."""

    symbol: str
    bids: list[OrderBookLevel]  # descending by price
    asks: list[OrderBookLevel]  # ascending by price
    timestamp_ms: int

    @property
    def best_bid(self) -> float | None:
        return self.bids[0].price if self.bids else None

    @property
    def best_ask(self) -> float | None:
        return self.asks[0].price if self.asks else None

    @property
    def mid_price(self) -> float | None:
        if self.best_bid is None or self.best_ask is None:
            return None
        return (self.best_bid + self.best_ask) / 2


class Ticker(BaseModel):
    """Bybit's own price/positioning snapshot for a pair. See SCOPE.md §3, §5."""

    symbol: str
    last_price: float
    mark_price: float
    index_price: float
    funding_rate: float
    open_interest: float
    bid_price: float | None
    ask_price: float | None


class CrossVenueFundingRate(BaseModel):
    """See SCOPE.md §5 — compared against Bybit's own funding rate to distinguish a
    Bybit-specific squeeze from genuinely market-wide positioning."""

    exchange: str
    symbol: str
    funding_rate: float
    timestamp_ms: int | None


class LongShortRatio(BaseModel):
    """Direct crowd-positioning read, complementary to funding rate. See SCOPE.md §5."""

    symbol: str
    buy_ratio: float  # 0..1 share of accounts net-long
    sell_ratio: float
    timestamp_ms: int


class LiquidationEvent(BaseModel):
    """One forced liquidation, from Bybit's public `allLiquidation` feed. See SCOPE.md §3, §5.

    `side` is the side of the *forced execution*: "Sell" means a long position was
    force-closed (forced selling); "Buy" means a short was force-closed (forced buying).
    """

    symbol: str
    side: str  # "Buy" | "Sell"
    price: float
    size: float
    timestamp_ms: int

    @property
    def notional(self) -> float:
        return self.price * self.size


class DeribitOptionInstrument(BaseModel):
    """One listed option contract. See SCOPE.md §5 — BTC/ETH only."""

    instrument_name: str  # e.g. "BTC-14AUG26-50000-C"
    option_type: str  # "call" | "put"
    strike: float
    expiration_timestamp_ms: int


class DeribitOptionTicker(BaseModel):
    """Market snapshot for one option instrument. See SCOPE.md §5.

    `delta` follows standard convention: positive for calls, negative for puts —
    used to identify ~25-delta strikes for skew without a separate option_type field.
    """

    instrument_name: str
    mark_iv: float  # annualized %, e.g. 71.24 = 71.24%
    delta: float
    underlying_price: float
    best_bid_price: float | None = None
    best_ask_price: float | None = None
    timestamp_ms: int = 0


class LLMFundamentalAssessment(BaseModel):
    """One LLM-generated fundamental read for a coin, from an OpenRouter model call. See
    sisera/data/openrouter.py, sisera/indicators/llm_fundamental.py.

    Live/paper-forward only -- never backtested against history (see
    NOT_BACKTESTABLE_INDICATORS in sisera/backtest/engine.py for why: there is no way to
    guarantee a model's "historical" judgment isn't contaminated by knowledge of what
    happened after the date being asked about). Real accuracy is instead tracked forward
    over time by sisera/scoring/llm_track_record.py.
    """

    symbol: str
    score: float  # -1.0 (bearish thesis) .. +1.0 (bullish thesis)
    confidence: float  # 0.0..1.0, the model's own stated confidence in its read
    reasoning: str  # short plain-language rationale, surfaced in the decision ledger
    model: str  # OpenRouter model id used, e.g. "anthropic/claude-sonnet-4.5"
    timestamp_ms: int


class NewsItem(BaseModel):
    """One raw headline/message from a news RSS feed or a monitored Telegram channel,
    before any relevance matching or LLM assessment. See sisera/data/news_feed.py and
    sisera/data/telegram_news.py.
    """

    source_type: str  # "rss" | "telegram"
    source_name: str  # feed name or channel username
    item_id: str  # stable id for dedup: RSS entry link, or "{channel}:{message_id}"
    title: str
    url: str | None = None
    published_ms: int


class NewsAssessment(BaseModel):
    """A cheap, targeted LLM read of one specific NewsItem's significance for one coin --
    distinct from LLMFundamentalAssessment (broad periodic project quality) in scope and
    cost: this is handed one headline and asked how significant/urgent/directional it is,
    not asked to go research the coin. See sisera/data/openrouter.py,
    sisera/indicators/news_sentiment.py.

    Live/paper-forward only, same reasoning as LLMFundamentalAssessment -- see
    NOT_BACKTESTABLE_INDICATORS in sisera/backtest/engine.py.
    """

    symbol: str
    news_item_id: str
    score: float  # -1.0 (bearish) .. +1.0 (bullish)
    urgency: float  # 0.0..1.0 -- how time-sensitive/actionable, not just how bullish/bearish
    confidence: float  # 0.0..1.0 -- the model's own stated confidence, incl. source reliability
    reasoning: str
    model: str
    timestamp_ms: int
    # Event-intelligence classification (see sisera/data/openrouter.py's _NEWS_SYSTEM_PROMPT
    # for the prompted taxonomy). Plain str, not an enum/Literal -- an LLM picking something
    # slightly off the prompted list should degrade gracefully, not fail the whole parse.
    # Defaulted so existing callers/tests that construct a NewsAssessment without these
    # fields keep working unchanged.
    event_category: str = "other"  # e.g. "macro_fed", "crypto_etf", "security_hack"
    severity: int = 1  # 1 (S1, noise) .. 5 (S5, market regime event)


class MacroSnapshot(BaseModel):
    """A market-wide (not per-coin) macro data read, refreshed once per scan cycle and
    reused across every symbol scored that cycle -- see Orchestrator.get_macro_snapshot.
    Feeds sisera/indicators/macro.py's compute_macro_regime. Every field is independently
    optional: a missing FRED key or a failed DeFiLlama call just drops that sub-signal
    (compute_macro_regime down-weights its reliability accordingly) rather than blocking
    the whole snapshot.
    """

    fed_funds_rate: float | None = None
    fed_funds_rate_1m_ago: float | None = None
    treasury_10y_yield: float | None = None
    treasury_10y_yield_1m_ago: float | None = None
    cpi_yoy_pct: float | None = None
    aggregate_tvl_usd: float | None = None
    aggregate_tvl_7d_ago_usd: float | None = None
