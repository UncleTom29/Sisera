ALTER TABLE alert_acknowledgements RENAME COLUMN order_id TO alert_id;

INSERT INTO alert_acknowledgements (subject, alert_id, acknowledged_at)
SELECT acknowledgement.subject, event.id, acknowledgement.acknowledged_at
FROM alert_acknowledgements AS acknowledgement
JOIN account_events AS event
  ON event.subject = acknowledgement.subject
 AND event.source_id = acknowledgement.alert_id
 AND event.status IN ('failed', 'unknown', 'rejected')
ON CONFLICT DO NOTHING;

CREATE INDEX alert_acknowledgements_alert_idx
  ON alert_acknowledgements (alert_id);
