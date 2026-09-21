from __future__ import annotations

import math

import numpy as np
import pandas as pd

from sisera.indicators.base import IndicatorResult


def _clip(x: float) -> float:
    return max(-1.0, min(1.0, x))


class EMACrossoverIndicator:
    """Trend: fast EMA vs. slow EMA. Score > 0 = fast above slow (bullish)."""

    name = "ema_crossover"

    def __init__(self, fast: int = 12, slow: int = 26) -> None:
        self.fast = fast
        self.slow = slow
        self.min_periods = slow + 5

    def compute(self, ohlcv: pd.DataFrame) -> IndicatorResult:
        close = ohlcv["close"]
        fast_ema = close.ewm(span=self.fast, adjust=False).mean().iloc[-1]
        slow_ema = close.ewm(span=self.slow, adjust=False).mean().iloc[-1]
        pct_diff = (fast_ema - slow_ema) / slow_ema
        return IndicatorResult(
            name=self.name, score=_clip(math.tanh(pct_diff * 20)), value=float(fast_ema - slow_ema)
        )


class RSIIndicator:
    """Momentum: Wilder's RSI. Score = (RSI-50)/50, so overbought/oversold map to ±1."""

    name = "rsi"

    def __init__(self, period: int = 14) -> None:
        self.period = period
        self.min_periods = period + 1

    def compute(self, ohlcv: pd.DataFrame) -> IndicatorResult:
        close = ohlcv["close"]
        delta = close.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.ewm(alpha=1 / self.period, adjust=False, min_periods=self.period).mean()
        avg_loss = loss.ewm(alpha=1 / self.period, adjust=False, min_periods=self.period).mean()
        with np.errstate(divide="ignore", invalid="ignore"):
            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))
        rsi_value = rsi.iloc[-1]
        if pd.isna(rsi_value):
            rsi_value = 50.0  # no price movement at all in the window -> neutral
        score = _clip((rsi_value - 50) / 50)
        return IndicatorResult(name=self.name, score=score, value=float(rsi_value))


class MACDIndicator:
    """Momentum: MACD histogram (MACD line - signal line), normalized by price."""

    name = "macd"

    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9) -> None:
        self.fast = fast
        self.slow = slow
        self.signal = signal
        self.min_periods = slow + signal

    def compute(self, ohlcv: pd.DataFrame) -> IndicatorResult:
        close = ohlcv["close"]
        fast_ema = close.ewm(span=self.fast, adjust=False).mean()
        slow_ema = close.ewm(span=self.slow, adjust=False).mean()
        macd_line = fast_ema - slow_ema
        signal_line = macd_line.ewm(span=self.signal, adjust=False).mean()
        histogram = (macd_line - signal_line).iloc[-1]
        pct = histogram / close.iloc[-1]
        return IndicatorResult(name=self.name, score=_clip(math.tanh(pct * 50)), value=float(histogram))


class ATRIndicator:
    """Volatility: Wilder's ATR. Score = how elevated current ATR is vs. its own
    recent baseline — feeds §9's "widen stops when vol elevated" logic via `value`."""

    name = "atr"

    def __init__(self, period: int = 14, baseline_window: int = 50) -> None:
        self.period = period
        self.baseline_window = baseline_window
        self.min_periods = period + baseline_window

    def compute(self, ohlcv: pd.DataFrame) -> IndicatorResult:
        high, low, close = ohlcv["high"], ohlcv["low"], ohlcv["close"]
        prev_close = close.shift(1)
        true_range = pd.concat(
            [high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1
        ).max(axis=1)
        atr = true_range.ewm(alpha=1 / self.period, adjust=False, min_periods=self.period).mean()
        atr_value = atr.iloc[-1]
        baseline = atr.tail(self.baseline_window).mean()
        score = math.tanh((atr_value - baseline) / baseline) if baseline > 0 else 0.0
        return IndicatorResult(name=self.name, score=_clip(score), value=float(atr_value))


class BollingerBandWidthIndicator:
    """Volatility: band width as % of price. Score = elevated vs. own recent baseline."""

    name = "bollinger_band_width"

    def __init__(self, period: int = 20, num_std: float = 2.0, baseline_window: int = 50) -> None:
        self.period = period
        self.num_std = num_std
        self.baseline_window = baseline_window
        self.min_periods = period + baseline_window

    def compute(self, ohlcv: pd.DataFrame) -> IndicatorResult:
        close = ohlcv["close"]
        sma = close.rolling(self.period).mean()
        std = close.rolling(self.period).std()
        width = (2 * self.num_std * std) / sma
        width_value = width.iloc[-1]
        baseline = width.tail(self.baseline_window).mean()
        score = math.tanh((width_value - baseline) / baseline) if baseline > 0 else 0.0
        return IndicatorResult(name=self.name, score=_clip(score), value=float(width_value))


class OBVIndicator:
    """Volume: On-Balance Volume vs. its own moving average, normalized by recent
    volume scale (not raw OBV magnitude, which is an arbitrary cumulative unit)."""

    name = "obv"

    def __init__(self, trend_window: int = 20) -> None:
        self.trend_window = trend_window
        self.min_periods = trend_window + 1

    def compute(self, ohlcv: pd.DataFrame) -> IndicatorResult:
        close, volume = ohlcv["close"], ohlcv["volume"]
        direction = np.sign(close.diff().fillna(0))
        obv = (direction * volume).cumsum()
        obv_value = obv.iloc[-1]
        baseline = obv.rolling(self.trend_window).mean().iloc[-1]
        recent_volume_scale = volume.tail(self.trend_window).sum()
        if recent_volume_scale > 0 and not pd.isna(baseline):
            score = math.tanh((obv_value - baseline) / recent_volume_scale)
        else:
            score = 0.0
        return IndicatorResult(name=self.name, score=_clip(score), value=float(obv_value))


def default_technical_indicators() -> list:
    return [
        EMACrossoverIndicator(),
        RSIIndicator(),
        MACDIndicator(),
        ATRIndicator(),
        BollingerBandWidthIndicator(),
        OBVIndicator(),
    ]
