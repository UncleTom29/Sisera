"""Unified Command-Line Interface for Sisera. See SCOPE.md §14.

Commands:
- `sisera web`: Launches the FastAPI web dashboard & real-time API.
- `sisera telegram`: Launches the interactive Telegram polling bot.
- `sisera run`: Runs the full trading orchestrator with web dashboard & alerts.
"""

from __future__ import annotations

import argparse
import logging
import threading
import time

import uvicorn

from sisera.config import config
from sisera.interfaces.telegram.bot import SiseraTelegramBot
from sisera.interfaces.web.app import create_app
from sisera.ledger.ledger import DecisionLedger
from sisera.orchestrator import Orchestrator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sisera.cli")


def run_web(host: str | None = None, port: int | None = None) -> None:
    import threading

    h = host or config.web_host
    p = port or config.web_port
    logger.info("Starting Sisera Web Dashboard on http://%s:%d (Capital: $%.2f)", h, p, config.initial_capital)
    orchestrator = Orchestrator(initial_capital=config.initial_capital)
    orchestrator.refresh_universe()
    threading.Thread(
        target=orchestrator.run_scan_cycle,
        kwargs={"timeframes": ["15m", "1h", "4h"], "max_scan_pairs": 10},
        daemon=True,
    ).start()
    app = create_app(orchestrator=orchestrator, ledger=orchestrator.ledger)
    uvicorn.run(app, host=h, port=p, log_level="info")


def run_telegram() -> None:
    logger.info("Starting Sisera Interactive Telegram Bot...")
    ledger = DecisionLedger()
    bot = SiseraTelegramBot(ledger=ledger)
    if not bot.token:
        logger.warning("No SISERA_TELEGRAM_BOT_TOKEN configured. Set it in .env to connect to Telegram.")

    logger.info("Telegram polling active. Press Ctrl+C to stop.")
    try:
        while True:
            bot.poll_updates_once()
            time.sleep(1.0)
    except KeyboardInterrupt:
        logger.info("Telegram polling stopped.")


def run_full(host: str | None = None, port: int | None = None) -> None:
    h = host or config.web_host
    p = port or config.web_port
    logger.info("Launching Sisera Full Intelligence Stack (Capital: $%.2f)...", config.initial_capital)

    orchestrator = Orchestrator(initial_capital=config.initial_capital)
    orchestrator.refresh_universe()

    # Start Telegram polling thread if enabled
    if config.telegram_polling_enabled and config.telegram_bot_token:
        tg_bot = SiseraTelegramBot(orchestrator=orchestrator)

        def _poll_worker() -> None:
            while True:
                tg_bot.poll_updates_once()
                time.sleep(1.0)

        tg_thread = threading.Thread(target=_poll_worker, daemon=True)
        tg_thread.start()
        logger.info("Telegram bot polling thread launched.")

    # Start FastAPI dashboard
    app = create_app(orchestrator=orchestrator, ledger=orchestrator.ledger)
    uvicorn.run(app, host=h, port=p, log_level="info")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sisera Quantitative Trading System CLI")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # `web` command
    web_parser = subparsers.add_parser("web", help="Start Web Dashboard")
    web_parser.add_argument("--host", default=None, help="Host to bind")
    web_parser.add_argument("--port", type=int, default=None, help="Port to bind")

    # `telegram` command
    subparsers.add_parser("telegram", help="Start Telegram Bot polling")

    # `run` command
    run_parser = subparsers.add_parser("run", help="Start full trading orchestrator and dashboard")
    run_parser.add_argument("--host", default=None, help="Web dashboard host")
    run_parser.add_argument("--port", type=int, default=None, help="Web dashboard port")

    args = parser.parse_args()

    if args.command == "web":
        run_web(host=args.host, port=args.port)
    elif args.command == "telegram":
        run_telegram()
    elif args.command == "run" or args.command is None:
        run_full(host=getattr(args, "host", None), port=getattr(args, "port", None))


if __name__ == "__main__":
    main()
