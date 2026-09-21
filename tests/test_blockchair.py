from __future__ import annotations

import responses

from sisera.data.blockchair import BlockchairClient

BASE_URL = "https://api.blockchair.com"


@responses.activate
def test_get_ethereum_tx_count_24h_parses_response():
    responses.add(
        responses.GET,
        f"{BASE_URL}/ethereum/stats",
        json={"data": {"transactions_24h": 2715119, "addresses": 0}},
        status=200,
    )

    client = BlockchairClient(base_url=BASE_URL)
    count = client.get_ethereum_tx_count_24h()

    assert count == 2715119
    assert isinstance(count, int)
