import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, ProsePage } from "../../components/prose-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms that apply when you use the Sisera website and terminal.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <ProsePage
      eyebrow="Legal"
      title="Terms of use"
      intro="These terms apply when you use sisera.xyz and the Sisera terminal. By using Sisera you agree to them."
      path="/terms"
      updated="September 2026"
    >
      <h2>The service</h2>
      <p>
        Sisera provides market data, research tools, paper trading, and interfaces for placing
        orders with third-party venues from wallets or accounts you control. Sisera is not a broker,
        exchange, custodian, or investment adviser, and does not hold your assets.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be old enough to form a binding contract where you live, and you may use Sisera
        only where doing so, and trading the assets you choose, is legal for you. Some assets and
        venues are not available in every country.
      </p>

      <h2>Your account and keys</h2>
      <p>
        You sign in through our authentication provider. You are responsible for your credentials,
        wallets, private keys, and any exchange API keys you connect, and for all activity under
        your account.
      </p>

      <h2>Orders and third parties</h2>
      <p>
        Orders you submit are executed by the venue or protocol you select, under its own terms.
        Sisera does not guarantee execution, price, or settlement, and is not responsible for the
        acts or failures of third-party venues, issuers, networks, bridges, or data providers.
      </p>

      <h2>Information only</h2>
      <p>
        Content in Sisera is provided for information. It is not advice and may be inaccurate,
        delayed, or incomplete. Read the <Link href="/risk-disclosure">risk disclosure</Link>.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not break the law, manipulate markets, or use Sisera to harm others.</li>
        <li>Do not scrape, overload, reverse engineer, or interfere with the service.</li>
        <li>Do not access accounts or data that are not yours.</li>
      </ul>

      <h2>Availability and changes</h2>
      <p>
        We may change, suspend, or discontinue any part of Sisera, and may update these terms. If
        the change is material we will say so on this page. Continuing to use Sisera after a change
        means you accept it.
      </p>

      <h2>Liability</h2>
      <p>
        Sisera is provided as is and as available. To the extent the law allows, Sisera is not
        liable for trading losses, lost profits, or indirect damages arising from your use of the
        service.
      </p>
      <ContactLine />
    </ProsePage>
  );
}
