import type { Metadata } from "next";
import { ContactLine, ProsePage } from "../../components/prose-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What information Sisera collects, why, and the choices you have.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <ProsePage
      eyebrow="Legal"
      title="Privacy"
      intro="We collect what we need to run your account and the terminal, and nothing we would be uncomfortable explaining."
      path="/privacy"
      updated="September 2026"
    >
      <h2>What we collect</h2>
      <ul>
        <li>
          Sign-in details from our authentication provider, Privy, such as your email address or the
          social or wallet account you sign in with.
        </li>
        <li>
          Public wallet addresses you connect or create, and the balances and transactions visible
          on public blockchains for those addresses.
        </li>
        <li>
          Account records you create in Sisera: preferences, agent drafts, paper trading activity,
          orders you submit through the terminal, bridge transfers, and alert acknowledgements.
        </li>
        <li>
          Exchange API keys, only if you choose to connect them for trading, used to place orders
          you request.
        </li>
        <li>
          Technical data such as IP address, browser, and request logs, used to secure and operate
          the service.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To sign you in, show your portfolio, carry out actions you request, keep an audit trail of
        account activity, protect the service from abuse, and fix problems. We do not sell your
        personal information.
      </p>

      <h2>Who we share it with</h2>
      <p>
        Service providers that run parts of Sisera on our behalf, such as authentication, hosting,
        network security, and blockchain infrastructure providers; the venues you send orders to;
        and authorities when the law requires it.
      </p>

      <h2>Your choices</h2>
      <p>
        You can disconnect wallets and API keys, sign out, and ask us to access, correct, or delete
        your account information, subject to records we must keep by law.
      </p>
      <ContactLine />
    </ProsePage>
  );
}
