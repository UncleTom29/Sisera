"""X (Twitter) API v2 client -- gated, paid, capped. See SCOPE.md §5.

Unlike every other data source in this codebase, X has no free tier as of February 2026:
read access is pay-per-use, $0.005 per post returned by a call, no free allowance
(confirmed live this session -- see sisera/config.py's enable_x_ingestion comment). This
client MUST consult an XSpendTracker (sisera/data/x_spend_tracker.py) before every call and
refuse rather than call-then-discover-the-cost. Off by default (SISERA_ENABLE_X_INGESTION);
building this at all was an explicit user decision given the recurring real-money cost, not
the default posture for a new data source in this project.

Endpoint shape (recent-search, `from:` query, `expansions=author_id`/`user.fields=username`
to recover which tracked account each result came from) follows X API v2's documented
conventions, but -- unlike the other clients added this session -- was NOT independently
curl-verified against a live key, since doing so requires a paid credential this session
doesn't have. Verify the exact request/response shape against X's current API docs on
first real use with a bearer token, same as any other since-training-cutoff API surface.
"""

from __future__ import annotations

import calendar
import logging
import time
from typing import Any

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from sisera.config import config
from sisera.data.models import NewsItem
from sisera.data.x_spend_tracker import XSpendTracker

logger = logging.getLogger(__name__)


class XClient:
    """Minimal X API v2 client scoped to one call: recent posts from a fixed set of
    tracked accounts. Never fabricates a result on failure or when capped -- returns []."""

    def __init__(
        self,
        bearer_token: str | None = None,
        base_url: str | None = None,
        spend_tracker: XSpendTracker | None = None,
    ) -> None:
        self._bearer_token = bearer_token if bearer_token is not None else config.x_bearer_token
        self._base_url = base_url or config.x_base_url
        self._session = requests.Session()
        self._spend_tracker = spend_tracker or XSpendTracker(db_path=config.cache_db_path)
        self._last_cap_warning_date: str | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self._bearer_token)

    @retry(
        reraise=True,
        stop=stop_after_attempt(config.http_max_retries),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        retry=retry_if_exception_type(requests.RequestException),
    )
    def _search_recent(self, query: str, max_results: int) -> dict[str, Any]:
        resp = self._session.get(
            f"{self._base_url}/2/tweets/search/recent",
            headers={"Authorization": f"Bearer {self._bearer_token}"},
            params={
                "query": query,
                "max_results": max(10, min(100, max_results)),
                "tweet.fields": "created_at,author_id",
                "expansions": "author_id",
                "user.fields": "username",
            },
            timeout=config.http_timeout_seconds,
        )
        resp.raise_for_status()
        return resp.json()

    def fetch_recent_posts(self, usernames: tuple[str, ...], max_results: int | None = None) -> list[NewsItem]:
        """Fetches recent posts from `usernames` as a single combined search (one call
        covering all tracked accounts, not one call per account -- cost is per post
        returned, not per call, so this doesn't multiply cost, but it does bound worst-case
        cost per poll to max_results regardless of how many accounts are tracked).

        Returns [] if unconfigured, if the daily spend cap would be exceeded, or on any
        request/parse failure -- never a fabricated result.
        """
        if not self.is_configured or not usernames:
            return []

        limit = max_results if max_results is not None else config.x_max_results_per_call
        if self._spend_tracker.would_exceed(limit):
            today = time.strftime("%Y-%m-%d", time.gmtime())
            if self._last_cap_warning_date != today:
                logger.warning(
                    "X daily spend cap reached ($%.2f/day) -- skipping X ingestion for the "
                    "rest of the UTC day.",
                    config.x_max_daily_spend_usd,
                )
                self._last_cap_warning_date = today
            return []

        query = "(" + " OR ".join(f"from:{u}" for u in usernames) + ")"
        try:
            payload = self._search_recent(query, limit)
        except requests.RequestException as exc:
            logger.warning("X search failed: %s", exc)
            return []
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("X returned unparseable response: %s", exc)
            return []

        posts = payload.get("data", [])
        # Record actual reads returned, not the requested limit -- cost is per post
        # actually returned, so a quiet query that matches nothing costs nothing.
        self._spend_tracker.record_reads(len(posts))
        if not posts:
            return []

        users_by_id = {u["id"]: u.get("username", "unknown") for u in payload.get("includes", {}).get("users", [])}

        items: list[NewsItem] = []
        for post in posts:
            author_id = post.get("author_id")
            username = users_by_id.get(author_id, "unknown")
            post_id = post.get("id", "")
            items.append(
                NewsItem(
                    source_type="x",
                    source_name=username,
                    item_id=f"x:{post_id}",
                    title=post.get("text", ""),
                    url=f"https://x.com/{username}/status/{post_id}" if post_id else None,
                    published_ms=_parse_created_at_ms(post.get("created_at")),
                )
            )
        return items


def _parse_created_at_ms(created_at: str | None) -> int:
    if not created_at:
        return int(time.time() * 1000)
    try:
        # X API v2 timestamps are ISO 8601 UTC, e.g. "2026-08-18T12:34:56.000Z".
        parsed = time.strptime(created_at.split(".")[0], "%Y-%m-%dT%H:%M:%S")
        return int(calendar.timegm(parsed) * 1000)
    except ValueError:
        return int(time.time() * 1000)
