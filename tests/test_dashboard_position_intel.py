"""Unit tests for sisera.intelligence.position_intel.PositionIntelligenceEngine (the
dashboard-facing one -- distinct from sisera.position.engine.PositionIntelligenceEngine,
which sisera/tests/test_position_intelligence.py already covers).

Regression coverage for the fixes made when removing hardcoded/fabricated dashboard data:
real entry p_win/EV from the tracked Opportunity (was a hardcoded per-symbol-name lookup
table), real ATR back-derived from the position's own stop distance (was a flat 1.82
constant), and real funding/OI invalidation triggers (were hardcoded strings that could
never actually trigger).
"""

from __future__ import annotations

from sisera.intelligence.position_intel import PositionIntelligenceEngine
from sisera.opportunity.models import Opportunity, TradeDirection
from sisera.risk.models import Position


def _position(**overrides) -> Position:
    defaults = dict(
        symbol="ZZZUSDT", direction=TradeDirection.LONG, entry_price=100.0,
        size_notional=1000.0, leverage=3.0, margin=333.0, liquidation_price=70.0,
        stop_loss_price=95.0, highest_price=100.0,
    )
    defaults.update(overrides)
    return Position(**defaults)


def _opportunity(**overrides) -> Opportunity:
    defaults = dict(
        opportunity_id="opp1", symbol="ZZZUSDT", direction=TradeDirection.LONG,
        primary_timeframe="1h", entry_price=100.0, invalidation_price=95.0,
        invalidation_conditions=[], holding_horizon_bars=12, expected_value=0.05,
        p_win=0.72, epistemic_uncertainty=0.15, ev_r=0.90,
    )
    defaults.update(overrides)
    return Opportunity(**defaults)


def test_uses_real_opportunity_p_win_and_ev_as_entry_baseline():
    """Previously a hardcoded per-symbol-name lookup table (e.g. "ETH" -> 0.63/0.84)
    regardless of what the position was actually opened under."""
    engine = PositionIntelligenceEngine()
    pos = _position(symbol="ZZZUSDT")  # not one of the old table's known symbols
    opp = _opportunity(p_win=0.72, ev_r=0.90)

    result = engine.evaluate(pos, current_market_price=100.0, opportunity=opp)

    assert result.entry_p_win == 0.72
    assert result.entry_ev_r == 0.90


def test_falls_back_to_neutral_prior_without_a_tracked_opportunity():
    """No fabricated per-symbol guess when there's no real tracked thesis -- a single
    neutral prior instead."""
    engine = PositionIntelligenceEngine()
    pos = _position(symbol="BTCUSDT")  # was "BTC" -> 0.60/0.75 in the old hardcoded table

    result = engine.evaluate(pos, current_market_price=100.0, opportunity=None)

    assert result.entry_p_win == 0.55
    assert result.entry_ev_r == 0.50


def test_atr_is_real_back_derived_from_stop_distance_not_a_flat_constant():
    """Previously atr_pct was a flat 1.82 for every position regardless of asset. Now
    derived from the real stop distance RiskManager.size_position() actually set."""
    from sisera.config import config

    engine = PositionIntelligenceEngine()

    tight_stop = _position(entry_price=100.0, stop_loss_price=99.0)  # 1% stop
    wide_stop = _position(entry_price=100.0, stop_loss_price=90.0)  # 10% stop

    tight_result = engine.evaluate(tight_stop, current_market_price=100.0)
    wide_result = engine.evaluate(wide_stop, current_market_price=100.0)

    assert tight_result.current_atr_pct == round(1.0 / config.atr_stop_multiplier, 2)
    assert wide_result.current_atr_pct == round(10.0 / config.atr_stop_multiplier, 2)
    assert wide_result.current_atr_pct > tight_result.current_atr_pct


def test_funding_crowding_trigger_is_direction_aware_and_real():
    engine = PositionIntelligenceEngine()
    long_pos = _position(direction=TradeDirection.LONG)
    short_pos = _position(direction=TradeDirection.SHORT, entry_price=100.0, stop_loss_price=105.0)

    # Funding spiking positive is adverse for a LONG (overcrowded longs)...
    long_result = engine.evaluate(long_pos, current_market_price=100.0, current_funding_rate=0.0006)
    funding_trigger = next(t for t in long_result.invalidation_triggers if "Funding" in t["condition"])
    assert funding_trigger["triggered"] is True

    # ...but not for a SHORT, where the same positive funding is favorable.
    short_result = engine.evaluate(short_pos, current_market_price=100.0, current_funding_rate=0.0006)
    funding_trigger_short = next(t for t in short_result.invalidation_triggers if "Funding" in t["condition"])
    assert funding_trigger_short["triggered"] is False


def test_funding_trigger_reports_not_tracked_without_real_data():
    engine = PositionIntelligenceEngine()
    pos = _position()
    result = engine.evaluate(pos, current_market_price=100.0, current_funding_rate=None)
    funding_trigger = next(t for t in result.invalidation_triggers if "Funding" in t["condition"])
    assert funding_trigger["triggered"] is False
    assert "not tracked" in funding_trigger["current_value"]


def test_oi_reversal_trigger_real_once_entry_baseline_exists():
    engine = PositionIntelligenceEngine()
    pos = _position(entry_open_interest=100_000.0)

    # OI collapsed >8% since entry -> triggered
    result = engine.evaluate(pos, current_market_price=100.0, current_open_interest=90_000.0)
    oi_trigger = next(t for t in result.invalidation_triggers if "Open Interest" in t["condition"])
    assert oi_trigger["triggered"] is True
    assert "-10.0%" in oi_trigger["current_value"]

    # OI stable -> not triggered
    result_stable = engine.evaluate(pos, current_market_price=100.0, current_open_interest=99_000.0)
    oi_trigger_stable = next(t for t in result_stable.invalidation_triggers if "Open Interest" in t["condition"])
    assert oi_trigger_stable["triggered"] is False


def test_oi_reversal_trigger_reports_not_tracked_for_pre_existing_positions():
    """Positions opened before Position.entry_open_interest existed default to 0.0 --
    must report as untracked, not fabricate a percentage."""
    engine = PositionIntelligenceEngine()
    pos = _position(entry_open_interest=0.0)

    result = engine.evaluate(pos, current_market_price=100.0, current_open_interest=90_000.0)
    oi_trigger = next(t for t in result.invalidation_triggers if "Open Interest" in t["condition"])
    assert oi_trigger["triggered"] is False
    assert "not tracked" in oi_trigger["current_value"]
