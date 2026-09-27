ALTER TABLE agent_manifests
  ADD COLUMN owner_subject text,
  ADD COLUMN manifest_hash text;

CREATE FUNCTION guard_agent_manifest() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'agent manifests are immutable; create a reviewed version';
  END IF;
  IF NEW.stage <> 'draft' OR NEW.autonomy <> 'research' THEN
    RAISE EXCEPTION 'new agents must start as research-only drafts';
  END IF;
  IF NEW.owner_subject IS NULL OR NEW.manifest_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'agent owner and manifest hash are required';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_manifest_guard BEFORE INSERT OR UPDATE OR DELETE ON agent_manifests
FOR EACH ROW EXECUTE FUNCTION guard_agent_manifest();

CREATE TABLE agent_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  manifest_version text NOT NULL,
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  stage text NOT NULL CHECK (stage IN (
    'backtest', 'stress_test', 'paper', 'shadow', 'limited_live', 'live'
  )),
  outcome text NOT NULL CHECK (outcome IN ('passed', 'failed', 'inconclusive')),
  evidence jsonb NOT NULL,
  data_window_start timestamptz NOT NULL,
  data_window_end timestamptz NOT NULL,
  reviewer_subject text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_evaluation_window CHECK (data_window_end > data_window_start),
  CONSTRAINT agent_evaluation_manifest_fk FOREIGN KEY (agent_id, manifest_version)
    REFERENCES agent_manifests(id, version)
);
CREATE INDEX agent_evaluations_agent_time_idx
  ON agent_evaluations (agent_id, recorded_at DESC);
CREATE FUNCTION guard_agent_evaluation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_hash text;
  owner text;
BEGIN
  SELECT manifest_hash, owner_subject INTO expected_hash, owner
  FROM agent_manifests WHERE id = NEW.agent_id AND version = NEW.manifest_version;
  IF expected_hash IS NULL OR expected_hash <> NEW.manifest_hash THEN
    RAISE EXCEPTION 'evaluation does not match the immutable agent manifest';
  END IF;
  IF NEW.outcome = 'passed' AND NEW.stage IN ('limited_live', 'live')
     AND NEW.reviewer_subject = owner THEN
    RAISE EXCEPTION 'live promotion evidence requires an independent reviewer';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_evaluation_guard BEFORE INSERT ON agent_evaluations
FOR EACH ROW EXECUTE FUNCTION guard_agent_evaluation();
CREATE TRIGGER agent_evaluations_no_update BEFORE UPDATE OR DELETE ON agent_evaluations
FOR EACH ROW EXECUTE FUNCTION account_events_immutable();
