import { faqs, site } from "../../lib/site";

export const dynamic = "force-static";

export function GET() {
  const body = `# ${site.name}

> ${site.description}

Sisera is a web terminal at ${site.url}. It is a research and trading workspace, not a broker or investment adviser. Market data comes from ${site.dataSources.join(", ")}.

## What Sisera does

- Tokenized stocks: prices of US stock tokens on Solana beside the underlying share's Pyth reference price, with the premium or discount between them, liquidity, 24h volume, and company news. Sisera flags when the share market is closed, because token and share prices drift apart outside regular hours.
- Private markets: pre-IPO company tokens compared with the issuer's published mark and implied valuation.
- Crypto and perpetuals: spot markets, Hyperliquid perpetuals with order book depth, funding, and open interest.
- Prediction markets: browse markets with paper and live trading where available.
- Intelligence: why a price moved, combining the move with news, reference prices, and market context.
- Portfolio and risk: Solana, HyperEVM, and Hyperliquid holdings in one view, with exposure and shock tests.
- Agents: rule-bound research agents drafted as hashed policies with capital caps, drawdown limits, stop-loss and take-profit rules, and a kill switch. Agents propose; an operator decides. They move through a seven-stage lifecycle (draft, backtest, stress test, paper, shadow, limited live, live).

## Key pages

- [Home](${site.url}/): overview of the terminal
- [About](${site.url}/about): what Sisera is and how it works
- [Risk disclosure](${site.url}/risk-disclosure): risks of tokenized and private-market assets
- [Brand](${site.url}/brand): logo, colours, and typography
- [Terms](${site.url}/terms) and [Privacy](${site.url}/privacy)

## FAQ

${faqs.map((faq) => `### ${faq.question}\n\n${faq.answer}`).join("\n\n")}
`;
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
