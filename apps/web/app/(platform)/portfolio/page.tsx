import { StatusBadge } from "@sisera/ui";
import { BriefcaseBusiness, Download, Layers3, RefreshCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";
import { PortfolioConnect } from "../../../components/portfolio-connect";
import { getPublicPerpAccount, getSolanaWallet } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function PortfolioPage({
  searchParams,
}: { searchParams: Promise<{ address?: string; solana?: string }> }) {
  const parameters = await searchParams;
  const address = parameters.address?.trim() ?? "";
  const solanaAddress = parameters.solana?.trim() ?? "";
  const validSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solanaAddress);
  const validAddress = /^0x[a-fA-F0-9]{40}$/.test(address);
  const session = await auth();
  const solana = validSolanaAddress
    ? await getSolanaWallet(solanaAddress, {
        accessToken: session?.accessToken,
        localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
      }).catch(() => null)
    : null;
  const observed = validAddress
    ? await getPublicPerpAccount(address, {
        accessToken: session?.accessToken,
        localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
      }).catch(() => null)
    : null;
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Unified Portfolio / Reconciled Truth"
        title="Portfolio"
        description="Unified portfolio across tokenized public equities, PreStocks private markets, Clawpump assets, autonomous agent allocations, and Solana cash."
        actions={
          <div className="flex items-center gap-2">
            <PortfolioConnect />
          </div>
        }
      />
      <section className="m-4 border border-line bg-panel p-5 md:m-6">
        <p className="eyebrow">Solana</p>
        <h2 className="mt-2 text-base font-semibold text-slate-100">Your wallet</h2>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
          Connect your wallet or enter an address to view balances.
        </p>
        <form action="/portfolio" className="mt-4 flex flex-wrap gap-2">
          <input
            name="solana"
            defaultValue={solanaAddress}
            aria-label="Solana public wallet address"
            placeholder="Solana public address"
            className="min-w-64 flex-1 rounded border border-line bg-[#0f1a22] px-3 py-2 font-mono text-xs text-slate-100"
          />
          <button
            type="submit"
            className="rounded border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-300"
          >
            View balances
          </button>
        </form>
        {solanaAddress && !validSolanaAddress && (
          <p className="mt-2 text-xs text-rose-300">Enter a valid base58 Solana address.</p>
        )}
        {validSolanaAddress && !solana && (
          <p className="mt-2 text-xs text-amber-300">
            Wallet balances are temporarily unavailable.
          </p>
        )}
        {solana && (
          <div className="mt-5">
            <p className="font-mono text-[10px] text-slate-500">
              {solana.source} · fetched {new Date(solana.fetchedAt).toLocaleTimeString()} · not
              reconciled
            </p>
            <p className="mt-3 font-mono text-xl text-white">
              {(Number(solana.solLamports) / 1e9).toFixed(4)} SOL
            </p>
            <div className="mt-4 divide-y divide-line border-t border-line">
              {solana.holdings.map((holding) => (
                <div
                  key={holding.mint}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-100">
                      {holding.symbol ?? holding.name ?? "Unknown token"}
                    </p>
                    <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                      {holding.mint}
                    </p>
                  </div>
                  <p className="font-mono text-slate-200">
                    {(Number(holding.rawBalance) / 10 ** holding.decimals).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            {!solana.holdings.length && (
              <p className="mt-4 text-xs text-slate-500">No indexed fungible holdings reported.</p>
            )}
          </div>
        )}
      </section>
      <section className="m-4 border border-line bg-panel p-5 md:m-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Public onchain observation</p>
            <h2 className="mt-1 text-base font-semibold text-slate-100">
              Watch a Hyperliquid perp wallet
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
              Read-only clearinghouse state for an address you supply. This is not custody, account
              verification, or a reconciled Sisera portfolio.
            </p>
          </div>
          {observed && (
            <Link
              href={`/risk?address=${encodeURIComponent(address)}`}
              className="rounded border border-cyan-400/30 px-3 py-2 text-xs text-cyan-300"
            >
              Review observed exposure →
            </Link>
          )}
        </div>
        <form action="/portfolio" className="mt-4 flex flex-wrap gap-2">
          <input
            name="address"
            defaultValue={address}
            aria-label="Hyperliquid wallet address"
            placeholder="0x… public wallet address"
            className="min-w-64 flex-1 rounded border border-line bg-[#0f1a22] px-3 py-2 font-mono text-xs text-slate-100"
          />
          <button
            type="submit"
            className="rounded border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-300"
          >
            Observe wallet
          </button>
        </form>
        {address && !validAddress && (
          <p className="mt-2 text-xs text-rose-300">Enter a 42-character 0x address.</p>
        )}
        {validAddress && !observed && (
          <p className="mt-2 text-xs text-amber-300">
            Hyperliquid account state is unavailable for this address.
          </p>
        )}
        {observed && (
          <div className="mt-5">
            <p className="font-mono text-[10px] text-slate-500">
              {observed.source} · fetched {new Date(observed.fetchedAt).toLocaleTimeString()} ·
              public read-only observation
            </p>
            <div className="mt-3 grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Account value", observed.accountValue],
                ["Notional exposure", observed.notionalExposure],
                ["Margin used", observed.marginUsed],
                ["Withdrawable", observed.withdrawable],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#101b23] p-4">
                  <p className="data-label">{label}</p>
                  <p className="mt-2 font-mono text-lg text-white">
                    ${Number(value).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="font-mono text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-3">Perp</th>
                    <th>Size</th>
                    <th>Entry</th>
                    <th>Notional</th>
                    <th>Unrealized P&L</th>
                    <th>Margin</th>
                    <th>Liquidation</th>
                  </tr>
                </thead>
                <tbody>
                  {observed.positions.map((position) => (
                    <tr
                      key={position.coin}
                      className="border-t border-line font-mono text-slate-300"
                    >
                      <td className="py-3 font-semibold text-white">
                        {position.coin} · {position.marginType} {position.leverage}x
                      </td>
                      <td>{position.size}</td>
                      <td>{position.entryPrice}</td>
                      <td>${Number(position.notional).toLocaleString()}</td>
                      <td
                        className={
                          Number(position.unrealizedPnl) >= 0 ? "text-emerald-300" : "text-rose-300"
                        }
                      >
                        {position.unrealizedPnl}
                      </td>
                      <td>{position.marginUsed}</td>
                      <td>{position.liquidationPrice ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!observed.positions.length && (
                <p className="border-t border-line py-4 text-xs text-slate-500">
                  No open perpetual positions reported.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
      <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2 xl:grid-cols-5">
        {["Net asset value", "Available cash", "Gross exposure", "Net exposure", "Today P&L"].map(
          (label) => (
            <div key={label} className="bg-panel p-5">
              <p className="data-label">{label}</p>
              <p className="data-value mt-4 text-2xl text-slate-600">—</p>
              <p className="mt-2 font-mono text-[8px] uppercase tracking-wider text-slate-700">
                Awaiting reconciliation
              </p>
            </div>
          ),
        )}
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[1.45fr_.55fr]">
        <section className="border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-semibold">Positions</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled
                className="flex items-center gap-1.5 text-[9px] text-slate-700"
              >
                <RefreshCcw size={11} /> Reconcile
              </button>
              <button
                type="button"
                disabled
                className="flex items-center gap-1.5 text-[9px] text-slate-700"
              >
                <Download size={11} /> Export
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[1.4fr_repeat(5,1fr)] border-b border-line bg-[#090e14] px-4 py-2 data-label">
            <span>Instrument</span>
            <span className="text-right">Position</span>
            <span className="text-right">Entry</span>
            <span className="text-right">Mark</span>
            <span className="text-right">Unrealized</span>
            <span className="text-right">Exposure</span>
          </div>
          <EmptyState
            icon={BriefcaseBusiness}
            title="No reconciled positions"
            copy="Connect a portfolio source and complete its first balance and position reconciliation cycle."
            code="PORTFOLIO / EMPTY"
          />
        </section>
        <div className="space-y-4">
          <section className="border border-line bg-panel">
            <div className="border-b border-line px-4 py-3 text-xs font-semibold">Allocation</div>
            <EmptyState
              icon={Layers3}
              title="No allocation data"
              copy="Allocation remains blank until portfolio truth is available."
              code="ALLOCATION / EMPTY"
            />
          </section>
          <section className="border border-emerald-500/15 bg-emerald-500/[0.035] p-4">
            <ShieldCheck size={16} className="text-emerald-300" />
            <h3 className="mt-4 text-xs font-semibold text-slate-200">
              Reconciliation is mandatory
            </h3>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">
              Venue balances are compared with Sisera’s double-entry ledger before positions can
              influence risk limits or order sizing.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
