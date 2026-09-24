# SISERA V2 — INCIDENT RESPONSE PROCEDURE

> **Severity Levels, Escalation Paths, Kill Switch Tripping, and Post-Mortem Guidelines**

---

## 1. Incident Classification & Severity Matrix

| Severity | Definition | Target Response SLA | Example Incidents |
|---|---|---|---|
| **SEV-1 (CRITICAL)** | Active financial loss, risk engine breach, unauthorized execution, catastrophic venue partition. | < 5 minutes | Errant runaway agent execution, double-entry ledger imbalance, kill switch failure. |
| **SEV-2 (HIGH)** | Core service degradation, market data feed disconnect, venue latency spike > 500ms. | < 15 minutes | Binance WS feed stale, order routing failovers exhausted, database replica lag > 10s. |
| **SEV-3 (MEDIUM)** | Non-blocking feature failure, analytics/TCA delay, UI reporting discrepancy. | < 2 hours | Historical candles delayed, TCA calculation queue backlog. |
| **SEV-4 (LOW)** | Minor cosmetic defect, non-critical documentation inaccuracy. | Next business day | Styling glitch, prompt tuning anomaly. |

---

## 2. Immediate Triage & Containment (SEV-1 / SEV-2)

### Step 1: Emergency Kill Switch Activation
If anomalous execution or unexpected portfolio drawdown is detected, immediately trip the Kill Switch to cancel open orders and halt routing:

```bash
# Via API:
curl -X POST "http://localhost:8000/api/v1/risk/kill-switch/trip" \
  -H "Authorization: Bearer $SISERA_OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scope": "GLOBAL", "reason": "SEV-1 incident triage"}'

# Or via Python Service CLI:
uv run python -c "from sisera_risk.circuit_breaker import CircuitBreaker; CircuitBreaker().trip('GLOBAL', 'all', 'FULL_HALT', 'Emergency manual halt', 'oncall_engineer')"
```

### Step 2: Open Incident Bridge
1. Create a dedicated incident Slack/Discord channel: `#incident-YYYYMMDD-[tag]`.
2. Designate an Incident Commander (IC), Lead Technical Investigator, and Communications Lead.
3. Notify all designated risk officers and senior quantitative researchers.

### Step 3: Reconcile Ledger & Open Positions
1. Pull live exchange positions across all venue adapters:
   ```bash
   curl "http://localhost:8000/api/v1/positions?portfolio_id=pf_1"
   ```
2. Verify total inventory against the double-entry accounting ledger:
   ```bash
   curl "http://localhost:8000/api/v1/ledger/balances?account=portfolio:pf_1"
   ```

---

## 3. Post-Incident & Root Cause Analysis (RCA)

Within 24 hours of incident resolution, the Incident Commander must publish a formal blameless Post-Mortem covering:
1. **Executive Summary**: What happened, business impact, total financial variance.
2. **Timeline of Events (UTC)**: Millisecond-by-millisecond chronology from initiation to resolution.
3. **Root Cause Analysis (5 Whys)**: Underlying technical, quantitative, or procedural defects.
4. **Corrective & Preventative Actions (CAPA)**: Action items assigned to owners with explicit due dates.
