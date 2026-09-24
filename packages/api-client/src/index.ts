/**
 * Shared Sisera API client (web + mobile).
 * Targets the versioned `/api/v1` institutional trading OS backend.
 */

export type OrderSide = "BUY" | "SELL";
export type OrderType =
  | "MARKET"
  | "LIMIT"
  | "POST_ONLY"
  | "REDUCE_ONLY"
  | "IOC"
  | "FOK"
  | "STOP"
  | "STOP_LIMIT"
  | "TAKE_PROFIT"
  | "TRAILING_STOP"
  | "OCO"
  | "BRACKET";

export type OrderState =
  | "CREATED"
  | "VALIDATING"
  | "RISK_CHECK"
  | "RISK_REJECTED"
  | "APPROVAL_PENDING"
  | "APPROVED"
  | "ROUTING"
  | "SUBMITTING"
  | "ACKNOWLEDGED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCEL_PENDING"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED"
  | "UNKNOWN";

export interface Order {
  sisera_order_id: string;
  client_order_id: string;
  instrument_id: string;
  side: OrderSide;
  order_type: OrderType;
  quantity: string;
  price: string | null;
  state: OrderState;
  filled_quantity: string;
  avg_fill_price: string | null;
  account_id: string;
  portfolio_id: string;
}

export interface CreateOrderRequest {
  client_order_id: string;
  instrument_id: string;
  side: OrderSide;
  order_type: OrderType;
  quantity: string;
  price?: string | null;
  account_id: string;
  portfolio_id: string;
  user_id?: string | null;
}

export interface OrderPreviewRequest {
  instrument_id: string;
  side: OrderSide;
  order_type: OrderType;
  quantity: string;
  price?: string | null;
  portfolio_id?: string;
  account_id?: string;
}

export interface OrderPreviewResponse {
  instrument_id: string;
  side: OrderSide;
  order_type: OrderType;
  quantity: string;
  estimated_fill_price: string;
  estimated_notional: string;
  estimated_fees: string;
  estimated_slippage_bps: string;
  estimated_gas: string;
  estimated_funding_impact: string;
  resulting_exposure: string;
  resulting_leverage: string;
  margin_impact: string;
  liquidation_estimate: string | null;
  risk_check: {
    approved: boolean;
    reasons: string[];
  };
  route_plan: {
    decision: string;
    legs: any[];
  };
}

export interface MarketTicker {
  symbol: string;
  instrument_id: string;
  base_asset: string;
  quote_asset: string;
  venue: string;
  instrument_type: string;
  last_price: string;
  bid: string;
  ask: string;
  change_24h_pct: string;
  volume_24h: string;
  funding_rate: string;
  open_interest: string;
  quality_status: "LIVE" | "DELAYED" | "STALE" | "DEGRADED" | "UNAVAILABLE";
  status_timestamp_ms: number;
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBook {
  symbol: string;
  timestamp_ms: number;
  quality_status: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface Candle {
  time: number;
  timestamp_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Position {
  position_id: string;
  portfolio_id: string;
  instrument_id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: string;
  entry_price: string;
  current_price: string;
  unrealized_pnl: string;
  leverage: string;
  margin_used: string;
  liquidation_price?: string;
  liquidation_distance_pct: string;
  risk_score: "LOW" | "MEDIUM" | "HIGH";
}

export interface Portfolio {
  portfolio_id: string;
  name: string;
  equity: string;
  nav?: string;
  daily_pnl?: string;
  daily_pnl_pct?: string;
  gross_exposure?: string;
  net_exposure?: string;
  leverage?: string;
  margin_usage_pct?: string;
  cash?: Record<string, string>;
}

export interface CopilotEvidence {
  source: string;
  kind: "FACT" | "ESTIMATE" | "INFERENCE";
  label: string;
  value: string;
  confidence: string;
}

export interface CopilotAnswer {
  question: string;
  synthesis: string;
  evidence: CopilotEvidence[];
  uncertainty: string;
  model: string;
}

export interface CompiledIntent {
  original_prompt: string;
  compiled_intent: {
    instrument: string;
    action: string;
    trigger: {
      type: string;
      reference?: string | null;
    };
    filters: {
      funding_percentile_max: number;
    };
    risk: {
      portfolio_risk_fraction: string;
      max_daily_drawdown: string;
    };
  };
  valid: boolean;
  review_required: boolean;
}

export interface DifferentialFactor {
  factor: string;
  value: string;
  previous_value: string;
  direction: "UP" | "DOWN" | "FLAT";
  change_pct: string;
  significant?: boolean;
}

export interface DifferentialDiff {
  instrument_id: string;
  timestamp_ms: number;
  factors: DifferentialFactor[];
  regime_changed: boolean;
}

export interface Opportunity {
  opportunity_id: string;
  instrument_id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  structure: string;
  thesis: string;
  confidence: string;
  expected_value: string;
  uncertainty: string;
  entry_price?: string;
  invalidation_price?: string;
  target_price?: string;
  risk_reward_ratio?: string;
  catalysts?: string[];
}

export interface AgentRecord {
  agent_id: string;
  name: string;
  autonomy_level: "RESEARCH" | "SUGGEST" | "CONFIRM" | "POLICY_AUTO" | "AUTONOMOUS" | "EMERGENCY_RISK_ONLY";
  lifecycle_stage: "DRAFT" | "BACKTEST" | "STRESS_TEST" | "PAPER" | "SHADOW" | "LIMITED_LIVE" | "LIVE";
  allocated_capital: string;
  current_equity: string;
  daily_pnl: string;
  max_daily_drawdown: string;
  risk_per_trade: string;
  active_positions: number;
  status: string;
}

export interface PredictionOutcome {
  outcome_id: string;
  label: string;
  probability: string;
  price: string;
}

export interface PredictionMarketRecord {
  market_id: string;
  question: string;
  category: string;
  expiry_ms: number;
  volume: string;
  liquidity: string;
  status: string;
  outcomes: PredictionOutcome[];
  resolution_criteria: string;
  oracle: string;
}

export interface NotificationItem {
  notification_id: string;
  category: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  timestamp_ms: number;
  read: boolean;
  actionable?: boolean;
  action_type?: string;
  symbol?: string;
}

export interface TelegramNewsItem {
  id: string;
  channel: string;
  channel_title: string;
  url: string;
  text: string;
  timestamp_ms: number;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  symbols: string[];
  urgency: "HIGH" | "NORMAL" | "LOW";
}

export interface TechnicalIndicators {
  current_price: number;
  rsi: {
    value: number;
    condition: string;
    signal: string;
  };
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    trend: string;
  };
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth_pct: number;
    pct_b: number;
  };
  emas: {
    ema_20: number;
    ema_50: number;
    ema_200: number;
    alignment: string;
  };
  atr: {
    value: number;
    atr_pct: number;
    volatility_regime: string;
  };
  pivots: {
    pivot: number;
    r1: number;
    r2: number;
    s1: number;
    s2: number;
  };
  overall_signal: string;
  momentum_score: number;
}

export interface MicrostructureAnalytics {
  funding_rate: number;
  annualized_funding_apr_pct: number;
  open_interest: string;
  order_book_imbalance: number;
  imbalance_status: string;
  bid_depth_top15: number;
  ask_depth_top15: number;
  liquidations_24h: {
    long_usd: string;
    short_usd: string;
    net_bias: string;
  };
  smart_money_divergence: {
    score: number;
    interpretation: string;
  };
}

export interface MacroIntelligence {
  macro_regime: string;
  regime_score: number;
  fed_funds_rate: string;
  fed_posture: string;
  us10y_yield: string;
  cpi_yoy: string;
  dxy_dollar_index: string;
  defi_tvl_usd: string;
  defi_tvl_7d_change: string;
  btc_dominance: string;
  global_liquidity_state: string;
  key_event_catalyst: string;
}

export interface MarketAnalysis {
  symbol: string;
  timestamp_ms: number;
  composite_score: number;
  verdict: string;
  action_recommendation: string;
  time_horizon: string;
  technicals: TechnicalIndicators;
  microstructure: MicrostructureAnalytics;
  macro: MacroIntelligence;
}

export interface ApiError {
  detail: string;
}

const DEFAULT_BASE_URL =
  typeof process !== "undefined" && process.env?.SISERA_API_URL
    ? process.env.SISERA_API_URL
    : "http://localhost:8000";

export class SiseraApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

export class SiseraClient {
  private baseUrl: string;
  private token: string | null;

  constructor(baseUrl: string = DEFAULT_BASE_URL, token: string | null = null) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((init?.headers as Record<string, string>) ?? {}),
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as ApiError;
        if (body.detail) detail = body.detail;
      } catch {
        /* keep statusText */
      }
      throw new SiseraApiError(res.status, detail);
    }
    return (await res.json()) as T;
  }

  // --- Health & Auth ---
  health(): Promise<{ status: string }> {
    return this.request("/api/v1/health");
  }

  getAuthMe(): Promise<any> {
    return this.request("/api/v1/auth/me");
  }

  getOrganizations(): Promise<any> {
    return this.request("/api/v1/organizations");
  }

  // --- Instruments & Markets ---
  listInstruments(params?: { venue?: string; instrument_type?: string }): Promise<any[]> {
    const q = new URLSearchParams(params as any).toString();
    return this.request(`/api/v1/instruments${q ? `?${q}` : ""}`);
  }

  getInstrument(instrumentId: string): Promise<any> {
    return this.request(`/api/v1/instruments/${encodeURIComponent(instrumentId)}`);
  }

  listMarkets(): Promise<MarketTicker[]> {
    return this.request("/api/v1/markets");
  }

  getTicker(symbol: string): Promise<MarketTicker> {
    return this.request(`/api/v1/markets/${encodeURIComponent(symbol)}/ticker`);
  }

  getOrderBook(symbol: string, depth = 10): Promise<OrderBook> {
    return this.request(`/api/v1/markets/${encodeURIComponent(symbol)}/orderbook?depth=${depth}`);
  }

  getCandles(symbol: string, interval = "1h", limit = 48): Promise<Candle[]> {
    return this.request(`/api/v1/markets/${encodeURIComponent(symbol)}/candles?interval=${interval}&limit=${limit}`);
  }

  getTrades(
    symbol: string,
    limit = 30
  ): Promise<Array<{ id: string; timestamp: number; price: string; size: string; side: "BUY" | "SELL" }>> {
    return this.request(`/api/v1/markets/${encodeURIComponent(symbol)}/trades?limit=${limit}`);
  }

  getDerivatives(symbol: string): Promise<any> {
    return this.request(`/api/v1/markets/${encodeURIComponent(symbol)}/derivatives`);
  }

  getAnalysis(symbol: string): Promise<MarketAnalysis> {
    return this.request(`/api/v1/markets/${encodeURIComponent(symbol)}/analysis`);
  }

  getNews(symbol?: string, limit = 25): Promise<TelegramNewsItem[]> {
    const q = new URLSearchParams({ ...(symbol ? { symbol } : {}), limit: String(limit) }).toString();
    return this.request(`/api/v1/news?${q}`);
  }

  // --- Orders & Preview ---
  createOrder(req: CreateOrderRequest): Promise<Order> {
    return this.request("/api/v1/orders", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  getOrder(siseraOrderId: string): Promise<Order> {
    return this.request(`/api/v1/orders/${encodeURIComponent(siseraOrderId)}`);
  }

  listOrders(portfolioId?: string, state?: string): Promise<Order[]> {
    const q = new URLSearchParams({ ...(portfolioId ? { portfolio_id: portfolioId } : {}), ...(state ? { state } : {}) }).toString();
    return this.request(`/api/v1/orders${q ? `?${q}` : ""}`);
  }

  advanceOrder(siseraOrderId: string, target: OrderState, note?: string): Promise<Order> {
    return this.request(`/api/v1/orders/${encodeURIComponent(siseraOrderId)}/advance`, {
      method: "POST",
      body: JSON.stringify({ target, note }),
    });
  }

  previewOrder(req: OrderPreviewRequest): Promise<OrderPreviewResponse> {
    return this.request("/api/v1/orders/preview", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  executeOrder(siseraOrderId: string, req?: { portfolio_id?: string; account_id?: string }): Promise<any> {
    return this.request(`/api/v1/orders/${encodeURIComponent(siseraOrderId)}/execute`, {
      method: "POST",
      body: JSON.stringify(req || {}),
    });
  }

  // --- Positions ---
  listPositions(portfolioId = "pf_1"): Promise<Position[]> {
    return this.request(`/api/v1/positions?portfolio_id=${encodeURIComponent(portfolioId)}`);
  }

  closePosition(instrumentId: string): Promise<any> {
    return this.request(`/api/v1/positions/${encodeURIComponent(instrumentId)}/close`, {
      method: "POST",
    });
  }

  // --- Portfolio & Ledger ---
  getPortfolio(portfolioId: string): Promise<Portfolio> {
    return this.request(`/api/v1/portfolios/${encodeURIComponent(portfolioId)}`);
  }

  ledgerBalances(account: string): Promise<Record<string, string>> {
    return this.request(`/api/v1/ledger/balances?account=${encodeURIComponent(account)}`);
  }

  queryDecisions(symbol?: string, limit = 20): Promise<any[]> {
    const q = new URLSearchParams({ ...(symbol ? { symbol } : {}), limit: String(limit) }).toString();
    return this.request(`/api/v1/ledger/decisions?${q}`);
  }

  // --- Risk Engine & Controls ---
  checkRisk(order: CreateOrderRequest): Promise<any> {
    return this.request("/api/v1/risk/check", {
      method: "POST",
      body: JSON.stringify(order),
    });
  }

  runStressTest(portfolioId = "pf_1", scenarios?: any[]): Promise<any> {
    return this.request("/api/v1/risk/stress-test", {
      method: "POST",
      body: JSON.stringify({ portfolio_id: portfolioId, scenarios }),
    });
  }

  getRiskLimits(portfolioId = "pf_1"): Promise<any> {
    return this.request(`/api/v1/risk/limits?portfolio_id=${encodeURIComponent(portfolioId)}`);
  }

  getKillSwitches(): Promise<{ global_tripped: boolean; tripped_switches: any[] }> {
    return this.request("/api/v1/risk/kill-switch");
  }

  tripKillSwitch(scope = "GLOBAL", reason = "Emergency action", scopeId?: string): Promise<any> {
    return this.request("/api/v1/risk/kill-switch/trip", {
      method: "POST",
      body: JSON.stringify({ scope, reason, scope_id: scopeId }),
    });
  }

  clearKillSwitch(scope = "GLOBAL", reason = "Operator resume", scopeId?: string): Promise<any> {
    return this.request("/api/v1/risk/kill-switch/clear", {
      method: "POST",
      body: JSON.stringify({ scope, reason, scope_id: scopeId }),
    });
  }

  // --- Intelligence ---
  queryCopilot(question: string, instrumentId?: string, portfolioId = "pf_1"): Promise<CopilotAnswer> {
    return this.request("/api/v1/intelligence/copilot", {
      method: "POST",
      body: JSON.stringify({ question, instrument_id: instrumentId, portfolio_id: portfolioId }),
    });
  }

  compileIntent(prompt: string, portfolioId = "pf_1"): Promise<CompiledIntent> {
    return this.request("/api/v1/intelligence/intent", {
      method: "POST",
      body: JSON.stringify({ prompt, portfolio_id: portfolioId }),
    });
  }

  getDifferential(symbol = "BTC-PERP"): Promise<DifferentialDiff> {
    return this.request(`/api/v1/intelligence/differential?symbol=${encodeURIComponent(symbol)}`);
  }

  queryMemory(instrumentId = "bybit_btc_perp", topK = 3): Promise<any[]> {
    return this.request("/api/v1/intelligence/memory", {
      method: "POST",
      body: JSON.stringify({ instrument_id: instrumentId, top_k: topK }),
    });
  }

  listOpportunities(): Promise<Opportunity[]> {
    return this.request("/api/v1/opportunities");
  }

  // --- Agents ---
  listAgents(): Promise<AgentRecord[]> {
    return this.request("/api/v1/agents");
  }

  createAgent(name: string, manifestYaml: string, autonomyLevel = "SUGGEST", capital = "50000"): Promise<any> {
    return this.request("/api/v1/agents", {
      method: "POST",
      body: JSON.stringify({ name, manifest_yaml: manifestYaml, autonomy_level: autonomyLevel, allocated_capital: capital }),
    });
  }

  updateAgentAutonomy(agentId: string, autonomyLevel: string): Promise<any> {
    return this.request(`/api/v1/agents/${encodeURIComponent(agentId)}/autonomy`, {
      method: "POST",
      body: JSON.stringify({ autonomy_level: autonomyLevel }),
    });
  }

  scanAgent(agentId: string): Promise<any> {
    return this.request(`/api/v1/agents/${encodeURIComponent(agentId)}/scan`, {
      method: "POST",
    });
  }

  pauseAgent(agentId: string): Promise<any> {
    return this.request(`/api/v1/agents/${encodeURIComponent(agentId)}/pause`, {
      method: "POST",
    });
  }

  resumeAgent(agentId: string): Promise<any> {
    return this.request(`/api/v1/agents/${encodeURIComponent(agentId)}/resume`, {
      method: "POST",
    });
  }

  // --- Prediction Markets ---
  listPredictions(): Promise<PredictionMarketRecord[]> {
    return this.request("/api/v1/predictions");
  }

  getPrediction(marketId: string): Promise<PredictionMarketRecord> {
    return this.request(`/api/v1/predictions/${encodeURIComponent(marketId)}`);
  }

  placePredictionOrder(marketId: string, outcomeId: string, quantity = "100", side: OrderSide = "BUY"): Promise<any> {
    return this.request("/api/v1/predictions/orders", {
      method: "POST",
      body: JSON.stringify({ market_id: marketId, outcome_id: outcomeId, quantity, side }),
    });
  }

  // --- Analytics & TCA ---
  getTcaReport(): Promise<any> {
    return this.request("/api/v1/analytics/tca");
  }

  // --- Notifications ---
  listNotifications(unreadOnly = false): Promise<NotificationItem[]> {
    return this.request(`/api/v1/notifications?unread_only=${unreadOnly}`);
  }

  markNotificationRead(notificationId: string): Promise<any> {
    return this.request(`/api/v1/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: "POST",
    });
  }
}

/** Realtime channel names (services/api WebSocket fan-out target). */
export const RealtimeChannels = [
  "market.*",
  "portfolio.*",
  "orders.*",
  "fills.*",
  "positions.*",
  "risk.*",
  "agents.*",
  "alerts.*",
  "intelligence.*",
] as const;
export type RealtimeChannel = (typeof RealtimeChannels)[number];
