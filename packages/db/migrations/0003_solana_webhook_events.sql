CREATE TABLE solana_webhook_events (
  signature text PRIMARY KEY,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'helius',
  observed_at timestamptz NOT NULL DEFAULT now()
);
