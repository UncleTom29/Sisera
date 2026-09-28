import { StatusBadge } from "@sisera/ui";
import { Activity, Database, Globe2, RadioTower } from "lucide-react";
import { auth } from "../../../auth";
import { PageHeader } from "../../../components/page-header";
import {
  getChains,
  getMacroRegime,
  getMarketOverview,
  getPerpetualMetrics,
} from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function MacroPage() {
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const [metrics, chains, regime, overview] = await Promise.all([
    getPerpetualMetrics(identity).catch(() => []),
    getChains(identity).catch(() => []),
    getMacroRegime(identity).catch(() => null),
    getMarketOverview(identity).catch(() => null),
  ]);
  const freshMetrics = metrics.filter(
    (item) => Date.now() - Date.parse(item.observedAt) < 10 * 60_000,
  );
  const freshChains = chains.filter(
    (item) => Date.now() - Date.parse(item.observedAt) < 10 * 60_000,
  );
  const chainRows = [
    ...chains.slice(0, 10),
    ...chains.filter(
      (chain) =>
        chain.name.toLowerCase() === "solana" &&
        !chains.slice(0, 10).some((listed) => listed.name === chain.name),
    ),
  ];
  const funding = freshMetrics.map((item) => Number(item.fundingRate)).filter(Number.isFinite);
  const meanFunding = funding.length
    ? funding.reduce((sum, value) => sum + value, 0) / funding.length
    : null;
  const tone =
    meanFunding == null || freshChains.length === 0
      ? null
      : meanFunding > 0.00005
        ? "Crowded long"
        : meanFunding < -0.00005
          ? "Crowded short"
          : "Balanced";
  const quoted = (overview?.crypto ?? []).filter((asset) => asset.change24hPct != null);
  const advancing = quoted.filter((asset) => (asset.change24hPct ?? 0) > 0).length;
  const falling = quoted.filter((asset) => (asset.change24hPct ?? 0) < 0).length;
  const strongest = [...quoted]
    .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0))
    .slice(0, 4);
  const weakest = [...quoted]
    .sort((a, b) => (a.change24hPct ?? 0) - (b.change24hPct ?? 0))
    .slice(0, 4);
  const tokenized = [...(overview?.rwaStocks ?? [])]
    .filter((asset) => asset.tokenizedVolume24hUsd != null)
    .sort((a, b) => (b.tokenizedVolume24hUsd ?? 0) - (a.tokenizedVolume24hUsd ?? 0))
    .slice(0, 6);
  const compact = (value: number | null | undefined) =>
    value == null
      ? "—"
      : `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="The bigger picture"
        title="Market climate"
        description="Track the forces around your trades: investor mood, crypto capital flows, rates, onchain liquidity, and derivatives positioning."
        actions={
          <StatusBadge tone={freshMetrics.length ? "positive" : "warning"}>
            {freshMetrics.length ? "Markets updating" : "Market update pending"}
          </StatusBadge>
        }
      />
      <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            "Crypto market value",
            overview?.global?.marketCapUsd == null
              ? "Explore markets"
              : `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(overview.global.marketCapUsd)}`,
          ],
          [
            "24h trading",
            overview?.global?.volume24hUsd == null
              ? "Explore markets"
              : `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(overview.global.volume24hUsd)}`,
          ],
          [
            "Bitcoin share",
            overview?.global?.btcDominancePct == null
              ? "Market view"
              : `${overview.global.btcDominancePct.toFixed(1)}%`,
          ],
          [
            "Investor mood",
            overview?.sentiment
              ? `${overview.sentiment.score} · ${overview.sentiment.label}`
              : "Read the market",
          ],
        ].map(([label, value]) => (
          <div key={label} className="bg-panel p-5">
            <p className="data-label">{label}</p>
            <p className="mt-3 font-mono text-xl text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            "Outside Bitcoin",
            compact(overview?.global?.altcoinMarketCapUsd),
            "Combined value of other crypto assets",
          ],
          [
            "Altcoin trading",
            compact(overview?.global?.altcoinVolume24hUsd),
            "24h trading outside Bitcoin",
          ],
          [
            "Ethereum share",
            overview?.global?.ethDominancePct == null
              ? "—"
              : `${overview.global.ethDominancePct.toFixed(1)}%`,
            "Of total crypto value",
          ],
          [
            "Assets tracked",
            overview?.global?.activeAssets == null
              ? "—"
              : overview.global.activeAssets.toLocaleString(),
            "Active crypto assets",
          ],
        ].map(([label, value, detail]) => (
          <div key={label} className="bg-panel p-5">
            <p className="data-label">{label}</p>
            <p className="mt-3 font-mono text-xl text-white">{value}</p>
            <p className="mt-2 text-[11px] text-slate-500">{detail}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="eyebrow">Market breadth</p>
              <h2 className="mt-1 text-base font-semibold text-white">
                How widely is the market moving?
              </h2>
            </div>
            <p className="font-mono text-sm text-white">
              {advancing} up · {falling} down
            </p>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            Among {quoted.length} leading assets with current 24h changes. A narrow rally can be
            more fragile than a broad one.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(
              [
                ["Leading", strongest, "text-emerald-300"],
                ["Lagging", weakest, "text-rose-300"],
              ] as const
            ).map(([heading, items, color]) => (
              <div key={heading}>
                <h3 className="text-xs font-semibold text-white">{heading}</h3>
                <div className="mt-2 divide-y divide-line">
                  {items.map((asset) => (
                    <div key={asset.id} className="flex justify-between gap-3 py-2 text-xs">
                      <span className="text-slate-300">{asset.symbol}</span>
                      <span className={`font-mono ${color}`}>
                        {(asset.change24hPct ?? 0) > 0 ? "+" : ""}
                        {asset.change24hPct?.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-line bg-panel p-5">
          <p className="eyebrow">Stock tokens</p>
          <h2 className="mt-1 text-base font-semibold text-white">
            Where tokenized-stock trading is concentrated
          </h2>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            Volume shows where traders are active. It does not guarantee an executable quote for
            your wallet.
          </p>
          <div className="mt-5 divide-y divide-line">
            {tokenized.map((asset) => (
              <div
                key={asset.symbol}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <div>
                  <p className="font-semibold text-white">{asset.symbol}</p>
                  <p className="text-[11px] text-slate-500">{asset.name}</p>
                </div>
                <div className="text-right font-mono">
                  <p className="text-white">{compact(asset.tokenizedVolume24hUsd)}</p>
                  <p className="text-[10px] text-slate-500">
                    {compact(asset.tokenizedMarketCapUsd)} value
                  </p>
                </div>
              </div>
            ))}
          </div>
          {!tokenized.length && (
            <p className="mt-5 text-xs text-slate-400">Stock-token activity is updating.</p>
          )}
        </section>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[1.25fr_.75fr]">
        <aside className="border border-line bg-[#091019]">
          <div className="border-b border-line px-4 py-3 text-xs font-semibold">
            What the backdrop suggests
          </div>
          <div className="p-5">
            <Globe2 size={20} className="text-cyan-300" />
            <p className="mt-8 data-label">Current climate</p>
            <p className="mt-2 text-2xl font-medium text-slate-100">
              {regime ? regime.state.replace("_", " ").toUpperCase() : "Market read updating"}
            </p>
            <p className="mt-4 text-xs leading-6 text-slate-400">
              {regime?.rationale ??
                "Rates and volatility are being updated. Explore market breadth and positioning while the next macro read comes in."}
            </p>
            {regime && (
              <div className="mt-4 space-y-2 font-mono text-[10px] text-slate-500">
                <p>
                  10 year yield change over 20 sessions: {regime.tenYearChange20d.toFixed(3)}{" "}
                  percentage points
                </p>
              </div>
            )}
            <p className="mt-4 text-xs leading-6 text-slate-500">
              {tone
                ? `Derivatives positioning looks ${tone.toLowerCase()} across ${funding.length} markets.`
                : "Explore current crypto breadth and tokenized stock activity while derivatives data updates."}
            </p>
            <div className="mt-8 grid grid-cols-2 gap-px bg-line">
              <StateCell icon={Activity} label="Rates" available={regime !== null} />
              <StateCell icon={RadioTower} label="Liquidity" available={freshChains.length > 0} />
              <StateCell icon={Database} label="Onchain" available={freshChains.length > 0} />
              <StateCell icon={Globe2} label="Derivatives" available={freshMetrics.length > 0} />
            </div>
          </div>
        </aside>
        <section className="border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-semibold">Market breadth</span>
            <Globe2 size={14} className="text-cyan-300" />
          </div>
          {overview?.crypto.length ? (
            <div className="divide-y divide-line">
              {overview.crypto.slice(0, 7).map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-xs"
                >
                  <div>
                    <p className="font-semibold text-white">{asset.name}</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-500">
                      {asset.symbol} · {asset.rank ? `#${asset.rank}` : "Crypto"}
                    </p>
                  </div>
                  <div className="text-right font-mono">
                    <p className="text-white">
                      {asset.priceUsd == null
                        ? "Market view"
                        : `$${asset.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                    </p>
                    <p
                      className={`mt-1 text-[10px] ${asset.change24hPct != null && asset.change24hPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                    >
                      {asset.change24hPct == null
                        ? "See trend"
                        : `${asset.change24hPct > 0 ? "+" : ""}${asset.change24hPct.toFixed(2)}% today`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <p className="text-sm text-slate-300">
                Follow market leaders and their changing momentum alongside rates and liquidity.
              </p>
              <a href="/markets" className="mt-3 inline-block text-xs text-cyan-300">
                Explore markets →
              </a>
            </div>
          )}
        </section>
        <section className="overflow-hidden border border-line bg-panel xl:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-semibold">Where onchain liquidity is growing</span>
            <span className="data-label">Value locked · USD</span>
          </div>
          {chains.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="font-mono text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Chain</th>
                    <th>TVL / USD</th>
                    <th>Native token</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {chainRows.map((chain) => (
                    <tr key={chain.name} className="border-t border-line font-mono text-slate-300">
                      <td className="px-4 py-3 font-semibold text-white">{chain.name}</td>
                      <td>
                        {new Intl.NumberFormat("en-US", {
                          notation: "compact",
                          maximumFractionDigits: 2,
                        }).format(chain.tvlUsd)}
                      </td>
                      <td>{chain.tokenSymbol ?? "—"}</td>
                      <td>{new Date(chain.observedAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-xs text-slate-500">
              Chain liquidity is refreshing. Explore crypto leaders above while the latest figures
              arrive.
            </p>
          )}
        </section>
        <section className="overflow-hidden border border-line bg-panel xl:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-semibold">Perpetuals liquidity & funding</span>
            <span className="data-label">Current market view</span>
          </div>
          {metrics.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="font-mono text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Market</th>
                    <th>Mark / USDC</th>
                    <th>Index</th>
                    <th>Funding / 1h</th>
                    <th>Open interest · base</th>
                    <th>24h notional / USDC</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((item) => (
                    <tr key={item.symbol} className="border-t border-line font-mono text-slate-300">
                      <td className="px-4 py-3 font-semibold text-white">{item.symbol}</td>
                      <td>{Number(item.markPrice).toLocaleString()}</td>
                      <td>{item.oraclePrice ? Number(item.oraclePrice).toLocaleString() : "—"}</td>
                      <td
                        className={
                          Number(item.fundingRate) >= 0 ? "text-emerald-300" : "text-rose-300"
                        }
                      >
                        {item.fundingRate ? `${(Number(item.fundingRate) * 100).toFixed(4)}%` : "—"}
                      </td>
                      <td>
                        {item.openInterestBase
                          ? Number(item.openInterestBase).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        {item.volume24hUsd
                          ? Number(item.volume24hUsd).toLocaleString(undefined, {
                              notation: "compact",
                              maximumFractionDigits: 2,
                            })
                          : "—"}
                      </td>
                      <td>{new Date(item.observedAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-xs text-slate-500">
              Perpetual market activity is refreshing. Browse crypto trends above in the meantime.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function StateCell({
  icon: Icon,
  label,
  available,
}: { icon: typeof Activity; label: string; available: boolean }) {
  return (
    <div className="bg-panel p-3">
      <Icon size={12} className="text-slate-700" />
      <p className="mt-3 data-label">{label}</p>
      <p className={`mt-1 text-[9px] ${available ? "text-emerald-300" : "text-slate-700"}`}>
        {available ? "Fresh observation" : "No observation"}
      </p>
    </div>
  );
}
