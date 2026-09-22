# Sisera — one-command local development

.PHONY: help dev infra-up infra-down test lint typecheck fmt check db-migrate

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

dev: ## Boot local infra + run the web dashboard (hot reload)
	@echo "Starting Sisera local infrastructure..."
	$(MAKE) infra-up
	@echo "Starting web dashboard on http://localhost:8000"
	uv run sisera web --port 8000

infra-up: ## Start dev infrastructure (Postgres/Timescale, Redis, NATS, MinIO, Prometheus, Grafana)
	docker compose -f infra/docker/docker-compose.yml up -d

infra-up-analytics: ## Start dev infrastructure including ClickHouse (analytics profile)
	docker compose -f infra/docker/docker-compose.yml --profile analytics up -d

infra-down: ## Stop dev infrastructure
	docker compose -f infra/docker/docker-compose.yml down

test: ## Run the full test suite
	uv run pytest

lint: ## Run ruff lint
	uv run ruff check .

format: ## Auto-format and fix lint
	uv run ruff check . --fix

typecheck: ## Type-check (placeholder until mypy is wired into CI)
	@echo "Type-check not yet configured; run 'make lint' in the interim."

check: lint test ## Lint + test together

db-migrate: ## Run Alembic migrations (Postgres must be up)
	@echo "Alembic migrations are introduced in Phase 2; see docs/architecture.md"
