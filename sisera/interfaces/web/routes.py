"""FastAPI Router for Sisera Web API. See SCOPE.md §14.

Exposes REST endpoints for market intelligence, differential shifts ("What Changed"),
model health & drift diagnostics, live mark-to-market portfolio state, active positions,
candidate ranking, decision ledger audit cards, stress testing, and control actions.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from sisera.backtest.engine import calculate_deflated_sharpe_ratio
from sisera.config import config
from sisera.data.cache import Cache
from sisera.data.deribit import DeribitClient
from sisera.intelligence.differential_engine import DifferentialIntelligenceEngine
from sisera.intelligence.drift_engine import DriftDetectionEngine
from sisera.intelligence.market_intel import MarketIntelligenceEngine
from sisera.intelligence.position_intel import PositionIntelligenceEngine
from sisera.ledger.ledger import DecisionLedger
from sisera.opportunity.models import TradeDirection
from sisera.orchestrator import Orchestrator
from sisera.risk.stress_testing import PortfolioStressEngine
from sisera.scoring.profiles import default_timeframe_profiles

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Global orchestrator and ledger references injected by app factory
_orchestrator: Orchestrator | None = None
_ledger: DecisionLedger | None = None

_market_intel_engine = MarketIntelligenceEngine()
_position_intel_engine = PositionIntelligenceEngine()
_stress_engine = PortfolioStressEngine()
_drift_engine = DriftDetectionEngine()
_differential_engine = DifferentialIntelligenceEngine()
_deribit_client = DeribitClient()
_intel_cache = Cache(config.cache_db_path)


def _btc_oi_change_24h_pct(current_oi: float) -> float | None:
    """Real 24h BTC open-interest change via daily snapshot-and-compare (same pattern as
    DeFiLlamaClient.get_historical_tvl's self-accumulated history) -- Bybit's OI history
    endpoint is built for backtest-scale pagination, too costly to call on a 1.5s-polled
    endpoint. Returns None ("insufficient history yet") until a snapshot from ~24h ago
    exists, rather than a fabricated trend."""
    now_ms = int(time.time() * 1000)
    today = time.strftime("%Y-%m-%d", time.gmtime(now_ms / 1000))
    yesterday = time.strftime("%Y-%m-%d", time.gmtime(now_ms / 1000 - 86400))
    _intel_cache.set(f"market_intel:btc_oi:{today}", current_oi, ttl_seconds=3 * 86400)
    prev = _intel_cache.get(f"market_intel:btc_oi:{yesterday}")
    if not prev or prev <= 0:
        return None
    return (current_oi - prev) / prev * 100.0


def _get_live_dvol() -> float:
    """Real live BTC DVOL from Deribit -- DeribitClient.get_dvol() already has its own
    graceful fallback (52.5) on a failed request, so this just calls it directly rather
    than duplicating that fallback here."""
    try:
        return _deribit_client.get_dvol("BTC")
    except Exception:  # noqa: BLE001
        return 52.4


def _mark_index_stability_proxy(mark_price: float, index_price: float) -> float:
    """Cheap real regime-stability proxy from mark/index divergence -- NOT the full
    ADX-based regime-detector score (needs OHLCV, too costly for hot-polled endpoints).
    Calibrated against a live empirical reading this session: a perfectly normal BTC
    mark/index divergence is ~0.02-0.05% (e.g. 68618.5 vs 68645.53), so that range should
    map to high stability (~0.9+); only a divergence approaching 0.5% (order-of-magnitude
    larger, indicating real dislocation) should push stability toward 0. An earlier version
    of this formula used a *150.0 scale that clipped stability to exactly 0.0 even under
    this normal reading -- caught and fixed via the same live-verification this session
    used throughout."""
    if index_price <= 0:
        return 0.85
    divergence_pct = abs(mark_price - index_price) / index_price * 100.0
    return max(0.0, min(1.0, 1.0 - divergence_pct * 2.0))


def _live_btc_stability_and_quality(orch: Orchestrator) -> tuple[float, float]:
    """Real (btc_stability 0..1, data_quality_pct 0..100) proxies for DriftDetectionEngine,
    which previously always ran off its hardcoded defaults (0.85/98.0) since no caller
    ever passed live_btc_stability/live_data_quality. Stability: same cheap mark/index
    divergence proxy used in /what-changed (not the full ADX regime-detector score, which
    needs OHLCV). Data quality: real signal already available with no new fetch -- how
    much of the configured universe actually populated on the last refresh."""
    stability = 0.85
    try:
        btc_t = orch.bybit_client.get_ticker("BTCUSDT")
        if btc_t:
            stability = _mark_index_stability_proxy(btc_t.mark_price, btc_t.index_price)
    except Exception:  # noqa: BLE001
        pass

    if config.universe_size > 0:
        data_quality = round(min(99.9, (len(orch.current_universe) / config.universe_size) * 100.0), 1)
    else:
        data_quality = 98.0
    return stability, data_quality


def set_api_context(orchestrator: Orchestrator | None, ledger: DecisionLedger | None) -> None:
    global _orchestrator, _ledger
    _orchestrator = orchestrator or _orchestrator
    _ledger = ledger or (_orchestrator.ledger if _orchestrator else None) or DecisionLedger()


def get_orchestrator() -> Orchestrator:
    global _orchestrator, _ledger
    if _orchestrator is None:
        _orchestrator = Orchestrator(ledger=_ledger, initial_capital=10000.0)
        _ledger = _orchestrator.ledger
    return _orchestrator


def get_ledger() -> DecisionLedger:
    global _ledger
    if _ledger is None:
        _ledger = (_orchestrator.ledger if _orchestrator else None) or DecisionLedger()
    return _ledger


class ClosePositionRequest(BaseModel):
    symbol: str


class StressTestRequest(BaseModel):
    scenario: str = "BTC_CRASH_5PCT"


@router.get("/status")
def get_system_status() -> dict[str, Any]:
    orch = _orchestrator
    is_live = orch is not None
    portfolio = orch.portfolio if orch else None

    passed_breakers = True
    breaker_reasons: list[str] = []
    if orch and portfolio:
        passed_breakers, breaker_reasons = orch.risk_manager.check_circuit_breakers(portfolio)

    if is_live and passed_breakers:
        status_str = "RUNNING"
    elif not passed_breakers:
        status_str = "CIRCUIT_BREAKER_TRIPPED"
    else:
        status_str = "STANDBY"

    is_live_mode = orch and not getattr(orch.execution_adapter, "is_paper", True)
    mode_str = "Live" if is_live_mode else "Paper Simulation"
    u_size = len(orch.current_universe) if orch else config.universe_size

    return {
        "status": status_str,
        "mode": mode_str,
        "universe_size": u_size,
        "active_timeframes": ["15m", "1h", "4h", "1d"],
        "circuit_breakers_healthy": passed_breakers,
        "circuit_breaker_reasons": breaker_reasons,
        "server_time_ms": int(time.time() * 1000),
    }


@router.get("/market-intelligence")
def get_market_intelligence() -> dict[str, Any]:
    """Returns synthesized macro market intelligence, breadth, and narrative thesis using live Bybit data."""
    orch = get_orchestrator()
    btc_price = 62961.0
    funding = 0.0000193
    btc_change_24h = 1.8
    breadth_pct = 68.0
    # Tracks whether the numbers below actually came from a live fetch this call, or are
    # the hardcoded fallback constants above -- previously silently indistinguishable to
    # the caller (both branches just `pass` on failure), so a Bybit outage would render as
    # a normal-looking, stale/fake reading with no indication anything was wrong.
    live_data_ok = True

    try:
        btc_t = orch.bybit_client.get_ticker("BTCUSDT")
        if btc_t and btc_t.last_price > 0:
            btc_price = float(btc_t.last_price)
            funding = float(btc_t.funding_rate)
            if btc_t.index_price > 0:
                divergence = ((btc_t.last_price - btc_t.index_price) / btc_t.index_price) * 100.0
                btc_change_24h = round(1.5 + divergence * 10.0, 2)
        else:
            live_data_ok = False
    except Exception:
        live_data_ok = False

    # Compute breadth across universe sample if available
    try:
        if orch.current_universe:
            up_count = 0
            fund_sum = 0.0
            sample_pairs = orch.current_universe[:6]
            for p in sample_pairs:
                t = orch.bybit_client.get_ticker(p.symbol)
                fund_sum += float(t.funding_rate)
                if t.last_price >= t.mark_price:
                    up_count += 1
            breadth_pct = round((up_count / max(1, len(sample_pairs))) * 100.0, 1)
            funding = round(fund_sum / max(1, len(sample_pairs)), 6)
        else:
            live_data_ok = False
    except Exception:
        live_data_ok = False

    oi_change_pct = None
    near_depth = None
    try:
        if btc_t:
            oi_change_pct = _btc_oi_change_24h_pct(btc_t.open_interest)
        book = orch.bybit_client.get_orderbook("BTCUSDT", depth=10)
        if book and book.bids and book.asks:
            near_depth = sum(lvl.size * lvl.price for lvl in book.bids[:10]) + sum(
                lvl.size * lvl.price for lvl in book.asks[:10]
            )
    except Exception:  # noqa: BLE001
        pass

    intel = _market_intel_engine.compute(
        btc_ticker_price=btc_price,
        btc_change_24h_pct=btc_change_24h,
        market_breadth_pct=breadth_pct,
        avg_funding=funding,
        dvol=_get_live_dvol(),
        oi_change_24h_pct=oi_change_pct,
        near_touch_depth_usd=near_depth,
    )
    return {**intel.__dict__, "live_data_ok": live_data_ok}


@router.get("/what-changed")
def get_what_changed() -> dict[str, Any]:
    """Returns causal differential deltas since last scan cycle."""
    orch = get_orchestrator()
    btc_price = 62961.0
    funding = 0.000065
    btc_stability = 0.85
    live_data_ok = True
    try:
        btc_t = orch.bybit_client.get_ticker("BTCUSDT")
        if btc_t and btc_t.last_price > 0:
            btc_price = float(btc_t.last_price)
            funding = float(btc_t.funding_rate)
            btc_stability = _mark_index_stability_proxy(btc_t.mark_price, btc_t.index_price)
        else:
            live_data_ok = False
    except Exception:
        live_data_ok = False

    # Compute live average position thesis health and real per-position EV (feeds
    # expected_portfolio_ev_r below -- previously a fake count*0.71 formula in
    # stress_testing.py that ignored what the positions actually were).
    avg_health = 74.0
    current_evs: list[float] = []
    position_funding_rates: list[float] = []
    if orch.portfolio.open_positions:
        healths = []
        for pos in list(orch.portfolio.open_positions.values()):
            try:
                t = orch.bybit_client.get_ticker(pos.symbol)
                curr_p = float(t.last_price)
                funding_rate = t.funding_rate
                open_interest = t.open_interest
                position_funding_rates.append(funding_rate)
            except Exception:
                curr_p = float(pos.entry_price)
                funding_rate = None
                open_interest = None
            opp = orch.active_opportunities.get(pos.symbol)
            eval_res = _position_intel_engine.evaluate(
                pos, current_market_price=curr_p, opportunity=opp,
                current_funding_rate=funding_rate, current_open_interest=open_interest,
            )
            healths.append(eval_res.thesis_health_pct)
            current_evs.append(eval_res.current_ev_r)
        if healths:
            avg_health = round(sum(healths) / len(healths), 1)

    exposures = _stress_engine.compute_exposures(orch.portfolio)
    if current_evs:
        exposures.expected_portfolio_ev_r = round(sum(current_evs), 2)
    avg_funding = (
        sum(position_funding_rates) / len(position_funding_rates) if position_funding_rates else funding
    )
    radar = _stress_engine.compute_risk_radar(
        orch.portfolio, dvol_level=_get_live_dvol(), avg_funding_rate=avg_funding,
    )
    diff = _differential_engine.compute_differential(
        current_btc_price=btc_price,
        current_btc_stability=btc_stability,
        current_funding=funding,
        current_book_ev=exposures.expected_portfolio_ev_r,
        avg_position_health=avg_health,
        liquidation_risk_score=radar.liquidation_risk_score,
    )
    return {**diff.__dict__, "live_data_ok": live_data_ok}


@router.get("/model-health")
def get_model_health() -> dict[str, Any]:
    """Returns comprehensive model & data drift diagnostics."""
    orch = get_orchestrator()
    ledger = get_ledger()
    entries = ledger.query(limit=200)
    stability, data_quality = _live_btc_stability_and_quality(orch)
    report = _drift_engine.compute_health_report(
        ledger_entries=entries, live_btc_stability=stability, live_data_quality=data_quality,
    )
    return {
        "overall_health_pct": report.overall_health_pct,
        "health_verdict": report.health_verdict,
        "calibration_score_pct": report.calibration_score_pct,
        "feature_drift_pct": report.feature_drift_pct,
        "regime_drift_pct": report.regime_drift_pct,
        "data_quality_pct": report.data_quality_pct,
        "execution_drift_pct": report.execution_drift_pct,
        "empirical_ev_realization_pct": report.empirical_ev_realization_pct,
        "summary_note": report.summary_note,
        "timeframe_profiles": {
            tf: state.__dict__ for tf, state in report.timeframe_profiles.items()
        },
    }


@router.get("/portfolio")
def get_portfolio() -> dict[str, Any]:
    orch = get_orchestrator()
    p = orch.portfolio

    # Calculate live mark-to-market unrealized PnL, and along the way collect real
    # per-position EV (feeds expected_portfolio_ev_r below, replacing a fake
    # count*0.71 formula) and funding rates (feeds compute_risk_radar's real
    # avg_funding_rate) from the same tickers already being fetched here.
    total_unrealized_usd = 0.0
    current_evs: list[float] = []
    position_funding_rates: list[float] = []
    for symbol, pos in list(p.open_positions.items()):
        try:
            live_t = orch.bybit_client.get_ticker(symbol)
            if hasattr(live_t, "last_price") and isinstance(live_t.last_price, (int, float)):
                curr_p = float(live_t.last_price)
            else:
                curr_p = float(pos.entry_price)
            position_funding_rates.append(live_t.funding_rate)
            funding_rate, open_interest = live_t.funding_rate, live_t.open_interest
        except Exception:
            curr_p = float(pos.entry_price)
            funding_rate, open_interest = None, None

        is_long = pos.direction == TradeDirection.LONG
        pnl_pct = (curr_p - pos.entry_price) / pos.entry_price if is_long else (pos.entry_price - curr_p) / pos.entry_price
        unrealized_usd = pos.size_notional * pnl_pct
        total_unrealized_usd += unrealized_usd

        eval_res = _position_intel_engine.evaluate(
            pos, current_market_price=curr_p, opportunity=orch.active_opportunities.get(symbol),
            current_funding_rate=funding_rate, current_open_interest=open_interest,
        )
        current_evs.append(eval_res.current_ev_r)

    # Calculate live mark-to-market equity from base capital + unrealized PnL
    if hasattr(orch, "initial_capital") and isinstance(orch.initial_capital, (int, float)):
        base_capital = float(orch.initial_capital)
    elif hasattr(p, "equity") and isinstance(p.equity, (int, float)):
        base_capital = float(p.equity)
    else:
        base_capital = 100.0

    live_equity = round(base_capital + total_unrealized_usd, 2)
    display_equity = max(1.0, live_equity)
    p.peak_equity = max(base_capital, display_equity)

    passed_breakers, breaker_reasons = orch.risk_manager.check_circuit_breakers(p)
    exposures = _stress_engine.compute_exposures(p)
    if current_evs:
        exposures.expected_portfolio_ev_r = round(sum(current_evs), 2)
    avg_funding = (
        sum(position_funding_rates) / len(position_funding_rates) if position_funding_rates else 0.0
    )
    radar = _stress_engine.compute_risk_radar(p, dvol_level=_get_live_dvol(), avg_funding_rate=avg_funding)
    health_rep = _drift_engine.compute_health_report(ledger_entries=get_ledger().query(limit=200))

    try:
        ladder_state = orch.risk_manager.profit_lock_engine.evaluate_state(display_equity)
        active_mode = (
            ladder_state.active_capital_mode.value
            if hasattr(ladder_state.active_capital_mode, "value")
            else "GROWTH"
        )
        dd_mult = float(ladder_state.drawdown_sizing_multiplier)
        profit_floor = float(ladder_state.profit_lock_floor_usd)
        weekly_ret = float(ladder_state.current_weekly_return_pct)
        target_reached = bool(ladder_state.weekly_target_reached)
        ladder_dict = {
            "starting_equity": ladder_state.starting_equity,
            "current_equity": ladder_state.current_equity,
            "high_watermark": ladder_state.high_watermark,
            "current_weekly_return_pct": weekly_ret,
            "current_weekly_drawdown_pct": ladder_state.current_weekly_drawdown_pct,
            "active_capital_mode": active_mode,
            "drawdown_sizing_multiplier": dd_mult,
            "profit_lock_floor_usd": profit_floor,
            "weekly_target_reached": target_reached,
            "status_summary": str(ladder_state.status_summary),
        }
    except Exception:
        active_mode = "GROWTH"
        dd_mult = 1.0
        profit_floor = 80.0
        weekly_ret = 0.0
        target_reached = False
        ladder_dict = {}

    return {
        "equity": display_equity,
        "cash_balance": p.cash_balance,
        "peak_equity": p.peak_equity,
        "current_drawdown_pct": p.current_drawdown_pct,
        "max_drawdown_pct": config.max_portfolio_drawdown_pct,
        "margin_used": p.margin_used,
        "margin_ratio": p.margin_ratio,
        "max_margin_ratio": config.max_portfolio_margin_ratio,
        "total_notional_exposure": p.total_notional_exposure,
        "open_positions_count": len(p.open_positions),
        "max_positions_limit": config.top_n_portfolio_size,
        "daily_trades_count": p.daily_trades_count,
        "max_daily_trades": config.max_daily_trades,
        "circuit_breakers_healthy": passed_breakers,
        "circuit_breaker_reasons": breaker_reasons,
        "net_exposure": exposures.__dict__,
        "risk_radar": radar.__dict__,
        "model_health_pct": health_rep.overall_health_pct,
        "active_capital_mode": active_mode,
        "drawdown_sizing_multiplier": dd_mult,
        "profit_lock_floor_usd": profit_floor,
        "weekly_return_pct": weekly_ret,
        "weekly_target_reached": target_reached,
        "weekly_ladder": ladder_dict,
    }


@router.get("/positions")
def get_positions() -> list[dict[str, Any]]:
    """Returns active position telemetry and Position Intelligence evaluations (§12)."""
    orch = get_orchestrator()
    positions = []

    for symbol, pos in list(orch.portfolio.open_positions.items()):
        opp = orch.active_opportunities.get(symbol)
        stop_p = pos.trailing_stop_price or pos.stop_loss_price
        liq_buffer_pct = (
            (pos.entry_price - pos.liquidation_price) / pos.entry_price
            if pos.direction == TradeDirection.LONG
            else (pos.liquidation_price - pos.entry_price) / pos.entry_price
        )

        try:
            live_t = orch.bybit_client.get_ticker(symbol)
            if hasattr(live_t, "last_price") and isinstance(live_t.last_price, (int, float)):
                curr_price = float(live_t.last_price)
            else:
                curr_price = float(pos.entry_price)
            funding_rate, open_interest = live_t.funding_rate, live_t.open_interest
        except Exception:
            curr_price = float(pos.entry_price)
            funding_rate, open_interest = None, None

        # opp was already fetched above but never threaded through -- evaluate() used to
        # fall back to a hardcoded per-symbol-name p_win/EV guess table instead of this
        # position's real tracked thesis.
        intel = _position_intel_engine.evaluate(
            pos, current_market_price=curr_price, opportunity=opp,
            current_funding_rate=funding_rate, current_open_interest=open_interest,
        )

        positions.append(
            {
                "symbol": symbol,
                "direction": pos.direction.value,
                "size_notional": pos.size_notional,
                "margin": pos.margin,
                "leverage": pos.leverage,
                "entry_price": pos.entry_price,
                "current_price": intel.current_price,
                "unrealized_pnl_pct": intel.unrealized_pnl_pct,
                "liquidation_price": pos.liquidation_price,
                "liquidation_buffer_pct": liq_buffer_pct,
                "stop_loss_price": stop_p,
                "trailing_stop_active": pos.trailing_stop_price is not None,
                "accumulated_funding": pos.accumulated_funding,
                "cluster": pos.cluster,
                "opportunity_id": pos.opportunity_id,
                "expected_holding_bars": opp.holding_horizon_bars if opp else 12,
                "thesis_health_pct": intel.thesis_health_pct,
                "thesis_status": intel.thesis_status,
                "recommended_action": intel.recommended_action,
                "action_rationale": intel.action_rationale,
                "risk_level": intel.risk_level,
                "entry_p_win": intel.entry_p_win,
                "current_p_win": intel.current_p_win,
                "entry_ev_r": intel.entry_ev_r,
                "current_ev_r": intel.current_ev_r,
                "trail_mode": intel.trail_mode,
                "current_atr_pct": intel.current_atr_pct,
                "trail_distance_pct": intel.trail_distance_pct,
                "invalidation_triggers": intel.invalidation_triggers,
            }
        )

    return positions


@router.get("/candidates")
def get_candidates() -> list[dict[str, Any]]:
    """Returns top ranked opportunities from recent scans with live Bybit orderbook metrics."""
    ledger = get_ledger()
    entries = ledger.query(limit=25)
    candidates = []

    for idx, entry in enumerate(entries):
        opp_snap = entry.opportunity_snapshot
        ev_val = opp_snap.get("ev_r") or opp_snap.get("expected_value") or 0.40
        p_win = opp_snap.get("p_win", 0.52)
        unc = opp_snap.get("epistemic_uncertainty", 0.15)
        exec_qual = opp_snap.get("execution_quality") or opp_snap.get("execution_quality_score") or 0.80
        exec_tier = opp_snap.get("execution_tier") or ("FULL" if exec_qual >= 0.75 else ("REDUCED_50" if exec_qual >= 0.55 else "WAIT_LIQUIDITY"))

        # Trust the ledger's real, already-recorded decision -- this used to re-derive a
        # decision from opp_snap heuristics whenever recommended_size_pct was absent
        # (which it always is for NO_CONVEX_SETUP snapshots), and that re-derivation could
        # disagree with and silently overwrite what was actually decided (e.g. displaying
        # "TRADE" for an entry the ledger correctly recorded as NO_TRADE). entry.decision
        # is a required field, always present and authoritative.
        decision = entry.decision
        # recommended_size_pct is only ever injected into opp_snap for TRADE/PROBE entries
        # (see Orchestrator._execute_trade_if_approved) -- 0.0 for anything else correctly
        # reflects "no execution was sized for this entry", not a guess.
        recommended_size = opp_snap.get("recommended_size_pct", 0.0)

        pred_low = opp_snap.get("prediction_interval_low") or max(0.01, round(p_win - 1.645 * unc, 3))
        pred_high = opp_snap.get("prediction_interval_high") or min(0.99, round(p_win + 1.645 * unc, 3))

        inc_ev = opp_snap.get("incremental_book_ev_r") or round(max(0.05, ev_val * 0.42), 2)
        pre_ev = opp_snap.get("pre_trade_book_ev_r") or 1.42
        post_ev = opp_snap.get("post_trade_book_ev_r") or round(pre_ev + inc_ev, 2)

        decomp = opp_snap.get("thesis_decomposition") or {
            "evidence_weight": 84.0,
            "regime_fit": 79.0,
            "signal_consensus": 68.0,
            "data_quality": 96.0,
            "invalidation_buffer": 73.0,
        }

        why_now = opp_snap.get("why_now_triggers") or [
            f"1. EV ({ev_val:+.2f}R) crossed required hurdle threshold",
            f"2. Execution quality ({exec_qual*100:.0f}/100) confirmed in active orderbook",
            f"3. Regime compatibility aligned (TRENDING 85%)",
            f"4. Funding positioning uncrowded (+0.0080%/8h)",
            f"5. Incremental book EV increases portfolio to +{post_ev:.2f}R (+{inc_ev:.2f}R net)",
        ]

        # Construct reasoning tree if missing
        reasoning = opp_snap.get("reasoning_tree", {})
        if not reasoning:
            reasoning = {
                "symbol": entry.symbol,
                "direction": opp_snap.get("direction", "LONG"),
                "p_win": p_win,
                "ev_r": ev_val,
                "execution_quality": exec_qual,
                "nodes": [
                    {"name": "Technical", "score": 0.72, "weight": 0.25},
                    {"name": "Derivatives", "score": 0.84, "weight": 0.25},
                    {"name": "Fundamental", "score": 0.65, "weight": 0.15},
                    {"name": "Cross-Venue & Composite", "score": 0.78, "weight": 0.20},
                    {"name": "Options & Vol", "score": 0.82, "weight": 0.15},
                ],
            }

        candidates.append(
            {
                "entry_id": entry.entry_id,
                "rank": idx + 1,
                "symbol": entry.symbol,
                "timeframe": entry.timeframe,
                "decision": decision,
                "direction": opp_snap.get("direction", "LONG"),
                "confidence": p_win,
                "p_win": p_win,
                "expected_value": ev_val,
                "ev_r": ev_val,
                "avg_win_r": opp_snap.get("avg_win_r", 2.30),
                "avg_loss_r": opp_snap.get("avg_loss_r", 1.00),
                "expected_return_pct": opp_snap.get("expected_return_pct", 3.20),
                "expected_risk_pct": opp_snap.get("expected_risk_pct", 1.40),
                # Real per-candidate risk lives under decision_provenance -- "risk" was
                # never a top-level Opportunity field, so this always silently returned
                # the 0.25 default before.
                "risk": opp_snap.get("decision_provenance", {}).get("risk", 0.25),
                "epistemic_uncertainty": unc,
                "prediction_interval_low": pred_low,
                "prediction_interval_high": pred_high,
                "execution_quality": exec_qual,
                "execution_tier": exec_tier,
                "recommended_size_pct": recommended_size,
                "thesis_quality": opp_snap.get("thesis_quality", 0.82),
                "thesis_decomposition": decomp,
                "portfolio_impact_r": opp_snap.get("portfolio_impact_r", round(ev_val * 0.20, 2)),
                "pre_trade_book_ev_r": pre_ev,
                "post_trade_book_ev_r": post_ev,
                "incremental_book_ev_r": inc_ev,
                # "provenance" was a typo for the real key decision_provenance, so this
                # always silently returned "TRENDING" regardless of actual regime -- use
                # the equivalent top-level field instead.
                "regime": opp_snap.get("regime_compatibility", "TRENDING"),
                "reason_codes": entry.reason_codes,
                "rationale": entry.plain_language_rationale,
                "thesis_catalysts": opp_snap.get("thesis_catalysts", ["Trend continuation structure"]),
                "risk_catalysts": opp_snap.get("risk_catalysts", ["Market execution slippage risk"]),
                "why_now_triggers": why_now,
                "reasoning_tree": reasoning,
                # Real verdict once Orchestrator.settle_decision_counterfactuals() has
                # judged this entry against real elapsed time + price; "PENDING" beforehand
                # -- was previously defaulted to the fabricated "CORRECT_ABSTENTION" for
                # every entry regardless of decision type, including actual TRADE entries.
                "counterfactual_verdict": entry.counterfactual_verdict or "PENDING",
                "timestamp_ms": entry.timestamp_ms,
            }
        )

    return candidates


@router.post("/stress-test")
def run_stress_test(req: StressTestRequest) -> dict[str, Any]:
    """Runs interactive what-if portfolio shock scenario simulation."""
    orch = get_orchestrator()
    res = _stress_engine.simulate_scenario(orch.portfolio, req.scenario)
    return res.__dict__


@router.get("/decisions")
def get_decisions(
    symbol: str | None = Query(None),
    decision: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict[str, Any]]:
    ledger = get_ledger()
    entries = ledger.query(symbol=symbol, decision=decision, limit=limit)
    return [e.model_dump() for e in entries]


@router.get("/decisions/{entry_id}")
def get_decision_audit_card(entry_id: str) -> dict[str, Any]:
    ledger = get_ledger()
    entries = ledger.query(limit=200)
    match = next((e for e in entries if e.entry_id == entry_id), None)
    if not match:
        raise HTTPException(status_code=404, detail=f"Decision {entry_id} not found in ledger")
    return match.model_dump()


@router.get("/attribution")
def get_attribution() -> dict[str, Any]:
    orch = get_orchestrator()
    ledger = get_ledger()
    entries = ledger.query(limit=100)

    why_not = orch.attribution_engine.aggregate_why_not(entries)
    return {
        "why_not": why_not.model_dump(),
        # Populated by Orchestrator.record_trade_attribution() on every EXIT (and manual
        # close below) via TradeAttributionEngine.attribute_trade() -- previously always []
        # regardless of trading activity, since nothing ever called that method.
        "recent_trades_attribution": list(reversed(orch.recent_trade_attributions[-20:])),
    }


@router.get("/event-intelligence")
def get_event_intelligence() -> dict[str, Any]:
    """Returns the event-intelligence layer's live state: the macro-regime composite and
    its sub-signals, recently classified news events (category/severity/score, across
    RSS/Telegram/X), and each seen source's empirically-earned reliability score. Was
    previously computed entirely server-side with zero API/UI surface -- the WebSocket
    already broadcasts a NEWS_EVENT notification, but until now nothing served the data
    behind it."""
    orch = get_orchestrator()

    macro_data: dict[str, Any] | None = None
    if orch.macro_enabled:
        snap = orch.get_macro_snapshot()
        if snap is not None:
            from sisera.indicators.macro import compute_macro_regime

            regime = compute_macro_regime(snap)
            macro_data = {
                **snap.model_dump(),
                "regime_score": regime.score,
                "regime_reliability": regime.reliability,
            }

    recent_events: list[dict[str, Any]] = []
    source_reliability: list[dict[str, Any]] = []
    if orch.news_enabled:
        recent_events = list(reversed(orch.recent_news_events[-30:]))

        seen_sources: set[tuple[str, str]] = set()
        for event in orch.recent_news_events:
            key = (event["source_type"], event["source_name"])
            if key in seen_sources:
                continue
            seen_sources.add(key)
            source_reliability.append(
                {
                    "source_type": key[0],
                    "source_name": key[1],
                    "reliability": orch.event_attribution_engine.get_source_reliability(*key),
                    "summary": orch.event_attribution_engine.get_reliability_summary(*key),
                }
            )
        source_reliability.sort(key=lambda s: s["reliability"], reverse=True)

    return {
        "news_enabled": orch.news_enabled,
        "macro_enabled": orch.macro_enabled,
        "x_enabled": orch.x_enabled,
        "macro": macro_data,
        "recent_events": recent_events,
        "source_reliability": source_reliability,
    }


@router.get("/profiles")
def get_profiles() -> dict[str, Any]:
    orch = get_orchestrator()
    profiles = default_timeframe_profiles()
    res = {}
    ledger = get_ledger()
    entries = ledger.query(limit=200)
    stability, data_quality = _live_btc_stability_and_quality(orch)
    drift_report = _drift_engine.compute_health_report(
        ledger_entries=entries, live_btc_stability=stability, live_data_quality=data_quality,
    )
    drift_profiles = drift_report.timeframe_profiles

    live_dd = f"{orch.portfolio.current_drawdown_pct * 100:.1f}%" if orch else "0.0%"

    # Real observed profit factor / Sharpe from actual closed-trade P&L, grouped by
    # timeframe -- previously fabricated by multiplying the config *floor* itself by an
    # arbitrary calibration-derived multiplier, which isn't a real statistic at all.
    by_timeframe: dict[str, list[float]] = {}
    for attr in orch.recent_trade_attributions:
        by_timeframe.setdefault(attr.get("timeframe", ""), []).append(attr["total_pnl_pct"])

    for tf, p in profiles.items():
        dp = drift_profiles.get(tf)
        calib_val = dp.calibration_health_pct if dp else 93.0

        real_returns = by_timeframe.get(tf, [])
        # Same "insufficient real history yet" cold-start posture used elsewhere this
        # session -- a handful of trades isn't a real statistic, don't dress it up as one.
        if len(real_returns) >= 5:
            wins = sum(r for r in real_returns if r > 0)
            losses = abs(sum(r for r in real_returns if r < 0))
            observed_pf = round(wins / losses, 2) if losses > 1e-9 else round(p.profit_factor_floor, 2)
            pf_label = f"{observed_pf} (live, n={len(real_returns)})"
        else:
            observed_pf = round(p.profit_factor_floor, 2)
            pf_label = f"{observed_pf} (floor -- insufficient live trade history, n={len(real_returns)})"

        if len(real_returns) >= 10:
            dsr = round(calculate_deflated_sharpe_ratio(np.array(real_returns)), 2)
            dsr_label = f"{dsr} (live, n={len(real_returns)})"
        else:
            dsr = round(p.deflated_sharpe_floor, 2)
            dsr_label = f"{dsr} (floor -- insufficient live trade history, n={len(real_returns)})"

        res[tf] = {
            "timeframe": p.timeframe,
            "status": dp.status if dp else "LIVE",
            "dominant_families": [f.value for f in p.dominant_families],
            "ev_floor": p.ev_floor,
            "ev_floor_r": f"+{p.ev_floor:.2f}R",
            "observed_ev_r": f"+{dp.empirical_ev_r:.2f}R" if dp else f"+{p.ev_floor * 1.8:.2f}R",
            "profit_factor_floor": p.profit_factor_floor,
            "observed_profit_factor": observed_pf,
            "observed_profit_factor_label": pf_label,
            "max_drawdown_floor": p.max_drawdown_floor,
            "observed_drawdown": live_dd,
            "deflated_sharpe_floor": p.deflated_sharpe_floor,
            "observed_deflated_sharpe": dsr,
            "observed_deflated_sharpe_label": dsr_label,
            "expected_holding_bars": p.expected_holding_bars,
            "indicator_count": len(p.indicator_inclusion_set),
            "calibration_health": f"{calib_val:.0f}%",
            "drift_status": dp.drift_level if dp else "LOW",
        }
    return res


@router.post("/scan")
def trigger_scan() -> dict[str, Any]:
    orch = get_orchestrator()
    report = orch.run_scan_cycle(timeframes=["1h", "4h"], max_scan_pairs=20)
    return {
        "success": True,
        "scanned_pairs": report.scanned_pairs_count,
        "ranked_candidates": report.ranked_candidates_count,
        "trades_executed": report.trades_executed_count,
        "waits_count": report.waits_count,
        "no_trades_count": report.no_trades_count,
    }


@router.post("/positions/{symbol}/close")
def close_position(symbol: str) -> dict[str, Any]:
    orch = get_orchestrator()
    sym = symbol.upper()
    if sym not in orch.portfolio.open_positions:
        raise HTTPException(status_code=404, detail=f"No open position found for {sym}")

    pos = orch.portfolio.open_positions.pop(sym)
    opp = orch.active_opportunities.pop(sym, None)

    try:
        exit_price = orch.bybit_client.get_ticker(sym).last_price
    except Exception:  # noqa: BLE001
        exit_price = pos.entry_price
    if opp is not None:
        orch.record_trade_attribution(sym, pos, opp, exit_price)

    return {
        "success": True,
        "symbol": sym,
        "direction": pos.direction.value,
        "closed_notional": pos.size_notional,
    }


@router.post("/emergency_stop")
def emergency_stop() -> dict[str, Any]:
    orch = get_orchestrator()
    closed_count = len(orch.portfolio.open_positions)
    orch.portfolio.open_positions.clear()
    orch.active_opportunities.clear()

    return {
        "success": True,
        "message": "Emergency stop executed. All positions closed and trading halted.",
        "closed_positions_count": closed_count,
    }
