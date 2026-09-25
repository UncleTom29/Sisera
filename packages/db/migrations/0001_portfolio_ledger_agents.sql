CREATE TABLE portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, name text NOT NULL,
  base_currency text NOT NULL DEFAULT 'USD', status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX portfolio_tenant_name_idx ON portfolios (tenant_id, name);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL,
  portfolio_id uuid NOT NULL REFERENCES portfolios(id), venue text NOT NULL,
  venue_account_ref text NOT NULL, mode text NOT NULL DEFAULT 'paper', permissions jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending', last_reconciled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX account_venue_reference_idx ON accounts (tenant_id, venue, venue_account_ref);

CREATE TABLE balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id),
  asset text NOT NULL, total numeric NOT NULL, available numeric NOT NULL,
  source_timestamp timestamptz NOT NULL, observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX balance_account_asset_idx ON balances (account_id, asset);

CREATE TABLE positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id),
  instrument_id text NOT NULL REFERENCES instruments(id), side text NOT NULL, quantity numeric NOT NULL,
  entry_price numeric NOT NULL, mark_price numeric NOT NULL, margin_used numeric NOT NULL DEFAULT 0,
  source_timestamp timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX position_account_instrument_idx ON positions (account_id, instrument_id);

CREATE TABLE fills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
  venue_fill_id text NOT NULL, quantity numeric NOT NULL, price numeric NOT NULL,
  fee numeric NOT NULL DEFAULT 0, fee_asset text NOT NULL, filled_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX fill_order_venue_id_idx ON fills (order_id, venue_fill_id);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL,
  portfolio_id uuid NOT NULL REFERENCES portfolios(id), entry_type text NOT NULL,
  reference_id text NOT NULL, correlation_id text NOT NULL, effective_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ledger_portfolio_reference_idx ON ledger_entries (portfolio_id, entry_type, reference_id);

CREATE TABLE ledger_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid NOT NULL REFERENCES ledger_entries(id),
  account_code text NOT NULL, asset text NOT NULL, amount numeric NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX posting_entry_idx ON ledger_postings (entry_id);

CREATE TABLE reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id),
  status text NOT NULL, venue_snapshot_at timestamptz NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz, summary jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE reconciliation_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES reconciliation_runs(id),
  asset text NOT NULL, venue_amount numeric NOT NULL, ledger_amount numeric NOT NULL,
  difference numeric NOT NULL, severity text NOT NULL, resolved_at timestamptz
);
CREATE INDEX reconciliation_break_run_idx ON reconciliation_breaks (run_id);

CREATE TABLE agent_manifests (
  id text NOT NULL, version text NOT NULL, tenant_id text NOT NULL, name text NOT NULL,
  stage text NOT NULL, autonomy text NOT NULL, policy jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (id, version)
);
CREATE TABLE agent_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id text NOT NULL, manifest_version text NOT NULL,
  status text NOT NULL DEFAULT 'proposed', payload jsonb NOT NULL,
  risk_decision_id uuid REFERENCES risk_decisions(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_proposal_agent_time_idx ON agent_proposals (agent_id, created_at);
