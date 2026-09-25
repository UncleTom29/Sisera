CREATE TABLE solana_swap_orders (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  subject text NOT NULL,
  wallet text NOT NULL,
  input_mint text NOT NULL,
  output_mint text NOT NULL,
  in_amount text NOT NULL,
  out_amount text NOT NULL,
  request_id text,
  unsigned_transaction text,
  risk_decision jsonb NOT NULL,
  mode text NOT NULL CHECK (mode IN ('paper', 'live')),
  status text NOT NULL CHECK (status IN ('paper_filled', 'prepared', 'submitting', 'confirmed', 'failed', 'unknown')),
  signature text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX solana_swap_orders_subject_created_idx ON solana_swap_orders (subject, created_at DESC);

CREATE TABLE solana_paper_accounts (
  subject text PRIMARY KEY,
  cash_usd numeric NOT NULL DEFAULT 10000,
  holdings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

UPDATE organization_memberships
SET role = 'trader'
WHERE role = 'viewer' AND organization_id LIKE 'personal:%';
