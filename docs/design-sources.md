# Design and data sources

Sisera uses an original mark and editorial artwork. The mark is implemented as an SVG component;
the landing artwork is stored in `apps/web/public/brand/sisera-signal.png`. IBM Plex Sans and IBM
Plex Mono are hosted locally; their Open Font License is in `apps/web/public/fonts`.

The application adapts patterns from human-built, open-source work:

- [Origin UI tabs on 21st.dev](https://21st.dev/originui/tabs): line tab navigation adapted for
  the terminal detail panel, with keyboard navigation and accessible tab states. Origin UI's
  published source is MIT licensed.
- [Serafim's Badge Delta on 21st.dev](https://21st.dev/community/components/serafim/badge-delta):
  directional change badge adapted for live prices in the terminal and market screener.
- [Kibo UI data table on 21st.dev](https://21st.dev/community/components/haydenbleasel/data-table/default):
  sortable table structure adapted around the existing TanStack Table integration.
- [Lucide](https://lucide.dev/), [Radix](https://www.radix-ui.com/primitives),
  [cmdk](https://cmdk.paco.me/), and [Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
  provide the icon, dialog, command, and chart foundations.

The visual direction uses the density of professional market terminals and the legibility of
research products as references. Sisera's copper and sea-glass palette, mark, typography, spacing,
and artwork are its own.

Market data is read from [Binance's public market-data API](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md).
The API supports public quotes, candles, and book depth without an account. The prediction-market
adapter uses [Polymarket Gamma](https://docs.polymarket.com/developers/gamma-markets-api/overview).
Both adapters label their source and fail when the provider is unavailable.
