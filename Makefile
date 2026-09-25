# Sisera — Institutional Multi-Asset Trading OS
# One-command local development & CI commands

.PHONY: help dev dev-v1 test lint format typecheck check db-migrate

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

dev: ## Boot V2 API Gateway & Next.js Web Terminal
	@echo "Starting Sisera V2 API Gateway on http://localhost:8000..."
	SISERA_ENVIRONMENT=dev SISERA_DEV_TOKEN=dev-secret-123 .venv/bin/uvicorn sisera_api.main:app --port 8000 & \
	echo "Starting Web Terminal on http://localhost:3000..." && \
	pnpm --filter @sisera/web dev

dev-v1: ## Boot legacy dashboard
	uv run sisera web --port 8000

db-migrate: ## Run PostgreSQL database migrations
	pnpm db:migrate

test: ## Run full Python test suite
	uv run pytest

lint: ## Run ruff lint across all packages and services
	uv run ruff check packages/ services/ sisera/

format: ## Auto-format and fix linting errors
	uv run ruff check packages/ services/ sisera/ --fix
	uv run ruff format packages/ services/ sisera/

typecheck: ## Type-check across all TypeScript workspaces
	npm run typecheck

check: lint typecheck test ## Run lint, typecheck, and test together

db-migrate: ## Run Alembic migrations
	uv run alembic upgrade head
