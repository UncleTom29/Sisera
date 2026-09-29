-- Earlier writes bound JSON text to jsonb parameters, which stored a JSON string instead of an
-- object. When such a string was later spread as an object it was split into one key per
-- character ("0", "1", ...) merged with real keys. This restores the intended documents.
CREATE FUNCTION sisera_repair_jsonb(value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  current jsonb := value;
  encoded text;
  rest jsonb;
  depth int := 0;
BEGIN
  WHILE depth < 32 LOOP
    depth := depth + 1;
    IF jsonb_typeof(current) = 'string' THEN
      encoded := current #>> '{}';
      IF left(ltrim(encoded), 1) NOT IN ('{', '[') THEN RETURN current; END IF;
      current := encoded::jsonb;
    ELSIF jsonb_typeof(current) = 'object' AND current ? '0' THEN
      SELECT string_agg(item.value #>> '{}', '' ORDER BY item.key::int)
        INTO encoded
        FROM jsonb_each(current) AS item WHERE item.key ~ '^[0-9]+$';
      SELECT COALESCE(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
        INTO rest
        FROM jsonb_each(current) AS item WHERE item.key !~ '^[0-9]+$';
      current := encoded::jsonb || rest;
    ELSE
      RETURN current;
    END IF;
  END LOOP;
  RETURN current;
END;
$$;

UPDATE solana_paper_accounts SET holdings = sisera_repair_jsonb(holdings)
WHERE jsonb_typeof(holdings) <> 'object' OR holdings ? '0';
UPDATE market_paper_accounts SET
  spot_holdings = sisera_repair_jsonb(spot_holdings),
  perp_positions = sisera_repair_jsonb(perp_positions)
WHERE jsonb_typeof(spot_holdings) <> 'object' OR spot_holdings ? '0'
   OR jsonb_typeof(perp_positions) <> 'object' OR perp_positions ? '0';
UPDATE prediction_paper_accounts SET positions = sisera_repair_jsonb(positions)
WHERE jsonb_typeof(positions) <> 'object' OR positions ? '0';

-- risk_decision is part of an audit record; repairing the encoding does not change its content.
UPDATE solana_swap_orders SET risk_decision = sisera_repair_jsonb(risk_decision)
WHERE jsonb_typeof(risk_decision) = 'string';
