"use client";

import { useSolanaStandardWallets } from "@privy-io/react-auth/solana";
import { ArrowRightLeft, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PortfolioConnect } from "./portfolio-connect";
import { useLiveCapability } from "./use-live-capability";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function toRaw(value: string, decimals: number) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || decimals < 0 || decimals > 18)
    throw new Error("Enter a valid amount.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const raw =
    BigInt(whole ?? "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (raw <= 0n) throw new Error("Enter an amount above zero.");
  return raw.toString();
}

type WalletBalance = { holdings: Array<{ mint: string; rawBalance: string; decimals: number }> };
type TradeResult = {
  status: string;
  signature?: string | null;
  filledQuantity?: string;
  fillPrice?: string;
};
type PreparedTrade = {
  orderId: string;
  transaction: string;
  wallet: string;
  outAmount: string;
  outputDecimals: number;
  expiresAt: string;
};

type TicketProps = { mint: string; symbol: string; price: string | null; halted?: boolean };
type StandardWallets = ReturnType<typeof useSolanaStandardWallets>["wallets"];

export function StockTradeTicket(props: TicketProps) {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID ? (
    <ConnectedStockTradeTicket {...props} />
  ) : (
    <TradeTicketView {...props} wallets={[]} />
  );
}

function ConnectedStockTradeTicket(props: TicketProps) {
  const { wallets } = useSolanaStandardWallets();
  return <TradeTicketView {...props} wallets={wallets} />;
}

function TradeTicketView({
  mint,
  symbol,
  price,
  halted = false,
  wallets,
}: TicketProps & { wallets: StandardWallets }) {
  const wallet = wallets.find((item) => item.accounts.length > 0);
  const account = wallet?.accounts[0];
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [prepared, setPrepared] = useState<PreparedTrade | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const liveAvailable = useLiveCapability("solana");
  const estimate = useMemo(() => {
    const numeric = Number(amount);
    const mark = Number(price);
    if (!Number.isFinite(numeric) || numeric <= 0 || !Number.isFinite(mark) || mark <= 0)
      return null;
    return side === "buy"
      ? `${(numeric / mark).toFixed(6)} ${symbol}`
      : `$${(numeric * mark).toFixed(2)}`;
  }, [amount, price, side, symbol]);

  useEffect(() => {
    if (!account || mode !== "live") return;
    let cancelled = false;
    void fetch(`/api/wallet?address=${encodeURIComponent(account.address)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled) setBalance(payload?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account, mode]);

  async function submit() {
    setWorking(true);
    setMessage(null);
    setResult(null);
    try {
      if (halted) throw new Error("Trading is paused for this asset.");
      if (mode === "live" && !liveAvailable) throw new Error("Solana live trading is paused.");
      if (mode === "live" && prepared) {
        if (Date.now() > Date.parse(prepared.expiresAt))
          throw new Error("This quote expired. Please get a new one.");
        if (prepared.wallet !== account?.address || !wallet || !account)
          throw new Error("The selected wallet changed. Try again.");
        const bytes = Uint8Array.from(atob(prepared.transaction), (character) =>
          character.charCodeAt(0),
        );
        const signer = wallet.features["solana:signTransaction"];
        if (!signer)
          throw new Error("This wallet cannot sign trades. Choose another Solana wallet.");
        const [signed] = await signer.signTransaction({
          account,
          transaction: bytes,
          chain: "solana:mainnet",
        });
        if (!signed) throw new Error("The wallet did not sign this trade.");
        const signedTransaction = btoa(
          Array.from(signed.signedTransaction, (byte) => String.fromCharCode(byte)).join(""),
        );
        const execution = await fetch("/api/trade", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "execute", orderId: prepared.orderId, signedTransaction }),
        });
        const completed = await execution.json();
        if (!execution.ok)
          throw new Error(completed.message ?? "The trade could not be completed.");
        setResult(completed.data);
        setPrepared(null);
        setReview(false);
        setAmount("");
        return;
      }
      let body: Record<string, string> = { action: "paper", mint, side, amount };
      if (mode === "live") {
        if (!wallet || !account) throw new Error("Connect your Solana wallet first.");
        if (!balance) throw new Error("Wallet balances are unavailable. Try again shortly.");
        const inputMint = side === "buy" ? USDC : mint;
        const holding = balance.holdings.find((item) => item.mint === inputMint);
        if (!holding)
          throw new Error(`No ${side === "buy" ? "USDC" : symbol} balance in this wallet.`);
        body = {
          action: "prepare",
          wallet: account.address,
          mint,
          side,
          amount: toRaw(amount, holding.decimals),
        };
      }
      const response = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "This trade could not be completed.");
      if (mode === "paper") {
        setResult(payload.data);
        setReview(false);
        setAmount("");
      } else {
        setPrepared(payload.data);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This trade could not be completed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Trade {symbol}</h2>
        <ArrowRightLeft size={15} className="text-slate-500" />
      </div>
      <fieldset
        aria-label="Trading mode"
        className="mt-5 grid grid-cols-2 rounded border border-line bg-[#0b141c] p-1"
      >
        {(["paper", "live"] as const).map((option) => (
          <button
            key={option}
            type="button"
            disabled={option === "live" && !liveAvailable}
            onClick={() => {
              setMode(option);
              setReview(false);
              setPrepared(null);
              setMessage(null);
              setResult(null);
            }}
            className={`rounded py-2 text-xs font-semibold disabled:cursor-not-allowed ${mode === option ? "bg-[#263b49] text-white" : "text-slate-400 hover:text-white"}`}
          >
            {option === "paper" ? "Paper trade" : "Live trade"}
          </button>
        ))}
      </fieldset>
      {!liveAvailable && (
        <p className="mt-2 text-[11px] text-amber-300">
          Live stock trading is paused while wallet ownership, risk, and reconciliation checks are
          completed.
        </p>
      )}
      {mode === "live" && (
        <div className="mt-5 flex items-center justify-between gap-3 border-b border-line pb-4">
          <span className="text-xs text-slate-400">Solana wallet</span>
          <PortfolioConnect compact />
        </div>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        {(["buy", "sell"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setSide(option);
              setReview(false);
              setPrepared(null);
            }}
            className={`rounded border py-2.5 text-xs font-semibold ${side === option ? (option === "buy" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-rose-400/40 bg-rose-400/10 text-rose-300") : "border-line text-slate-400"}`}
          >
            {option === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>
      <label className="mt-5 block text-xs text-slate-400">
        {side === "buy" ? "Spend (USDC)" : `Sell (${symbol})`}
        <input
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setReview(false);
            setPrepared(null);
          }}
          inputMode="decimal"
          placeholder="0.00"
          className="mt-2 h-12 w-full rounded border border-line bg-[#0b141c] px-3 text-right font-mono text-base text-white outline-none focus:border-cyan-400/50"
        />
      </label>
      <div className="mt-4 flex justify-between border-t border-line pt-4 text-xs">
        <span className="text-slate-400">
          {mode === "paper" ? "Estimated result" : "Price guide"}
        </span>
        <span className="font-mono text-slate-200">{estimate ?? "—"}</span>
      </div>
      {mode === "live" && (
        <p className="mt-3 text-[11px] leading-5 text-slate-500">
          Final amount is shown by your wallet before you sign.
        </p>
      )}
      {!review ? (
        <button
          type="button"
          disabled={!estimate || halted || working}
          onClick={() => {
            setReview(true);
            setMessage(null);
          }}
          className="mt-6 h-11 w-full rounded bg-cyan-300 text-xs font-semibold text-[#0b1b24] hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Review {mode === "paper" ? "paper" : "live"} trade
        </button>
      ) : (
        <div className="mt-6 rounded border border-cyan-400/30 bg-cyan-400/[.06] p-3">
          <p className="text-xs text-slate-200">
            {side === "buy" ? "Buy" : "Sell"} {symbol} · {amount} {side === "buy" ? "USDC" : symbol}
          </p>
          <p className="mt-2 text-[11px] text-slate-400">
            {mode === "paper"
              ? "Simulated trade at the displayed price."
              : prepared
                ? "You can approve this quote in your wallet."
                : "Get the current quote before you sign."}
          </p>
          {prepared && (
            <p className="mt-3 border-t border-line pt-3 text-xs text-white">
              Estimated to receive:{" "}
              {(Number(prepared.outAmount) / 10 ** prepared.outputDecimals).toLocaleString(
                "en-US",
                { maximumFractionDigits: 6 },
              )}{" "}
              {side === "buy" ? symbol : "USDC"}
            </p>
          )}
          <button
            type="button"
            disabled={working}
            onClick={() => void submit()}
            className="mt-4 h-10 w-full rounded bg-cyan-300 text-xs font-semibold text-[#0b1b24] disabled:opacity-50"
          >
            {working
              ? "Processing…"
              : mode === "paper"
                ? "Place paper trade"
                : prepared
                  ? "Approve in wallet"
                  : "Get live quote"}
          </button>
          <button
            type="button"
            onClick={() => {
              setReview(false);
              setPrepared(null);
            }}
            className="mt-2 w-full py-2 text-xs text-slate-400"
          >
            Back
          </button>
        </div>
      )}
      {message && (
        <p role="alert" className="mt-4 text-xs text-rose-300">
          {message}
        </p>
      )}
      {result && (
        <output className="mt-4 rounded border border-emerald-400/20 bg-emerald-400/[.06] p-3 text-xs text-emerald-200">
          {result.status === "paper_filled"
            ? `Paper trade placed at $${Number(result.fillPrice).toFixed(2)}.`
            : result.status === "confirmed"
              ? "Trade confirmed on Solana."
              : result.status === "unknown"
                ? "Trade submitted. Check your wallet activity before trying again."
                : "Trade was not completed."}
          {result.signature && (
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={`https://solscan.io/tx/${result.signature}`}
              className="mt-2 block underline"
            >
              View transaction
            </a>
          )}
        </output>
      )}
      {mode === "live" && !account && (
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <WalletCards size={13} /> Connect a wallet to trade live.
        </p>
      )}
    </section>
  );
}
