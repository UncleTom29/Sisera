from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    """Central config surface. Covers all parameters defined in SCOPE.md §17."""

    # Data & Universe (§3, §4)
    universe_size: int = int(os.getenv("SISERA_UNIVERSE_SIZE", "200"))
    bybit_base_url: str = os.getenv("SISERA_BYBIT_BASE_URL", "https://api.bytick.com")
    bybit_testnet_base_url: str = os.getenv(
        "SISERA_BYBIT_TESTNET_BASE_URL", "https://api-testnet.bybit.com"
    )
    coingecko_base_url: str = os.getenv("SISERA_COINGECKO_BASE_URL", "https://api.coingecko.com/api/v3")
    cache_db_path: str = os.getenv("SISERA_CACHE_DB", "sisera_cache.db")
    ledger_db_path: str = os.getenv("SISERA_LEDGER_DB", "sisera_ledger.db")
    universe_cache_ttl_seconds: int = int(os.getenv("SISERA_UNIVERSE_CACHE_TTL", str(24 * 60 * 60)))
    reconciliation_tolerance_pct: float = float(os.getenv("SISERA_RECONCILIATION_TOLERANCE_PCT", "1.0"))
    # "penalize" | "skip"
    reconciliation_action: str = os.getenv("SISERA_RECONCILIATION_ACTION", "penalize")
    http_timeout_seconds: float = float(os.getenv("SISERA_HTTP_TIMEOUT", "10"))
    http_max_retries: int = int(os.getenv("SISERA_HTTP_MAX_RETRIES", "3"))

    # Indicator Engine & Market Microstructure (§5)
    liquidation_notional_threshold: float = float(os.getenv("SISERA_LIQ_NOTIONAL_THRESHOLD", "500000.0"))
    order_book_depth_levels: int = int(os.getenv("SISERA_ORDER_BOOK_DEPTH_LEVELS", "10"))
    cross_venue_funding_divergence_threshold: float = float(
        os.getenv("SISERA_CROSS_VENUE_FUNDING_DIFF_THRESHOLD", "0.0005")
    )
    enable_options_indicators: bool = os.getenv("SISERA_ENABLE_OPTIONS", "true").lower() == "true"
    regime_adx_threshold: float = float(os.getenv("SISERA_REGIME_ADX_THRESHOLD", "25.0"))
    regime_stability_threshold: float = float(os.getenv("SISERA_REGIME_STABILITY_THRESHOLD", "0.6"))

    # Scoring & Calibration (§7)
    relevance_threshold: float = float(os.getenv("SISERA_RELEVANCE_THRESHOLD", "0.02"))
    relevance_cadence_days: int = int(os.getenv("SISERA_RELEVANCE_CADENCE_DAYS", "7"))
    epistemic_uncertainty_threshold: float = float(
        os.getenv("SISERA_EPISTEMIC_UNCERTAINTY_THRESHOLD", "0.35")
    )
    min_candidate_confidence: float = float(os.getenv("SISERA_MIN_CANDIDATE_CONFIDENCE", "0.55"))
    max_candidate_risk: float = float(os.getenv("SISERA_MAX_CANDIDATE_RISK", "0.75"))

    # Timeframe Gating Floors (§7, §10, §13)
    ev_floor_15m: float = float(os.getenv("SISERA_EV_FLOOR_15M", "0.02"))
    ev_floor_1h: float = float(os.getenv("SISERA_EV_FLOOR_1H", "0.03"))
    ev_floor_4h: float = float(os.getenv("SISERA_EV_FLOOR_4H", "0.05"))
    ev_floor_1d: float = float(os.getenv("SISERA_EV_FLOOR_1D", "0.08"))

    profit_factor_floor: float = float(os.getenv("SISERA_PROFIT_FACTOR_FLOOR", "1.25"))
    max_drawdown_floor: float = float(os.getenv("SISERA_MAX_DRAWDOWN_FLOOR", "0.20"))
    deflated_sharpe_floor: float = float(os.getenv("SISERA_DEFLATED_SHARPE_FLOOR", "0.80"))

    # Opportunity Engine & Decision Policy (§8)
    decision_utility_threshold: float = float(os.getenv("SISERA_DECISION_UTILITY_THRESHOLD", "0.02"))
    min_execution_quality_for_trade: float = float(os.getenv("SISERA_MIN_EXECUTION_QUALITY", "0.4"))

    # Portfolio Construction & Risk Management (§9)
    initial_capital: float = float(os.getenv("SISERA_INITIAL_CAPITAL", "100.0"))
    # Raised from 5 -- previously ALSO separately restricted to 2 full-size positions
    # under $250 equity by risk/manager.py's now-removed capital-tier logic; both numbers
    # are unified into this single, user-configurable cap. Raised at explicit user
    # request ("aggressive" calibration) after the original 2-position/3x-leverage-flat
    # posture was found to be blocking most qualifying candidates on a $100 account.
    top_n_portfolio_size: int = int(os.getenv("SISERA_TOP_N_PORTFOLIO_SIZE", "8"))
    max_correlation_cluster_exposure: float = float(
        os.getenv("SISERA_MAX_CORRELATION_CLUSTER_EXPOSURE", "0.40")
    )
    max_btc_beta_exposure: float = float(os.getenv("SISERA_MAX_BTC_BETA_EXPOSURE", "2.5"))
    kelly_multiplier: float = float(os.getenv("SISERA_KELLY_MULTIPLIER", "0.5"))
    max_position_notional_pct: float = float(os.getenv("SISERA_MAX_POSITION_NOTIONAL_PCT", "0.20"))
    max_total_notional_pct: float = float(os.getenv("SISERA_MAX_TOTAL_NOTIONAL_PCT", "1.0"))
    # Raised from 5.0 at explicit user request ("aggressive" calibration). This is the
    # ceiling for non-BTC/ETH clusters under risk/manager.py's confidence-scaled leverage
    # formula; BTC/ETH ("large_cap") get 1.5x this (30.0 at this default) since they're
    # meaningfully more liquid/less prone to violent single-asset moves.
    max_leverage_ceiling: float = float(os.getenv("SISERA_MAX_LEVERAGE_CEILING", "20.0"))
    margin_mode: str = os.getenv("SISERA_MARGIN_MODE", "isolated")
    liquidation_buffer_stress_multiplier: float = float(
        os.getenv("SISERA_LIQ_BUFFER_STRESS_MULTIPLIER", "1.5")
    )
    portfolio_stress_btc_shock_pct: float = float(
        os.getenv("SISERA_PORTFOLIO_STRESS_BTC_SHOCK_PCT", "-0.06")
    )
    max_portfolio_drawdown_pct: float = float(os.getenv("SISERA_MAX_PORTFOLIO_DRAWDOWN_PCT", "0.15"))
    max_portfolio_margin_ratio: float = float(os.getenv("SISERA_MAX_PORTFOLIO_MARGIN_RATIO", "0.70"))
    max_daily_trades: int = int(os.getenv("SISERA_MAX_DAILY_TRADES", "20"))
    atr_stop_multiplier: float = float(os.getenv("SISERA_ATR_STOP_MULTIPLIER", "2.5"))
    atr_activation_pct: float = float(os.getenv("SISERA_ATR_ACTIVATION_PCT", "0.01"))
    dvol_widen_factor: float = float(os.getenv("SISERA_DVOL_WIDEN_FACTOR", "1.3"))

    # Execution Intelligence (§11)
    post_only_timeout_seconds: float = float(os.getenv("SISERA_POST_ONLY_TIMEOUT_SECONDS", "30.0"))
    alpha_decay_factor: float = float(os.getenv("SISERA_ALPHA_DECAY_FACTOR", "1.0"))
    order_slicing_depth_ratio: float = float(os.getenv("SISERA_ORDER_SLICING_DEPTH_RATIO", "0.15"))
    max_order_slices: int = int(os.getenv("SISERA_MAX_ORDER_SLICES", "4"))

    # Position Intelligence (§12)
    position_reevaluation_interval_seconds: int = int(
        os.getenv("SISERA_POS_REEVALUATION_INTERVAL", "60")
    )

    # Market Memory (§6)
    memory_k_neighbors: int = int(os.getenv("SISERA_MEMORY_K_NEIGHBORS", "5"))
    memory_min_history: int = int(os.getenv("SISERA_MEMORY_MIN_HISTORY", "30"))

    # LLM Fundamental Analysis (live/paper-forward only -- see NOT_BACKTESTABLE_INDICATORS)
    # Off by default: paid API, and a departure from this project's free-tier-only design
    # constraint that the user should opt into deliberately, not get by default.
    enable_llm_fundamental_analysis: bool = (
        os.getenv("SISERA_ENABLE_LLM_FUNDAMENTAL", "false").lower() == "true"
    )
    openrouter_api_key: str = os.getenv("SISERA_OPENROUTER_API_KEY", "")
    openrouter_base_url: str = os.getenv("SISERA_OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    # Chosen via live A/B testing (not just spec comparison) against gemini-2.5-flash-lite,
    # qwen3-235b-a22b-2507, deepseek-v4-flash, and gpt-5.4-nano on a real BTC (easy) and
    # INJ (ambiguous) case: this model showed the largest, most dynamic confidence swing of
    # everything tested (0.98->0.57 as the case genuinely got harder) plus the most
    # detailed, specific reasoning on both cases -- the property this indicator's
    # score*confidence weighting actually depends on, not just a low sticker price. ~1.7x
    # the latency of gpt-5.4-nano (3.8s vs 2.2s) at essentially the same per-token price
    # ($0.20/M in, $1.20/M out) -- acceptable since results are cached 24h and this isn't
    # hard-realtime. deepseek-v4-flash failed intermittently in testing; qwen3.6-flash
    # returned unparseable (null-content) responses both times.
    openrouter_model: str = os.getenv("SISERA_OPENROUTER_MODEL", "openai/gpt-5.6-luna")
    llm_fundamental_cache_ttl_seconds: int = int(
        os.getenv("SISERA_LLM_FUNDAMENTAL_CACHE_TTL", str(24 * 60 * 60))
    )
    # How long a live LLM call's directional thesis is given to play out before its
    # accuracy is judged and fed back into relevance tracking -- fundamentals are a slower
    # signal than a technical indicator, so this defaults far longer than any backtest
    # holding-period profile in scoring/profiles.py.
    llm_fundamental_resolve_after_hours: float = float(
        os.getenv("SISERA_LLM_FUNDAMENTAL_RESOLVE_HOURS", "168")
    )

    # Web Interface & API (§14)
    web_host: str = os.getenv("SISERA_WEB_HOST", "0.0.0.0")
    web_port: int = int(os.getenv("SISERA_WEB_PORT", "8000"))

    # Telegram Interface (§14) -- outbound alert bot (Bot REST API)
    telegram_bot_token: str = os.getenv("SISERA_TELEGRAM_BOT_TOKEN", "")
    telegram_chat_id: str = os.getenv("SISERA_TELEGRAM_CHAT_ID", "")
    telegram_polling_enabled: bool = (
        os.getenv("SISERA_TELEGRAM_POLLING_ENABLED", "false").lower() == "true"
    )

    # Breaking News Monitor (RSS + Telegram channels) -- live/paper-forward only, see
    # NOT_BACKTESTABLE_INDICATORS. This is a *different* Telegram integration from the bot
    # above: a real user-account client (Telethon/MTProto) reading public channels, not the
    # outbound alert bot -- see sisera/data/telegram_news.py for why a bot can't do this.
    enable_news_monitor: bool = os.getenv("SISERA_ENABLE_NEWS_MONITOR", "false").lower() == "true"
    news_monitor_interval_seconds: int = int(os.getenv("SISERA_NEWS_MONITOR_INTERVAL_SECONDS", "180"))
    news_min_urgency_for_action: float = float(os.getenv("SISERA_NEWS_MIN_URGENCY_FOR_ACTION", "0.5"))
    # Much shorter than llm_fundamental_resolve_after_hours (168h) -- a news-driven move is
    # meant to show up within hours, not a week, so its accuracy should be judged on that
    # timescale rather than fundamentals' slower one.
    news_resolve_after_hours: float = float(os.getenv("SISERA_NEWS_RESOLVE_HOURS", "4"))
    # Credentials from https://my.telegram.org (free) -- required only if you want Telegram
    # channel monitoring; RSS monitoring works without them.
    telegram_news_api_id: str = os.getenv("SISERA_TELEGRAM_NEWS_API_ID", "")
    telegram_news_api_hash: str = os.getenv("SISERA_TELEGRAM_NEWS_API_HASH", "")
    telegram_news_session_path: str = os.getenv(
        "SISERA_TELEGRAM_NEWS_SESSION_PATH", "sisera_telegram_news"
    )
    # Deliberately empty by default -- see sisera/data/telegram_news.py module docstring
    # for why this isn't pre-populated with a channel list. Comma-separated usernames,
    # e.g. "cryptonews_channel,another_channel".
    telegram_news_channels: tuple[str, ...] = tuple(
        c.strip() for c in os.getenv("SISERA_TELEGRAM_NEWS_CHANNELS", "").split(",") if c.strip()
    )

    # Event Intelligence: Classification, Source Reliability, Corroboration -- refinements
    # to the Breaking News Monitor above, gated by the same SISERA_ENABLE_NEWS_MONITOR.
    news_corroboration_window_seconds: float = float(
        os.getenv("SISERA_NEWS_CORROBORATION_WINDOW_SECONDS", "3600")
    )
    news_high_severity_alert_threshold: int = int(
        os.getenv("SISERA_NEWS_HIGH_SEVERITY_ALERT_THRESHOLD", "4")
    )
    event_attribution_min_settled_for_score: int = int(
        os.getenv("SISERA_EVENT_ATTRIBUTION_MIN_SETTLED", "10")
    )
    event_attribution_rolling_window: int = int(
        os.getenv("SISERA_EVENT_ATTRIBUTION_ROLLING_WINDOW", "30")
    )

    # Event Intelligence: Macro Data (FRED/Treasury/DeFiLlama) -- free; defaults ON unlike
    # the paid LLM features above (same reasoning as SISERA_ENABLE_OPTIONS: free data,
    # graceful no-op without a key, no surprise cost).
    enable_macro_regime_indicator: bool = (
        os.getenv("SISERA_ENABLE_MACRO_REGIME", "true").lower() == "true"
    )
    fred_api_key: str = os.getenv("SISERA_FRED_API_KEY", "")
    fred_base_url: str = os.getenv("SISERA_FRED_BASE_URL", "https://api.stlouisfed.org/fred")
    treasury_fiscal_base_url: str = os.getenv(
        "SISERA_TREASURY_FISCAL_BASE_URL",
        "https://api.fiscaldata.treasury.gov/services/api/fiscal_service",
    )
    defillama_base_url: str = os.getenv("SISERA_DEFILLAMA_BASE_URL", "https://api.llama.fi")
    macro_data_cache_ttl_seconds: int = int(os.getenv("SISERA_MACRO_DATA_CACHE_TTL", str(6 * 60 * 60)))

    # Event Intelligence: X/Twitter Ingestion -- OFF by default. Real recurring paid cost
    # ($0.005/post read, no free tier as of Feb 2026) with no fixed subscription ceiling, so
    # this needs BOTH the enable flag AND a spend cap explicitly set, unlike every other
    # opt-in feature in this file which only needs the former.
    enable_x_ingestion: bool = os.getenv("SISERA_ENABLE_X_INGESTION", "false").lower() == "true"
    x_bearer_token: str = os.getenv("SISERA_X_BEARER_TOKEN", "")
    x_base_url: str = os.getenv("SISERA_X_BASE_URL", "https://api.x.com")
    x_max_daily_spend_usd: float = float(os.getenv("SISERA_X_MAX_DAILY_SPEND_USD", "2.0"))
    x_poll_interval_seconds: int = int(os.getenv("SISERA_X_POLL_INTERVAL_SECONDS", "180"))
    x_max_results_per_call: int = int(os.getenv("SISERA_X_MAX_RESULTS_PER_CALL", "25"))
    x_cost_per_read_usd: float = float(os.getenv("SISERA_X_COST_PER_READ_USD", "0.005"))
    # Deliberately empty by default -- same reasoning as SISERA_TELEGRAM_NEWS_CHANNELS. See
    # .env.example for the recommended starting list (trimmed from the user's full research
    # to exclude accounts already covered free elsewhere in this config).
    x_tracked_accounts: tuple[str, ...] = tuple(
        a.strip() for a in os.getenv("SISERA_X_TRACKED_ACCOUNTS", "").split(",") if a.strip()
    )


config = Config()
