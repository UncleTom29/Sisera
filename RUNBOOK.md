# SISERA V2 — OPERATIONAL RUNBOOK

> **Daily Operations, System Health Verification, Emergency Kill Switches, and Incident Escalation**

---

## 1. Quick Boot & Local Verification

### 1.1 Start API Gateway
```bash
uv sync
SISERA_ENVIRONMENT=dev SISERA_DEV_TOKEN=dev-secret-123 \
  uv run uvicorn sisera_api.main:app --host 0.0.0.0 --port 8000
```
Verify health:
```bash
curl http://localhost:8000/api/v1/health
# {"status":"ok","version":"2.0.0","environment":"dev",...}
```

### 1.2 Start Web Terminal
```bash
cd apps/web
npm run dev
# Running on http://localhost:3000
```

---

## 2. Daily Operational Checklist (Start of Trading Day)

- [ ] **System Health Check**: Verify all core microservices report green via `/api/v1/health`.
- [ ] **Data Quality Audit**: Confirm all primary market data feeds (Binance, Bybit, Polymarket) have status `LIVE` and status age < 500ms.
- [ ] **Ledger Balancing Reconciliation**: Run double-entry balance check script to verify zero-sum postings across all asset accounts.
- [ ] **Circuit Breaker Status**: Verify no unintended kill switches or circuit breakers are currently tripped.
- [ ] **Agent Performance Review**: Review 24h PnL, win rate, and max drawdown for all active autonomous agents.
- [ ] **Risk Limits Verification**: Confirm margin usage is within approved limits (< 60% gross leverage).

---

## 3. Emergency Kill Switch Operations

The kill switch system halts trading and protects firm capital during market turbulence or system faults.

### Trip Kill Switch
```bash
# Global halt across all accounts and venues:
curl -X POST "http://localhost:8000/api/v1/risk/kill-switch/trip" \
  -H "Authorization: Bearer $SISERA_DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scope": "GLOBAL", "reason": "Emergency volatility halt", "scope_id": "all"}'

# Portfolio-specific halt:
curl -X POST "http://localhost:8000/api/v1/risk/kill-switch/trip" \
  -H "Authorization: Bearer $SISERA_DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scope": "PORTFOLIO", "reason": "Portfolio drawdown breached", "scope_id": "pf_1"}'
```

### Clear Kill Switch (Resume Trading)
```bash
curl -X POST "http://localhost:8000/api/v1/risk/kill-switch/clear" \
  -H "Authorization: Bearer $SISERA_DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scope": "PORTFOLIO", "reason": "Risk officer resumed after manual audit", "scope_id": "pf_1"}'
```

---

## 4. Incident Response & Disaster Recovery

- **Incident Response Procedures**: Refer to [docs/operations/incident-response.md](file:///Users/ginmax/Sisera/docs/operations/incident-response.md) for severity classifications (SEV-1 to SEV-4) and triage protocols.
- **Disaster Recovery & Failover**: Refer to [docs/operations/disaster-recovery.md](file:///Users/ginmax/Sisera/docs/operations/disaster-recovery.md) for database promotion, RPO/RTO metrics, and standby failover steps.

---

## 5. Security & Credential Hygiene

- **Credential Remediation**: Refer to [docs/security/credential-remediation.md](file:///Users/ginmax/Sisera/docs/security/credential-remediation.md).
- **Prohibited Files**: Never commit `.env`, `*.session`, `*.key`, `*.pem`, or `var/` files to Git.
- **Authentication**: Production uses Privy JWT verification with Ed25519 JWKS.
