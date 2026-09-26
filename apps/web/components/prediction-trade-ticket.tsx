"use client";

import { useSolanaStandardWallets } from "@privy-io/react-auth/solana";
import { useState } from "react";
import { useLiveCapability } from "./use-live-capability";

type Prepared = {
  orderId: string;
  transaction: string;
  wallet: string;
  orderPubkey: string;
  priceUsd: number;
  expiresAt: string;
};

export function PredictionTradeTicket({ marketId }: { marketId: string }) {
  const liveAvailable = useLiveCapability("predictions");
  const { wallets } = useSolanaStandardWallets();
  const wallet = wallets.find((item) => item.accounts.length > 0);
  const account = wallet?.accounts[0];
  const [outcome, setOutcome] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setWorking(true);
    setMessage(null);
    try {
      if (!liveAvailable) throw new Error("Prediction live trading is paused.");
      if (!wallet || !account) throw new Error("Connect a Solana wallet to your Sisera account.");
      if (prepared) {
        if (prepared.wallet !== account.address || Date.now() > Date.parse(prepared.expiresAt)) {
          setPrepared(null);
          throw new Error("The order expired or the wallet changed. Prepare it again.");
        }
        const signer = wallet.features["solana:signTransaction"];
        if (!signer) throw new Error("This wallet cannot sign Solana transactions.");
        const bytes = Uint8Array.from(atob(prepared.transaction), (character) =>
          character.charCodeAt(0),
        );
        const [signed] = await signer.signTransaction({
          account,
          transaction: bytes,
          chain: "solana:mainnet",
        });
        if (!signed) throw new Error("The wallet did not sign this order.");
        const signedTransaction = btoa(
          Array.from(signed.signedTransaction, (byte) => String.fromCharCode(byte)).join(""),
        );
        const response = await fetch("/api/prediction-trade", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "execute", orderId: prepared.orderId, signedTransaction }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? "Prediction order submission failed.");
        setMessage(
          payload.data.status === "submitted"
            ? `Order submitted on Solana. Match status may take time. Transaction: ${payload.data.signature}`
            : `Order status ${payload.data.status}. Check Activity before trying again.`,
        );
        setPrepared(null);
        setAmount("");
        return;
      }
      if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount))
        throw new Error("Enter a valid USDC amount.");
      const [whole, fraction = ""] = amount.split(".");
      const raw = BigInt(whole ?? "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
      if (raw < 5_000_000n || raw > 500_000_000n) throw new Error("Enter between $5 and $500.");
      const response = await fetch("/api/prediction-trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          wallet: account.address,
          marketId,
          outcome,
          depositAmount: raw.toString(),
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.message ?? "Prediction order could not be prepared.");
      setPrepared(payload.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prediction order failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-3 text-xs">
      <p className="font-semibold text-slate-200">Trade with Jupiter · live</p>
      {!liveAvailable && (
        <p className="mt-2 text-amber-300">
          Live trading is paused while account risk and order reconciliation are completed.
        </p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-1">
        {(["yes", "no"] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => {
              setOutcome(side);
              setPrepared(null);
            }}
            className={`rounded border px-2 py-2 uppercase ${outcome === side ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300" : "border-line text-slate-500"}`}
          >
            {side}
          </button>
        ))}
      </div>
      <label className="mt-2 block text-slate-400">
        Deposit · USDC
        <input
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setPrepared(null);
          }}
          inputMode="decimal"
          placeholder="5.00"
          className="mt-1 h-9 w-full rounded border border-line bg-[#0f1a22] px-2 font-mono text-white"
        />
      </label>
      {prepared && (
        <p className="mt-2 text-amber-200">
          Review {outcome.toUpperCase()} at about ${prepared.priceUsd.toFixed(3)} per contract.
          Wallet signature opens an order; a fill is not guaranteed.
        </p>
      )}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={working || !account || !amount || !liveAvailable}
        className="mt-2 h-9 w-full rounded border border-cyan-400/40 bg-cyan-400/10 text-cyan-200 disabled:opacity-40"
      >
        {working ? "Working…" : prepared ? "Sign and submit" : "Review live order"}
      </button>
      {!account && <p className="mt-2 text-slate-500">Connect a Solana wallet to trade.</p>}
      {message && <output className="mt-2 block text-slate-300">{message}</output>}
    </div>
  );
}
