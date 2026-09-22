/**
 * Shared Sisera API client (web + mobile).
 * Targets the versioned `/api/v1` backend (services/api).
 * Mutating financial calls accept idempotency keys (client_order_id / entry_id).
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
  | "CREATED" | "VALIDATING" | "RISK_CHECK" | "RISK_REJECTED"
  | "APPROVAL_PENDING" | "APPROVED" | "ROUTING" | "SUBMITTING"
  | "ACKNOWLEDGED" | "PARTIALLY_FILLED" | "FILLED"
  | "CANCEL_PENDING" | "CANCELLED" | "REJECTED" | "EXPIRED" | "UNKNOWN";

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

export interface Instrument {
  instrument_id: string;
  symbol: string;
  display_symbol: string;
  instrument_type: string;
  venue: string;
}

export interface Portfolio {
  portfolio_id: string;
  name: string;
  equity: string;
}

export interface LedgerBalances {
  [asset: string]: string;
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

  health(): Promise<{ status: string }> {
    return this.request("/api/v1/health");
  }

  getInstrument(instrumentId: string): Promise<Instrument> {
    return this.request(`/api/v1/instruments/${encodeURIComponent(instrumentId)}`);
  }

  createOrder(req: CreateOrderRequest): Promise<Order> {
    return this.request("/api/v1/orders", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  getOrder(siseraOrderId: string): Promise<Order> {
    return this.request(`/api/v1/orders/${encodeURIComponent(siseraOrderId)}`);
  }

  advanceOrder(siseraOrderId: string, target: OrderState, note?: string): Promise<Order> {
    return this.request(`/api/v1/orders/${encodeURIComponent(siseraOrderId)}/advance`, {
      method: "POST",
      body: JSON.stringify({ target, note }),
    });
  }

  ledgerBalances(account: string): Promise<LedgerBalances> {
    return this.request(`/api/v1/ledger/balances?account=${encodeURIComponent(account)}`);
  }

  getPortfolio(portfolioId: string): Promise<Portfolio> {
    return this.request(`/api/v1/portfolios/${encodeURIComponent(portfolioId)}`);
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
