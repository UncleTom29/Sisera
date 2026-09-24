CREATE TYPE order_status AS ENUM (
  'draft', 'risk_rejected', 'accepted', 'working', 'partially_filled', 'filled', 'cancelled', 'expired'
);

CREATE TABLE instruments (
  id text PRIMARY KEY,
  venue text NOT NULL,
  venue_symbol text NOT NULL,
  asset_class text NOT NULL,
  type text NOT NULL,
  base_asset text NOT NULL,
  quote_asset text NOT NULL,
  price_increment numeric NOT NULL,
  quantity_increment numeric NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX instrument_venue_symbol_idx ON instruments (venue, venue_symbol, type);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_order_id text NOT NULL,
  tenant_id text NOT NULL,
  portfolio_id text NOT NULL,
  account_id text NOT NULL,
  instrument_id text NOT NULL REFERENCES instruments(id),
  side text NOT NULL,
  type text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  limit_price numeric,
  status order_status NOT NULL DEFAULT 'draft',
  filled_quantity numeric NOT NULL DEFAULT 0,
  average_fill_price numeric,
  correlation_id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX order_tenant_client_id_idx ON orders (tenant_id, client_order_id);
CREATE INDEX order_portfolio_created_idx ON orders (portfolio_id, created_at DESC);

CREATE TABLE risk_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  outcome text NOT NULL,
  reasons jsonb NOT NULL,
  limits_snapshot jsonb NOT NULL,
  portfolio_snapshot jsonb NOT NULL,
  quote_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE decision_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  actor_id text NOT NULL,
  actor_type text NOT NULL,
  action text NOT NULL,
  correlation_id text NOT NULL,
  payload jsonb NOT NULL,
  previous_hash text,
  entry_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decision_tenant_time_idx ON decision_ledger (tenant_id, created_at DESC);
