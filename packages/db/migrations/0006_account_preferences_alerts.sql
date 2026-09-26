CREATE TABLE account_preferences (
  subject text PRIMARY KEY,
  refresh_interval_ms integer NOT NULL DEFAULT 30000 CHECK (refresh_interval_ms IN (0, 15000, 30000, 60000)),
  failed_order_alerts boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_acknowledgements (
  subject text NOT NULL,
  order_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject, order_id)
);
CREATE INDEX alert_acknowledgements_subject_time_idx ON alert_acknowledgements (subject, acknowledged_at DESC);
