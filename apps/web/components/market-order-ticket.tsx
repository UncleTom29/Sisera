"use client";

import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { useConnectWallet, useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { createWalletClient, custom } from "viem";
import { arbitrum } from "viem/chains";

export function MarketOrderTicket({
  venue,
  bid,
  ask,
  symbol,
  quoteAsset,
}: {
  venue: "binance" | "hyperliquid";
  bid: string | undefined;
  ask: string | undefined;
  symbol: string;
  quoteAsset: string;
}) {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const { createWallet } = useCreateWallet();
  const wallet = wallets[0];
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [accountValue, setAccountValue] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const price = side === "buy" ? ask : bid;
  const notional = useMemo(() => Number(quantity) * Number(price), [quantity, price]);

  async function submitPaper() {
    const response = await fetch("/api/market-trade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "paper", venue, symbol, side, quantity }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? "Paper order rejected.");
    setMessage(
      `Paper ${side} filled: ${quantity} ${symbol} at ${payload.data.fillPrice} ${quoteAsset}.`,
    );
    setQuantity("");
  }

  async function submitBinance() {
    if (!apiKey || !apiSecret) throw new Error("Enter a Binance trading API key and secret.");
    const response = await fetch("/api/market-trade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "live",
        venue: "binance",
        symbol,
        side,
        quantity,
        apiKey,
        apiSecret,
      }),
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(
        payload.message ?? "Binance order could not be confirmed. Check Binance before retrying.",
      );
    setMessage(
      `Binance ${payload.data.status.toLowerCase()}: ${payload.data.executedQty} ${symbol} · order ${payload.data.orderId}.`,
    );
    setQuantity("");
  }

  async function submitHyperliquid() {
    if (!wallet) throw new Error("Connect an EVM wallet first.");
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive quantity.");
    const info = new InfoClient({ transport: new HttpTransport() });
    const [metadata, book, account] = await Promise.all([
      info.metaAndAssetCtxs(),
      info.l2Book({ coin: symbol.replace(/USDT$/, "") }),
      info.clearinghouseState({ user: wallet.address as `0x${string}` }),
    ]);
    const coin = symbol.replace(/USDT$/, "");
    const asset = metadata[0].universe.findIndex((item) => item.name === coin);
    if (asset < 0) throw new Error("This perpetual is not listed on Hyperliquid.");
    const decimals = metadata[0].universe[asset]?.szDecimals ?? 0;
    if ((quantity.split(".")[1]?.length ?? 0) > decimals)
      throw new Error(`Hyperliquid permits at most ${decimals} size decimals for ${coin}.`);
    if (!book) throw new Error("Fresh order book unavailable.");
    const top = side === "buy" ? book.levels[1][0] : book.levels[0][0];
    const best = Number(top?.px);
    if (!Number.isFinite(best) || best <= 0) throw new Error("Fresh order book unavailable.");
    const accountUsd = Number(account.marginSummary.accountValue);
    const buyingPower = Number(account.withdrawable);
    setAccountValue(account.marginSummary.accountValue);
    if (
      !Number.isFinite(accountUsd) ||
      accountUsd <= 0 ||
      !Number.isFinite(buyingPower) ||
      buyingPower <= 0
    )
      throw new Error("Fund the HyperCore trading balance before placing a live perp order.");
    const orderNotional = amount * best;
    if (orderNotional < 10 || orderNotional > Math.min(2500, accountUsd * 0.2, buyingPower))
      throw new Error(
        "Order must be at least $10 and within 20% of account value, $2,500, and available margin.",
      );
    const maxPrice = Number((best * (side === "buy" ? 1.005 : 0.995)).toPrecision(5));
    const provider = await wallet.getEthereumProvider();
    const signer = createWalletClient({
      account: wallet.address as `0x${string}`,
      chain: arbitrum,
      transport: custom(provider),
    });
    const exchange = new ExchangeClient({
      transport: new HttpTransport(),
      wallet: signer,
      signatureChainId: "0xa4b1",
    });
    const result = await exchange.order({
      orders: [
        {
          a: asset,
          b: side === "buy",
          p: String(maxPrice),
          s: quantity,
          r: false,
          t: { limit: { tif: "Ioc" } },
        },
      ],
      grouping: "na",
    });
    const status = result.response.data.statuses[0];
    if (!status || typeof status === "string")
      throw new Error("Hyperliquid has not confirmed a fill. Check Activity before retrying.");
    if ("error" in status) throw new Error(String(status.error));
    setMessage(
      "filled" in status
        ? `Live ${side} filled: ${status.filled.totalSz} ${coin} at ${status.filled.avgPx} USDC. Order ${status.filled.oid}.`
        : "Live order accepted by Hyperliquid. Verify its status in Activity before retrying.",
    );
    setQuantity("");
  }

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "paper") await submitPaper();
      else if (venue === "hyperliquid") await submitHyperliquid();
      else await submitBinance();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Order failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <span className="text-sm font-semibold text-slate-100">Order ticket</span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-cyan-300">
          <ShieldCheck size={13} /> {mode}
        </span>
      </div>
      <div className="flex-1 space-y-4 p-4">
        <div className="grid grid-cols-2 gap-1 rounded border border-line p-1">
          {(["paper", "live"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setMode(option);
                setMessage(null);
              }}
              className={`rounded py-2 text-xs font-semibold ${mode === option ? "bg-cyan-400/15 text-cyan-300" : "text-slate-500"}`}
            >
              {option === "paper" ? "Paper" : "Live"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 rounded border border-line p-1">
          {(["buy", "sell"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSide(option)}
              className={`rounded py-2 text-xs font-semibold ${side === option ? (option === "buy" ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300") : "text-slate-500"}`}
            >
              {option === "buy"
                ? venue === "hyperliquid"
                  ? "Buy / Long"
                  : "Buy"
                : venue === "hyperliquid"
                  ? "Sell / Short"
                  : "Sell"}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="data-label">Quantity · {symbol.replace(/USDT$/, "")}</span>
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            inputMode="decimal"
            placeholder="0.00000"
            className="mt-2 h-11 w-full rounded border border-line bg-[#0f1a22] px-3 text-right font-mono text-sm text-white"
          />
        </label>
        <div className="divide-y divide-line border-y border-line text-xs">
          <div className="flex justify-between py-3">
            <span className="text-slate-400">Indicative {side === "buy" ? "ask" : "bid"}</span>
            <span>
              {price ?? "—"} {quoteAsset}
            </span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-slate-400">Estimated notional</span>
            <span>
              {Number.isFinite(notional) && notional > 0 ? `$${notional.toFixed(2)}` : "—"}
            </span>
          </div>
        </div>
        {mode === "live" && venue === "hyperliquid" && (
          <div className="space-y-2 border border-cyan-400/20 bg-cyan-400/[0.04] p-3 text-xs text-slate-300">
            <p>
              EVM wallet:{" "}
              <span className="font-mono text-cyan-300">{wallet?.address ?? "Not connected"}</span>
            </p>
            {accountValue && <p>HyperCore account value: ${accountValue}</p>}
            {!wallet && (
              <div className="flex gap-3">
                <button type="button" onClick={() => connectWallet()} className="text-cyan-300">
                  Connect EVM wallet
                </button>
                {authenticated && (
                  <button
                    type="button"
                    onClick={() => void createWallet()}
                    className="text-cyan-300"
                  >
                    Create Privy wallet
                  </button>
                )}
              </div>
            )}
            <p>
              USDC must be deposited into the HyperCore trading balance. A HyperEVM token balance
              alone cannot margin a perpetual position.
            </p>
            <a
              href="https://app.hyperliquid.xyz/trade"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-300"
            >
              Open Hyperliquid deposit ↗
            </a>
          </div>
        )}
        {mode === "live" && venue === "binance" && (
          <div className="space-y-3 border border-cyan-400/20 bg-cyan-400/[0.04] p-3 text-xs text-slate-300">
            <p>
              Binance HMAC trading credentials. They stay in this page's memory and are sent only
              for the order request.
            </p>
            <label className="block">
              API key
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                type="password"
                autoComplete="off"
                className="mt-1 h-9 w-full rounded border border-line bg-[#0f1a22] px-2 text-white"
              />
            </label>
            <label className="block">
              API secret
              <input
                value={apiSecret}
                onChange={(event) => setApiSecret(event.target.value)}
                type="password"
                autoComplete="off"
                className="mt-1 h-9 w-full rounded border border-line bg-[#0f1a22] px-2 text-white"
              />
            </label>
            <p>
              Use a trading-only key with withdrawals disabled. Orders are capped at $2,500 and 20%
              of free balance.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={
            busy ||
            !quantity ||
            (mode === "live" &&
              (venue === "binance" ? !authenticated || !apiKey || !apiSecret : !wallet))
          }
          className="h-11 w-full rounded border border-cyan-400/40 bg-cyan-400/10 text-xs font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:border-line disabled:bg-slate-800 disabled:text-slate-500"
        >
          {busy
            ? "Submitting…"
            : mode === "paper"
              ? "Place paper market order"
              : "Place live market order"}
        </button>
        {message && <output className="block text-xs leading-5 text-slate-300">{message}</output>}
        <p className="text-[11px] leading-5 text-slate-500">
          Paper fills use a fresh venue bid or ask and a persistent simulated balance. Live
          Hyperliquid orders use an immediate-or-cancel limit with a 0.5% price bound and require
          wallet signing. Binance orders use its signed Spot API.
        </p>
      </div>
    </div>
  );
}
