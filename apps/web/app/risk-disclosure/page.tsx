import type { Metadata } from "next";
import { ContactLine, ProsePage } from "../../components/prose-page";

export const metadata: Metadata = {
  title: "Risk disclosure",
  description:
    "The main risks of trading tokenized stocks, pre-IPO tokens, crypto, perpetuals, and prediction markets through Sisera.",
  alternates: { canonical: "/risk-disclosure" },
};

export default function RiskDisclosurePage() {
  return (
    <ProsePage
      eyebrow="Legal"
      title="Risk disclosure"
      intro="Trading the assets Sisera covers can lose you money, sometimes quickly and sometimes all of it. Read this before you place an order."
      path="/risk-disclosure"
      updated="September 2026"
    >
      <h2>No advice</h2>
      <p>
        Sisera provides market data and research tools. Nothing in the terminal, including agent
        output, prices, premiums, scores, or news summaries, is investment, legal, or tax advice or
        a recommendation to buy or sell anything.
      </p>

      <h2>Tokenized stocks</h2>
      <ul>
        <li>
          A stock token is not the share itself. Depending on the issuer, it may not carry voting
          rights, dividends, or a claim on the company.
        </li>
        <li>
          Tokens trade when the underlying exchange is closed, so their price can move away from the
          last share price. Premiums and discounts can widen or persist.
        </li>
        <li>
          You depend on the issuer, its custodian, and the smart contracts involved. Any of them can
          fail, pause trading, or restrict who may hold the token.
        </li>
      </ul>

      <h2>Pre-IPO and private-company tokens</h2>
      <ul>
        <li>
          Issuer marks and implied valuations are estimates, may be infrequent, and may differ from
          what the company would fetch in a real transaction.
        </li>
        <li>These tokens can be thinly traded. You may not be able to sell when you want to.</li>
        <li>The rights attached to a token vary by issuer. Read them before trading.</li>
      </ul>

      <h2>Crypto, perpetuals, and prediction markets</h2>
      <ul>
        <li>Crypto assets are volatile and can fall sharply in minutes.</li>
        <li>
          Perpetual futures use leverage. Losses can exceed your initial margin, and positions can
          be liquidated automatically.
        </li>
        <li>Prediction market positions can expire worthless.</li>
      </ul>

      <h2>Data and software</h2>
      <ul>
        <li>
          Prices, reference data, and news come from third parties and can be delayed, wrong, or
          missing.
        </li>
        <li>
          Networks, wallets, bridges, and venues can be congested, fail, or be attacked.
          Transactions on public blockchains are generally irreversible.
        </li>
        <li>
          Paper trading results do not include all real-world costs, slippage, or liquidity limits
          and do not predict live results.
        </li>
        <li>
          Research agents can be wrong. Their limits reduce but do not remove the risk of loss.
        </li>
      </ul>

      <h2>Your responsibility</h2>
      <p>
        Only trade with money you can afford to lose. Check that the assets and venues you use are
        legal where you live. You are responsible for your own decisions, orders, keys, and taxes.
      </p>
      <ContactLine />
    </ProsePage>
  );
}
