# SISERA V2 — DISASTER RECOVERY & BUSINESS CONTINUITY

> **Recovery Point Objective (RPO), Recovery Time Objective (RTO), Multi-Region Failover, and Cold Site Activation**

---

## 1. Objectives & Metrics

- **Recovery Point Objective (RPO)**:
  - Canonical Financial Ledger: **0 seconds** (Strictly synchronous replication + durable WAL archiving).
  - Analytical Market Data: **< 10 seconds**.
- **Recovery Time Objective (RTO)**:
  - API Gateway & Read Services: **< 2 minutes**.
  - Order Execution & Routing: **< 5 minutes**.

---

## 2. Backup & Replication Architecture

### 2.1 PostgreSQL Canonical Database
- Primary instance running with continuous streaming replication to cross-region standby.
- Continuous WAL shipping to geo-redundant S3 / Cloud Storage buckets using `pgBackRest`.
- Automated daily logical backups and weekly integrity verification tests.

### 2.2 NATS JetStream Event Stream
- Multi-cluster JetStream gateway mirroring all order and fill streams across regions.
- Durable consumer offsets checkpointed at regular intervals.

---

## 3. Disaster Recovery Failover Procedure

In the event of total primary region failure:

### Step 1: Declare DR Failover
The Incident Commander and Head of Infrastructure declare formal DR activation.

### Step 2: Promote Standby Database
```bash
# On the secondary standby PostgreSQL node:
pgbackrest --stanza=sisera_main standby-promote
# Or using Patroni:
patronictl failover sisera-cluster --candidate standby-node-01
```

### Step 3: Switch DNS / Global Load Balancer
1. Update Cloudflare / Route53 DNS records to point `api.sisera.internal` and `web.sisera.internal` to secondary ingress IPs.
2. Verify SSL certificates and health check endpoints.

### Step 4: Validate State & Resynchronize Venues
1. Run balance reconciliation script:
   ```bash
   uv run python -m sisera.scripts.reconcile_all_venues
   ```
2. Verify all venue adapters establish authenticated WebSocket and FIX sessions.
3. Switch Circuit Breakers from `FULL_HALT` to `PASSIVE_ONLY` for 15 minutes of stability observation before resuming `NORMAL` mode.
