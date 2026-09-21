"""Manual verification tool: builds the universe and prints it.

Usage: uv run python scripts/show_universe.py [--refresh]
"""

from __future__ import annotations

import argparse
import logging

from sisera.universe import UniverseManager


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="bypass cache")
    parser.add_argument("--size", type=int, default=200)
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )

    universe = UniverseManager(universe_size=args.size).get_universe(force_refresh=args.refresh)

    print(f"Universe: {len(universe)} pairs\n")
    for pair in universe:
        print(f"  #{pair.market_cap_rank:>4}  {pair.symbol:<12} mcap=${pair.market_cap:,.0f}")


if __name__ == "__main__":
    main()
