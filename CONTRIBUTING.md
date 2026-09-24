# SISERA V2 — CONTRIBUTING & ENGINEERING STANDARDS

> **Monorepo Guidelines, Financial Precision Rules, Testing Requirements, and Pull Request Workflows**

---

## 1. Development Setup

### Prerequisites
- Python 3.12+
- `uv` (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Node.js 20+ & `npm`
- Docker & Docker Compose

### Quickstart
```bash
# Clone the repository
git clone https://github.com/UncleTom29/Sisera.git
cd Sisera

# Install Python environment and dependencies
uv sync

# Install Node monorepo dependencies
npm install

# Start local services in background
docker compose -f infra/docker/docker-compose.yml up -d postgres redis nats

# Run full test suite
uv run pytest
npm run typecheck
```

---

## 2. Institutional Engineering Invariants

### 2.1 Financial Accounting Precision (ADR-002)
- **Never use floating-point types (`float`, `double`) for accounting logic**:
  - Quantities, prices, fees, balances, margin amounts, and PnL must be represented using `Decimal` (Python) or Decimal strings (TypeScript / JSON).
  - Division must explicitly specify rounding mode (`ROUND_HALF_EVEN` or `ROUND_DOWN` for conservative balances).

### 2.2 LLM Execution Boundary (ADR-008)
- LLMs are prohibited from executing mutating actions directly.
- All AI reasoning must flow through schema-validated intents and undergo evaluation by the deterministic policy engine and pre-trade risk engine before reaching the OMS.

### 2.3 Double-Entry Bookkeeping (ADR-007)
- All financial state changes must emit balanced journal entries into the ledger.
- For every transaction, `sum(postings) == 0`.

---

## 3. Code Quality & Style Standards

### Python
- Format and lint with `ruff`:
  ```bash
  uv run ruff check .
  uv run ruff format .
  ```
- Type annotations required on all function signatures (`mypy` / `pyright`).

### TypeScript / Frontend
- Strict mode enabled (`"strict": true` in `tsconfig.json`).
- Verify types without emitting:
  ```bash
  npm run typecheck
  ```
- No hardcoded inline style colors; import design tokens from `@sisera/ui`.

---

## 4. Testing Requirements

No pull request will be merged without passing all continuous integration gates:
1. **Unit Tests**:
   - Comprehensive coverage of math, state machines, risk limits, and serializers.
   - Run: `uv run pytest tests/unit/`
2. **Integration & API Tests**:
   - Verification of all `/api/v1` routes with valid auth tokens.
   - Run: `uv run pytest services/api/tests/`
3. **Double-Entry Ledger Invariant Tests**:
   - Mathematical proof that all postings balance to zero.
   - Run: `uv run pytest services/ledger/tests/`
4. **TypeScript Verification**:
   - Clean compilation of all packages and applications:
   - Run: `npm run typecheck`

---

## 5. Pull Request & Branching Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/institutional-risk-limits
   ```
2. Ensure all pre-commit hooks and tests pass locally:
   ```bash
   make test
   make typecheck
   make lint
   ```
3. Commit with semantic commit messages:
   - `feat(risk): implement portfolio stress test simulation`
   - `fix(oms): correct order state transition guard`
   - `docs(api): add endpoint examples for preview API`
4. Open a PR against `main`. Require at least one peer approval and 100% green CI.
