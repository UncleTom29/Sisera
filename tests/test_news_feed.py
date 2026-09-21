from __future__ import annotations

import responses

from sisera.data.news_feed import NewsFeedClient

_SAMPLE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Test Feed</title>
  <item>
    <title>Founder of ExampleCoin announces resignation</title>
    <link>https://example.test/news/founder-resigns</link>
    <pubDate>Mon, 17 Aug 2026 12:00:00 +0000</pubDate>
  </item>
  <item>
    <title>Market update: majors trade sideways</title>
    <link>https://example.test/news/market-update</link>
    <pubDate>Mon, 17 Aug 2026 10:00:00 +0000</pubDate>
  </item>
</channel>
</rss>
"""


@responses.activate
def test_fetch_latest_parses_items_from_single_feed():
    responses.add(responses.GET, "https://example.test/rss", body=_SAMPLE_RSS, status=200)

    client = NewsFeedClient(feeds={"testfeed": "https://example.test/rss"})
    items = client.fetch_latest()

    assert len(items) == 2
    assert items[0].source_type == "rss"
    assert items[0].source_name == "testfeed"
    assert items[0].title == "Founder of ExampleCoin announces resignation"
    assert items[0].url == "https://example.test/news/founder-resigns"
    assert items[0].item_id == "https://example.test/news/founder-resigns"
    assert items[0].published_ms > 0


@responses.activate
def test_fetch_latest_continues_past_one_failing_feed():
    responses.add(responses.GET, "https://good.test/rss", body=_SAMPLE_RSS, status=200)
    responses.add(responses.GET, "https://bad.test/rss", status=500)

    client = NewsFeedClient(feeds={"good": "https://good.test/rss", "bad": "https://bad.test/rss"})
    items = client.fetch_latest()

    assert len(items) == 2
    assert all(it.source_name == "good" for it in items)


@responses.activate
def test_fetch_latest_handles_empty_feed():
    empty_rss = '<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>'
    responses.add(responses.GET, "https://empty.test/rss", body=empty_rss, status=200)

    client = NewsFeedClient(feeds={"empty": "https://empty.test/rss"})
    assert client.fetch_latest() == []
