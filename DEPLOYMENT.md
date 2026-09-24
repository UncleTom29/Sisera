# SISERA V2 — PRODUCTION DEPLOYMENT GUIDE

> **Infrastructure Topology, Containerization, Kubernetes Manifests, Docker Compose, and Zero-Downtime Deployment**

---

## 1. Architecture Overview

In production, Sisera is deployed as a resilient, horizontally scalable microservice mesh:
- **API Gateway (`sisera-api`)**: Horizontally auto-scaled FastAPI pods behind an Ingress controller with TLS termination.
- **Web Terminal (`sisera-web`)**: Next.js 14 SSR container optimized with static asset CDN caching.
- **Workers**:
  - `market-data-worker`: Websocket feed ingestion and L2 book normalization.
  - `risk-monitor-worker`: Continuous background portfolio margin and drawdown monitoring.
  - `agent-runtime-worker`: Sandboxed execution of autonomous strategies.
- **Data Tier**:
  - PostgreSQL 16 (Patroni HA cluster) with TimescaleDB extension.
  - ClickHouse cluster for tick/TCA storage.
  - NATS JetStream 3-node cluster.
  - Redis 7 Sentinel cluster.

---

## 2. Local Multi-Service Stack (Docker Compose)

Launch the full Sisera V2 infrastructure stack locally:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

### Services Started:
- `postgres`: Port 5432 (Database: `sisera`, User: `sisera`)
- `redis`: Port 6379 (Ephemeral cache & locks)
- `nats`: Ports 4222, 8222 (JetStream durable event bus)
- `clickhouse`: Ports 8123, 9000 (Time-series ticks & TCA)
- `api`: Port 8000 (`uvicorn sisera_api.main:app`)
- `web`: Port 3000 (`npm run start` in `apps/web`)

---

## 3. Kubernetes Deployment (Helm / K8s Manifests)

Sisera charts are structured under `infra/helm/sisera/`.

### Deployment Commands
```bash
# 1. Add secret values
kubectl create secret generic sisera-secrets \
  --from-literal=postgres-url="postgresql://sisera:${POSTGRES_PASS}@postgres-ha:5432/sisera" \
  --from-literal=privy-verification-key="${PRIVY_KEY}" \
  --namespace=sisera-prod

# 2. Deploy via Helm
helm upgrade --install sisera infra/helm/sisera \
  --namespace sisera-prod \
  --values infra/helm/sisera/values-prod.yaml

# 3. Verify rollout status
kubectl rollout status deployment/sisera-api -n sisera-prod
kubectl rollout status deployment/sisera-web -n sisera-prod
```

### Zero-Downtime Rolling Update Strategy
```yaml
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
        - name: sisera-api
          image: ghcr.io/uncletom29/sisera-api:v2.0.0
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 8000
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 8000
            initialDelaySeconds: 15
            periodSeconds: 10
```

---

## 4. Environment Variables Reference

| Variable | Description | Default / Example |
|---|---|---|
| `SISERA_ENVIRONMENT` | Environment mode (`dev`, `staging`, `production`) | `dev` |
| `SISERA_API_URL` | Base URL for the API Gateway | `http://localhost:8000` |
| `SISERA_POSTGRES_URL` | Canonical PostgreSQL connection string | `postgresql://sisera:pass@localhost:5432/sisera` |
| `SISERA_CLICKHOUSE_URL` | ClickHouse HTTP interface | `http://localhost:8123` |
| `SISERA_REDIS_URL` | Redis URL | `redis://localhost:6379/0` |
| `SISERA_NATS_URL` | NATS JetStream cluster URL | `nats://localhost:4222` |
| `SISERA_PRIVY_APP_ID` | Privy Application ID for JWT auth | `clq...` |
| `SISERA_PRIVY_VERIFICATION_KEY` | Public Ed25519 verification key | `-----BEGIN PUBLIC KEY...` |
| `SISERA_LIVE_TRADING_ENABLED` | Safety switch for live execution | `false` (MUST remain false unless explicitly overridden) |
| `SISERA_DEV_TOKEN` | Development bearer token bypass | Unset in production |

---

## 5. Backup & Disaster Recovery Procedures

1. **PostgreSQL Automated Backups**:
   - Continuous WAL archiving to S3 via `pgBackRest`.
   - Point-in-time recovery (PITR) RPO target: < 1 minute.
2. **Cold Site Failover**:
   - Secondary read-replica cluster in alternate cloud region.
   - Failover procedure detailed in `docs/operations/disaster-recovery.md`.
