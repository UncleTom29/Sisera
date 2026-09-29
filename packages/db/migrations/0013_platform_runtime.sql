-- Unified ledger, conversational policies, agent runtime, launches and event intelligence.

-- Live swaps record token decimals so that raw amounts can be normalized into fills.
ALTER TABLE solana_swap_orders
  ADD COLUMN token_decimals integer CHECK (token_decimals BETWEEN 0 AND 18),
  ADD COLUMN book text NOT NULL DEFAULT 'manual',
  ADD COLUMN arrival_price_usd numeric;
ALTER TABLE market_live_orders
  ADD COLUMN fill_price numeric CHECK (fill_price > 0),
  ADD COLUMN fee_usd numeric CHECK (fee_usd >= 0);

ALTER TABLE account_preferences
  ADD COLUMN liquidity_threshold_usd numeric NOT NULL DEFAULT 250000 CHECK (liquidity_threshold_usd >= 0),
  ADD COLUMN mandate jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Agent executions, kept separately from the owner's manual book.
CREATE TABLE agent_fills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  subject text NOT NULL,
  agent_id text NOT NULL,
  manifest_version text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('paper', 'live')),
  venue text NOT NULL,
  asset_class text NOT NULL,
  instrument_key text NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  price_usd numeric NOT NULL CHECK (price_usd > 0),
  fee_usd numeric NOT NULL DEFAULT 0 CHECK (fee_usd >= 0),
  arrival_price_usd numeric,
  slippage_bps numeric,
  decision_id uuid,
  signature text,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT agent_fill_manifest_fk FOREIGN KEY (agent_id, manifest_version)
    REFERENCES agent_manifests(id, version)
);
CREATE INDEX agent_fills_agent_time_idx ON agent_fills (agent_id, occurred_at DESC);
CREATE INDEX agent_fills_subject_time_idx ON agent_fills (subject, occurred_at DESC);
CREATE TRIGGER agent_fills_no_update BEFORE UPDATE OR DELETE ON agent_fills
FOR EACH ROW EXECUTE FUNCTION account_events_immutable();

-- One normalized, read-only view over every recorded fill. Live swaps without recorded decimals
-- predate normalization and are reported as unreconciled by the application.
CREATE VIEW portfolio_fills AS
SELECT
  o.id::text AS id, o.tenant_id, o.subject, o.mode, o.book, 'solana' AS venue,
  NULL::text AS asset_class,
  CASE WHEN o.input_mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' THEN o.output_mint ELSE o.input_mint END AS instrument_key,
  CASE WHEN o.input_mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' THEN 'buy' ELSE 'sell' END AS side,
  CASE
    WHEN o.mode = 'paper' AND o.input_mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' THEN o.out_amount::numeric
    WHEN o.mode = 'paper' THEN o.in_amount::numeric
    WHEN o.input_mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' THEN o.out_amount::numeric / power(10::numeric, o.token_decimals)
    ELSE o.in_amount::numeric / power(10::numeric, o.token_decimals)
  END AS quantity,
  CASE
    WHEN o.mode = 'paper' AND o.input_mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' THEN o.in_amount::numeric / NULLIF(o.out_amount::numeric, 0)
    WHEN o.mode = 'paper' THEN o.out_amount::numeric / NULLIF(o.in_amount::numeric, 0)
    WHEN o.input_mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      THEN (o.in_amount::numeric / 1000000) / NULLIF(o.out_amount::numeric / power(10::numeric, o.token_decimals), 0)
    ELSE (o.out_amount::numeric / 1000000) / NULLIF(o.in_amount::numeric / power(10::numeric, o.token_decimals), 0)
  END AS price_usd,
  0::numeric AS fee_usd,
  o.arrival_price_usd,
  o.signature,
  'solana_swap_orders' AS source,
  o.updated_at AS occurred_at
FROM solana_swap_orders o
WHERE o.status IN ('paper_filled', 'confirmed') AND (o.mode = 'paper' OR o.token_decimals IS NOT NULL)
UNION ALL
SELECT id::text, tenant_id, subject, 'paper', 'manual', venue,
  CASE WHEN venue = 'hyperliquid' THEN 'perpetual' ELSE 'crypto_spot' END,
  venue || ':' || symbol, side, quantity, fill_price, fee_usd, fill_price, NULL, 'market_paper_orders', created_at
FROM market_paper_orders WHERE status = 'filled'
UNION ALL
SELECT id::text, tenant_id, subject, 'live', 'manual', venue,
  CASE WHEN venue = 'hyperliquid' THEN 'perpetual' ELSE 'crypto_spot' END,
  venue || ':' || symbol, side, quantity, fill_price, COALESCE(fee_usd, 0), NULL, venue_order_id, 'market_live_orders', updated_at
FROM market_live_orders WHERE status = 'filled' AND fill_price IS NOT NULL
UNION ALL
SELECT id::text, tenant_id, subject, 'paper', 'manual', 'jupiter-prediction', 'prediction',
  'prediction:' || market_id || ':' || outcome, 'buy', contracts, fill_price_usd, fee_usd, fill_price_usd, NULL,
  'prediction_paper_orders', created_at
FROM prediction_paper_orders
UNION ALL
SELECT id::text, tenant_id, subject, mode, 'agent:' || agent_id, venue, asset_class, instrument_key, side,
  quantity, price_usd, fee_usd, arrival_price_usd, signature, 'agent_fills', occurred_at
FROM agent_fills;

-- Conversational trading policies compiled from natural language.
CREATE TABLE trading_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  subject text NOT NULL,
  name text NOT NULL,
  policy jsonb NOT NULL,
  policy_hash text NOT NULL CHECK (policy_hash ~ '^[0-9a-f]{64}$'),
  mode text NOT NULL CHECK (mode IN ('paper', 'live')),
  status text NOT NULL CHECK (status IN (
    'draft', 'active', 'awaiting_approval', 'executing', 'executed', 'failed', 'cancelled', 'expired', 'invalidated'
  )),
  source text NOT NULL DEFAULT 'copilot',
  last_evaluation jsonb,
  last_evaluated_at timestamptz,
  execution jsonb,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trading_policies_subject_idx ON trading_policies (subject, created_at DESC);
CREATE INDEX trading_policies_active_idx ON trading_policies (status) WHERE status IN ('active', 'awaiting_approval');

-- A compiled policy never changes after activation; only its lifecycle fields may.
CREATE FUNCTION guard_trading_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'trading policies are retained for audit'; END IF;
  IF OLD.status <> 'draft' AND (NEW.policy IS DISTINCT FROM OLD.policy OR NEW.policy_hash <> OLD.policy_hash) THEN
    RAISE EXCEPTION 'an activated policy cannot be edited; cancel it and compile a new one';
  END IF;
  IF OLD.status IN ('executed', 'failed', 'cancelled', 'expired', 'invalidated') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'policy % is final', OLD.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trading_policy_guard BEFORE UPDATE OR DELETE ON trading_policies
FOR EACH ROW EXECUTE FUNCTION guard_trading_policy();

CREATE FUNCTION record_policy_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  INSERT INTO account_events (tenant_id, subject, source, source_id, mode, status, detail)
  VALUES (NEW.tenant_id, NEW.subject, 'trading_policies', NEW.id, NEW.mode, NEW.status,
    jsonb_strip_nulls(jsonb_build_object(
      'symbol', NEW.policy->'instrument'->>'symbol',
      'side', NEW.policy->'action'->>'side',
      'notionalUsd', NEW.policy->'action'->>'notionalUsd',
      'name', NEW.name
    )));
  RETURN NEW;
END;
$$;
CREATE TRIGGER trading_policy_event AFTER INSERT OR UPDATE ON trading_policies
FOR EACH ROW EXECUTE FUNCTION record_policy_event();

-- Agent lifecycle: the manifest is immutable; stage and autonomy move through an append-only log.
CREATE TABLE agent_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  manifest_version text NOT NULL,
  stage text NOT NULL CHECK (stage IN (
    'draft', 'backtest', 'stress_test', 'paper', 'shadow', 'limited_live', 'live', 'paused'
  )),
  autonomy text NOT NULL CHECK (autonomy IN (
    'research', 'suggest', 'confirm', 'policy_auto', 'autonomous', 'risk_only'
  )),
  reason text NOT NULL,
  actor_subject text NOT NULL,
  evaluation_id uuid REFERENCES agent_evaluations(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT agent_state_manifest_fk FOREIGN KEY (agent_id, manifest_version)
    REFERENCES agent_manifests(id, version)
);
CREATE INDEX agent_state_events_agent_idx ON agent_state_events (agent_id, created_at DESC);
CREATE TRIGGER agent_state_events_no_update BEFORE UPDATE OR DELETE ON agent_state_events
FOR EACH ROW EXECUTE FUNCTION account_events_immutable();

-- Server-side enforcement of the promotion pipeline, independent of the API.
CREATE FUNCTION guard_agent_state_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner text;
  required text;
  evidence_ok boolean;
BEGIN
  SELECT owner_subject INTO owner FROM agent_manifests
  WHERE id = NEW.agent_id AND version = NEW.manifest_version;
  IF owner IS NULL THEN RAISE EXCEPTION 'unknown agent manifest'; END IF;
  required := CASE NEW.stage
    WHEN 'stress_test' THEN 'backtest'
    WHEN 'paper' THEN 'stress_test'
    WHEN 'shadow' THEN 'paper'
    WHEN 'limited_live' THEN 'shadow'
    WHEN 'live' THEN 'limited_live'
    ELSE NULL
  END;
  -- Resuming a paused agent at paper still needs the stress-test evidence for this version.
  IF required IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM agent_evaluations
      WHERE agent_id = NEW.agent_id AND manifest_version = NEW.manifest_version
        AND stage = required AND outcome = 'passed'
    ) INTO evidence_ok;
    IF NOT evidence_ok THEN
      RAISE EXCEPTION 'stage % requires a passed % evaluation for this manifest version', NEW.stage, required;
    END IF;
  END IF;
  IF NEW.stage IN ('limited_live', 'live') AND NEW.actor_subject = owner THEN
    RAISE EXCEPTION 'live stages require an independent approver';
  END IF;
  IF NEW.autonomy IN ('policy_auto', 'autonomous') AND NEW.stage IN ('draft', 'backtest', 'stress_test') THEN
    RAISE EXCEPTION 'automatic autonomy requires an evaluated stage';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_state_event_guard BEFORE INSERT ON agent_state_events
FOR EACH ROW EXECUTE FUNCTION guard_agent_state_event();

CREATE TABLE agent_runtime_state (
  agent_id text NOT NULL,
  manifest_version text NOT NULL,
  subject text NOT NULL,
  tenant_id text NOT NULL,
  stage text NOT NULL,
  stage_started_at timestamptz NOT NULL DEFAULT now(),
  starting_equity_usd numeric NOT NULL,
  max_drawdown_pct numeric NOT NULL DEFAULT 0,
  cash_usd numeric NOT NULL,
  positions jsonb NOT NULL DEFAULT '{}'::jsonb,
  day date NOT NULL DEFAULT current_date,
  day_start_equity_usd numeric NOT NULL,
  peak_equity_usd numeric NOT NULL,
  last_tick_at timestamptz,
  last_data_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, manifest_version),
  CONSTRAINT agent_runtime_manifest_fk FOREIGN KEY (agent_id, manifest_version)
    REFERENCES agent_manifests(id, version)
);

-- The decision trail: what the agent observed, which rules passed, and what it did.
CREATE TABLE agent_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  manifest_version text NOT NULL,
  subject text NOT NULL,
  stage text NOT NULL,
  autonomy text NOT NULL,
  symbol text NOT NULL,
  action text NOT NULL CHECK (action IN ('enter', 'exit', 'hold', 'abstain', 'breaker')),
  disposition text NOT NULL CHECK (disposition IN ('record', 'recommend', 'await_approval', 'execute', 'blocked')),
  market_state jsonb NOT NULL,
  rule_results jsonb NOT NULL,
  risk_decision jsonb,
  reasons jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX agent_decisions_agent_idx ON agent_decisions (agent_id, created_at DESC);
CREATE TRIGGER agent_decisions_no_update BEFORE UPDATE OR DELETE ON agent_decisions
FOR EACH ROW EXECUTE FUNCTION account_events_immutable();

CREATE TABLE agent_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  subject text NOT NULL,
  agent_id text NOT NULL,
  manifest_version text NOT NULL,
  decision_id uuid NOT NULL REFERENCES agent_decisions(id),
  mode text NOT NULL CHECK (mode IN ('paper', 'shadow', 'live')),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  symbol text NOT NULL,
  instrument_key text NOT NULL,
  notional_usd numeric NOT NULL CHECK (notional_usd > 0),
  quantity numeric,
  arrival_price_usd numeric,
  fill_price_usd numeric,
  status text NOT NULL CHECK (status IN (
    'recommended', 'awaiting_approval', 'approved', 'rejected', 'executed', 'shadowed', 'failed', 'expired'
  )),
  approved_by text,
  signature text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_orders_subject_idx ON agent_orders (subject, created_at DESC);
CREATE INDEX agent_orders_agent_idx ON agent_orders (agent_id, created_at DESC);

CREATE FUNCTION record_agent_order_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  INSERT INTO account_events (tenant_id, subject, source, source_id, mode, status, detail)
  VALUES (NEW.tenant_id, NEW.subject, 'agent_orders', NEW.id,
    CASE WHEN NEW.mode = 'live' THEN 'live' ELSE 'paper' END, NEW.status,
    jsonb_strip_nulls(jsonb_build_object(
      'agentId', NEW.agent_id, 'symbol', NEW.symbol, 'side', NEW.side,
      'notionalUsd', NEW.notional_usd::text, 'signature', NEW.signature
    )));
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_order_event AFTER INSERT OR UPDATE ON agent_orders
FOR EACH ROW EXECUTE FUNCTION record_agent_order_event();

-- Token and liquidity launches through Clawpump and Meteora DBC.
CREATE TABLE token_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  subject text NOT NULL,
  venue text NOT NULL CHECK (venue IN ('clawpump', 'meteora_dbc')),
  agent_id text,
  status text NOT NULL CHECK (status IN (
    'draft', 'quoted', 'awaiting_signature', 'submitted', 'confirming', 'launched', 'failed', 'expired'
  )),
  name text NOT NULL,
  symbol text NOT NULL,
  description text NOT NULL,
  image_url text,
  wallet text NOT NULL,
  quote_mint text NOT NULL,
  quote_symbol text NOT NULL,
  reference_symbol text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  base_mint text,
  pool_address text,
  config_address text,
  unsigned_transaction text,
  signature text,
  error text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX token_launches_subject_idx ON token_launches (subject, created_at DESC);
CREATE UNIQUE INDEX token_launches_signature_idx ON token_launches (signature) WHERE signature IS NOT NULL;
CREATE INDEX token_launches_mint_idx ON token_launches (base_mint) WHERE base_mint IS NOT NULL;

CREATE FUNCTION record_launch_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  INSERT INTO account_events (tenant_id, subject, source, source_id, mode, status, detail)
  VALUES (NEW.tenant_id, NEW.subject, 'token_launches', NEW.id, 'live', NEW.status,
    jsonb_strip_nulls(jsonb_build_object(
      'venue', NEW.venue, 'symbol', NEW.symbol, 'mint', NEW.base_mint, 'signature', NEW.signature
    )));
  RETURN NEW;
END;
$$;
CREATE TRIGGER token_launch_event AFTER INSERT OR UPDATE ON token_launches
FOR EACH ROW EXECUTE FUNCTION record_launch_event();

-- Classified market events, persisted so "what changed" survives restarts.
CREATE TABLE market_events (
  id text PRIMARY KEY,
  headline text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  sentiment text NOT NULL,
  certainty text NOT NULL,
  asset_keys text[] NOT NULL DEFAULT '{}',
  impact_score numeric NOT NULL,
  payload jsonb NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_events_last_seen_idx ON market_events (last_seen_at DESC);
CREATE INDEX market_events_assets_idx ON market_events USING gin (asset_keys);

CREATE TABLE copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  thread_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  intent text,
  evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX copilot_messages_thread_idx ON copilot_messages (subject, thread_id, created_at);

-- Agent lifecycle changes appear on the owner's timeline, so pauses and demotions can alert.
CREATE FUNCTION record_agent_state_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner text;
  tenant text;
BEGIN
  SELECT owner_subject, tenant_id INTO owner, tenant FROM agent_manifests
  WHERE id = NEW.agent_id AND version = NEW.manifest_version;
  INSERT INTO account_events (tenant_id, subject, source, source_id, mode, status, detail)
  VALUES (tenant, owner, 'agent_state_events', NEW.id,
    CASE WHEN NEW.stage IN ('limited_live', 'live') THEN 'live' ELSE 'paper' END, NEW.stage,
    jsonb_build_object('agentId', NEW.agent_id, 'version', NEW.manifest_version,
      'autonomy', NEW.autonomy, 'reason', left(NEW.reason, 300), 'actor', NEW.actor_subject));
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_state_event_timeline AFTER INSERT ON agent_state_events
FOR EACH ROW EXECUTE FUNCTION record_agent_state_event();
