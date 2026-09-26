"use client";

import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { getPrivySolanaAddress } from "../lib/privy-identity";

const chains = [
  { id: 8453, label: "Base" },
  { id: 42161, label: "Arbitrum" },
  { id: 1, label: "Ethereum" },
];
type Quote = {
  requestId: string | null;
  steps: Array<{
    kind: string;
    items: Array<{ from: string; to: string; data: string; value: string; chainId: number }>;
  }>;
  fees: Record<string, { amountUsd?: string }>;
  outputAmountUsdc: string;
  timeEstimateSeconds: number | null;
  originChainId: number;
  destinationChainId: number;
  recipient: string;
};

export function BridgeUsdc() {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const wallet = wallets[0];
  const solana = getPrivySolanaAddress(user);
  const [origin, setOrigin] = useState(8453);
  const [destination, setDestination] = useState<999 | 792703809>(999);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotedAt, setQuotedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const recipient = destination === 999 ? wallet?.address : solana;

  useEffect(() => {
    const saved = window.localStorage.getItem("sisera:last-bridge-request");
    if (saved && /^0x[a-fA-F0-9]{64}$/.test(saved)) setRequestId(saved);
  }, []);

  async function getQuote() {
    if (!wallet) throw new Error("Connect an EVM source wallet first.");
    if (!recipient)
      throw new Error(
        destination === 999
          ? "An EVM destination wallet is required."
          : "Sign in to create your Solana wallet first.",
      );
    const response = await fetch("/api/bridge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        originChainId: origin,
        destinationChainId: destination,
        user: wallet.address,
        recipient,
        amountUsdc: amount,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? "No bridge route is available.");
    setQuote(payload.data);
    setQuotedAt(Date.now());
    setMessage("Review the expected USDC output and fees, then confirm in your wallet.");
  }

  async function submit() {
    if (!wallet || !quote || !recipient) throw new Error("Request a quote first.");
    if (Date.now() - quotedAt > 60_000) throw new Error("Quote expired. Request a fresh quote.");
    if (
      quote.originChainId !== origin ||
      quote.destinationChainId !== destination ||
      quote.recipient !== recipient
    )
      throw new Error("Bridge details changed. Request a fresh quote.");
    await wallet.switchChain(origin);
    const provider = await wallet.getEthereumProvider();
    for (const step of quote.steps) {
      if (step.kind !== "transaction")
        throw new Error("Unsupported wallet step. Request a new quote.");
      for (const transaction of step.items) {
        if (
          transaction.chainId !== origin ||
          transaction.from.toLowerCase() !== wallet.address.toLowerCase()
        )
          throw new Error("Quote wallet or chain does not match your connected wallet.");
        const hash = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: transaction.from,
              to: transaction.to,
              data: transaction.data,
              value: `0x${BigInt(transaction.value).toString(16)}`,
            },
          ],
        })) as string;
        if (quote.requestId) {
          setRequestId(quote.requestId);
          window.localStorage.setItem("sisera:last-bridge-request", quote.requestId);
        }
        setQuote(null);
        setMessage(`Transaction submitted: ${hash.slice(0, 12)}… Waiting for confirmation.`);
        let confirmed = false;
        for (let attempt = 0; attempt < 45; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const receipt = (await provider.request({
            method: "eth_getTransactionReceipt",
            params: [hash],
          })) as { status?: string } | null;
          if (!receipt) continue;
          if (receipt.status !== "0x1") throw new Error("The source chain transaction failed.");
          confirmed = true;
          break;
        }
        if (!confirmed)
          throw new Error(
            `Source transaction ${hash} is pending. Check Activity or your wallet before trying again.`,
          );
      }
    }
    setMessage(
      "Source transaction confirmed. Relay is delivering USDC to your destination wallet.",
    );
  }

  async function checkStatus() {
    if (!requestId) return;
    const response = await fetch(`/api/bridge?requestId=${encodeURIComponent(requestId)}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? "Status unavailable.");
    setMessage(
      `Bridge status: ${payload.data.status}${payload.data.txHashes?.length ? ` · destination transaction ${payload.data.txHashes[0]}` : ""}`,
    );
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bridge request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="m-4 border border-line bg-panel p-5 md:m-6">
      <p className="eyebrow">Cross-chain funding</p>
      <h2 className="mt-2 text-base font-semibold text-slate-100">Bridge USDC in Sisera</h2>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
        Move USDC from an EVM wallet on Base, Arbitrum or Ethereum to your HyperEVM or Solana
        wallet. The quote comes from Relay; your wallet signs every source-chain transaction.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-400">
          From{" "}
          <select
            value={origin}
            onChange={(event) => {
              setOrigin(Number(event.target.value));
              setQuote(null);
            }}
            className="mt-1 w-full rounded border border-line bg-[#0f1a22] p-2 text-slate-100"
          >
            {chains.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          To{" "}
          <select
            value={destination}
            onChange={(event) => {
              setDestination(Number(event.target.value) as 999 | 792703809);
              setQuote(null);
            }}
            className="mt-1 w-full rounded border border-line bg-[#0f1a22] p-2 text-slate-100"
          >
            <option value={999}>HyperEVM</option>
            <option value={792703809}>Solana</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Amount in USDC{" "}
          <input
            type="number"
            min="5"
            max="10000"
            step="0.000001"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setQuote(null);
            }}
            className="mt-1 w-full rounded border border-line bg-[#0f1a22] p-2 text-slate-100"
            placeholder="100"
          />
        </label>
      </div>
      <p className="mt-3 break-all font-mono text-[10px] text-slate-500">
        Destination: {recipient ?? "Connect wallet to see address"}
      </p>
      {!wallet && authenticated && (
        <button
          type="button"
          onClick={() => connectWallet()}
          className="mt-4 rounded border border-cyan-400/30 px-3 py-2 text-xs text-cyan-300"
        >
          Connect EVM wallet
        </button>
      )}
      {wallet && (
        <button
          type="button"
          disabled={busy || !amount || !recipient}
          onClick={() => run(getQuote)}
          className="mt-4 rounded border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-300 disabled:opacity-50"
        >
          Get bridge quote
        </button>
      )}
      {quote && (
        <div className="mt-4 rounded border border-line bg-[#0f1a22] p-4 text-xs text-slate-300">
          <p>
            Expected destination amount: <strong>{quote.outputAmountUsdc} USDC</strong>
          </p>
          {quote.timeEstimateSeconds && (
            <p className="mt-1">Estimated time: {Math.ceil(quote.timeEstimateSeconds / 60)} min</p>
          )}
          {Object.entries(quote.fees)
            .filter(([, fee]) => Number(fee?.amountUsd) > 0)
            .map(([name, fee]) => (
              <p key={name} className="mt-1">
                {name}: ${fee.amountUsd}
              </p>
            ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(submit)}
            className="mt-3 rounded border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 font-semibold text-cyan-300 disabled:opacity-50"
          >
            Confirm bridge in wallet
          </button>
        </div>
      )}
      {requestId && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(checkStatus)}
          className="mt-4 rounded border border-line px-3 py-2 text-xs text-slate-300"
        >
          Refresh bridge status
        </button>
      )}
      {message && <output className="mt-3 block text-xs text-amber-200">{message}</output>}
      <p className="mt-3 text-[11px] text-slate-500">
        HyperEVM USDC must be moved to HyperCore before it can fund a Hyperliquid perp account.
      </p>
    </section>
  );
}
