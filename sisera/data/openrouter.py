"""OpenRouter LLM client for live fundamental analysis. See SCOPE.md §1, §5.

Unlike every other data client in this codebase, this one has no free-tier fallback and
must not fabricate one: the other clients synthesize plausible *market data* when offline
(a reasonable resilience choice for continuity of a price series), but synthesizing a fake
LLM "opinion" would be actively dishonest -- a caller can't tell a real assessment from a
made-up one, and this indicator's entire value proposition is being a real judgment. On any
failure this returns None (no assessment, no reading for this cycle) rather than a
plausible-looking placeholder.

Also unlike every other client here, this one is never used for historical replay -- see
NOT_BACKTESTABLE_INDICATORS in sisera/backtest/engine.py. Live/paper-forward only.
"""

from __future__ import annotations

import json
import logging
import time

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from sisera.config import config
from sisera.data.models import CoinMarketData, LLMFundamentalAssessment, NewsAssessment, NewsItem

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a cryptocurrency fundamental analyst. You assess a project's \
underlying fundamentals -- technology, tokenomics, competitive position, adoption/usage \
trend, team and governance credibility, and narrative durability -- explicitly EXCLUDING \
recent price action, which a separate technical system already covers. Respond with your \
honest, calibrated assessment even when the evidence is thin or mixed; a confidence near \
0 is a valid and expected answer when you don't have enough to go on, not a failure.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"score": <float -1.0 to 1.0, bearish to bullish fundamental thesis>, \
"confidence": <float 0.0 to 1.0>, "reasoning": <string, one or two sentences>}"""

_NEWS_SYSTEM_PROMPT = """You are a cryptocurrency news triage analyst. You are given ONE \
headline or social-media message and asked whether it's significant enough to act on for \
a specific coin. You are explicitly aware that low-cap crypto is a frequent target for \
market manipulation: fake resignation/hack/delisting/partnership rumors posted (sometimes \
from previously-legitimate but now-compromised accounts) specifically to trigger \
algorithmic sell-offs or pumps. Weigh source reliability heavily -- a single unverified \
post claiming something dramatic should score LOWER confidence than the same claim from an \
established, harder-to-fake source (an official exchange announcement, a major outlet with \
editorial review), even if the content sounds equally dramatic. Urgency should reflect how \
time-sensitive the claim is (a confirmed hack is maximally urgent; a vague rumor is not),
not merely how negative or positive it sounds. It is correct and expected to give both low \
confidence and low urgency to a claim you cannot corroborate, even if it sounds severe. If \
the user message includes a "Context:" section with a source track record and/or \
corroboration count, treat that as real, verified data about this specific source and \
event -- weigh it directly rather than falling back on your own pretrained assumptions \
about the outlet's general reputation.

Classify the event into exactly one category:
- macro_fed, macro_cpi, macro_oil, macro_rates, macro_geopolitical (broad market-wide, not coin-specific)
- crypto_etf, crypto_listing, crypto_unlock, crypto_funding, crypto_upgrade (crypto-sector, not necessarily this one coin)
- security_hack, security_exploit, security_delist, security_depeg, security_insolvency
- other (anything not covered above, including ordinary project news)

And assign a severity tier:
- 5 (S5, market regime event): Fed emergency action, major war escalation, global liquidity shock, major stablecoin failure
- 4 (S4, major crypto event): major exchange insolvency, BTC/ETH ETF decision, major regulatory decision, top-20 protocol exploit
- 3 (S3, significant asset event): listing/delisting, large unlock, protocol upgrade failure, treasury movement, large whale transfer
- 2 (S2, minor): analyst comments, partnership, ordinary project announcements
- 1 (S1, noise): influencer opinions, promotional content, unverified rumors

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"score": <float -1.0 to 1.0, bearish to bullish for the coin>, \
"urgency": <float 0.0 to 1.0, how time-sensitive/actionable, independent of direction>, \
"confidence": <float 0.0 to 1.0, weighted by source reliability and corroboration>, \
"event_category": <string, one of the categories above>, \
"severity": <int 1 to 5, one of the tiers above>, \
"reasoning": <string, one or two sentences>}"""


class OpenRouterError(RuntimeError):
    """Raised when OpenRouter returns an error or an unparseable response after retries."""


class OpenRouterClient:
    """Minimal OpenRouter chat-completions client, scoped to the one call this codebase
    needs: a structured fundamental-analysis judgment for one coin."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        self._api_key = api_key if api_key is not None else config.openrouter_api_key
        self._base_url = base_url or config.openrouter_base_url
        self._model = model or config.openrouter_model
        self._session = requests.Session()

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    @retry(
        reraise=True,
        stop=stop_after_attempt(config.http_max_retries),
        wait=wait_exponential(multiplier=0.2, min=0.2, max=1),
        retry=retry_if_exception_type(requests.RequestException),
    )
    def _chat_completion(self, messages: list[dict[str, str]]) -> str:
        resp = self._session.post(
            f"{self._base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._model,
                "messages": messages,
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
                "max_tokens": 400,
            },
            timeout=config.http_timeout_seconds * 3,  # LLM calls run longer than market-data fetches
        )
        resp.raise_for_status()
        payload = resp.json()
        if "error" in payload:
            raise OpenRouterError(f"OpenRouter returned error: {payload['error']}")
        return payload["choices"][0]["message"]["content"]

    def analyze_fundamentals(
        self,
        symbol: str,
        base_coin: str,
        market_data: CoinMarketData | None = None,
    ) -> LLMFundamentalAssessment | None:
        """Returns a live fundamental read for `base_coin`, or None on any failure
        (missing API key, network error, malformed response) -- never a fabricated
        placeholder. See module docstring for why."""
        if not self.is_configured:
            logger.debug("OpenRouter not configured (no API key) -- skipping %s", symbol)
            return None

        context_lines = [f"Coin: {base_coin} (perpetual contract symbol: {symbol})"]
        if market_data is not None:
            if market_data.market_cap_rank:
                context_lines.append(f"Market cap rank: #{market_data.market_cap_rank}")
            if market_data.market_cap:
                context_lines.append(f"Market cap: ${market_data.market_cap:,.0f}")
            if market_data.circulating_supply and market_data.max_supply:
                pct = market_data.circulating_supply / market_data.max_supply * 100
                context_lines.append(f"Circulating supply: {pct:.1f}% of max supply")
        user_prompt = (
            "Assess the fundamental (not technical/price-based) investment thesis for this "
            "project as of today:\n" + "\n".join(context_lines)
        )

        try:
            raw = self._chat_completion(
                [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ]
            )
            parsed = json.loads(raw)
            score = max(-1.0, min(1.0, float(parsed["score"])))
            confidence = max(0.0, min(1.0, float(parsed["confidence"])))
            reasoning = str(parsed.get("reasoning", ""))[:500]
        except (requests.RequestException, OpenRouterError) as exc:
            logger.warning("OpenRouter call failed for %s: %s", symbol, exc)
            return None
        except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
            logger.warning("OpenRouter returned unparseable response for %s: %s", symbol, exc)
            return None

        return LLMFundamentalAssessment(
            symbol=symbol,
            score=score,
            confidence=confidence,
            reasoning=reasoning,
            model=self._model,
            timestamp_ms=int(time.time() * 1000),
        )

    def assess_news_headline(
        self,
        symbol: str,
        base_coin: str,
        news_item: NewsItem,
        extra_context: str | None = None,
    ) -> NewsAssessment | None:
        """Cheap, targeted read of one specific headline's significance for one coin --
        distinct from analyze_fundamentals in both scope and cost: this is handed a
        headline, not asked to go research the coin, so it's the same cost class as
        analyze_fundamentals (~$0.0002/call), not the ~$0.06/call web-search-augmented
        cost of asking a model to find news itself. Returns None on any failure, same
        no-fabricated-placeholder policy as analyze_fundamentals.

        `extra_context`, when provided, is appended as a "Context:" section -- this is
        where a caller injects real, computed data the model has no other way to know:
        this source's empirical track record (sisera/scoring/event_attribution.py) and/or
        how many other distinct sources have reported matching content recently
        (sisera/scoring/news_relevance.py's CorroborationTracker). The system prompt
        explicitly instructs the model to treat this as verified data, not a suggestion.
        """
        if not self.is_configured:
            logger.debug("OpenRouter not configured (no API key) -- skipping news for %s", symbol)
            return None

        user_prompt = (
            f"Coin: {base_coin} (perpetual contract symbol: {symbol})\n"
            f"Source: {news_item.source_type} / {news_item.source_name}\n"
            f"Headline/message: {news_item.title}"
        )
        if extra_context:
            user_prompt += f"\nContext: {extra_context}"

        try:
            raw = self._chat_completion(
                [
                    {"role": "system", "content": _NEWS_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ]
            )
            parsed = json.loads(raw)
            score = max(-1.0, min(1.0, float(parsed["score"])))
            urgency = max(0.0, min(1.0, float(parsed["urgency"])))
            confidence = max(0.0, min(1.0, float(parsed["confidence"])))
            reasoning = str(parsed.get("reasoning", ""))[:500]
        except (requests.RequestException, OpenRouterError) as exc:
            logger.warning("OpenRouter news assessment failed for %s: %s", symbol, exc)
            return None
        except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
            logger.warning("OpenRouter returned unparseable news response for %s: %s", symbol, exc)
            return None

        # Lenient, unlike score/urgency/confidence above: these are newer fields, and a
        # model omitting or mangling one of them shouldn't invalidate an otherwise-good
        # assessment the same way a missing core score would -- fall back to the safest
        # default (uncategorized / lowest severity) rather than failing the whole call.
        try:
            event_category = str(parsed.get("event_category", "other"))[:50]
        except Exception:  # noqa: BLE001
            event_category = "other"
        try:
            severity = max(1, min(5, int(parsed.get("severity", 1))))
        except (ValueError, TypeError):
            severity = 1

        return NewsAssessment(
            symbol=symbol,
            news_item_id=news_item.item_id,
            score=score,
            urgency=urgency,
            confidence=confidence,
            reasoning=reasoning,
            model=self._model,
            timestamp_ms=int(time.time() * 1000),
            event_category=event_category,
            severity=severity,
        )
