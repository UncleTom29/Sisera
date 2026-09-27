CREATE TABLE prediction_paper_accounts (
  subject text PRIMARY KEY,
  cash_usd numeric NOT NULL DEFAULT 10000 CHECK (cash_usd >= 0),
  positions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prediction_paper_orders (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  subject text NOT NULL,
  market_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('yes', 'no')),
  deposit_usd numeric NOT NULL CHECK (deposit_usd > 0),
  fill_price_usd numeric NOT NULL CHECK (fill_price_usd > 0 AND fill_price_usd < 1),
  contracts numeric NOT NULL CHECK (contracts > 0),
  fee_usd numeric NOT NULL CHECK (fee_usd >= 0),
  status text NOT NULL DEFAULT 'filled' CHECK (status = 'filled'),
  closes_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prediction_paper_orders_subject_created_idx
  ON prediction_paper_orders (subject, created_at DESC);

CREATE OR REPLACE FUNCTION record_account_order_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  record_json jsonb;
  event_mode text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  END IF;
  record_json := to_jsonb(NEW);
  event_mode := CASE
    WHEN TG_TABLE_NAME IN ('market_paper_orders', 'prediction_paper_orders') THEN 'paper'
    WHEN TG_TABLE_NAME = 'solana_swap_orders' THEN record_json->>'mode'
    ELSE 'live'
  END;
  INSERT INTO account_events (tenant_id, subject, source, source_id, mode, status, detail)
  VALUES (
    NEW.tenant_id, NEW.subject, TG_TABLE_NAME, NEW.id, event_mode, NEW.status,
    jsonb_strip_nulls(jsonb_build_object(
      'venue', record_json->>'venue', 'symbol', record_json->>'symbol',
      'side', record_json->>'side', 'quantity', record_json->>'quantity',
      'marketId', record_json->>'market_id', 'outcome', record_json->>'outcome',
      'contracts', record_json->>'contracts', 'signature', record_json->>'signature',
      'venueOrderId', record_json->>'venue_order_id'
    ))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER prediction_paper_order_event AFTER INSERT ON prediction_paper_orders
FOR EACH ROW EXECUTE FUNCTION record_account_order_event();
