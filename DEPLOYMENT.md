# Sisera Deployment Guide

This document outlines how to run and deploy Sisera in **Development** and **Production** environments.

---

## 1. Prerequisites

- **Python**: `>= 3.12`
- **Package Manager**: [`uv`](https://github.com/astral-sh/uv) (recommended) or standard `pip`

```bash
# Clone the repository and install dependencies
git clone <repo-url>
cd Sisera
uv sync
```

---

## 2. Development Environment

In development mode, Sisera runs with simulated **Paper Execution** and does not place real exchange orders.

### Step 1: Set up Environment Variables
```bash
cp .env.example .env
```
*(No API keys are required for paper simulation mode.)*

### Step 2: Start the Web Dashboard
```bash
# Run from repository root (Sisera)
uv run sisera web --port 8000
# or alternatively:
uv run python -m sisera.cli web --port 8000
```
Open [http://localhost:8000](http://localhost:8000) to view the real-time glassmorphic terminal.

### Step 3: Run Tests & Verification
```bash
uv run pytest -v
uv run ruff check .
```

---

## 3. Production Environment

### Step 1: Configure Live/Testnet Credentials
Edit your `.env` file:
```ini
# Bybit API Credentials
SISERA_BYBIT_API_KEY=your_bybit_api_key
SISERA_BYBIT_API_SECRET=your_bybit_api_secret
SISERA_USE_TESTNET=false # Set true for Bybit Testnet

# Telegram Notifications & Interactive Bot
SISERA_TELEGRAM_BOT_TOKEN=your_telegram_bot_token
SISERA_TELEGRAM_CHAT_ID=your_telegram_chat_id
SISERA_TELEGRAM_POLLING_ENABLED=true

# Web Dashboard Binding
SISERA_WEB_HOST=0.0.0.0
SISERA_WEB_PORT=8000
```

### Step 2: Run the Full Production Stack
```bash
uv run sisera run
```
This initializes the universe, starts background 15-minute scan cycles and 5-minute position monitors, launches the Telegram polling worker, and serves the FastAPI web dashboard.

---

## 4. Production Process Management (systemd)

For persistent background operation on a Linux server:

```ini
# /etc/systemd/system/sisera.service
[Unit]
Description=Sisera Quantitative Trading Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/Sisera
ExecStart=/home/ubuntu/.local/bin/uv run sisera run
Restart=always
RestartSec=10
EnvironmentFile=/home/ubuntu/Sisera/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable sisera
sudo systemctl start sisera
sudo journalctl -u sisera -f
```

---

## 5. Docker Deployment (Optional)

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project
COPY . .
RUN uv sync --frozen
EXPOSE 8000
CMD ["uv", "run", "sisera", "run"]
```
