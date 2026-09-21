"""One-time interactive Telegram login for the news monitor (sisera/data/telegram_news.py).

This creates the local session file that TelegramNewsMonitor reuses on every subsequent
run -- Telegram requires a login code sent to your phone/Telegram app, which only a human
can receive and enter, so this step can't be automated or run unattended.

Prerequisites:
  1. Get a free API ID + API hash from https://my.telegram.org (login with the phone
     number you want this to monitor from -- can be a dedicated number, doesn't have to be
     your main account).
  2. Set SISERA_TELEGRAM_NEWS_API_ID and SISERA_TELEGRAM_NEWS_API_HASH in .env.
  3. Set SISERA_TELEGRAM_NEWS_CHANNELS to the public channel usernames you want monitored
     (comma-separated, e.g. "some_channel,another_channel"). This script will try to join
     each one as part of login verification.

Usage: uv run python scripts/telegram_login.py
"""

from __future__ import annotations

import asyncio
import sys

sys.path.insert(0, ".")

from sisera.config import config  # noqa: E402


async def main() -> None:
    if not config.telegram_news_api_id or not config.telegram_news_api_hash:
        print(
            "SISERA_TELEGRAM_NEWS_API_ID / SISERA_TELEGRAM_NEWS_API_HASH are not set in "
            ".env -- get them from https://my.telegram.org first."
        )
        return

    from telethon import TelegramClient
    from telethon.errors import ChannelPrivateError, UsernameNotOccupiedError

    client = TelegramClient(
        config.telegram_news_session_path,
        int(config.telegram_news_api_id),
        config.telegram_news_api_hash,
    )

    print("Connecting to Telegram -- you'll be prompted for your phone number and the "
          "login code Telegram sends you (and a 2FA password if you have one set).")
    await client.start()
    print(f"Logged in. Session saved to {config.telegram_news_session_path}.session")

    if not config.telegram_news_channels:
        print(
            "\nNo channels configured in SISERA_TELEGRAM_NEWS_CHANNELS yet -- add "
            "comma-separated public channel usernames to .env and re-run this script."
        )
        await client.disconnect()
        return

    print(f"\nVerifying access to {len(config.telegram_news_channels)} configured channel(s):")
    for channel in config.telegram_news_channels:
        try:
            entity = await client.get_entity(channel)
            print(f"  OK   {channel}  ({getattr(entity, 'title', channel)})")
        except (UsernameNotOccupiedError, ChannelPrivateError) as exc:
            print(f"  FAIL {channel}  -- {exc}")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAIL {channel}  -- {exc}")

    await client.disconnect()
    print("\nDone. The news monitor will reuse this session automatically -- no need to "
          "run this script again unless the session is revoked or you change accounts.")


if __name__ == "__main__":
    asyncio.run(main())
