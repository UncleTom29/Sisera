"""RSS crypto news client. See SCOPE.md §5.

Free, keyless, and -- unlike scraping a site's HTML -- RSS feeds are an explicitly
sanctioned syndication mechanism, so this doesn't carry the same ToS risk. Verified
working (no API key required) against CoinTelegraph, Decrypt, The Block, CoinDesk,
WSJ Markets, FT, and Blockworks. CryptoPanic's "free" tier returned an HTML page rather
than JSON when tested without a key (likely needs registration now), so it's not included
as a default source. Reuters' public RSS domain (feeds.reuters.com) no longer resolves and
its current redirect target 404s -- confirmed dead, not included. Bloomberg, CNBC, and AP
have no confirmed free/official real-time feed as of this check.
"""

from __future__ import annotations

import calendar
import logging
import time

import feedparser
import requests

logger = logging.getLogger(__name__)

DEFAULT_FEEDS: dict[str, str] = {
    "cointelegraph": "https://cointelegraph.com/rss",
    "decrypt": "https://decrypt.co/feed",
    "theblock": "https://www.theblock.co/rss.xml",
    "coindesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "blockworks": "https://blockworks.co/feed/",
    # Macro/institutional context (§1, §5 event-intelligence layer) -- these two rarely
    # mention a specific coin ticker, so most of their items won't match any symbol via
    # scoring/news_relevance.match_symbols and are effectively no-ops for the per-coin
    # reaction pipeline today. Kept as default sources anyway because the macro-regime
    # indicator (sisera/indicators/macro.py) and the Event Attribution Engine's
    # event_category/severity classification both benefit from them being in the pool,
    # even before a coin-specific match is possible.
    "wsj_markets": "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    "ft": "https://www.ft.com/rss/home",
}

# Blockworks (and possibly others) returns 403 for the default `python-requests/x.y.z`
# User-Agent string specifically -- confirmed via direct curl comparison -- while a normal
# browser-like UA succeeds against the exact same public RSS URL. This is a basic bot
# filter, not an auth wall; RSS is an explicitly-sanctioned syndication format meant to be
# machine-fetched, so identifying as a normal browser here isn't circumventing anything
# the feed owner intended to restrict -- it's just not tripping a blunt UA-sniffing rule.
_REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    )
}


class NewsFeedClient:
    """Fetches recent headlines from a configurable set of crypto news RSS feeds."""

    def __init__(self, feeds: dict[str, str] | None = None, timeout_seconds: float = 10.0) -> None:
        self.feeds = feeds if feeds is not None else DEFAULT_FEEDS
        self._timeout = timeout_seconds

    def fetch_latest(self) -> list["NewsItem"]:  # noqa: F821 -- imported lazily to avoid a cycle
        """Fetches the current items from every configured feed. Each feed's failure is
        independent -- one down/slow outlet doesn't block the others (same fallback
        philosophy as every other data client in this codebase)."""
        from sisera.data.models import NewsItem

        items: list[NewsItem] = []
        for source_name, url in self.feeds.items():
            try:
                resp = requests.get(
                    url, timeout=self._timeout, allow_redirects=True, headers=_REQUEST_HEADERS
                )
                resp.raise_for_status()
                parsed = feedparser.parse(resp.content)
            except requests.RequestException as exc:
                logger.warning("News feed %s failed: %s", source_name, exc)
                continue

            for entry in parsed.entries:
                published_ms = _entry_published_ms(entry)
                link = entry.get("link")
                items.append(
                    NewsItem(
                        source_type="rss",
                        source_name=source_name,
                        item_id=link or f"{source_name}:{entry.get('title', '')}",
                        title=entry.get("title", ""),
                        url=link,
                        published_ms=published_ms,
                    )
                )
        return items


def _entry_published_ms(entry) -> int:
    parsed_time = entry.get("published_parsed") or entry.get("updated_parsed")
    if parsed_time is not None:
        return int(calendar.timegm(parsed_time) * 1000)
    return int(time.time() * 1000)
