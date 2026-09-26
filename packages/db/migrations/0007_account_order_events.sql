CREATE TABLE account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  subject text NOT NULL,
  source text NOT NULL,
  source_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('paper', 'live')),
  status text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX account_events_subject_time_idx ON account_events (subject, occurred_at DESC);

CREATE FUNCTION account_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'account_events are append only';
END;
$$;
CREATE TRIGGER account_events_no_update BEFORE UPDATE OR DELETE ON account_events
FOR EACH ROW EXECUTE FUNCTION account_events_immutable();

CREATE FUNCTION record_account_order_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  record_json jsonb;
  event_mode text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  END IF;
  record_json := to_jsonb(NEW);
  event_mode := CASE
    WHEN TG_TABLE_NAME = 'market_paper_orders' THEN 'paper'
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
      'signature', record_json->>'signature', 'venueOrderId', record_json->>'venue_order_id'
    ))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER solana_order_event AFTER INSERT OR UPDATE ON solana_swap_orders
FOR EACH ROW EXECUTE FUNCTION record_account_order_event();
CREATE TRIGGER market_paper_order_event AFTER INSERT OR UPDATE ON market_paper_orders
FOR EACH ROW EXECUTE FUNCTION record_account_order_event();
CREATE TRIGGER market_live_order_event AFTER INSERT OR UPDATE ON market_live_orders
FOR EACH ROW EXECUTE FUNCTION record_account_order_event();
CREATE TRIGGER prediction_order_event AFTER INSERT OR UPDATE ON prediction_orders
FOR EACH ROW EXECUTE FUNCTION record_account_order_event();
