CREATE TABLE bridge_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE CHECK (request_id ~ '^0x[0-9a-fA-F]{64}$'),
  tenant_id text NOT NULL,
  subject text NOT NULL,
  origin_address text NOT NULL,
  recipient text NOT NULL,
  origin_chain_id integer NOT NULL,
  destination_chain_id integer NOT NULL,
  origin_amount_usdc numeric NOT NULL CHECK (origin_amount_usdc > 0),
  quoted_output_usdc numeric NOT NULL CHECK (quoted_output_usdc >= 0),
  status text NOT NULL DEFAULT 'quoted',
  source_tx_hash text,
  destination_tx_hash text,
  quoted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX bridge_transfers_subject_time_idx ON bridge_transfers (subject, quoted_at DESC);

CREATE FUNCTION record_bridge_account_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  INSERT INTO account_events (tenant_id, subject, source, source_id, mode, status, detail)
  VALUES (
    NEW.tenant_id, NEW.subject, 'bridge_transfers', NEW.id, 'live', NEW.status,
    jsonb_strip_nulls(jsonb_build_object(
      'requestId', NEW.request_id, 'originChainId', NEW.origin_chain_id,
      'destinationChainId', NEW.destination_chain_id, 'recipient', NEW.recipient,
      'sourceTxHash', NEW.source_tx_hash, 'destinationTxHash', NEW.destination_tx_hash
    ))
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER bridge_account_event AFTER INSERT OR UPDATE ON bridge_transfers
FOR EACH ROW EXECUTE FUNCTION record_bridge_account_event();
