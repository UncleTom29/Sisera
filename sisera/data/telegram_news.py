"""Telegram public-channel news monitor. See SCOPE.md §5.

Uses Telethon (Telegram's official MTProto client protocol -- the same one the real
Telegram apps use, not HTML scraping) to read recent messages from public channels the
configured account has joined. This is a genuinely different mechanism from the existing
sisera/interfaces/telegram/bot.py, which is an outbound alert *bot* via the Bot REST API --
a bot can only see channels it's been explicitly added to by that channel's admin, which
doesn't work for "monitor N public channels you don't administer." A real user-account
client session is the correct, standard tool for that, and is what Telethon provides.

Requires one-time interactive setup -- see scripts/telegram_login.py. This module cannot
authenticate itself: Telegram requires a login code sent to the account's phone/app, which
only a human can receive and enter. Deliberately does NOT ship a default channel list --
see the module docstring discussion in this session: recommending specific "reliable" crypto
channels without a way to verify they're currently legitimate (vs. compromised or turned
into pump-and-dump mills, both common in this space) isn't something to do from training
data alone. SISERA_TELEGRAM_NEWS_CHANNELS is empty by default; populate it yourself.
"""

from __future__ import annotations

import asyncio
import logging
import os

from sisera.config import config
from sisera.data.models import NewsItem

logger = logging.getLogger(__name__)


class TelegramNewsMonitor:
    """Reads recent messages from configured public Telegram channels."""

    def __init__(
        self,
        api_id: str | None = None,
        api_hash: str | None = None,
        session_path: str | None = None,
        channels: list[str] | None = None,
    ) -> None:
        self._api_id = api_id if api_id is not None else config.telegram_news_api_id
        self._api_hash = api_hash if api_hash is not None else config.telegram_news_api_hash
        self._session_path = session_path or config.telegram_news_session_path
        self.channels = channels if channels is not None else config.telegram_news_channels

    @property
    def is_configured(self) -> bool:
        return bool(self._api_id and self._api_hash and self.channels)

    @property
    def is_authenticated(self) -> bool:
        """True once scripts/telegram_login.py has completed the one-time interactive
        login and produced a session file -- distinct from is_configured (which only
        checks that credentials/channels are *set*, not that login has happened)."""
        return os.path.exists(f"{self._session_path}.session")

    def fetch_recent_messages(
        self, since_ms: int | None = None, limit_per_channel: int = 20
    ) -> list[NewsItem]:
        """Fetches recent messages from every configured channel. Returns [] (with a
        clear log message, not a crash) if not configured or not yet authenticated --
        same graceful-degradation pattern as OpenRouterClient when unconfigured."""
        if not self.is_configured:
            logger.debug("Telegram news monitor not configured (no credentials/channels)")
            return []
        if not self.is_authenticated:
            logger.warning(
                "Telegram news monitor configured but not authenticated -- run "
                "`uv run python scripts/telegram_login.py` once to log in."
            )
            return []

        try:
            return asyncio.run(self._fetch_async(since_ms, limit_per_channel))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Telegram news monitor fetch failed: %s", exc)
            return []

    async def _fetch_async(self, since_ms: int | None, limit_per_channel: int) -> list[NewsItem]:
        from telethon import TelegramClient

        items: list[NewsItem] = []
        since_dt = None
        if since_ms is not None:
            import datetime

            since_dt = datetime.datetime.fromtimestamp(since_ms / 1000, tz=datetime.timezone.utc)

        async with TelegramClient(self._session_path, int(self._api_id), self._api_hash) as client:
            for channel in self.channels:
                try:
                    async for message in client.iter_messages(channel, limit=limit_per_channel):
                        if not message.text:
                            continue
                        if since_dt is not None and message.date <= since_dt:
                            break  # iter_messages is newest-first; older than cutoff -> done
                        items.append(
                            NewsItem(
                                source_type="telegram",
                                source_name=channel,
                                item_id=f"{channel}:{message.id}",
                                title=message.text[:500],
                                url=None,
                                published_ms=int(message.date.timestamp() * 1000),
                            )
                        )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Telegram channel %s fetch failed: %s", channel, exc)
        return items
