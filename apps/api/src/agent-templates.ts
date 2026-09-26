export const agentTemplates = [
  {
    id: "trend-confirmation-v1",
    name: "Trend Confirmation",
    description: "Follows liquid BTC, ETH and SOL trends only when volume confirms the move.",
    universe: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    timeframe: "1h",
    factors: [
      "EMA 12/26 crossover",
      "20-candle relative volume above 1.2",
      "ATR volatility filter",
    ],
    risk: "Risk at most 0.5% of allocated capital per idea; abstain on stale candles.",
  },
  {
    id: "funding-dislocation-v1",
    name: "Funding Dislocation",
    description:
      "Looks for crowded perpetual positioning and requires a confirming price reversal.",
    universe: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    timeframe: "4h",
    factors: ["Hyperliquid funding percentile", "mark versus oracle divergence", "RSI reversal"],
    risk: "Research only until funding history and execution shortfall pass backtest and stress gates.",
  },
  {
    id: "spot-breakout-v1",
    name: "Spot Breakout",
    description: "Screens spot assets for a 20-period high with sufficient book depth.",
    universe: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"],
    timeframe: "1h",
    factors: ["20-period high", "relative volume", "spread and depth gate"],
    risk: "No leverage; reject wide spreads and stale order books.",
  },
  {
    id: "private-market-value-v1",
    name: "Private Market Value Gap",
    description:
      "Ranks PreStocks token prices against issuer marks, with liquidity and news checks.",
    universe: ["prestocks:*"],
    timeframe: "1d",
    factors: ["token versus issuer mark", "liquidity availability", "recent company news"],
    risk: "Issuer marks are not fair value; require independent review before any order proposal.",
  },
  {
    id: "prediction-evidence-v1",
    name: "Prediction Evidence",
    description: "Reviews Jupiter YES/NO prices, time to resolution and stated resolution sources.",
    universe: ["jupiter-prediction:*"],
    timeframe: "event",
    factors: ["outcome price gap", "time to close", "resolution criteria review"],
    risk: "Prices are not calibrated probabilities; no trade proposal without verified resolution rules.",
  },
] as const;
