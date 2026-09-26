CREATE TABLE market_paper_accounts (
  subject text PRIMARY KEY,
  cash_usd numeric NOT NULL DEFAULT 10000,
  spot_holdings jsonb NOT NULL DEFAULT '{}'::jsonb,
  perp_positions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE market_paper_orders (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  subject text NOT NULL,
  venue text NOT NULL CHECK (venue IN ('binance', 'hyperliquid')),
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  fill_price numeric NOT NULL CHECK (fill_price > 0),
  fee_usd numeric NOT NULL CHECK (fee_usd >= 0),
  status text NOT NULL DEFAULT 'filled',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_paper_orders_subject_created_idx ON market_paper_orders (subject, created_at DESC);

CREATE TABLE market_live_orders (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  subject text NOT NULL,
  venue text NOT NULL CHECK (venue IN ('binance', 'hyperliquid')),
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  client_order_id text NOT NULL,
  venue_order_id text,
  status text NOT NULL CHECK (status IN ('submitting', 'filled', 'rejected', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_live_orders_subject_created_idx ON market_live_orders (subject, created_at DESC);

CREATE TABLE prediction_orders (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  subject text NOT NULL,
  wallet text NOT NULL,
  market_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('yes', 'no')),
  deposit_amount text NOT NULL,
  order_pubkey text NOT NULL,
  unsigned_transaction text NOT NULL,
  status text NOT NULL CHECK (status IN ('prepared', 'submitting', 'submitted', 'failed', 'unknown')),
  signature text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prediction_orders_subject_created_idx ON prediction_orders (subject, created_at DESC);
