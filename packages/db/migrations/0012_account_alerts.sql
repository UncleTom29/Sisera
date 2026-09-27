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

ALTER TABLE bridge_transfers ADD COLUMN source_submitted_at timestamptz;
UPDATE bridge_transfers AS transfer
SET source_submitted_at = (
  SELECT min(event.occurred_at)
  FROM account_events AS event
  WHERE event.source = 'bridge_transfers'
    AND event.source_id = transfer.id
    AND event.status = 'source_submitted'
)
WHERE source_tx_hash IS NOT NULL;
